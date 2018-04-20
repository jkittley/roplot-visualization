/**
 * Created by jacob on 20/06/2016.
 */
(function ($) {

    var rootElem = null;

    // Configuration notes.
    // - All distance measurements in mm
    //

    var config = {
        "rotationSpeed": 10,
        "beltSpeed": 10,
        "physical": { 
            "boomRadius": 500,      // Radius of the boom
            "boomWidth": 10,        // Width of the boom
            "boomColor": "gray",    // Boom colour
            "drawStart": 100,       // Distance from boom center where carriage stops - inner
            "drawEnd": 450,         // Distance from boom center where carriage stops - outer
            "carWidth": 20,         // Carriage Width - axis normal to boom
            "carHeight": 20,        // Carriage Height - axis parallel to boom
            "boomStep": 0.9,        // Boom stepper motor step size
            "carStep": 1.5,         // Carriage stepper motor step size
            "pens": [{
                "id": 1,
                "pole": "north",    // Which half of the boom is the carriage on. North or South
                "color": "red",     // Color of the pen
                "width": 5,
                "offset": {          // X Offset of pen tip from center of boom width
                    x: 25,
                    y: 0
                }
            },{
                "id": 2,
                "pole": "south",     // Which half of the boom is the carriage on. North or South
                "color": "blue",     // Color of the pen
                "width": 5,
                "offset": {          // X Offset of pen tip from center of boom width
                    x: 25,
                    y: 0
                }
            }],
        },
        "clock": {
            "tickInterval": 5,      // Interval in degrees between tick marks
            "LabelInterval": 15     // Interval in degrees between tick labels
        }
    };
    
    var drawing = {
        "radius": null,
        "ox": null,
        "oy": null,
        "padding": 40,
    }

    const CAR_OUT = 1;
    const CAR_IN = 2;
    const ROTATE_CW = 1;
    const ROTATE_AC = 2;  
    const PEN_UP = 1;
    const PEN_DOWN = 2;

    var svg = null;
    var boom = null;
    var boomAngle = 0;
    var north = null;
    var south = null;
    var drawLayer = null;
    var physicalBeltPos = config.physical.drawStart;
    var penState = []

    // ----------------------------------------------------
    // Helpers
    // ----------------------------------------------------
    
    var getConfig = function() {
        return config;
    }

    var log = function() {
        // var msg = "";
        // for (x in arguments) msg += " "+arguments[x];
        // $('#log ul').append('<li>'+msg+'</li>');
        // $('#log .panel-scroller').scrollTop($('#log ul').height());
        // console.log(arguments);
    };

    // Take an xy from top left and convert to a point from center of circle
    var pointTransform = function(x,y) {
        if (y===undefined) { y=x[1];  x=x[0]; }
        var off_x = x - drawing.radius;
        var off_y = drawing.radius - y;
        var off_c = Math.sqrt( Math.abs(off_x * off_x) + Math.abs(off_y * off_y) );
        var radians = 0;
        if      (off_x>=0 && off_y>=0) { radians = Math.asin(off_x / off_c);  }
        else if (off_x>=0 && off_y<0)  { radians = Math.PI/2 + Math.asin(Math.abs(off_y) / off_c);  }
        else if (off_x<0  && off_y<0)  { radians = Math.PI + Math.asin(Math.abs(off_x) / off_c);  }
        else                           { radians = Math.PI*1.5 + Math.asin(off_y / off_c);  }
        if (isNaN(radians)) radians = 0;
        var degrees = radianToDegree(radians);
        return { 
            originalX: x,
            originalY: y,
            degrees: 1 * degrees.toFixed(2), 
            radians: 1 * radians.toFixed(2), 
            radius: 1 * off_c.toFixed(2), 
            cxOffset: 1 * off_x.toFixed(2), 
            cyOffset: 1 * off_y.toFixed(2)
        };
    };

    var maxTravel = function() {
        var max_belt_pos = 0;
        for (i in config.carriagePairs) {
            var x = config.carriagePairs[i].virtualBeltpos;
            if (max_belt_pos < x) max_belt_pos = x;
        }
        return config.scaled.drawEnd - max_belt_pos;
    };

    var degreeToRadian = function (degrees) {
        return Math.PI/180 * degrees;
    };

    var radianToDegree = function (radians) {
         return 180/Math.PI * radians;
    };

    // ----------------------------------------------------
    // Boom
    // ----------------------------------------------------

    var stepBoom = function(direction) {
        if (direction !== ROTATE_AC && direction !== ROTATE_CW) throw "Unknown direction";
        var d = (direction === ROTATE_AC) ? -1 : 1;
        boomAngle = boomAngle + (config.physical.boomStep * d);
        boom.attr("transform", "rotate("+boomAngle+","+drawing.ox+","+drawing.oy+")");
    }

    // ----------------------------------------------------
    // Carriages
    // ----------------------------------------------------

    var stepCar = function(direction) {
        if (direction !== CAR_IN && direction !== CAR_OUT) throw "Unknown direction";
        var d = (direction === CAR_IN) ? -1 : 1;
        physicalBeltPos = physicalBeltPos + (config.physical.carStep * d);
        physicalBeltPos = Math.min(physicalBeltPos, config.physical.drawEnd);
        physicalBeltPos = Math.max(physicalBeltPos, config.physical.drawStart);     
        north.attr("transform", "translate(0, "+scale(-physicalBeltPos)+")");
        south.attr("transform", "translate(0, "+scale(physicalBeltPos)+")");
    }    
    
    // ----------------------------------------------------
    // Pen
    // ----------------------------------------------------

    var setPenState = function(penIndex, newState) {
        if (penIndex >= penState.length ) throw "Unknown pen index";
        if (newState !== PEN_DOWN && newState !== PEN_UP) throw "Unknown pen state";
        penState[penIndex] = newState;
    }

    // ----------------------------------------------------
    // Build
    // ----------------------------------------------------

    var buildSurface = function(svg) {
        // Surface
        svg.append("circle")
            .attr("r", drawing.radius)
            .attr("cx", drawing.ox)
            .attr("cy", drawing.oy)
            .attr("class", 'draw-surface');
        // Hub
        svg.append("circle")
            .attr("r", 20)
            .attr("cx", drawing.ox)
            .attr("cy", drawing.oy)
            .attr("class", 'hub');
        // Drawable area
        var arc = d3.arc()
            .innerRadius(config.scaled.drawStart)
            .outerRadius(config.scaled.drawEnd)
            .startAngle(0)
            .endAngle(2 * Math.PI);
        svg.append("path")
            .attr("d", arc)
            .attr("class", "drawable-area")
            .attr("transform", "translate("+drawing.ox+","+drawing.oy+")");

        // Clock face      
        var face = svg.append('g')
		    .attr('id','clock-face')
            .attr('transform','translate(' + drawing.ox + ',' + drawing.oy + ')');
	    face.selectAll('.degree-tick')
		.data(d3.range(0,360/5)).enter()
			.append('line')
			.attr('class', 'degree-tick')
			.attr('x1',0)
			.attr('x2',0)
			.attr('y1',drawing.radius)
			.attr('y2',drawing.radius - 5)
			.attr('transform',function(d){
				return 'rotate(' + d * config.clock.tickInterval + ')';
			});
        var radian = Math.PI / 180;
        var interval = config.clock.LabelInterval;
        var labelRadius = drawing.radius - 20;
        face.selectAll('.degree-label')
		    .data(d3.range(0,360/interval))
			.enter()
			.append('text')
			.attr('class', 'degree-label')
			.attr('text-anchor','middle')
			.attr('x',function(d){
				return labelRadius * Math.sin(d*interval*radian);
			})
			.attr('y',function(d){
				return -labelRadius * Math.cos(d*interval*radian);
			})
            .attr('dy', ".35em")
			.text(function(d){
				return d*interval;
			});
    };

    var buildBoom = function (svg) {
        boom = svg.append("g")
            .attr('id', 'boom');
        // Boom
        boom.append("line")
            .attr("x1", drawing.ox)
            .attr("y1", drawing.oy - config.scaled.boomRadius)
            .attr("x2", drawing.ox)
            .attr("y2", drawing.oy + config.scaled.boomRadius)
            .attr("stroke-width", Math.max(2, config.scaled.boomWidth))
            .style("stroke", config.physical.boomColor);
        // Angle markers
        boom.append("circle")
            .attr('class', 'boom-angle-marker')
            .attr("cx", drawing.ox)
            .attr("cy", drawing.oy - drawing.radius + 5)
            .attr("r", 5);
        boom.append("circle")
            .attr('class', 'boom-angle-marker')
            .attr("cx", drawing.ox)
            .attr("cy", drawing.oy + drawing.radius - 5)
            .attr("r", 5);
    };

    var buildCarriages = function (svg) {
        var carriages = boom.append("g")
            .attr("id", "carriages");

        // Great groups for north and south
        north = carriages.append("g").attr("id","north-belt");
        south = carriages.append("g").attr("id","south-belt");

        north.append("rect")
            .attr('class', 'carriage')
            .attr("x", drawing.ox - config.scaled.carWidth / 2)
            .attr("y", function () {
                return drawing.oy - config.scaled.carHeight / 2;
            })
            .attr("width", config.scaled.carWidth)
            .attr("height", config.scaled.carHeight);
        
        north.attr("transform", "translate(0, "+scale(-physicalBeltPos)+")");

        south.append("rect")
            .attr('class', 'carriage')
            .attr("x", drawing.ox - config.scaled.carWidth / 2)
            .attr("y", function () {
                return drawing.oy - config.scaled.carHeight / 2;
            })
            .attr("width", config.scaled.carWidth)
            .attr("height", config.scaled.carHeight);

        south.attr("transform", "translate(0, "+scale(physicalBeltPos)+")");

        // Add pens
        for (i in config.physical.pens) {
            var pen  = config.physical.pens[i];
            var pole = (pen.pole === 'north') ? north : south;

            // Pens
            pen.circle = pole.append("circle")
                .attr('class', 'pen')
                .attr("id", "pen-"+i)
                .attr("r", 5)
                .attr("cx", drawing.ox + scale(pen.offset.x))
                .attr("cy", drawing.oy + scale(pen.offset.y))
                .style("fill", pen.color);
        }
    };

    var buildClickLayer = function(svg) {
        var mouseLine = svg.append("line")
            .attr("x1", drawing.ox)
            .attr("y1", drawing.oy)
            .attr("x2", drawing.ox)
            .attr("y2", drawing.oy)
            .attr("class", "mouse-line");
        
        svg.append("circle")
            .attr("r", drawing.radius)
            .attr("cx", drawing.ox)
            .attr("cy", drawing.oy)
            .style("fill", 'transparent')
            .on("mousemove", function () {
                var point = d3.mouse(this);
                mouseLine.attr("x2", point[0]).attr("y2", point[1]);
                var trans = pointTransform(point);
                if (trans!==undefined) {
                    trans.inDrawSpace = (trans.radius >= config.scaled.drawStart && trans.radius <= config.scaled.drawEnd );
                    if (trans.radius <= drawing.radius) rootElem.trigger( "mousemove", trans );   
                }
                d3.event.stopPropagation();
            })
            .on("mouseout", function () {
                mouseLine.attr("x2", drawing.ox).attr("y2", drawing.oy);
                d3.event.stopPropagation();
            })
            .on("click", function () {
                var point = d3.mouse(this);
                var trans = pointTransform(point);
                trans.inDrawSpace = (trans.radius >= config.scaled.drawStart && trans.radius <= config.scaled.drawEnd );
                rootElem.trigger( "click", trans );            
                d3.event.stopPropagation();
            });
    };

    var buildDrawLayer = function(svg) {
        drawLayer = svg.append("g");
    }

    // ----------------------------------------------------
    // Config
    // ----------------------------------------------------

    var scale = function (value, reverse=false) {
        var a = Math.max(1 * config.physical.boomRadius, 1 * drawing.radius - drawing.padding);
        var b = Math.min(1 * config.physical.boomRadius, 1 * drawing.radius - drawing.padding);
        if (reverse) return value / (b / a);
        return (b / a) * value;
    };

    var updConfig = function(new_settings) {
        $.extend(true, config, new_settings);
        // Safety checks
        if (config.physical.drawEnd > config.physical.boomRadius) throw "Draw area exceeds boom";
        if (config.physical.drawStart < 0 || config.physical.drawEnd < 0) throw "Draw area invalid";
        // Create scaled measurements 
        config.scaled = {};
        for (x in config.physical) {
            config.scaled[x] = scale(config.physical[x]);
        }
    }

    // ----------------------------------------------------
    // Main
    // ----------------------------------------------------

    $.fn.roplot = function(device_config) {
        // Set root element
        rootElem = this;
        rootElem.addClass('roplot');
        // Calc space on which we can draw
        drawing.radius = Math.min(rootElem.width(), rootElem.height()) / 2;
        drawing.ox = drawing.radius;
        drawing.oy = drawing.radius;
        // Update configuration
        updConfig(device_config);
        for (i in config.physical.pens) {
            penState[i] = PEN_UP;
        }
        
        svg = d3.select("#"+this.prop('id')).append("svg")
            .attr("width", drawing.radius * 2)
            .attr("height", drawing.radius * 2);

        buildSurface(svg);
        buildDrawLayer(svg);
        buildBoom(svg);
        buildCarriages(svg);
        buildClickLayer(svg);
        
        return this;
    };

    // ----------------------------------------------------
    // RAT
    // ----------------------------------------------------

    var drawLine = function(pen, x1, y1, x2, y2) {
        drawLayer.append("line")
            .attr("x1", x1)
            .attr("y1", y1)
            .attr("x2", x2)
            .attr("y2", y2)
            .style("stroke-width", scale(pen.width))
            .style("stroke", pen.color);
    }

    var drawCircle = function(pen, x1, y1) {
        drawLayer.append("circle")
            .attr("r", scale(pen.width/2))
            .attr("cx", x1)
            .attr("cy", y1)
            .style("fill", pen.color);
    }

    var polarToCart = function(d, r) {
        return { 
            x: drawing.ox + (r * Math.cos( degreeToRadian(d-90)) ),
            y: drawing.oy + (r * Math.sin( degreeToRadian(d-90)) ) 
        };
    }
    
    var runRat = function(cmdStr) {

        var re = /((?<repeats>\d+)\*)?(?<cmd>PU|PD|RC|RA|CO|CI)(:(?<param>\d+))?/;

        var parsedInstructions = [];
        var errors = [];
        $.each(cmdStr.split(','), function (i, instruction) {
            instruction = instruction.trim();
            if (instruction == "") return true;

            var parsed = instruction.match(re);
            if (parsed === null) {
                errors.push("Unable to parse command: "+instruction+" (#"+i+")");
                return false;
            }

            parsedDict = parsed.groups;                
            parsedDict.repeats = (parsedDict.repeats === undefined) ? 1 : Number.parseInt(parsedDict.repeats);
            parsedDict.param = (parsedDict.param == undefined) ? null : Number.parseInt(parsedDict.param);
            parsedInstructions.push(parsedDict)    

        });

        if (errors.length > 0) {
            console.log(errors);
            return errors;
        }

        // Execute parsed instructions
        $.each(parsedInstructions, function(i, instruction) {
            for(var i=0; i<instruction.repeats; i++) {

                var lines = {};
                for (j in penState) {
                    if (penState[j] == PEN_DOWN) {
                        lines[j] = { "before": polarToCart(boomAngle, scale(physicalBeltPos)) };
                    }
                }

                switch (instruction.cmd) {
                    case "PU":
                        setPenState(instruction.param, PEN_UP);
                        break;
                    case "PD":
                        setPenState(instruction.param, PEN_DOWN);
                        pos = polarToCart(boomAngle, scale(physicalBeltPos));
                        drawCircle(config.physical.pens[instruction.param], pos.x, pos.y);
                        break;
                    case "RC":
                        stepBoom(ROTATE_CW);
                        break;
                    case "RA":
                        stepBoom(ROTATE_AC);
                        break;
                    case "CO":
                        stepCar(CAR_OUT);
                        break;
                    case "CI":
                        stepCar(CAR_IN);
                        break;
                    default:
                        throw "Unknown RAT command";
                }

                // Draw ink
                for (j in lines) {
                    lines[j]['after'] = polarToCart(boomAngle, scale(physicalBeltPos));
                    drawLine(config.physical.pens[j], lines[j].before.x, lines[j].before.y, lines[j].after.x, lines[j].after.y);
                }
            }
        })
    };

    $.fn.runRat = runRat;
    $.fn.getConfig = getConfig;

})($);
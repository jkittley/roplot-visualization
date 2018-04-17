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
            "pens": [{
                "id": 1,
                "pole": "north",    // Which half of the boom is the carriage on. North or South
                "color": "red",     // Color of the pen
                "offsetX": 15,      // X Offset of pen tip from center of boom width
            }]
        }
    };
    
    var drawing = {
        "radius": null,
        "ox": null,
        "oy": null,
        "padding": 40,
    }

    var svg = null;
    var boom = null;
    var boomAngle = 0;
    var north = null;
    var south = null;

    var jobs = []
    var job_id = 0;
    var selectedPen = null;

    // ----------------------------------------------------
    // Belt Position
    // ----------------------------------------------------
    
    var physicalBeltPos = null;

    var getBeltPosition = function(scaled=false) {
        if (physicalBeltPos === null) setBeltPosition(config.physical.drawStart);
        if (scaled) return scale(physicalBeltPos);
        return physicalBeltPos;
    }

    var setBeltPosition = function(value, is_scaled=false) {
        if (is_scaled) { 
            physicalBeltPos = scale(value);
        } else {
            physicalBeltPos = value;
        }
    }

    // ----------------------------------------------------
    // Helpers
    // ----------------------------------------------------
    
    var log = function() {
        var msg = "";
        for (x in arguments) msg += " "+arguments[x];
        $('#log ul').append('<li>'+msg+'</li>');
        $('#log .panel-scroller').scrollTop($('#log ul').height());
        console.log(arguments);
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

    var animateBoom = function(to_angle, cb=null) {
        // Swing it baby
        boom.transition()
            .duration(function () {
                var distance = Math.max(boomAngle, to_angle) - Math.min(boomAngle, to_angle);
                return config.rotationSpeed * distance;
            })
            .attrTween("transform", function() {
                return d3.interpolateString("rotate("+boomAngle+", "+drawing.ox+", "+drawing.ox+")", "rotate("+to_angle+", "+drawing.oy+", "+drawing.oy+")");
            })
            .on("end", function () {
                rootElem.trigger('boomAnimEnd');
                // if (cb) cb();
                // $('.stat-angle').html('Angle: '+Math.round(boomAngle)+"&deg;");
            });
    };


    var rotateBoom = function(abs_angle, cb, force_dir) {
        // Make sure its a number
        abs_angle = abs_angle * 1;
        // Is the boom already at the angle
        if (abs_angle===boomAngle) {
            log("Already at angle ", abs_angle);
            if (cb) cb();
            return;
        }

        var CW  = 1;
        var CCW = -1;
        var is_forced = false;
        if (typeof force_dir !==undefined) { is_forced = true; }

        // Calc different distances
        var dir = (abs_angle > boomAngle) ? CW : CCW;
        var diff_cw=0, diff_ccw=0;
        if (dir===CW) {
            diff_cw  = Math.abs(abs_angle - boomAngle);
            diff_ccw = 360 - Math.abs(abs_angle - boomAngle);
        } else {
            diff_cw = 360 - Math.abs(abs_angle - boomAngle);
            diff_ccw  = Math.abs(abs_angle - boomAngle);
        }
        log("Route lengths: CCW",Math.round(diff_ccw), " - CW", Math.round(diff_cw));

        // Workout shortest direction of travel
        var auto_dir = 0;
        if (diff_ccw > diff_cw) {
            log("Shortest route is clockwise");
            auto_dir = 1;
        } else {
            log("Shortest route is anticlockwise");
            auto_dir = -1;
        }

        var move_cw  = boomAngle + diff_cw % 360;
        var move_ccw = boomAngle - diff_ccw;

        var to_angle = abs_angle;
        if (is_forced && force_dir===CW) {
            log("Forcing direction CW");
            to_angle = move_cw
        } else if (is_forced && force_dir===CCW) {
            log("Forcing direction CCW");
            to_angle = move_ccw
        } else if (auto_dir===CW) {
            to_angle = move_cw
        } else {
            to_angle = move_ccw
        }

        log("Rotating from: ",Math.round(boomAngle), " to: ", Math.round(abs_angle), " moving: ", Math.round(to_angle));
       
        animateBoom(to_angle, function() {
            boomAngle = abs_angle;
        });

        return this;
    };

    // ----------------------------------------------------
    // Carriages
    // ----------------------------------------------------

    var moveCarriages = function(newPhysicalBeltPossition, cb=null) {
        log("Carriages to new belt position:", newPhysicalBeltPossition);
        // Check if within draw limits
        if (newPhysicalBeltPossition > config.physical.drawEnd)   { log("Greater than draw space"); if(cb) cb(false); return; }
        if (newPhysicalBeltPossition < config.physical.drawStart) { log("Less than draw space");    if(cb) cb(false); return; }
        // Position from center to move to
        var from_start = Math.abs(config.physical.drawStart - newPhysicalBeltPossition);
        log("Belt needs to move", from_start);

        // Direction of travel
        var direction_of_travel = (from_start > newPhysicalBeltPossition) ? direction_of_travel = 1 : -1;
        
        animateCarriages(direction_of_travel, from_start, function() {
            setBeltPosition(from_start, false);
        });

        return this;
    }    
    
    var animateCarriages = function(direction_of_travel, from_start, cb=null) {
        // Animate belt moving
        var dur = function () {
            var distance =  Math.abs(scale(from_start) - getBeltPosition(true));
            console.log(distance);
            return config.beltSpeed * distance;
        };
        north.transition()
            .duration(dur)
            .attr("transform", "translate(0, "+(direction_of_travel * scale(from_start))+")")
            .on("end", function() { rootElem.trigger('carAnimEnd'); });
        south.transition()
            .duration(dur)
            .attr("transform", "translate(0, "+(-direction_of_travel * scale(from_start))+")");
        if (cb) cb();
    };


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
            .attr("class", "draw-zones")
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
			.attr('y2',drawing.radius-5)
			.attr('transform',function(d){
				return 'rotate(' + d * 5 + ')';
			});
        var radian = Math.PI / 180;
        var interval = 15;
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
                return drawing.oy - config.scaled.drawStart - config.scaled.carHeight / 2;
            })
            .attr("width", config.scaled.carWidth)
            .attr("height", config.scaled.carHeight);

        south.append("rect")
            .attr('class', 'carriage')
            .attr("x", drawing.ox - config.scaled.carWidth / 2)
            .attr("y", function () {
                return drawing.oy + config.scaled.drawStart  - config.scaled.carHeight / 2;
            })
            .attr("width", config.scaled.carWidth)
            .attr("height", config.scaled.carHeight);

        // Add pens
        for (i in config.physical.pens) {
            var pen  = config.physical.pens[i];
            var pole = (pen.pole === 'north') ? north : south;

            // Pens
            pen.circle = pole.append("circle")
                .attr('class', 'pen')
                .attr("r", 5)
                .attr("cx", drawing.ox - scale(pen.offsetX))
                .attr("cy", function() {
                    var offset = getBeltPosition(true);
                    if (pole===north) return drawing.oy - offset; else return drawing.oy + offset;
                })
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
                trans.inDrawSpace = (trans.radius >= config.scaled.drawStart && trans.radius <= config.scaled.drawEnd );
                rootElem.trigger( "mousemove", trans );   
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

    var buildStats = function(svg) {
        svg.append('text')
         .attr("x", 10)
         .attr("y", 20)
         .text("")
         .attr("class", "stat stat-angle");
    };

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
        // Calc space on which we can draw
        drawing.radius = Math.min(rootElem.width(), rootElem.height()) / 2;
        drawing.ox = drawing.radius;
        drawing.oy = drawing.radius;
        // Update configuration
        updConfig(device_config);
        
        console.log([drawing.radius]);

        svg = d3.select("#"+this.prop('id')).append("svg")
            .attr("width", drawing.radius * 2)
            .attr("height", drawing.radius * 2);

        buildSurface(svg);
        buildBoom(svg);
        buildCarriages(svg);
        buildClickLayer(svg);

        return this;
    };

    $.fn.boomTo = rotateBoom;
    $.fn.carTo = moveCarriages
 

})($);
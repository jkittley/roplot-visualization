var gen = function(canvasRadius, boomStep, carStep, cb=null) {

    var radianToDegree = function (radians) {
        return 180/Math.PI * radians;
    };

    // Take an xy from top left and convert to a point from center of circle
    var pointTransform = function(x,y,r) {
        if (y===undefined) { y=x[1];  x=x[0]; }
        var off_x = x - r;
        var off_y = r - y;
        console.log(off_x, off_y);
        var off_c = Math.sqrt( Math.abs(off_x * off_x) + Math.abs(off_y * off_y) );
        console.log("OffC:"+off_c);
        console.log("R:"+r);
        var radians = 0;
        if      (off_x>=0 && off_y>=0) { radians = Math.asin(off_x / off_c);  }
        else if (off_x>=0 && off_y<0)  { radians = Math.PI/2 + Math.asin(Math.abs(off_y) / off_c);  }
        else if (off_x<0  && off_y<0)  { radians = Math.PI + Math.asin(Math.abs(off_x) / off_c);  }
        else                           { radians = Math.PI*1.5 + Math.asin(off_y / off_c);  }
        if (isNaN(radians)) radians = 0;
        console.log("Radians:"+radians);
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
 
    var svg = d3.select("#imageToPrint")
      .attr("width", canvasRadius*2)
      .attr("height", canvasRadius*2);
  
    var path = svg.selectAll("path");

    var circle = svg.append("circle")
      .attr("r", 10)
      .attr("fill", "red");

      var rat = [ "PD:1" ];
      var i = 0;
      var n = path.node().getTotalLength();
      var prevDegrees = -1;
      var prevRadius = -1;
      var x = setInterval(function() {
      var point = path.node().getPointAtLength(i);
     

      circle.attr("cx",point.x).attr("cy",point.y);
      var params = pointTransform(point.x, point.y, canvasRadius);
      console.log(params.degrees);
      if (prevRadius != -1) {

            var carDiff = Math.abs(params.radius - prevRadius);
            var stepsNeeded = Math.floor(carDiff / carStep);
            if (stepsNeeded >= 1) {
                if (params.radius > prevRadius) {
                    rat.push(stepsNeeded+"*CO");
                    if (cb !== null) cb(rat[rat.length-1]);
                } else if (params.radius < prevRadius) {
                    rat.push(stepsNeeded+"*CI");
                    if (cb !== null) cb(rat[rat.length-1]);
                } else {
                    console.log("Unhandled: "+prevRadius+" "+params.radius);
                }
                prevRadius = params.radius;
            }
        } else {
            prevRadius = params.radius;
        }

        if (prevDegrees != -1) {
            var angleDiff = Math.abs(params.degrees - prevDegrees);
            console.log("angle diff: "+angleDiff)
            var stepsNeeded = Math.floor(angleDiff / boomStep);
            if (stepsNeeded >= 1) {
                if (prevDegrees > 270 && params.degrees < 90) {
                    rat.push(stepsNeeded+"*RC")
                    if (cb !== null) cb(rat[rat.length-1]);
                } else if (prevDegrees < params.degrees) {
                    rat.push(stepsNeeded+"*RC")
                    if (cb !== null) cb(rat[rat.length-1]);
                } else if (params.degrees > 270 && prevDegrees < 90) {
                    rat.push(stepsNeeded+"*RA")
                    if (cb !== null) cb(rat[rat.length-1]);
                } else if (params.degrees < prevDegrees) {
                    rat.push(stepsNeeded+"*RA")
                    if (cb !== null) cb(rat[rat.length-1]);
                } else {
                    console.log("Unhandled: "+prevDegrees+" "+params.degrees);
                }
                prevDegrees = params.degrees;
            }
        } else {
            prevDegrees = params.degrees;
        }

        i++;
        if (i == n-1) {
            clearInterval(x);
        }
      },0.25);

};
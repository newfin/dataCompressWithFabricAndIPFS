var http=require("http");
var querystring = require("querystring");
var stringRandom = require('string-random');
var async = require('async');
const sendItems = 10;


var tamplateDataOfOBD ={

    datanum:0,
    timeStamp:0,
    odbid:0,
    tirepressure:0,
    distance:0,
    carspeed:0,
    enginespeed:0,
    gasremain:0,
    enginetemperature:0,
    waterbox:0,
    localtion:0
};

var optionsPost={
    hostname:"127.0.0.1",
    port:60003,
    path:'/obddata',
    json: true,
    method:"POST",
    headers: {
        'Content-Type': 'application/json'
    }
};



let count = 1;

async.whilst(
    function(){
        return count <= sendItems;
    },
    function(cb){

        var req = http.request(optionsPost,function(res){
            res.on("data",function(chunk){
                console.log("received chunck:",chunk.toString());
            });
            res.on("end",function(){
                console.log("### end ##");
            });
            console.log("res.statusCode:",res.statusCode);
        });

        req.on("error",function(err){
            console.log(err.message);
        });

        tamplateDataOfOBD.datanum = count;
        tamplateDataOfOBD.timeStamp = new Date();
        tamplateDataOfOBD.odbid = 'X8888-S6665';
        tamplateDataOfOBD.tirepressure = stringRandom(4, {letters: false});
        tamplateDataOfOBD.distance = stringRandom(4, {letters: false});
        tamplateDataOfOBD.carspeed = stringRandom(4, {letters: false});
        tamplateDataOfOBD.enginespeed = stringRandom(4, {letters: false});
        tamplateDataOfOBD.gasremain = stringRandom(4, {letters: false});
        tamplateDataOfOBD.enginetemperature = stringRandom(4, {letters: false});
        tamplateDataOfOBD.waterbox = stringRandom(4, {letters: false});
        tamplateDataOfOBD.localtion = stringRandom(4, {letters: false});
        console.log(tamplateDataOfOBD);
        req.write(JSON.stringify(tamplateDataOfOBD));
        req.end();

        count++;
        setTimeout(cb, 3000);
    },
    function(err){
        console.log(err);
    }
);


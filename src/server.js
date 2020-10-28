const Readable = require('stream').Readable;
const validator = require('validator');
const ipfsAPI = require('ipfs-api');
const ipfs = ipfsAPI('localhost', '5001', {protocol: 'http'});
const express = require('express');
const crypto = require('crypto');
const bodyparse = require('body-parser');
const fabricService = require('./fabricService');
const app = express();
app.use(bodyparse.urlencoded({extend:false}));

const chaincodeName = 'cc_sendhashtofabric';    // fabric链码名称
const fileHashType = 'md5';                     // 文件指纹类型'md5'/'sha256'
const blockItems = 10080;                       // 每个数据块含有数据条目

var obdidArrays = new Set();
var obdidCount = {};
var streamArrays = {};
var currentStream = null;
var currentHashHandler = null;
var hashComputeHandlers = {};

// 自定义可读流
class MyReadable extends Readable{
    constructor(dataSource, options){
        super(options);
    }
    _read(){
        const data = "";
        this.push(data)
    }
}

// 向IPFS发送打包后的块
function sendBlockDataToIPFS(readableStream) {
    //向IPFS发送数据块
    return new Promise(function (resolve,reject) {
        ipfs.util.addFromStream(readableStream).then(result => {
            console.log("sendBlockDataToIPFS ==> IPFS return: \n" ,result)
            resolve(result);
        }).catch(e => {
            console.log("sendBlockDataToIPFS ==> err is:" ,e)
            reject(e);
        });
    });
}

// 向fabric发送数据块的相关信息：日期、IPFS地址、文件指纹
// 格式：{obdid:xxx,date:2019-4-1,ipfsAdd:xxx,fileFingerprint:xxx}
function sendHashToBlockChain(obdId,ipfsAddr,fileFingerprint){
    let sendJson = {
        'dataDate':new Date().toLocaleDateString(),
        'ipfsAddr':ipfsAddr,
        'fileFingerprint':fileFingerprint
    };
    return new Promise(function (resolve,reject) {
        fabricService.sendTransaction(chaincodeName,"invoke",["putvalue",obdId,JSON.stringify(sendJson)]).then(fabricHash => {
            console.log("sendHashToBlockChain ==> fabricHash is: " ,fabricHash)
            resolve(fabricHash)
        }).catch(e => {
            console.log("sendHashToBlockChain ==> has a err: " ,e)
            reject(e)
        });
    });
}

// 创建流，以流方式向IPFS传输数据
var streamInit = function (){
    let myReadable = new MyReadable();
    myReadable.setEncoding('utf8');

    myReadable.on('data', (chunk) => {
        console.log(`接收到 ${chunk.length} 个字节的数据`);
    });
    myReadable.on('end', (chunk) => {
        console.log('已没有数据');
    });
    myReadable.on('close', (chunk) => {
        console.log('流已关闭');
    });
    return myReadable;
};


/***
 *  客户端上传数据处理，使用http-post方式
 */
app.post("/obddata",bodyparse.json(),function (req,res) {

    let dataJson = req.body;
    let dataString = JSON.stringify(dataJson);
    let storedDataString = dataString +"\n" ;
    console.log("typeof dataJson:",typeof dataJson);
    console.log("typeof dataString:",typeof dataString);

    if(validator.isJSON(dataString)) {
        console.log("validator.isJSON is true!");
        if (!obdidArrays.has(dataJson.odbid)) { // 新连接的客户端
            console.log("a new client!");
            currentStream = streamInit();
            currentStream.push(storedDataString);// json字符串全放入Readable
            currentStream.pause();
            streamArrays[dataJson.odbid] = currentStream;

            currentHashHandler = crypto.createHash(fileHashType).update(storedDataString);
            hashComputeHandlers[dataJson.odbid] = currentHashHandler;

            obdidArrays.add(dataJson.odbid);// 查重集合
            obdidCount[dataJson.odbid] = 1; // 开始计数

        } else{ // 已经连接的客户端
            console.log("a already connected client!");
            currentStream = streamArrays[dataJson.odbid];
            currentStream.push(storedDataString);// 全放入Readable
            currentStream.pause();
            obdidCount[dataJson.odbid] += 1;
            hashComputeHandlers[dataJson.odbid].update(storedDataString);// 更新MD5/SHA1
        }

        if (obdidCount[dataJson.odbid] == blockItems) { // 最后一条数据完成并开始打包数据块,以Json字符串存储
            console.log("package:", dataJson.odbid);
            currentStream = streamArrays[dataJson.odbid];
            currentStream.resume();
            currentStream.push(null);

            // 计算该块的hash
            currentHashHandler = hashComputeHandlers[dataJson.odbid];
            let blockHash = currentHashHandler.digest('hex').toUpperCase();
            console.log("the block hash is:", blockHash);

            // 向IPFS发送打包数据块
            sendBlockDataToIPFS(currentStream).then(ipfsHash => {
                console.log("the ipfsHash is：", ipfsHash[0].hash);
                // 向Fabric发送数据存储的地址以及数据指纹
                console.log("the fileFingerprint is：", blockHash);
                return sendHashToBlockChain(dataJson.odbid, ipfsHash[0].hash, blockHash);

            }).then(txhash => {
                if (txhash) {
                    console.log("the txhash is: ", txhash);
                }
            }).catch(e => {
                console.log(e)
            });

            // 为下一个数据块进行初始化
            obdidCount[dataJson.odbid] = 1;
            hashComputeHandlers[dataJson.odbid] = crypto.createHash('md5');
            currentStream.destroy();
            streamArrays[dataJson.odbid] = streamInit();

            res.write("the block finished!");
            res.end();
        }
    }
});


/***
 *  通过内容获取fabric链上信息，使用http-get方式
 */
app.get('/querydata',function (req,res) {
    console.log("enter");
    let date = req.query.date;
    let obd  = req.query.obdid;
    fabricService.queryCc(chaincodeName, "invoke", ["gethistory", obd, ""]).then(itemStrArry => {
        // res.end(itemStrArry)
        console.log("itemStrArry:",itemStrArry);
        let fabricInfo = null;
        let ret = {};
        let itemsInfo = eval(itemStrArry.toString());
        console.log("saved in fabric itemsInfo:", itemsInfo);

        if(itemsInfo !== null && itemsInfo !== undefined){

            for (let i = 0; i < itemsInfo.length; i++) {
                let dataJson = JSON.parse(itemsInfo[i]);
                if(date === dataJson.dataDate){
                    fabricInfo = dataJson;
                    break;
                }
            }
            ipfs.get(fabricInfo.ipfsAddr,function (err,files) {
                if (err || typeof files == "undefined") {
                    console.log(err);
                    res.end(JSON.stringify(err))
                } else {
                    let content = files[0].content.toString();

                    console.log("content:",content);
                    ret['obdid'] = obd;
                    ret['dataDate'] = fabricInfo.dataDate;
                    ret['ipfsAddr'] = fabricInfo.ipfsAddr;
                    ret['fileFingerprint'] = fabricInfo.fileFingerprint;
                    res.end(JSON.stringify(ret))
                }
            });
        }
    })
});


/***
 *  通过hash获取IPFS上数据块，使用http-get方式
 */
app.get('/getobject',function (req,res){
    let hash  = req.query.hash;
    ipfs.object.get(hash, (err, node) => {
        if (err) {
            res.end(err);
            throw err;
        }else {
            // res.end(node.data.toString());
            res.end(node.serialized.toString());
        }
    })
});

/***
 *  通过hash获取fabric上数据块，使用http-get方式
 */
app.get('/getfabricinfobyhash',function (req,res){
   fabricService.getTransaction(fabricinfo => {
       res.end(JSON.stringify(fabricinfo));
   })
});


//启动http服务
var server = app.listen(60003, function () {
    var host = server.address().address;
    var port = server.address().port;

    console.log('Example app listening at http://%s:%s', host, port);
});

//注册异常处理器
process.on('unhandledRejection', function (err) {
    console.error(err.stack);
});
process.on('uncaughtException', console.error);

const ipfsAPI = require('ipfs-api');
const ipfs = ipfsAPI('localhost', '5001', {protocol: 'http'});//连接本地IPFS
const buffer = Buffer.from('this is a demo');

const net = require('net');
const listenPort = 60001;//监听端口
const fs = require('fs'); // 引入fs模块
const crypto = require('crypto');
const config = require('./config');


// 向区块链发送Hash
function sendHashToBlockChain(){

}
// 向IPFS发送打包后的块
function sendBlockDataToIPFS(content) {
    const buffer = Buffer.from(content);
    const json = JSON.parse(content);
    console.log("typeof json:",typeof json)
    return new Promise(function (resolve,reject) {
        ipfs.add(content)
            .then( rsp => {
                console.log(rsp[0].hash);
                resolve(rsp[0].hash);
            })  //得到IPFS返回的hash
            .catch(err => console.error(err));
    })
}

// var globalWriteStream = null;

// var createWriteStreamAndMonitor = function (filePath) {
//     globalWriteStream = fs.createWriteStream(filePath);
//
//     globalWriteStream.on('finish',function () {
//         console.log()
//     });
//
//     globalWriteStream.on('error',function (err) {
//         console.log("globalWriteStream has a err:",err)
//     });
// };
//
// createWriteStreamAndMonitor(blockNumber,'../productionData/' + blockNumber + ".json");
//
// globalWriteStream.write(data);


// 创建socket服务端
var server = net.createServer(function(socket){

    let blockContent = null;
    let contentItemNumber = 0;
    let blockNumber = 0;
    let blockItems = config.blockItemsNum;
    let blockMd5 = "";
    socket.setEncoding('binary');
    //接收到数据
    socket.on('data',async function(data){
        // 该处不能使用阻塞方法
        // console.log('connect: ' + socket.remoteAddress + ':' + socket.remotePort);
        // console.log("data-----",data);
        // let dataJson = JSON.parse(data);
        // console.log("type of dataJson-----",typeof dataJson);

        contentItemNumber += 1;

        blockContent += data;

        if(contentItemNumber === blockItems){ // 本块最后一条
            console.log("enter if----------------------");

            // 计算该块的hash
            blockMd5 = crypto.createHash('md5').update(blockContent).digest('hex').toUpperCase();
            console.log("blockMd5: ",blockMd5);

            // 开启子进程读文件并向IPFS传输
            sendBlockDataToIPFS(blockContent).then((hash,err) => {
                if(err){
                    console.log(err);
                    return null;
                }else {
                    console.log("sendBlockDataToIPFS hash:",hash);
                    return ipfs.get(hash)
                }

            }).then(res => {
                console.log("ipfs get:",res)
                // sendHashToBlockChain(blockMd5,hash);
            });

            blockContent = "";

        }else if(contentItemNumber >= blockItems ){ // 下一块第一条
            contentItemNumber = 1;
            blockNumber += 1;

        }

        // console.log("contentItemNumber:"+contentItemNumber,+'\t'+"dataNum:"+data);

        await fs.writeFile('../productionData/' + blockNumber + ".json", data + '\n', { 'flag': 'a',encoding: 'utf8' }, function(err) {
            if (err) {
                throw err;
            }
        });


    });
    // socket.write('Hello client!\r\n');
    // socket.pipe(socket);
    //数据错误事件
    socket.on('error',function(exception){
        console.log('socket error:' + exception);
        socket.end();
    });
    //客户端关闭事件
    socket.on('close',function(data){
        console.log('client closed!');
        // socket.remoteAddress + ' ' + socket.remotePort);
    });
}).listen(listenPort);
//服务器监听事件
server.on('listening',function(){
    console.log("server listening:" + server.address().port);
});
//服务器错误事件
server.on("error",function(exception){
    console.log("server error:" + exception);
});





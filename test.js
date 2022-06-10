const path = require('path');
const path_escaped = path;

const isDev = true;
const fs = require('fs');
const unzipper = require('unzipper');
const express = require('express');
const app = express();
const axios = require("axios");
const apiCfg = require("./config")
const pty = require('node-pty');

const os = require('os');
const WebSocket = require('ws');
const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';


const bodyParser = require('body-parser');
app.use(bodyParser.json());
var envExists = false


const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: process.env
});

const cfg = {
    tmpPath: "D:\\Server\\Server-2.7-dev\\Grasscutter1",
    gcFileName: "Server.jar"
}



class respBase {
    code = 200
    msg = "OK"
    data = null
}

var gcData = {
    remote: {
        branch: "development",
        sha: "",
    },
    local: {
        tag: "development",
        hash: "",
        fileHash: "",
    },
    branch: "development",
    sha: "",
}

var gcConfig = {}
// ipcMain.handle("showOpenDialog", (_, title, props)=> {return dialog.showOpenDialog(mainWindow, {title: title, ...props});})

var pathLists = {
    cfgPath: path.resolve(cfg.tmpPath, "config.json"),
    gcFullPath: path.resolve(cfg.tmpPath, cfg.gcFileName),
}

var commands = {
    start: `cd ${cfg.tmpPath} ; java -jar ${pathLists.gcFullPath} \r`,
    stop: `stop \r`,
}

function loadGcCFG(){
    if (envExists) {

        fs.readFile(pathLists.cfgPath, 'utf8', function (err, data) {
            try {

                gcConfig = JSON.parse(data);
            } catch { }


        });
    }
}

function updateCommands(){
    commands = {
        start: `cd ${cfg.tmpPath} ; java -jar ${pathLists.gcFullPath} \r`,
        stop: `stop \r`,
    }
}

function updatePathLists(){
    pathLists = {
        cfgPath: path.resolve(cfg.tmpPath, "config.json"),
        gcFullPath: path.resolve(cfg.tmpPath, cfg.gcFileName),
    }

    envExists = fs.existsSync(cfg.tmpPath)

    loadGcCFG();
    updateCommands();
}



app.get('/', function (req, res) {
    res.send('Hello World');
})

// ipcMain.handle("get-data", (_, key, defaultValue)=>{return electronStore.get(key, defaultValue)})
app.get('/loadEnv', function (req, res) {
    var r = new respBase();

    if (!envExists) {
        r.msg="环境未配置！"
        r.code=500
        res.send(r);
        return;
    }

    r.data = cfg;
    res.send(JSON.stringify(r));
})

// ipcMain.handle("set-data", (_, key, value) => { return electronStore.set(key, value) })
app.post('/setGcPath', function (req, res) {
    var r = new respBase();

    r.data = req.body;

    cfg.gcFileName=req.body.selected
    cfg.tmpPath=req.body.targetPath

    updatePathLists()



    res.send(JSON.stringify(r));
})


app.get("/loadCFG", (req, res) => {
    var r = new respBase();

    if (!envExists) {
        r.msg="环境未配置！"
        r.code=500
        res.send(r);
        return;
    }
    fs.readFile(pathLists.cfgPath, 'utf8', function (err, data) {
        console.log(data);
        gcConfig = JSON.parse(data);

        r.data = gcConfig;
        res.send(JSON.stringify(r));
    });
})


app.get('/getCommits', function (req, res) {
    var r = new respBase();

    axios.get(`${apiCfg.GITHUB_API}/repos/grasscutters/grasscutter/commits?sha=${gcData.branch}`).then(resp => {
        r.data = resp.data;
        res.send(JSON.stringify(r));
    }).catch(err => {
        r.msg = err.msg;
        r.code = err.code;
        res.send(JSON.stringify(r));
    })
})


app.get("/getGcData", function (req, res) {
    var r = new respBase();

    if (!envExists) {
        r.msg="环境未配置！"
        r.code=500
        res.send(r);
        return;
    }


    const regex = /VERSION[\s\S]*ConstantValue[^0-9\-.a-zA-Z]*([0-9.\-a-zA-Z]+)[\s\S]*GIT_HASH[^0-9a-f]*([0-9a-f]+)[\s\S]*Code/;


    const unzipper = require('unzipper');


    try {
        const directory = unzipper.Open.file(pathLists.gcFullPath);

        const f = require('./utils/hashFile')
        let hashVal = f.hashFileSha256Async(pathLists.gcFullPath, f.algorithmType.SHA1)

        if (gcData.local.hash != "" && gcData.local.fileHash == hashVal) {
            r.data = gcData.local;

            res.send(r)
        } else {

            directory.then(zipfile => {

                let buildconfig = null;
                for (let index = 0; index < zipfile.files.length; index++) {
                    const element = zipfile.files[index];
                    if (element.path == 'emu/grasscutter/BuildConfig.class') {

                        buildconfig = element;
                        break;
                    }
                }

                buildconfig.buffer().then(extracted => {

                    const content = extracted.toString();

                    let ret = content.match(regex);
                    gcData.local.fileHash = hashVal;
                    gcData.local.tag = ret[1]
                    gcData.local.hash = ret[2]

                    r.data = gcData.local;
                    res.send(r)
                });
            })
        }





    } catch (e) {

        console.log(e);

    }





})

app.get("/startServer", (req, res) => {
    ptyProcess.write(commands.start)
})
app.get("/stopServer", (req, res) => {
    ptyProcess.write(commands.stop)
})
app.get("/serverStats", function (req, res) {


    var r = new respBase();


    
    if (!envExists) {
        r.msg="环境未配置！"
        r.code=500
        res.send(r);
        return;
    }


    if (gcConfig == {}) {
        r.msg = "未加载配置文件";
        res.send(r);
        return;
    }

    const serverStatsUrl = `https://${gcConfig.server.http.bindAddress}:${gcConfig.server.http.bindPort}/status/server`
    console.log(serverStatsUrl)

    axios.get(serverStatsUrl).then(resp => {
        r.data = resp.data;
        console.log(resp.data)
        res.send(JSON.stringify(r));

    }).catch(err => {
        r.data = err.message
        r.msg = err.code
        r.code = 500
        res.send(JSON.stringify(r));


    })




})

app.get("/checkEnv", function (req, res) {
    var r = new respBase();

    fs.exists(cfg.tmpPath, (exists) => {
        r.data = exists;
        res.send(r)
    })


})

app.get("/listFiles", function (req, res) {
    var r = new respBase();
    console.log(req.body)
    var cores = []
    fs.readdir(req.query.path, (err, files) => {

        // if (err) {
        //     r.code=500
        //     r.msg=err.message
        //     return
        // }


        for (let index = 0; index < files.length; index++) {
            const element = files[index];
            if (element.toLocaleLowerCase().endsWith(".jar")) {
                cores.push(element)
            }

        }
        r.data = cores;

        res.send(r)

    });


})


var server = app.listen(8081, function () {

    var host = server.address().address
    var port = server.address().port

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    envExists = fs.existsSync(cfg.tmpPath)



    loadGcCFG();

    console.log("应用实例，访问地址为 http://%s:%s", host, port)

})

const wss = new WebSocket.Server({ port: 4001 });

wss.on('connection', (ws) => {
    console.log('socket connection success');


    ptyProcess.write(`cd ${cfg.tmpPath}\r`)

    //接受数据
    ws.on('message', (res) => {
        ptyProcess.write(res)
    });


    //发送数据
    ptyProcess.on('data', function (data) {
        process.stdout.write(data);
        ws.send(data)
    });

});


module.exports = app
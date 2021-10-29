const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const fs = require('fs')
var path = require('path');
const AWS = require("aws-sdk");
const {
  Readable
} = require('stream');

// const webmBuffers = []
// const webmReadable = new Readable();
// let outputWebmStream = fs.createWriteStream('video.mp4');
// let arrayOfOutputStreams = [];

const io = require("socket.io")(server, {
  cors: {
    origin: '*',
  },
  maxHttpBufferSize: 1e8
});
let broadcaster;
const port = process.env.PORT || 80;
app.use('/static', express.static('public'))
// API URLS
app.get("/client/browser", function(req, res) {
  res.sendFile(__dirname + "/public/browser.html");
});
app.get("/client/browser2", function(req, res) {
  res.sendFile(__dirname + "/public/browser2.html");
});

// SOCKET URLS
io.sockets.on("error", e => console.log(e));
io.sockets.on("connection", socket => {

  // ########### Webrtc Sockets ##########
  socket.on('recording', (data, ExternalUserId, part) => {
    console.log(ExternalUserId, part);
    // webmReadable.push(data);
    // processRecorderData2(data)
    processRecorderData3(ExternalUserId, part, data) // Arun 1 binary_data
  })

  socket.on("message", (message) => {
    console.log("::::::::::::::");
    console.log(message);
    console.log("::::::::::::::");
  });

  socket.on('stopRecording', (channelName) => {
    // processRecorderData(ExternalUserId);
    // arrayOfOutputStreams.forEach((outputStream, index) => {
    //   outputStream.end();
    // });
    //
    // outputWebmStream.end()
    var fileName = channelName + '-video' + '.webm'
    upload('webm', 'single', fs.readFileSync(fileName), channelName + '-video');
  })

  socket.on("disconnect", () => {
    socket.to(broadcaster).emit("disconnectPeer", socket.id);
  });
});

function processRecorderData(channelName) {
  webmReadable.push(null);

  // var blob = new Blob(data, {
  //   type: "video/webm"
  // });
  var fileName = channelName + '-video' + '.webm'
  // let file = new File([blob], fileName, {
  //   type: 'video/webm',
  //   lastModified: Date.now()
  // })
  const outputWebmStream = fs.createWriteStream(fileName);
  webmReadable.pipe(outputWebmStream);
  outputWebmStream.on('finish', () => {
    upload('webm', 'single', fs.readFileSync(fileName), channelName);
  })
}

function processRecorderData2(data) {
  outputWebmStream.write(data, 'binary')
}

function processRecorderData3(channelName, part, data) {
  var fileName = channelName + '-video' + '.webm'
  if (checkFileExists(fileName)) {
    fs.promises.appendFile(fileName, data)
  } else {
    fs.createWriteStream(fileName).write(data, 'binary').end()
  }

}

function checkFileExists(file) {
  return fs.promises.access(file, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false)
}

const upload = async function uploadFilesToS3(extension, path, file, fileName) {
  console.log("Initializing upload to s3:::::::::::");

  return new Promise(async (resolve, reject) => {
    const bucket = new AWS.S3({
      accessKeyId: "",
      secretAccessKey: "",
      region: "us-east-1"
    });
    const params = {
      Bucket: 'w-call-meeting-files',
      Key: path + "/" + fileName + '.' + extension,
      Body: file
    };
    bucket.upload(params, async (err, data) => {
      if (data) {
        console.log("Video uploaded")
      }
      if (err) {
        console.log("Video upload failed")
        console.log(err);
      }
    })
  })
}
server.listen(port, () => console.log(`Server is running on port ${port}`));

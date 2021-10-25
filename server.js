const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const fs = require('fs')
const AWS = require("aws-sdk");
const {
  Readable
} = require('stream');
const webmBuffers = []
const webmReadable = new Readable();
const outputWebmStream = fs.createWriteStream('video.mp4');

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

// SOCKET URLS
io.sockets.on("error", e => console.log(e));
io.sockets.on("connection", socket => {

  // ########### Webrtc Sockets ##########
  socket.on('recording', (data, ExternalUserId, part) => {
    console.log(ExternalUserId, part);
    webmReadable.push(data);
    // processRecorderData2(data)
  })

  socket.on("message", (message) => {
    console.log("::::::::::::::");
    console.log(message);
    console.log("::::::::::::::");
  });

  socket.on('stopRecording', (ExternalUserId) => {
    processRecorderData(ExternalUserId);
    // outputWebmStream.end()
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
  outputWebmStream.on('finish', ()=>{
    upload('webm', 'single', fs.readFileSync(fileName), channelName);
  })
}

function processRecorderData2(data) {
  outputWebmStream.write(data, 'binary')
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

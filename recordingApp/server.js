require('dotenv').config()
const express = require("express");
const app = express();
const http = require("http");
const fs = require('fs')
const server = http.createServer(app);
const AWS = require("aws-sdk");
const bucket = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});
const io = require("socket.io")(server, {
  cors: {
    origin: '*',
  },
  maxHttpBufferSize: 1e8
});
const port = process.env.PORT || 9000;


app.use('/static', express.static('public'))

app.use(express.json())


// API URLS
app.get("/client", function(req, res) {
  res.sendFile(__dirname + "/public/4k_studio.html");
});

// SOCKET URLS
io.sockets.on("error", e => console.log(e));

io.sockets.on("connection", socket => {
  socket.on('recording', (data) => {
    console.log(data.ExternalUserId, data.part, "received::::::::");
    logger(data.session_id, `INFO::: SOCKET Received message Recording For::::: ${data.ExternalUserId} part ${data.part}`)
    console.log(data);
    let path = `studio/${data.studio_id}/${data.session_id}/captures/${data.ExternalUserId}`
    startS3VideoUpload(data.videoChunks[0], data.fileName,  path);
    // backup(studio_id, session_id, ExternalUserId, data, part);
  })
});


// Function to upload video chunks to s3 bucket
const upload = async function uploadFilesToS3(extension, path, file, fileName) {
  console.log("Initializing upload to s3:::::::::::");
  return new Promise(async (resolve, reject) => {

    const params = {
      Bucket: process.env.BUCKET_NAME,
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

// Trigger Function to invoke upload function
function startS3VideoUpload(videoDataChunks, fileName, currentRecordingS3Path) {
  upload('webm', currentRecordingS3Path, videoDataChunks, fileName);
}

// Function to record app logs
async function logger(id, message) {
  fs.appendFileSync(`logs/${id}.log`, message + "\r\n", 'utf-8');
}

server.listen(port, () => console.log(`Server is running on port ${port}`));

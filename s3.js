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

let activeUploadDirectory = {}
let completedStreamPartsInfo = {
  previouslyUploadedPart: {}
}
let streamBuffer = {}
const accessKeyId = ""
const secretAccessKey = ""
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
  socket.on('startRecording', (ExternalUserId) => {
    console.log("Strat Recording For:::::", ExternalUserId);
    InitiateNewS3Recording(ExternalUserId); // Arun 1 binary_data
  })
  socket.on('recording', (data, ExternalUserId, part) => {
    console.log(ExternalUserId, part, "received::::::::");
    upload(ExternalUserId, data);
  })

  socket.on("message", (message) => {
    console.log("::::::::::::::");
    console.log(message);
    console.log("::::::::::::::");
  });

  socket.on('stopRecording', (channelName) => {
    final_check(channelName);
  })

  socket.on("disconnect", () => {
    socket.to(broadcaster).emit("disconnectPeer", socket.id);
  });
});

function InitiateNewS3Recording(ExternalUserId) {
  console.log("Existing active uploads :::::", activeUploadDirectory);
  if (!activeUploadDirectory[ExternalUserId]) {
    console.log("Creating a new upload stream :::::", ExternalUserId);
    const bucket = new AWS.S3({
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
      region: "us-east-1"
    });
    const params = {
      Bucket: 'w-call-meeting-files',
      Key: "single/" + ExternalUserId + '.webm',
    };

    bucket.createMultipartUpload(params, function(err, data) {
      if (err) console.log(err, err.stack); // an error occurred
      else {
        console.log(data); // successful response
        activeUploadDirectory[ExternalUserId] = data.UploadId
        completedStreamPartsInfo[ExternalUserId] = []
        completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId] = 0
        streamBuffer[ExternalUserId] = {
          size: 0
        }

        console.log(activeUploadDirectory);
      }
    });
  } else {
    return
  }
}
const upload = async function uploadFilesToS3(ExternalUserId, data) {

  return new Promise(async (resolve, reject) => {
    if (streamBuffer[ExternalUserId]['size'] > 5242880) {
      part = completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId] + 1
      streamBuffer[ExternalUserId][part + 1 + ''] = [data]
      streamBuffer[ExternalUserId]['size'] = 0
      const bucket = new AWS.S3({
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
        region: "us-east-1"
      });
      streamData = Buffer.concat(streamBuffer[ExternalUserId][part + '']);
      const params = {
        Bucket: 'w-call-meeting-files',
        Key: "single/" + ExternalUserId + '.webm',
        PartNumber: part,
        UploadId: activeUploadDirectory[ExternalUserId],
        Body: streamData
      };
      bucket.uploadPart(params, async (err, data) => {
        if (data) {
          console.log("part ", part, " uploaded:::::")
          completedStreamPartsInfo[ExternalUserId].push({
            ETag: data.ETag,
            PartNumber: part
          })
          console.log(data);
          completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId] = part
          streamBuffer[ExternalUserId][part + ''] = []
        }
        if (err) {
          console.log("part ", part, " upload failed:::::")
          console.log(err);
        }
      })
    } else {
      part = completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId] + 1
      streamBuffer[ExternalUserId]['size'] += data.byteLength
      if (streamBuffer[ExternalUserId][part + '']) {
        streamBuffer[ExternalUserId][part + ''].push(data)
      } else {
        streamBuffer[ExternalUserId][part + ''] = [data]
      }
      console.log("Part No ::: ", part);
      console.log("Current Size of buffer :::: ", streamBuffer[ExternalUserId]['size']);
    }
  })

}

let final_check = async function checkDataInStreamBuffer(ExternalUserId) {
  console.log("Final Check Started :::::::::::::::");
  console.log("No of Stream Buffers:::::::::::::::", Object.keys(streamBuffer[ExternalUserId]));
  return new Promise(async (resolve, reject) => {
      console.log("Checking for data in every buffer part :::::::::::::::");

      for (i = 1; i < Object.keys(streamBuffer[ExternalUserId]).length; i++) {
        console.log("Checking stream buffer of part ", i, " ::::::::");
        if ((streamBuffer[ExternalUserId][i + ''].length > 0) &&( i > completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId])) {
          console.log("buffer Data found for part ", i, " ::::::::");
          let part = i
          const bucket = new AWS.S3({
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey,
            region: "us-east-1"
          });
          streamData = Buffer.concat(streamBuffer[ExternalUserId][part + '']);
          const params = {
            Bucket: 'w-call-meeting-files',
            Key: "single/" + ExternalUserId + '.webm',
            PartNumber: part,
            UploadId: activeUploadDirectory[ExternalUserId],
            Body: streamData
          };
          bucket.uploadPart(params, async (err, data) => {
              if (data) {
                console.log("part ", part, " uploaded in final check:::::")
                completedStreamPartsInfo[ExternalUserId].push({
                  ETag: data.ETag,
                  PartNumber: part
                })
                console.log(data, completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId]);

                completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId] = part;
                streamBuffer[ExternalUserId][part + ''] = [];
                console.log("Checking if Last Buffer Reached:::: ")
                console.log(Object.keys(streamBuffer[ExternalUserId]).length - 1, part);
              if (Object.keys(streamBuffer[ExternalUserId]).length - 1 == part) {
                console.log("Initializing Complete Upload to S3::::::")
                CompleteS3Upload(ExternalUserId);
                return
              }
            }
            if (err) {
              console.log("part ", part, " upload failed:::::")
              console.log(err);
            }
          })
      }
    }
    console.log("Final Check part ::::", completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId]); console.log("Final Check streamBuffer length ::::", Object.keys(streamBuffer[ExternalUserId]).length);
    if (Object.keys(streamBuffer[ExternalUserId]).length-1 == completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId]) {
      console.log("Initializing Complete Upload to S3");
      CompleteS3Upload(ExternalUserId);
      return
    }
  })

}

function CompleteS3Upload(ExternalUserId) {
  console.log("Completed Upload INfo:::::::", completedStreamPartsInfo[ExternalUserId]);
  var params = {
    Bucket: 'w-call-meeting-files',
    Key: "single/" + ExternalUserId + '.webm',
    UploadId: activeUploadDirectory[ExternalUserId],
    MultipartUpload: {
      Parts: completedStreamPartsInfo[ExternalUserId]
    }
  }
  const bucket = new AWS.S3({
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
    region: "us-east-1"
  });

  bucket.completeMultipartUpload(params, function(err, data) {
    if (err) console.log(err, err.stack); // an error occurred
    else {
      console.log(data); // successful response
      console.log(ExternalUserId, " upload completed::::");
    }
  });
  /* required */
}
server.listen(port, () => console.log(`Server is running on port ${port}`));
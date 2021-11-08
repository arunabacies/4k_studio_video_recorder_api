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
const port = process.env.PORT || 8000;
app.use('/static', express.static('public'))
// API URLS
app.use(express.json())
app.get("/client/browser", function(req, res) {
  res.sendFile(__dirname + "/public/browser.html");
});
app.get("/client/browser2", function(req, res) {
  res.sendFile(__dirname + "/public/browser2.html");
});
app.post("/recordings/terminate", (req, res) => {
  var json_data = req.body
  var uploadsToTerminate = json_data.ExternalUserIds
  var session_id = json_data.session_id
  var studio_id = json_data.studio_id
  console.log("API:::::::::::::", studio_id, session_id, uploadsToTerminate);
  terminateActiveUploads(studio_id, session_id, uploadsToTerminate)
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    message: "Stop Recording Initialized",
    data: uploadsToTerminate
  }));
})


// SOCKET URLS
io.sockets.on("error", e => console.log(e));
io.sockets.on("connection", socket => {

  // ########### Webrtc Sockets ##########
  socket.on('startRecording', (studio_id, session_id, ExternalUserId) => {
    console.log("Start Recording For:::::", ExternalUserId);
    InitiateNewS3Recording(studio_id, session_id, ExternalUserId); // Arun 1 binary_data
  })
  socket.on('recording', (data, studio_id, session_id, ExternalUserId, part) => {
    console.log(ExternalUserId, part, "received::::::::");
    upload(studio_id, session_id, ExternalUserId, data);
  })

  socket.on("message", (message) => {
    console.log("::::::::::::::");
    console.log(message);
    console.log("::::::::::::::");
  });

  socket.on('stopRecording', (studio_id, session_id, channelName) => {
    console.log("Stop Recording For:::::", channelName);
    final_check(studio_id, session_id, channelName);
  })

  socket.on("disconnect", () => {
    socket.to(broadcaster).emit("disconnectPeer", socket.id);
  });
});

function InitiateNewS3Recording(studio_id, session_id, ExternalUserId) {
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
      Key: "studio/" + studio_id + "/" + session_id + "/" + ExternalUserId + '.webm',
    };

    bucket.createMultipartUpload(params, function(err, data) {
      if (err) console.log(err, err.stack); // an error occurred
      else {
        console.log(data); // successful response
        activeUploadDirectory[ExternalUserId] = {
          studio_id: studio_id,
          session_id: session_id,
          UploadId: data.UploadId
        }
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
const upload = async function uploadFilesToS3(studio_id, session_id, ExternalUserId, data) {

  return new Promise(async (resolve, reject) => {
    try {
      if (streamBuffer[ExternalUserId]['size'] > 5242880) {
        const part = completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId] + 1
        completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId]++;
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
          Key: "studio/" + studio_id + "/" + session_id + "/" + ExternalUserId + '.webm',
          PartNumber: part,
          UploadId: activeUploadDirectory[ExternalUserId].UploadId,
          Body: streamData
        };
        bucket.uploadPart(params, async (err, data) => {
          if (data) {
            console.log("part ", part, " uploaded:::::")
            completedStreamPartsInfo[ExternalUserId].push({
              ETag: data.ETag,
              PartNumber: part
            })
            console.log(completedStreamPartsInfo);
            // completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId] = part
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
    } catch (e) {
      if (e instanceof TypeError) {
        // Output expected TypeErrors.
        console.log(e);
      } else {
        console.log(e, false);
      }
    }
  })

}

let final_check = async function checkDataInStreamBuffer(studio_id, session_id, ExternalUserId) {
  try {
    console.log("Final Check Started :::::::::::::::");
    console.log("No of Stream Buffers:::::::::::::::", Object.keys(streamBuffer[ExternalUserId]));
  } catch (e) {
    if (e instanceof TypeError) {
      // Output expected TypeErrors.
      console.log("final_check :::::::::::");
      console.log(e);
    } else {
      console.log(e, false);
    }
  }
  return new Promise(async (resolve, reject) => {
    console.log("Checking for data in every buffer part :::::::::::::::");
    try {
      for (i = 1; i < Object.keys(streamBuffer[ExternalUserId]).length; i++) {
        console.log("Checking stream buffer of part ", i, " ::::::::");
        if ((streamBuffer[ExternalUserId][i + ''].length > 0) && (i > completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId])) {
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
            Key: "studio/" + studio_id + "/" + session_id + "/" + ExternalUserId + '.webm',
            PartNumber: part,
            UploadId: activeUploadDirectory[ExternalUserId].UploadId,
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
                CompleteS3Upload(activeUploadDirectory[ExternalUserId].studio_id, activeUploadDirectory[ExternalUserId].session_id, ExternalUserId);
                return
              }
            }
            if (err) {
              console.log("part ", part, " upload failed:::::")
              console.log(err, err.stack);
            }
          })
        }
      }
    } catch (e) {
      if (e instanceof TypeError) {
        // Output expected TypeErrors.
        console.log(e);
      } else {
        console.log(e, false);
      }
    }

    try {
      console.log("Final Check part ::::", completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId]);
      console.log("Final Check streamBuffer length ::::", Object.keys(streamBuffer[ExternalUserId]).length);
      if (Object.keys(streamBuffer[ExternalUserId]).length - 1 == completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId]) {
        console.log("Initializing Complete Upload to S3");
        CompleteS3Upload(activeUploadDirectory[ExternalUserId].studio_id, activeUploadDirectory[ExternalUserId].session_id, ExternalUserId);
        return
      }
    } catch (e) {
      if (e instanceof TypeError) {
        // Output expected TypeErrors.
        console.log(e);
      } else {
        console.log(e, false);
      }
    }
  })

};

function CompleteS3Upload(studio_id, session_id, ExternalUserId) {
  console.log("Completed Upload INfo:::::::", completedStreamPartsInfo[ExternalUserId]);
  console.log(completedStreamPartsInfo);
  var params = {
    Bucket: 'w-call-meeting-files',
    Key: "studio/" + studio_id + "/" + session_id + "/" + ExternalUserId + '.webm',
    UploadId: activeUploadDirectory[ExternalUserId].UploadId,
    MultipartUpload: {
      Parts: getCompletedPartsInfo(completedStreamPartsInfo[ExternalUserId])
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
      delete activeUploadDirectory[ExternalUserId]
      delete streamBuffer[ExternalUserId]
      delete completedStreamPartsInfo[ExternalUserId]
      delete completedStreamPartsInfo['previouslyUploadedPart'][ExternalUserId]
    }
  });
  /* required */
}

function getCompletedPartsInfo(partsArray) {
  const arr = new Set();
  const reversed = partsArray.reverse();
  //  Eliminate duplicates with same PartNumber from the array of objects
  const filteredArr = reversed.filter(el => {
    const duplicate = arr.has(el.PartNumber);
    console.log(!duplicate);
    arr.add(el.PartNumber);
    return !duplicate;
  });
  console.log("reverse:::", reversed);
  console.log("Set:::", arr);
  console.log("Filtered Array:::", filteredArr);
  const data = filteredArr.sort(function(a, b) {
    return a.PartNumber - b.PartNumber;
  })
  //  Sort the data in ascending order
  return data
}

async function terminateActiveUploads(studio_id, session_id, uploadsToTerminate) {
  console.log("Terminating active Uploads:::::::::");
  await sleep(60000)
  uploadsToTerminate.forEach((externalUserID, i) => {
    console.log("Terminating active Uploads:::::::::", externalUserID);
    console.log(Object.keys(activeUploadDirectory));
    if (activeUploadDirectory.hasOwnProperty(externalUserID)) {
      console.log("Stopping active Upload:::::::::", externalUserID);
      CompleteS3Upload(studio_id, session_id, externalUserID)
    }
  });
};

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

server.listen(port, () => console.log(`Server is running on port ${port}`));

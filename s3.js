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
app.post("/recordings/backup/process", (req, res) => {
  var json_data = req.body
  var ExternalUserId = json_data.ExternalUserId
  var session_id = json_data.session_id
  var studio_id = json_data.studio_id
  console.log("API:::::::::::::", studio_id, session_id, ExternalUserId);
  processBackupToS3(studio_id, session_id, ExternalUserId)
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    message: "Stop Recording Initialized",
    data: json_data
  }));
})



// SOCKET URLS
io.sockets.on("error", e => console.log(e));
io.sockets.on("connection", socket => {

  // ########### Webrtc Sockets ##########
  socket.on('startRecording', (studio_id, session_id, ExternalUserId) => {
    console.log("Start Recording For:::::", ExternalUserId);
    logger(session_id, `INFO::: SOCKET Received message to Start Recording For::::: ${ExternalUserId}`)
    InitiateNewS3Recording(studio_id, session_id, ExternalUserId); // Arun 1 binary_data
  })

  socket.on('recording', (data, studio_id, session_id, ExternalUserId, part) => {
    console.log(ExternalUserId, part, "received::::::::");
    logger(session_id, `INFO::: SOCKET Received message Recording For::::: ${ExternalUserId} part ${part}`)
    upload(studio_id, session_id, ExternalUserId, data);
    backup(studio_id, session_id, ExternalUserId, data, part);

  })

  socket.on("message", (message) => {
    console.log("::::::::::::::");
    console.log(message);
    console.log("::::::::::::::");
  });

  socket.on('stopRecording', (studio_id, session_id, ExternalUserId) => {
    logger(session_id, `INFO::: SOCKET Received message Stop Recording For::::: ${ExternalUserId} `)
    console.log("Stop Recording For:::::", ExternalUserId);
    final_check(studio_id, session_id, ExternalUserId);
  })

  socket.on("disconnect", () => {
    socket.to(broadcaster).emit("disconnectPeer", socket.id);
  });
});

function InitiateNewS3Recording(studio_id, session_id, ExternalUserId) {
  console.log("Existing active uploads :::::", activeUploadDirectory);
  logger(session_id, `INFO::: FUNCTION InitiateNewS3Recording Started For::::: ${ExternalUserId}`)
  logger(session_id, `INFO::: FUNCTION InitiateNewS3Recording Checking For::::: ${ExternalUserId} :::: active uploads in activeUploadDirectory`)
  try {
    if (!activeUploadDirectory[ExternalUserId]) {
      logger(session_id, `INFO::: FUNCTION InitiateNewS3Recording Found For::::: ${ExternalUserId} :::: No active upload in activeUploadDirectory`)
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

      logger(session_id, `INFO::: FUNCTION InitiateNewS3Recording createMultipartUpload For::::: ${ExternalUserId}`)
      bucket.createMultipartUpload(params, function(err, data) {
        if (err) {
          console.log(err, err.stack); // an error occurred
          logger(session_id, `ERROR::: FUNCTION InitiateNewS3Recording createMultipartUpload For::::: ${ExternalUserId}:::: Error:::: ${err}`)
        } else {
          logger(session_id, `INFO::: FUNCTION InitiateNewS3Recording createMultipartUpload For::::: ${ExternalUserId}:::: SUCCESS :::: ${data}`)
          console.log(data); // successful response
          activeUploadDirectory[ExternalUserId] = {
            studio_id: studio_id,
            session_id: session_id,
            UploadId: data.UploadId
          }
          logger(session_id, `INFO::: FUNCTION InitiateNewS3Recording For::::: ${ExternalUserId}:::: added in activeUploadDirectory ::::`)
          completedStreamPartsInfo[ExternalUserId] = []
          completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId] = 0
          logger(session_id, `INFO::: FUNCTION InitiateNewS3Recording For::::: ${ExternalUserId}:::: created  completedStreamPartsInfo ::::`)
          streamBuffer[ExternalUserId] = {
            size: 0
          }
          logger(session_id, `INFO::: FUNCTION InitiateNewS3Recording For::::: ${ExternalUserId}:::: created  streamBuffer ::::`)
          console.log(activeUploadDirectory);
        }
      });
    } else {
      logger(session_id, `INFO::: FUNCTION InitiateNewS3Recording Found For::::: ${ExternalUserId} :::: active upload in activeUploadDirectory`)
      return
    }

  } catch (e) {
    if (e instanceof TypeError) {
      // Output expected TypeErrors.
      logger(session_id, `ERROR::: FUNCTION InitiateNewS3Recording TypeError For::::: ${ExternalUserId}:::: Error:::: ${e}`)
      console.log(e);
    } else {
      logger(session_id, `ERROR::: FUNCTION InitiateNewS3Recording Error For::::: ${ExternalUserId}:::: Error:::: ${e}`)
      console.log(e, false);
    }
  }
}

const upload = async function uploadFilesToS3(studio_id, session_id, ExternalUserId, data) {
  logger(session_id, `INFO::: FUNCTION uploadFilesToS3 Started For::::: ${ExternalUserId}`)
  logger(session_id, `INFO::: FUNCTION uploadFilesToS3 For::::: ${ExternalUserId} data RECEIVED in uploadFilesToS3:::`)

  return new Promise(async (resolve, reject) => {
    try {
      logger(session_id, `INFO::: FUNCTION uploadFilesToS3 Check For::::: ${ExternalUserId} ::: trying streamBuffer > 5242880`)
      if (streamBuffer[ExternalUserId]['size'] > 5242880) {
        logger(session_id, `INFO::: FUNCTION uploadFilesToS3 For::::: ${ExternalUserId} ::: streamBuffer > 5242880 SUCCESS :::`)
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
        logger(session_id, `INFO::: FUNCTION uploadFilesToS3 For::::: ${ExternalUserId} ::: trying uploadPart ${part} :::`)
        bucket.uploadPart(params, async (err, data) => {
          if (data) {
            console.log("part ", part, " uploaded:::::")
            logger(session_id, `INFO::: FUNCTION uploadFilesToS3 For::::: ${ExternalUserId} ::: uploadPart ${part} SUCCESS :::`)
            completedStreamPartsInfo[ExternalUserId].push({
              ETag: data.ETag,
              PartNumber: part
            })
            console.log(completedStreamPartsInfo);
            // completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId] = part
            streamBuffer[ExternalUserId][part + ''] = []
          }
          if (err) {
            logger(session_id, `INFO::: FUNCTION uploadFilesToS3 For::::: ${ExternalUserId} ::: uploadPart ${part} FAIL :::`)
            logger(session_id, `ERROR::: FUNCTION uploadFilesToS3 For::::: ${ExternalUserId} :::  ${err}`)
            console.log("part ", part, " upload failed:::::")
            console.log(err);
          }
        })
      } else {
        logger(session_id, `INFO::: FUNCTION uploadFilesToS3 Check For::::: ${ExternalUserId} ::: streamBuffer > 5242880 FAIL::::`)
        part = completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId] + 1
        streamBuffer[ExternalUserId]['size'] += data.byteLength
        if (streamBuffer[ExternalUserId][part + '']) {
          streamBuffer[ExternalUserId][part + ''].push(data)
          logger(session_id, `INFO::: FUNCTION uploadFilesToS3 For::::: ${ExternalUserId} ::: part ${part} streamBuffer data ADDED ::::`)
        } else {
          streamBuffer[ExternalUserId][part + ''] = [data]
          logger(session_id, `INFO::: FUNCTION uploadFilesToS3 For::::: ${ExternalUserId} ::: part ${part} streamBuffer data INITIALIZED ::::`)
        }
        console.log("Part No ::: ", part);
        console.log("Current Size of buffer :::: ", streamBuffer[ExternalUserId]['size']);
      }
    } catch (e) {
      if (e instanceof TypeError) {
        // Output expected TypeErrors.
        logger(session_id, `ERROR::: FUNCTION uploadFilesToS3 TypeError For::::: ${ExternalUserId}:::: Error:::: ${e}`)
        console.log(e);
      } else {
        logger(session_id, `ERROR::: FUNCTION uploadFilesToS3 Error For::::: ${ExternalUserId}:::: Error:::: ${e}`)
        console.log(e, false);
      }
    }
  })

}

const backup = async function backupFilesForS3(studio_id, session_id, ExternalUserId, data, part) {
  logger(session_id, `INFO::: FUNCTION backupFilesForS3 Started For::::: ${ExternalUserId}::: part ${part} :::`)

  return new Promise(async (resolve, reject) => {
    try {
      const json_data = {
        studio_id: studio_id,
        session_id: session_id,
        part: part,
        ExternalUserId: ExternalUserId,
        data: data.toString('binary')
      }
      let json = JSON.stringify(json_data);
      logger(session_id, `INFO::: FUNCTION backupFilesForS3 For::::: ${ExternalUserId}::: part ${part} data PREPARED :::`)
      let filePath = path.format({
        root: '/ignored',
        dir: `${__dirname}/${studio_id}/${session_id}/${ExternalUserId}`,
        base: `${part}.json`
      })
      ensureDirectoryExistence(filePath)
      console.log(filePath);
      fs.writeFile(filePath, json, (err) => {
        console.log(filePath);
        if (err){
          logger(session_id, `ERROR::: FUNCTION backupFilesForS3 For::::: ${ExternalUserId}::: part ${part} writeFile :::`)
          console.log(err);
        }
      });
    } catch (e) {
      if (e instanceof TypeError) {
        logger(session_id, `ERROR::: FUNCTION backupFilesForS3 For::::: ${ExternalUserId}::: part ${part} TypeError ${e} :::`)
        console.log(e);
      } else {
        logger(session_id, `ERROR::: FUNCTION backupFilesForS3 For::::: ${ExternalUserId}::: part ${part} Error ${e} :::`)
        console.log(e, false);
      }
    }
  });
}
function ensureDirectoryExistence(filePath) {
  var dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

let final_check = async function checkDataInStreamBuffer(studio_id, session_id, ExternalUserId) {
  logger(session_id, `INFO::: FUNCTION checkDataInStreamBuffer Started For::::: ${ExternalUserId}:::`)

  try {
    console.log("Final Check Started :::::::::::::::");
    console.log("No of Stream Buffers:::::::::::::::", Object.keys(streamBuffer[ExternalUserId]));
    logger(session_id, `INFO::: FUNCTION checkDataInStreamBuffer For::::: ${ExternalUserId}::: Parts Uploaded to S3 ::: ${Object.keys(streamBuffer[ExternalUserId])} PRESENT :::::`)
  } catch (e) {
    if (e instanceof TypeError) {
      // Output expected TypeErrors.
      console.log("final_check :::::::::::");
      logger(session_id, `ERROR::: FUNCTION checkDataInStreamBuffer For::::: ${ExternalUserId}::: TypeError ${e}  :::::`)
      console.log(e);
    } else {
      logger(session_id, `ERROR::: FUNCTION checkDataInStreamBuffer For::::: ${ExternalUserId}::: Error ${e}  :::::`)
      console.log(e, false);
    }
  }
  return new Promise(async (resolve, reject) => {
    console.log("Checking for data in every buffer part :::::::::::::::");
    logger(session_id, `INFO::: FUNCTION checkDataInStreamBuffer Checking For::::: ${ExternalUserId}::: trying streamBuffer data available :::`)
    try {

      for (i = 1; i < Object.keys(streamBuffer[ExternalUserId]).length; i++) {
        console.log("Checking stream buffer of part ", i, " ::::::::");
        if ((streamBuffer[ExternalUserId][i + ''].length > 0) && (i > completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId])) {
          console.log("buffer Data found for part ", i, " ::::::::");
          logger(session_id, `INFO::: FUNCTION checkDataInStreamBuffer Checking For::::: ${ExternalUserId}::: trying streamBuffer data found for S3 part ${i} :::`)

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
          logger(session_id, `INFO::: FUNCTION checkDataInStreamBuffer For::::: ${ExternalUserId} ::: trying uploadPart ${part} :::`)
          bucket.uploadPart(params, async (err, data) => {
            if (data) {
              console.log("part ", part, " uploaded in final check:::::")
              logger(session_id, `INFO::: FUNCTION checkDataInStreamBuffer For::::: ${ExternalUserId} ::: uploadPart ${part} SUCCESS :::`)

              completedStreamPartsInfo[ExternalUserId].push({
                ETag: data.ETag,
                PartNumber: part
              })
              console.log(data, completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId]);

              completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId] = part;
              streamBuffer[ExternalUserId][part + ''] = [];
              console.log("Checking if Last Buffer Reached:::: ")
              logger(session_id, `INFO::: FUNCTION checkDataInStreamBuffer Checking For::::: ${ExternalUserId} :::  Last Buffer Reached :::`)
              console.log(Object.keys(streamBuffer[ExternalUserId]).length - 1, part);
              if (Object.keys(streamBuffer[ExternalUserId]).length - 1 == part) {
                logger(session_id, `INFO::: FUNCTION checkDataInStreamBuffer Checking For::::: ${ExternalUserId} :::  Last Buffer Reached SUCCESS :::`)
                logger(session_id, `INFO::: FUNCTION checkDataInStreamBuffer For::::: ${ExternalUserId} :::  Ready to Complete Upload to S3 :::`)
                console.log("Initializing Complete Upload to S3::::::")
                CompleteS3Upload(activeUploadDirectory[ExternalUserId].studio_id, activeUploadDirectory[ExternalUserId].session_id, ExternalUserId);
                return
              }
            }
            if (err) {
              logger(session_id, `INFO::: FUNCTION checkDataInStreamBuffer For::::: ${ExternalUserId} ::: uploadPart ${part} FAIL :::`)
              logger(session_id, `ERROR::: FUNCTION checkDataInStreamBuffer For::::: ${ExternalUserId} :::  ${err}`)
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
        logger(session_id, `ERROR::: FUNCTION checkDataInStreamBuffer For::::: ${ExternalUserId}:::trying streamBuffer data available ::: TypeError ${e}  :::::`)

      } else {
        console.log(e, false);
        logger(session_id, `ERROR::: FUNCTION checkDataInStreamBuffer For::::: ${ExternalUserId}::: trying streamBuffer data available :::Error ${e}  :::::`)

      }
    }
    logger(session_id, `INFO::: FUNCTION checkDataInStreamBuffer For::::: ${ExternalUserId}:::  streamBuffer data available COMPLETED & CompleteS3Upload NOT INITIALIZED till now :::`)

    try {
      console.log("Final Check part ::::", completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId]);
      console.log("Final Check streamBuffer length ::::", Object.keys(streamBuffer[ExternalUserId]).length);
      logger(session_id, `INFO::: FUNCTION checkDataInStreamBuffer For::::: ${ExternalUserId}:::  trying streamBuffer end reached :::`)
      if (Object.keys(streamBuffer[ExternalUserId]).length - 1 == completedStreamPartsInfo.previouslyUploadedPart[ExternalUserId]) {
        logger(session_id, `INFO::: FUNCTION checkDataInStreamBuffer For::::: ${ExternalUserId}:::  trying streamBuffer end reached SUCCESS:::`)
        console.log("Initializing Complete Upload to S3");
        CompleteS3Upload(activeUploadDirectory[ExternalUserId].studio_id, activeUploadDirectory[ExternalUserId].session_id, ExternalUserId);
        return
      }
    } catch (e) {
      if (e instanceof TypeError) {
        // Output expected TypeErrors.
        console.log(e);
        logger(session_id, `ERROR::: FUNCTION checkDataInStreamBuffer For::::: ${ExternalUserId}::: trying streamBuffer end reached::: TypeError ${e}  :::::`)
      } else {
        logger(session_id, `ERROR::: FUNCTION checkDataInStreamBuffer For::::: ${ExternalUserId}::: trying streamBuffer end reached::: Error ${e}  :::::`)
        console.log(e, false);
      }
    }
  })

};

function CompleteS3Upload(studio_id, session_id, ExternalUserId) {
  logger(session_id, `INFO::: FUNCTION CompleteS3Upload Started For::::: ${ExternalUserId} :::  Upload to S3 INITIALIZED :::`)
  logger(session_id, `INFO::: FUNCTION CompleteS3Upload For::::: ${ExternalUserId} :::  completedStreamPartsInfo ${completedStreamPartsInfo[ExternalUserId]} :::`)
  try {
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
      logger(session_id, `INFO::: FUNCTION CompleteS3Upload For::::: ${ExternalUserId} :::  completeMultipartUpload STARTED :::`)
      if (err) {
        console.log(err, err.stack); // an error occurred
        logger(session_id, `INFO::: FUNCTION CompleteS3Upload For::::: ${ExternalUserId} :::  completeMultipartUpload FAILED :::`)
        logger(session_id, `ERROR::: FUNCTION CompleteS3Upload For::::: ${ExternalUserId} :::  Error ${err} :::`)

      } else {
        console.log(data); // successful response
        console.log(ExternalUserId, " upload completed::::");
        logger(session_id, `INFO::: FUNCTION CompleteS3Upload For::::: ${ExternalUserId} :::  completeMultipartUpload SUCCESS :::`)
        delete activeUploadDirectory[ExternalUserId]
        logger(session_id, `INFO::: FUNCTION CompleteS3Upload For::::: ${ExternalUserId} :::  activeUploadDirectory DELETED :::`)
        delete streamBuffer[ExternalUserId]
        logger(session_id, `INFO::: FUNCTION CompleteS3Upload For::::: ${ExternalUserId} :::  streamBuffer DELETED :::`)
        delete completedStreamPartsInfo[ExternalUserId]
        logger(session_id, `INFO::: FUNCTION CompleteS3Upload For::::: ${ExternalUserId} :::  completedStreamPartsInfo DELETED :::`)
        delete completedStreamPartsInfo['previouslyUploadedPart'][ExternalUserId]
        logger(session_id, `INFO::: FUNCTION CompleteS3Upload For::::: ${ExternalUserId} :::  completedStreamPartsInfo-previouslyUploadedPart DELETED :::`)
      }
    });
} catch (e) {
    if (e instanceof TypeError) {
      // Output expected TypeErrors.
      console.log(e);
      logger(session_id, `ERROR::: FUNCTION CompleteS3Upload For::::: ${ExternalUserId}::: TypeError ${e}  :::::`)

    } else {
      logger(session_id, `ERROR::: FUNCTION CompleteS3Upload For::::: ${ExternalUserId}::: Error ${e}  :::::`)
      console.log(e, false);
    }
  }
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
  logger(session_id, `INFO::: FUNCTION terminateActiveUploads Started ::: uploadIDs ${uploadsToTerminate}`)

  console.log("Terminating active Uploads:::::::::");
  await sleep(60000)
  uploadsToTerminate.forEach((externalUserID, i) => {
    console.log("Terminating active Uploads:::::::::", externalUserID);
    console.log(Object.keys(activeUploadDirectory));
    logger(session_id, `INFO::: FUNCTION terminateActiveUploads for ${externalUserID} ::: trying  activeUploadDirectory ::::`)
    if (activeUploadDirectory.hasOwnProperty(externalUserID)) {
      logger(session_id, `INFO::: FUNCTION terminateActiveUploads for ${externalUserID} ::: trying  activeUploadDirectory SUCCESS::::`)
      console.log("Stopping active Upload:::::::::", externalUserID);
      CompleteS3Upload(studio_id, session_id, externalUserID)
    } else{
      console.log("No active Upload for :::::::::", externalUserID);
      logger(session_id, `INFO::: FUNCTION terminateActiveUploads for ${externalUserID} ::: trying  activeUploadDirectory FAILED::::`)
    }
  });
};

async function processBackupToS3(studio_id, session_id, ExternalUserId) {
  logger(session_id, `INFO::: FUNCTION processBackupToS3 Started for ${ExternalUserId}:::`)
  try {
    // const data = []
    logger(session_id, `INFO::: FUNCTION processBackupToS3 for ${ExternalUserId}::: tring to read backed up data :::`)

    const jsonFiles = await fs.promises.readdir(`${studio_id}/${session_id}/${ExternalUserId}`)
      .then((files) => {

        let filteredFiles = files.filter(file => path.extname(file) === '.json');
        console.log(filteredFiles);
        let sorted = filteredFiles.sort((a, b) => {
          let s1 = parseInt(path.basename(a));
          let s2 = parseInt(path.basename(b));
          return s1 - s2;
        });
        logger(session_id, `INFO::: FUNCTION processBackupToS3 for ${ExternalUserId}::: backed up data ${sorted} :::`)
        sorted.forEach(file => {
          const fileData = fs.readFileSync(path.join(`${studio_id}/${session_id}/${ExternalUserId}`, file));
          const json = JSON.parse(fileData.toString());
          // data.push(Buffer.from(json.data, 'binary'))
          let bufferData = Buffer.from(json.data, 'binary')
          fs.appendFileSync(`${studio_id}/${session_id}/${ExternalUserId}/${ExternalUserId}.webm`, bufferData, 'binary');
          console.log(json.ExternalUserId, json.part);
          console.log(bufferData);
          console.log('part', file, ' appended to file! ', `${ExternalUserId}.webm`);
          logger(session_id, `INFO::: FUNCTION processBackupToS3 for ${ExternalUserId}::: part ${json.part} completed :::`)
        });
      })

  } catch (err) {
    logger(session_id, `ERROR::: FUNCTION processBackupToS3 for ${ExternalUserId}::: Error ${err}  :::`)
    console.error(err);
  }
};

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function logger(id, message) {
  fs.appendFileSync(`logs/${id}.log`, message + "\r\n", 'utf-8');
}

server.listen(port, () => console.log(`Server is running on port ${port}`));

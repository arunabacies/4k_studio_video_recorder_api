# 4K Studio - Recording App
An app which provides sockets to upload video chunks directly to s3 Bucket.

## Setting up Environment
The `.env`  file is used to define enviroment variables which will be used run the application. Please setup an AWS account and update the following variables in `.env` file.
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_REGION
- BUCKET_NAME

**Other Configs**
- PORT -  specify the port on which the application should run

## Development Guidelines
We use `.env` file for local development. Update development environment variables in  `./.env`.
### `Install Dependencies`
```
cd recordingApp
npm install
```
### `Development`
By default the development server starts on `PORT 9000`. To start the development server, please run the following command below.
```
npm start
```
## How to send data to app
After connecting the client app to the socket. The data should be passed on as an `Object`.
- Socket URL: `/recording`
- Data -
```
        {
            videoChunks: videoChunks,
            studio_id: studio_id,
            session_id: session_id,
            ExternalUserId: ExternalUserId,
            part: part,
            fileName: fileName
          }
```
- videoChunks - Data recorded using Webrtc Media Recorder
- studio_id - All recording data will be stored in "BUCKET_NAME/studio/{studio_id}/"
- session_id - recordings belonging same session will be stored in  "BUCKET_NAME/studio/{studio_id}/{session_id}"
- ExternalUserId - recordings of a user will be stored in  "BUCKET_NAME/studio/{studio_id}/{session_id}/{ExternalUserId}/"
- part -  PART Number to identify the Recording Number
- fileName - A standard naming for the VideoChunk
`${currentDate.getFullYear()}-${(currentDate.getMonth() + 1)}-${currentDate.getDay()}-${currentDate.getHours()}-${currentDate.getMinutes()}-${currentDate.getSeconds()}-${currentDate.getMilliseconds()}-${ExternalUserId}`

Code should be updated or modified in `recordingApp/server.js` file. Static files should be added in the `./public/` directory. After the the modification you can test the app by running the following commands
```
cd recordingApp
npm start
OR
node server.js
```
### `Testing`
A demo Interface for testing the app is provided as part of this application. Goto `http://localhost:PORT/client`.
- start recording button - initiates the recording and passes data to app for s3 Bucket upload.
- stop recording button - stops the active upload

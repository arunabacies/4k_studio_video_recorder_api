# 4K Studio - Processing App
An app which downloads data from s3 Bucket and concatenates video chunks using FFMPEG and uploads the final output to s3 bucket as a single video file

## Setting up Environment
The `.env` file is used to define enviroment variables which will be used run the application. Please setup an AWS account and update the following variables in `.env` file.
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- BUCKET_NAME

#### Prerequisite
- FFMPEG installed in OS
## Development Guidelines

### `Install Dependencies`
Create a virtual environment and then install the required dependencies by running
```
cd processingApp
pip install -r requirements.txt
```
### `Development`

```
export FLASK_APP=app.py
export FLASK_ENV=development
cd processingApp/app/
flask run

```
Code should be updated or modified in `app/app.py` file. After the the modification you can test the app by running the following commands
```
cd processingApp
flask run
OR
docker-compose up  
```

The app is linked to port `5000`.

## APIs
#### `Process Video`
- URL: /api/process/video
The API initiates the processing of video chunks of a user(s) available in the s3 bucket.
```
METHOD: POST
SAMPLE DATA:
        {
            "session_id": "SessionID",
            "studio_id": "StudioId",
            "externalUserIds": ["AJ"]
        }
```
#### `List Video Chunks`
- URL: /api/list/studio
The API Lists chunks available in the s3 bucket of a particular studio's session.
```
METHOD: POST
SAMPLE DATA:
        {
            "session_id": "SessionID",
            "studio_id": "StudioId"
        }
```

## Deployment
### `Docker Deployment`
#### Build Image
    docker-compose build


#### Run the app

    docker-compose up -d

The app runs on  port `5000`, environmet variables in the `.env file`.
Lookup `docker-compose.yaml` & `./processingApp/Dockerfile` file to change docker configuration.

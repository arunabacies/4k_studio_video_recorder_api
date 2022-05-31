# compose_flask/app.py
from flask import Flask, jsonify, request
import boto3
import os
import subprocess
import shlex
import requests
import json
# from rq import Queue
# from rq.job import Job
# from app.worker import conn


SOURCE_BUCKET = os.environ['MEDIA_CAPTURE_BUCKET']
W_CALL_ACCESS_KEY = os.environ['W_CALL_ACCESS_KEY']
W_CALL_SECRET_KEY = os.environ['W_CALL_SECRET_KEY']
SOURCE_PREFIX = 'studio'
s3 = boto3.client('s3', aws_access_key_id=W_CALL_ACCESS_KEY,
                  aws_secret_access_key=W_CALL_SECRET_KEY)

app = Flask(__name__)
# q = Queue(connection=conn)


@app.route('/api/process/video', methods=['POST'])
def process_video():
    studio_id = request.json.get('studio_id')
    session_id = request.json.get('session_id')
    externalUserIds = request.json.get('externalUserIds')
    # job = q.enqueue_call(
    #     func=handler_process_video, args=(
    #         studio_id, session_id, externalUserIds), result_ttl=5000
    # )
    handler_process_video(studio_id, session_id, externalUserIds)
    return jsonify({"message": "success", "status": 200}), 200


@app.route('/api/list/studio', methods=['POST'])
def list_studio():
    studio_id = request.json.get('studio_id')
    session_id = request.json.get('session_id')
    objects = s3.list_objects_v2(Bucket=SOURCE_BUCKET,
                                 MaxKeys=1000,
                                 Prefix='studio/{}/{}'.format(
                                     studio_id, session_id),
                                 )
    # s3.download_file(
    #     SOURCE_BUCKET, objects['Contents'][0]['Key'], '/ProcessVideo/{}/{}/download.webm'.format(studio_id, session_id))
    # if objects['Contents']:
    # s3.delete_objects(
    #     Bucket=SOURCE_BUCKET,
    #     Delete={
    #         'Objects': [{"Key": object['Key']} for object in objects['Contents']],
    #         'Quiet': True
    #     })

    return jsonify({"message": "success", "data": objects.get('Contents')}), 200


###########################


def process_files(objs_keys, studio_id, session_id, attendee=None):
    if attendee:
        attendeeStr = attendee
    else:
        attendeeStr = ""
    # Video MERGING
    try:
        with open('/ProcessVideo/{}/{}/'.format(studio_id, session_id) + attendeeStr + '_list.txt', 'w') as f:
            for k in objs_keys:
                f.write(
                    f'file \'/ProcessVideo/{studio_id}/{session_id}/{k}\'\n')

        ffmpeg_cmd = "ffmpeg -f concat -safe 0 -i /ProcessVideo/{}/{}/".format(studio_id, session_id) + attendeeStr + \
            "_list.txt  -c copy /ProcessVideo/{}/{}/".format(
                studio_id, session_id) + attendeeStr + ".webm -y"
        command1 = shlex.split(ffmpeg_cmd)
        p1 = subprocess.run(command1, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE)
        print("WEBM:::::", ffmpeg_cmd)

        s3.upload_file('/ProcessVideo/{}/{}/'.format(studio_id, session_id) + attendeeStr + '.webm',
                       SOURCE_BUCKET,  "studio/{}/{}/processed/{}.webm".format(studio_id, session_id, attendeeStr.replace("#", "_")))

    except Exception as e:
        print(e)
    return


def emptyDir(folder):
    fileList = os.listdir(folder)
    print("Files present in directory::::", len(fileList))
    # print(fileList)
    for f in fileList:
        filePath = folder + '/' + f
        if os.path.isfile(filePath):
            os.remove(filePath)
        elif os.path.isdir(filePath):
            newFileList = os.listdir(filePath)
            for f1 in newFileList:
                insideFilePath = filePath + '/' + f1
                if os.path.isfile(insideFilePath):
                    os.remove(insideFilePath)


def handler_process_video(studio_id, session_id, externalUserIds):
    # This demo is limited in scope to give a starting point for how to process
    # produced audio files and should include error checking and more robust logic
    # for production use. Large meetings and/or long duration may lead to incomplete
    # recordings in this demo.

    print(studio_id, session_id, externalUserIds)
    command1 = shlex.split(
        "mkdir -p /ProcessVideo/{}/{}".format(studio_id, session_id))
    p1 = subprocess.run(command1, stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE)

    if os.path.isdir("/ProcessVideo/{}/{}".format(studio_id, session_id)):
        print("Folder Created ::: /ProcessVideo/{}/{}".format(studio_id, session_id))
    else:
        print("Error Creating Folder::: ")

    emptyDir('/ProcessVideo/{}/{}'.format(studio_id, session_id))

    videoPrefix = SOURCE_PREFIX + \
        '/{}/{}/captures'.format(studio_id, session_id)

    paginator = s3.get_paginator('list_objects_v2')
    pages = paginator.paginate(Bucket=SOURCE_BUCKET, Prefix=videoPrefix)

    paginator = s3.get_paginator('list_objects_v2')
    pages = paginator.paginate(Bucket=SOURCE_BUCKET, Prefix=videoPrefix)

    videoObjects = []
    for page in pages:
        videoObjects.extend(page.get('Contents', []))
    print("No of Video Objs :::::", len(videoObjects))

    if videoObjects:
        file_list = []
        for object in videoObjects:
            path, filename = os.path.split(object['Key'])
            file_list.append(filename)

        vid_keys = list(filter(lambda x:  any(
            item in x for item in ['mp4', 'webm']), file_list))
        # print(vid_keys)
        for attendee in externalUserIds:
            print("Concatenating " + " files for " + attendee + "...")
            attendeeVidKeys = list(filter(lambda x: attendee in x, vid_keys))
            print(len(attendeeVidKeys))
            download_files = []
            for object in videoObjects:
                path, filename = os.path.split(object['Key'])
                if filename in attendeeVidKeys:
                    s3.download_file(
                        SOURCE_BUCKET, object['Key'], '/ProcessVideo/{}/{}/{}'.format(studio_id, session_id, filename))
                    download_files.append(filename)
            print("Downloaded Files for {}".format(attendee))
            print(len(download_files))
            if download_files:
                process_files(attendeeVidKeys, studio_id, session_id, attendee)
                emptyDir('/ProcessVideo/{}/{}'.format(studio_id, session_id))

    else:
        print("No videos")
    return


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True)

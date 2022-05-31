ARG RUNTIME_VERSION="3.9"
ARG DISTRO_VERSION="3.12"

# pull official base image
FROM python:${RUNTIME_VERSION}-alpine${DISTRO_VERSION} AS python-alpine
# Install GCC (Alpine uses musl but we compile and link dependencies with GCC)
RUN apk add --no-cache \
    libstdc++

# create the app user
RUN addgroup -S user && adduser -S user user

# set work directory
WORKDIR /home/user


# set work directory
RUN mkdir -p /home/user/project
RUN mkdir -p /ProcessVideo
ENV APP_HOME=/home/user/project
WORKDIR $APP_HOME

# set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# install dependencies
COPY ./requirements.txt .
RUN pip install -r requirements.txt

RUN apk add --no-cache \
    build-base \
    libtool \
    autoconf \
    automake \
    libexecinfo-dev \
    make \
    cmake \
    libcurl
RUN apk add ffmpeg
RUN mkdir downloads

# copy project
COPY app app
COPY run.gunicorn.sh .
COPY config.py .
COPY .env ./.env

# run run.gunicorn.sh
RUN chmod +x run.gunicorn.sh
RUN chown -R user:user ./
RUN chown -R user:user /ProcessVideo
RUN ls

# change to the app user
USER user
#ENTRYPOINT ["./run.gunicorn.sh"]

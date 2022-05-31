#!/bin/bash
gunicorn --config config.py app.wsgi:app

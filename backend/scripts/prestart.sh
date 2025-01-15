#! /usr/bin/env bash

set -e
set -x

# Let the DB start
python --version
python app/backend_pre_start.py

echo "1"
# Run migrations
alembic upgrade head
echo "2"

# Create initial data in DB
python app/initial_data.py
echo "3"

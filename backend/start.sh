#!/bin/sh
# Apply pending migrations, then launch the API. Runs on every container boot;
# `alembic upgrade head` is a no-op when the DB is already current.
set -e

echo "[captionato] running migrations..."
alembic upgrade head

echo "[captionato] starting API on :8000"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000

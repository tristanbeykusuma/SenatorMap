#!/bin/sh
# Container entrypoint for Senator Map.
#
# Fly.io mounts persistent volumes owned by root, but the app runs as the
# unprivileged `appuser`. Without this step better-sqlite3 fails to open
# /data/denyut.db with "unable to open database file" (SQLITE_CANTOPEN).
# Fix ownership here while still root, then drop privileges for the process.
set -e

DATA_DIR="${DATA_DIR:-/data}"
APP_UID="${APP_UID:-1001}"
APP_GID="${APP_GID:-1001}"

mkdir -p "$DATA_DIR" "$DATA_DIR/uploads"

# A read-only or already-correct mount is not fatal; the app will fail loudly
# with a clear error in that case instead of the container dying here.
chown -R "$APP_UID:$APP_GID" "$DATA_DIR" 2>/dev/null || \
  echo "[entrypoint] could not chown $DATA_DIR (continuing)" >&2

exec su-exec "appuser" "$@"

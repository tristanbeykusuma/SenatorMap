#!/bin/sh
# Container entrypoint for Senator Map.
#
# The app is stateless, so the only directory that must be writable is the
# upload scratch space. It runs as an unprivileged user, and /tmp on most
# hosts is world-writable, but a host may mount it with narrower permissions,
# so ownership is corrected here while still root.
set -e

UPLOAD_DIR="${UPLOAD_DIR:-/tmp/uploads}"
APP_UID="${APP_UID:-1001}"
APP_GID="${APP_GID:-1001}"

mkdir -p "$UPLOAD_DIR"
chown -R "$APP_UID:$APP_GID" "$UPLOAD_DIR" 2>/dev/null || \
  echo "[entrypoint] could not chown $UPLOAD_DIR (continuing)" >&2

exec su-exec "appuser" "$@"

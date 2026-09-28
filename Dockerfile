# Fallback container image for Senator Map.
# Use this if Render ever stops supporting the Node blueprint, or deploy on
# any other platform (Fly.io, AWS ECS, a VPS, self-hosted Docker).
#
# Build:  docker build -t senator-map .
# Run:    docker run -p 8080:8080 -e DB_PATH=/data/denyut.db -v senator-map-data:/data senator-map
#
# The persistent volume at /data holds denyut.db and uploads/ so data
# survives container restarts.

FROM node:24-alpine AS base

WORKDIR /app

# better-sqlite3 is a native module — it needs Python + build toolchain to
# compile during `npm ci`. Install them once, then clean up to keep the
# image small.
RUN apk add --no-cache python3 make g++

# Install deps first (better layer caching).
COPY server/package.json server/package-lock.json ./server/
COPY server/client/package.json server/client/package-lock.json ./server/client/

RUN cd server && npm ci --omit=dev && cd client && npm ci

# Build the SPA.
COPY server/client ./server/client
RUN cd server/client && npm run build

# Install server deps (production only).
COPY server ./server

WORKDIR /app/server

# Drop root privileges — never run Express as root.
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup \
    && chown -R appuser:appgroup /app \
    && mkdir -p /data/uploads \
    && chown -R appuser:appgroup /data

USER appuser

EXPOSE 8080

ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/denyut.db \
    ROOT_DB_PATH=/data/denyut.db \
    UPLOAD_DIR=/data/uploads \
    HOST=0.0.0.0

CMD ["node", "index.js"]
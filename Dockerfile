# syntax=docker/dockerfile:1
#
# Senator Map — production image (Fly.io / any Docker host).
#
#   docker build -t senator-map .
#   docker run -p 8080:8080 -v senator-map-data:/data senator-map
#
# /data holds denyut.db and uploads/ on a persistent volume, so the database
# and uploaded workbooks survive restarts, rebuilds, and new releases.

# ---------------------------------------------------------------- build stage
FROM node:24-alpine AS builder

WORKDIR /app

# better-sqlite3 is a native module: it needs Python and a C++ toolchain to
# compile from source when no prebuild matches musl/node 24.
RUN apk add --no-cache python3 make g++

COPY server/package.json server/package-lock.json ./server/
COPY server/client/package.json server/client/package-lock.json ./server/client/

# Server runtime deps (prod only) and client build deps are installed
# separately so the runtime image never carries build tooling.
RUN cd server && npm ci --omit=dev
RUN cd server/client && npm ci

COPY server/client ./server/client
RUN cd server/client && npm run build

COPY server ./server

# -------------------------------------------------------------- runtime stage
FROM node:24-alpine AS runtime

WORKDIR /app

# su-exec lets the container start as root, fix ownership on the mounted
# volume, then drop to an unprivileged user before running Node.
RUN apk add --no-cache su-exec tini

COPY --from=builder /app/server ./server
COPY --from=builder /app/server/node_modules ./server/node_modules

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN addgroup -g 1001 -S appgroup \
    && adduser -u 1001 -S appuser -G appgroup \
    && chown -R appuser:appgroup /app \
    && mkdir -p /data/uploads \
    && chown -R appuser:appgroup /data

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DB_PATH=/data/denyut.db \
    ROOT_DB_PATH=/data/denyut.db \
    UPLOAD_DIR=/data/uploads

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/admin/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/server

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "index.js"]

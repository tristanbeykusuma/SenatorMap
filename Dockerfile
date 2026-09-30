# syntax=docker/dockerfile:1
#
# Senator Map — production image for any Docker host (Render, Koyeb, ECS, VPS).
#
#   docker build -t senator-map .
#   docker run -p 8080:8080 -e TURSO_DATABASE_URL=... -e TURSO_AUTH_TOKEN=... senator-map
#
# The app is stateless: all persistent data lives in a remote Turso/libSQL
# database, and uploaded workbooks are parsed in-request and then deleted. So
# no volume is required and the container can run on an ephemeral filesystem.

# ---------------------------------------------------------------- build stage
FROM node:24-alpine AS builder

WORKDIR /app

# The toolchain is kept only in the builder. @libsql/client ships prebuilt
# binaries, but a toolchain here means the build still succeeds on musl
# architectures where no prebuild matches.
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

# tini forwards SIGTERM/SIGINT to Node so the process shuts down cleanly.
RUN apk add --no-cache su-exec tini

# Copy only what the server actually runs: its sources, its production
# dependencies, and the built SPA. Copying the whole `server` directory here
# would drag ~139 MB of client build tooling into the runtime image.
COPY --from=builder /app/server/*.js ./server/
COPY --from=builder /app/server/package.json /app/server/package-lock.json ./server/
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server/dist ./server/dist

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN addgroup -g 1001 -S appgroup \
    && adduser -u 1001 -S appuser -G appgroup \
    && chown -R appuser:appgroup /app \
    && mkdir -p /tmp/uploads \
    && chown -R appuser:appgroup /tmp/uploads

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    UPLOAD_DIR=/tmp/uploads \
    NODE_OPTIONS=--max-old-space-size=384

# TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are NOT baked in here. Supply them
# at run time, or the server falls back to a local file database.

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/admin/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/server

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "index.js"]

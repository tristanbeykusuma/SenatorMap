# Senator Map — Deployment Guide

Two deployment paths, both verified locally:

| Path | Config | Best for |
|------|--------|----------|
| **Render Blueprint** (recommended) | `render.yaml` | One-click free deploy, no Docker daemon needed |
| **Docker / container** | `Dockerfile` | Fly.io, AWS ECS, a VPS, or self-hosted |

Both produce the same artifact: a Node 24 Express server that serves the
Vite SPA from `server/dist` and the `/api/*` routes, backed by
`better-sqlite3` on a persistent disk at `/var/data`.

---

## Path 1 — Render (free)

1. Sign up at [render.com](https://render.com) and connect your GitHub repo.
2. Click **New** → **Blueprint**. Render reads `render.yaml` automatically.
3. The free plan is selected by default. Click **Create**.
4. Build runs:
   - `cd server/client && npm install && npm run build` (SPA → `server/dist`)
   - `cd ../ && npm install` (Express deps)
   - `cd server && npm start`
5. A 1 GB persistent disk is created at `/var/data`. `denyut.db` and
   `uploads/` live there and survive deploys/restarts.
6. Health check polls `/api/admin/status`. Once 200, the site is live at
   `https://senator-map-xxxx.onrender.com`.

### Custom domain + SSL (Render)

Render issues **automatic Let's Encrypt SSL** for custom domains on the free
tier — no extra config needed.

1. In the Render dashboard, open the service → **Settings** → **Custom Domain**.
2. Add your domain (e.g. `senator.map`).
3. Add the CNAME record Render shows at your DNS provider:
   ```
   senator  CNAME  xxx.onrender.com
   ```
4. Render auto-provisions the SSL certificate. HTTPS is live once the DNS
   record propagates (usually < 5 min).

---

## Path 2 — Docker (Fly.io / ECS / VPS)

```sh
docker build -t senator-map .
docker run -d --name senator-map -p 8080:8080 \
  -e DB_PATH=/data/denyut.db \
  -v senator-map-data:/data \
  senator-map:latest
```

- Volume `/data` holds `denyut.db` and `uploads/` — survives restarts.
- Port 8080, env vars are set in the image defaults; override with `-e`.
- Verified: `GET /api/admin/status` → 200, `GET /radar` → SPA, and
  `POST /api/upload/radar` → 41 branches.

### Fly.io (free tier, 256 MB)

```sh
fly launch   # creates fly.toml from the Dockerfile
fly volumes create senator-map-data --size 1
fly deploy
```

### AWS ECS / any VPS

Push the image to ECR (or Docker Hub) and run it on a Fargate task or an EC2
instance with a target group on port 8080. Mount an EFS volume at `/data`.

---

## Environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | injected by platform | Listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `DB_PATH` | `/data/denyut.db` (deploy) | SQLite file |
| `ROOT_DB_PATH` | `/data/denyut.db` (deploy) | Root DB copy |
| `UPLOAD_DIR` | `/data/uploads` (deploy) | File upload dir |
| `NODE_ENV` | `production` | Express env |

## Health check

`GET /api/admin/status` returns `{"status":"ok",...}` — used by Render and
any other platform as the readiness probe.
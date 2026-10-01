# Senator Map — Deployment Guide

**The app is stateless.** All persistent data lives in a remote Turso/libSQL
database, and uploaded workbooks are parsed in-request and then deleted. That
is what lets it run on a free host with an ephemeral filesystem and no
persistent disk.

## Recommended: Render free tier (no credit card)

Render's free web services need no payment method, have no disk option, and
spin down after 15 minutes idle. This app is built for exactly that.

| | |
|---|---|
| Cost | $0, no credit card |
| Instance | 512 MB RAM, 0.1 CPU |
| Disk | ephemeral (irrelevant — state is remote) |
| Idle | spins down after 15 min, ~1 min to wake |
| Config | `render.yaml` |

### 1. Create the database at Turso (free, no card)

1. Sign up at <https://app.turso.tech> — free plan, no card required.
2. Create a database and copy the connection URL and token from the dashboard,
   or use the CLI:
   ```powershell
   npx @libsql/cli@latest auth signup
   npx @libsql/cli@latest db create senator-map
   npx @libsql/cli@latest db tokens create --url libsql://senator-map-<you>.turso.io
   ```
   You need `TURSO_DATABASE_URL` (`libsql://senator-map-<you>.turso.io`) and
   `TURSO_AUTH_TOKEN`.

   The free plan includes 100 databases, 5 GB storage, 500M rows read and 10M
   rows written per month, with no overage billing.

### 2. Deploy to Render

1. Push this repo to GitHub.
2. In the Render dashboard: **New → Blueprint**.
3. Connect the repo. Render reads `render.yaml`.
4. When prompted for `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, paste the
   values from step 1.
5. Deploy. The site is live at `https://senator-map.onrender.com`.

The schema is created automatically on first boot — there is no migration step.

### 3. Load your data

The database starts empty by design. In the app:

- **Radar** tab → upload `REKAM MEDIS CABANG JULI 2026.xlsx` (41 branches).
- **Denyut** tab → upload the denyut and senator workbooks.

### Health check

`GET /api/admin/status` returns `{"status":"ok",...}` and is configured as the
Render health check.

### First request after idle

Free instances sleep after 15 minutes idle and take roughly a minute to wake.
Render shows a loading page while it starts. This is a property of the free
tier, not the app.

---

## Fly.io (requires a credit card)

Fly removed its no-card free tier — new organisations must add a payment
method before an app can be created, and the free trial is capped at 2 VM
hours or 7 days. `fly.toml` is kept working for if a card is ever added; the
app needs no volume there either.

```powershell
fly apps create senator-map-denyut
fly secrets set TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=...
fly deploy
```

Do **not** run `fly launch` — it rewrites `fly.toml`.

### What it costs

Fly is pay-as-you-go and has no hard spending cap, so the bound comes from
the configuration itself. Pricing below is current as of 1 October 2026.

Our Machine is `shared-cpu-1x` with 1 GB RAM:

| Component | Monthly |
|---|---|
| `shared-cpu-1x` base (256 MB) | $2.19 |
| Extra RAM (768 MB @ $6.00/GB/mo) | $4.50 |
| **Worst case, running 24/7** | **$6.69** |

There is no volume, no dedicated IPv4, and no autoscaler, so the ceiling is
fixed. Fly never creates Machines on your own — anything running was
something we defined. `auto_stop_machines = "stop"` means an idle app costs
almost nothing; roughly $0.20/month if used about two hours a day.

Why 1 GB and not 256 MB: 256 MB would cut the ceiling to $2.19 but is tight
enough to risk out-of-memory failures when parsing the radar workbook. The
extra $4.50/month buys reliability.

Two safeguards: watch "current month to date bill" in the dashboard, and
`fly scale count 0` stops everything immediately. Fly states it will discuss
a refund for compute created by mistake.

---

## Local development

```powershell
cd server
npm install
npm start           # http://localhost:3001
```

With no `TURSO_DATABASE_URL` set, the server uses a local file database at
`server/denyut.db`. No network access, no setup. See `server/.env.example`.

Frontend dev server:

```powershell
cd server/client
npm run dev         # http://localhost:5173, proxies /api to :3001
```

### Maintenance

```powershell
cd server
node .\compact.mjs .\denyut.db        # reclaim freelist space
```

A stale database file can be almost entirely dead pages — one was found at
527 MB of which 526.8 MB was freelist, shrinking to 268 KB after compaction.

---

## Local Docker (any Docker host)

```powershell
docker build -t senator-map .
docker run -d -p 8080:8080 ^
  -e TURSO_DATABASE_URL=libsql://... ^
  -e TURSO_AUTH_TOKEN=... ^
  senator-map
```

No volume is needed. Omit the `TURSO_*` variables to run against a local
throwaway file database inside the container.

---

## Environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `TURSO_DATABASE_URL` | `file:server/denyut.db` | Remote database. Unset means a local file. |
| `TURSO_AUTH_TOKEN` | — | Required with a remote URL |
| `UPLOAD_DIR` | `../uploads` (`/tmp/uploads` in the image) | Scratch space for uploads |
| `PORT` | `3001` (`8080` in deploys) | Listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `production` | Express env |

## Why the app is stateless

Uploaded workbooks are the only files ever written. Each is read once by the
parser in the request that received it, then deleted in a `finally` block. No
code path reads an upload again, so the filesystem only needs to be writable,
not persistent. Everything that must survive a restart lives in Turso.

# Senator Map — Deployment Guide (Fly.io)

Target: **Fly.io free tier** — one `shared-cpu-1x` machine with a 1 GB
persistent volume. No credit card required.

| File | Role |
|------|------|
| `fly.toml` | App, region, env, health check, volume mount, deploy strategy |
| `Dockerfile` | Multi-stage build: compiles the SPA, then a slim runtime image |
| `docker-entrypoint.sh` | Fixes volume ownership, drops to a non-root user |
| `.dockerignore` | Keeps the build context small |

Everything below was verified locally with the exact image Fly will run.

---

## Architecture

A single Node 24 Express process that:

- serves the Vite SPA from `server/dist` (built inside the image), and
- serves `/api/*` routes, backed by `better-sqlite3` on `/data/denyut.db`.

`/data` is a Fly volume, so `denyut.db` and `uploads/` survive restarts and
redeploys. The SQLite schema is created automatically on first boot, so no
data migration step is required.

---

## One-time setup

### 1. Install flyctl

```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

Then **open a new PowerShell window** (PATH is set for new shells only).
Verify:

```powershell
fly version
```

### 2. Create a Fly account

Go to <https://fly.io/app/sign-up> and sign up (no card), or:

```powershell
fly auth signup
```

### 3. Confirm the app name is free

`app = "senator-map-denyut"` in `fly.toml` is a global name on Fly. Check:

```powershell
fly apps list | Select-String "senator-map-denyut"
```

If the name is taken, edit the `app` line in `fly.toml` to something unique
(e.g. `senator-map-denyut-<yourname>`) before continuing. Nothing else needs
to change.

---

## First deploy

```powershell
cd C:\Projects\SenatorMap

# 1. Create the app. Do NOT use `fly launch` — it rewrites fly.toml.
fly apps create senator-map-denyut

# 2. Create the 1 GB volume in the same region as primary_region ("sin").
fly volumes create senator_map_data --size 1 --region sin

# 3. Deploy.
fly deploy --build-timeout 20m
```

`-a senator-map-denyut` is not needed — flyctl reads the name from `fly.toml`.

Your site is then live at **https://senator-map-denyut.fly.dev**

### Verify the deploy

```powershell
fly status
fly logs -a senator-map-denyut          # Ctrl-C to stop following
(Invoke-WebRequest https://senator-map-denyut.fly.dev/api/admin/status).Content
```

Expected:

```json
{"status":"ok","timestamp":"...","data":{"customers":0,"accounts":0,"signals":0}}
```

The database starts empty by design. Load your data in the app:

1. Open the site → **Denyut** tab → upload the senator and denyut workbooks.
2. Open the **Radar** tab → upload `REKAM MEDIS CABANG JULI 2026.xlsx`
   (should report 41 branches).

---

## Updating the app later

```powershell
cd C:\Projects\SenatorMap
git pull
fly deploy --build-timeout 20m
```

The volume keeps all data across the new release.

---

## Custom domain + SSL

1. Add the domain to Fly:
   ```powershell
   fly certs add senator-map.com --app senator-map-denyut
   ```
2. At your DNS provider add the A record Fly shows:
   ```
   senator-map.com   A   <the IPv4 from fly certs add>
   senator-map.com   AAAA <the IPv6 from fly certs add>
   ```
3. Fly provisions Let's Encrypt automatically once DNS resolves (usually
   under 5 minutes). No container config needed.

---

## Why each setting is in `fly.toml`

These are the settings that make a volume-backed deploy fail if left at the
defaults. Each one is deliberate:

| Setting | Reason |
|---------|--------|
| `[deploy] strategy = "immediate"` | A machine holding a volume cannot take part in a rolling deploy. `canary` and `bluegreen` are explicitly rejected with volumes. |
| `[[mounts]] initial_size = "1gb"` | If the volume is missing, `fly deploy` creates it instead of erroring. |
| `[[mounts]] source = "senator_map_data"` | Volume name must match the one from `fly volumes create`. |
| `auto_stop_machines = false` | The app owns a volume and must stay reachable. |
| `min_machines_running = 1` | Guarantees one machine in the primary region. |
| `[[http_service.checks]] path = "/api/admin/status"` | Health endpoint returns 200 unauthenticated. |
| `[http_service] force_https = true` | Redirects plain HTTP to HTTPS. |
| `kill_signal` / `kill_timeout` | Gives Node time to close SQLite on redeploy. |
| `ENTRYPOINT` in the Dockerfile | Fly sends `SIGINT` to PID 1; `tini` forwards it to Node. |

---

## Troubleshooting

### `no access token available`

```powershell
fly auth login
```

### `failed to run migrations` / `no volume found for senator_map_data`

The volume is missing or in the wrong region:

```powershell
fly volumes create senator_map_data --size 1 --region sin
```

### `Error: no changes to deploy`

Nothing new was built. Check `git status` — the image is rebuilt from your
working tree, so uncommitted changes are still deployed.

### `unable to open database file` in the logs

The volume is owned by root and the app runs as `appuser`. `docker-entrypoint.sh`
fixes this at boot. If you see it, the entrypoint was bypassed — check that
`ENTRYPOINT` is still present in the `Dockerfile`.

### Deploy times out

The native `better-sqlite3` compile plus the Vite build can exceed Fly's
default build timeout on a cold cache. That is what `--build-timeout 20m` is
for. A retry after the first build is much faster (cached layers).

### Health checks failing after deploy

`fly logs` shows the reason. The most common cause is a slow first boot while
SQLite initialises; `grace_period = "15s"` covers this. Raise it if the app
takes longer on a cold volume.

### Start over completely

```powershell
fly apps destroy senator-map-denyut --yes
fly apps create senator-map-denyut
fly volumes create senator_map_data --size 1 --region sin
fly deploy --build-timeout 20m
```

This deletes the volume and all data. Export anything you need first.

---

## Local Docker (no Fly account)

```powershell
docker build -t senator-map .
docker run -d --name senator-map -p 8080:8080 -v senator-map-data:/data senator-map
```

Equivalent verification:

```powershell
(Invoke-WebRequest http://127.0.0.1:8080/api/admin/status).Content
curl.exe -X POST -F "file=@C:\Projects\SenatorMap\REKAM MEDIS CABANG JULI 2026.xlsx" http://127.0.0.1:8080/api/upload/radar
```

---

## Environment variables

| Var | Default (deploy) | Purpose |
|-----|------------------|---------|
| `PORT` | `8080` | Listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `DB_PATH` | `/data/denyut.db` | SQLite file |
| `ROOT_DB_PATH` | `/data/denyut.db` | Legacy secondary handle; reuses `DB_PATH` when identical |
| `UPLOAD_DIR` | `/data/uploads` | multer upload directory |
| `DATA_DIR` | `/data` | Volume root, chowned by the entrypoint |
| `NODE_OPTIONS` | `--max-old-space-size=512` | Heap cap for a 1 GB machine |

The server creates `DB_PATH`'s directory and `UPLOAD_DIR` on boot, so a fresh
volume needs no manual setup.

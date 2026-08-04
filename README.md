# Konec Project Management

Internal job-tracking tool: overview of every job (name, price, commission date),
per-project checklist (with notes), general notes, and multi-file upload
(floor plans, quotes, etc). Dark theme, yellow accent, single shared login.

No database server and no compiled/native dependencies — data is stored as
JSON on disk (`data/db.json`) plus uploaded files under `data/uploads/`. That
makes it trivial to back up (copy the `data/` folder) and trivial to run in
Docker on a plain Linux box.

## 1. Run it locally (Windows dev machine)

You'll need [Node.js](https://nodejs.org/) 18 or newer installed first —
grab the LTS installer, run it, then reopen your terminal.

```bash
cd "Claude Project management"
npm install
```

Create your local config:

```bash
cp .env.example .env
```

Edit `.env` and set `APP_PASSWORD` and `SESSION_SECRET` to real values (a
random `SESSION_SECRET` is fine — generate one with the command in the
comment inside `.env.example`).

Start the app:

```bash
npm start
```

Open http://localhost:3000, log in with `APP_PASSWORD`, and create a project.
All data lands in `data/` next to the project — delete that folder any time
to reset to a clean slate.

Use `npm run dev` instead of `npm start` while making changes — it restarts
automatically on file save (Node's built-in `--watch`).

## 2. Build & run the Docker image

Once you're happy with it locally, package it into a Docker image. This can
be done on your Windows machine (with Docker Desktop) or directly on the
Linux server — the `Dockerfile` is identical either way.

```bash
docker build -t konec-pm:latest .
```

Run it directly (the app listens on container port **80**):

```bash
docker run -d \
  --name konec-pm \
  -p 80:80 \
  -e APP_PASSWORD=Konec3133 \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  -e COOKIE_SECURE=true \
  -v /srv/konec-pm/data:/app/data \
  --restart unless-stopped \
  konec-pm:latest
```

Or with docker-compose (recommended — keeps your config in one place):

```bash
cp .env.example .env
# edit .env with real APP_PASSWORD / SESSION_SECRET
docker compose up -d --build
```

The `-v` / `volumes:` mount is what makes data persist across container
restarts and image rebuilds — point it at a real directory on the server
(e.g. `/srv/konec-pm/data`) and back that directory up regularly.

## 3. Deploying to the Konec Showroom platform

This app is built to run as a single container hosted on a Konec Showroom
player, per the platform's [service image
guide](https://cloud.test-toolkit.app/@s/p/guest/Quick%20Manuals/service-image-guide.md).
Two things follow from that:

- **The platform's reverse proxy does NOT strip the path prefix.** It injects
  a `BASE_PATH` env var (e.g. `/service/<player-slug>/<service-name>`) and
  forwards the full prefixed path straight to the container. This app already
  handles that: every route, static asset and redirect is mounted under
  `process.env.BASE_PATH` (see `server.js`), and every HTML page gets a
  `<base href="{BASE_PATH}/">` tag injected at startup so relative
  asset/API/link references resolve correctly regardless of how deep the
  current page is (e.g. `/project/:id`). Locally, with `BASE_PATH` unset, the
  app behaves exactly as if mounted at the root — no behavior change for
  `npm start`.
- **The platform pulls the image from GHCR**, not from a manually-built local
  image. Push this repo to GitHub and let `.github/workflows/publish.yml`
  build and publish it.

### One-time setup: push to GitHub and publish to GHCR

```bash
git remote add origin https://github.com/<your-username>/<repo-name>.git
git branch -M main
git push -u origin main
```

That push triggers the `Publish image` Actions workflow, which builds a
multi-arch (`linux/amd64` + `linux/arm64`) image and pushes:

- `ghcr.io/<your-username>/<repo-name>:latest` — moving tag, what you point the platform at
- `ghcr.io/<your-username>/<repo-name>:sha-<full-sha>` — immutable, for rollback

**Then make the package public** (required — the platform can't pull private
images yet): on GitHub, go to your profile → **Packages** → the new package →
**Package settings** → **Change visibility** → **Public**.

Every subsequent push to `main` re-publishes `:latest`; since the platform's
`docker run` uses `--pull always`, redeploying on the platform picks up the
new build automatically.

### Testing the BASE_PATH behavior locally before pushing

```bash
BASE_PATH=/service/testplayer/konec-pm npm start
```

Then open `http://localhost:3000/service/testplayer/konec-pm/` and confirm
login, the project list, a project page, and file upload all work with no
404s in the browser console — this mirrors exactly what the platform's proxy
will do in production.

### Handoff info for the platform operator UI

- **Image**: `ghcr.io/<your-username>/<repo-name>:latest`
- **Container port**: `80`
- **Env vars**: `APP_PASSWORD`, `SESSION_SECRET` (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), `COOKIE_SECURE=true`
- **Resource limits**: fits comfortably within the platform's 512MB/1.0 CPU defaults
- ⚠️ **Storage is ephemeral**: the platform does `docker rm -f` + re-run on every redeploy, and this app stores `data/db.json` and uploaded files on the container's local filesystem. **Unless the platform lets you mount a persistent volume for `/app/data`, all projects/checklists/notes/files will be wiped on every redeploy.** If persistent volumes aren't available on this platform, ask the operator about that before relying on this for real jobs — it's the one hard requirement in the guide (§2.4) this app doesn't control on its own.

## Notes on the checklist fields

The eight checklist items (Project Address, Builder, Builder Contact,
Client, Client Contact, Total Job Cost, Commissioning, Commissioning Rate)
are defined once in `src/fields.js` (server) and mirrored in
`public/js/fields.js` (browser) — edit both if you ever need to add or
rename a field. "Total Job Cost" is what drives the price shown on the
overview cards.

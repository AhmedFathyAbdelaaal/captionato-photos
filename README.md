# Captionato Photos

A self-hosted photography showcase — *a living archive, not a portfolio template*.
Public galleries with their own personality (layout, theme, accent), a fast
masonry landing page, a full-resolution lightbox, and a locked admin panel for
uploads and curation. Originals are stored untouched ("no compression, ever");
thumbnails are generated for fast browsing.

**Stack:** FastAPI (Python) · Angular 16 · PostgreSQL · Docker · Coolify

This is a ground-up rewrite of an earlier Next.js/Prisma version. Same idea,
calmer stack.

---

## Table of contents

1. [Architecture](#architecture)
2. [How it works (the logic)](#how-it-works-the-logic)
3. [Data model](#data-model)
4. [Project layout](#project-layout)
5. [Local development](#local-development)
6. [Environment variables](#environment-variables)
7. [Deploying on Coolify](#deploying-on-coolify)
8. [Gotchas & lessons learned](#gotchas--lessons-learned)
9. [API reference](#api-reference)
10. [Roadmap](#roadmap)

---

## Architecture

Three independent pieces, each in its own container:

```
            ┌──────────────────────────┐
  browser ──►  Frontend (Angular SPA)  │   photos.captionato.tech
            │  nginx serves static     │
            └────────────┬─────────────┘
                         │  HTTPS (JSON + images)
            ┌────────────▼─────────────┐
            │  Backend (FastAPI)        │  api.photos.captionato.tech
            │  uvicorn :8000            │
            │  - REST API               │
            │  - image upload/serving   │
            │  - JWT auth               │
            └──────┬──────────────┬─────┘
                   │              │
        ┌──────────▼───┐   ┌──────▼───────────────┐
        │ PostgreSQL   │   │ Volume /data/photos  │
        │ (metadata)   │   │  originals/ + thumbs/│
        └──────────────┘   └──────────────────────┘
```

- The **frontend** is a static Angular bundle served by nginx. It talks to the
  backend purely over HTTP. Its API URL is injected at container start (no
  rebuild needed to repoint it).
- The **backend** owns everything: the API, image processing, file storage, and
  auth. Image files live on a **persistent volume**; their metadata lives in
  **Postgres**.
- **Postgres** stores photo/gallery records only — never the image bytes.

Why separate subdomains (`photos` + `api.photos`)? It keeps the frontend a dumb
static host and avoids any reverse-proxy path-rewriting. CORS on the backend
allows the frontend origin.

---

## How it works (the logic)

### Image pipeline (upload → storage)

When you upload in the admin panel (`backend/app/routers/photos.py` →
`backend/app/imaging.py`):

1. The file is **streamed to disk in chunks** (`shutil.copyfileobj`) as the
   untouched **original**, named `<uuid><ext>` under `PHOTOS_ORIGINAL_PATH`.
   Streaming means a 25MB file never sits fully in memory.
2. Pillow opens the original and reads **EXIF from the header** (camera, lens,
   focal length, aperture, shutter, ISO, date taken).
3. **`img.draft()`** asks the JPEG decoder to downscale *while decoding* toward
   the thumbnail size — so a 50-megapixel photo never expands to its full raster
   in RAM. This is what keeps the container memory-light.
4. A **thumbnail** (long edge ≤ `THUMB_MAX_EDGE`, default 1600px, JPEG q85) is
   written to `PHOTOS_THUMB_PATH` as `<uuid>.jpg`. Orientation is honoured via
   `ImageOps.exif_transpose`.
5. The thumbnail's dimensions are stored as `width`/`height` — used by the
   masonry grid to size cells *before* the image loads (no layout shift).
6. EXIF strings are **sanitised** before storing (see the NUL-byte gotcha below).

Originals are **never modified**. Thumbnails are only for fast grids/preview.

### Image serving

- `GET /photos/{id}/thumb` → the thumbnail (long-cache headers).
- `GET /photos/{id}/original` → the untouched original, served **inline** for
  display in the lightbox.
- `GET /photos/{id}/original?download=1` → same file but with a
  `Content-Disposition: attachment` header so the browser downloads it with the
  real filename. This powers the lightbox "Download original" button.

### Auth

Single admin user, JWT-based (`backend/app/security.py`, `deps.py`):

- On first boot, `main.py`'s lifespan seeds an admin from `ADMIN_USERNAME` /
  `ADMIN_PASSWORD` **only if no admin exists**.
- `POST /auth/login` verifies the bcrypt hash and returns a JWT.
- Protected routes depend on `get_current_admin`, which validates the
  `Authorization: Bearer <jwt>` header.
- The frontend stores the token in `localStorage`; an HTTP interceptor attaches
  it to every request and bounces to the login on a 401.

### Frontend rendering

Angular 16 **standalone components** with **signals** (no NgModules):

- **Runtime config:** `main.ts` fetches `assets/config.json` *before*
  bootstrapping and provides `apiBaseUrl` via DI. In production that file is
  rendered from the `API_BASE_URL` env var by the container entrypoint, so the
  same build works in any environment.
- **Landing** (`pages/landing.component.ts`): CSS-column masonry, infinite
  scroll, per-cell skeleton until the thumbnail decodes, an `IntersectionObserver`
  reveal directive for scroll fade-in, and a subtle staggered "breathing" drift.
- **Gallery detail** (`pages/gallery-detail.component.ts`): one component, five
  layouts via `*ngSwitch` — `masonry`, `grid`, `editorial`, `slideshow`,
  `moodboard` (stable per-photo rotation seeded by photo id). On enter it applies
  the gallery's `force_theme` + `accent_color`; on leave it clears them.
- **Lightbox** (`components/lightbox.component.ts`): full-screen overlay shared
  by landing + galleries. Shows an **aspect-ratio skeleton + spinner** while the
  full-resolution original downloads, then fades it in. Keyboard nav (←/→/Esc),
  an EXIF panel, an error fallback with retry (cache-busts the URL), and the
  download button.
- **Theme** (`services/theme.service.ts`): resolves the active mode from three
  layers in priority order — a gallery override, then the user's manual toggle
  (persisted in `localStorage`), then the OS `prefers-color-scheme`. Writes
  `data-theme` to `<html>` and an inline `--color-accent` for gallery accents.

---

## Data model

```
photos
  id             UUID  PK
  filename       text          -- original upload name (for display/download)
  original_path  text          -- absolute path on the volume
  thumb_path     text
  title          text  null
  caption        text  null
  visible        bool  = true  -- shown on the landing archive
  width          int   null    -- thumbnail dims → aspect ratio for masonry
  height         int   null
  exif           jsonb null    -- sanitised camera/lens/etc.
  uploaded_at    timestamptz

galleries
  id             UUID  PK
  name           text
  slug           text  unique
  description    text  null
  cover_photo_id UUID  null → photos.id (ON DELETE SET NULL)
  layout         varchar(20) = 'masonry'  -- masonry|grid|editorial|slideshow|moodboard
  force_theme    varchar(10) = 'system'   -- system|light|dark
  accent_color   varchar(9)  null         -- hex, overrides default accent
  display_order  int  = 0
  created_at     timestamptz

gallery_photos                  -- many-to-many, ordered
  gallery_id     UUID → galleries.id (ON DELETE CASCADE)  PK
  photo_id       UUID → photos.id    (ON DELETE CASCADE)  PK
  display_order  int  = 0

admin_users
  id             UUID  PK
  username       text  unique
  password_hash  text          -- bcrypt
```

A photo can live in multiple galleries. Deleting a gallery unassigns its photos
(it does not delete them). The schema is created by Alembic migration
`0001_initial`, which `start.sh` runs (`alembic upgrade head`) on every boot.

---

## Project layout

```
captionato-photos/
├── backend/
│   ├── app/
│   │   ├── main.py          # app, CORS, lifespan (mkdir volumes + seed admin), /health
│   │   ├── config.py        # pydantic-settings (env vars)
│   │   ├── database.py      # SQLAlchemy engine / session / Base
│   │   ├── models.py        # ORM models (the four tables above)
│   │   ├── schemas.py       # Pydantic request/response models
│   │   ├── security.py      # bcrypt hashing + JWT encode/decode
│   │   ├── deps.py          # get_db, get_current_admin (HTTPBearer)
│   │   ├── imaging.py       # Pillow: EXIF extract + sanitise + thumbnail
│   │   ├── serializers.py   # ORM → response schema (+ image URL building)
│   │   └── routers/
│   │       ├── auth.py      # login, me, change password
│   │       ├── photos.py    # list/upload/update/delete + thumb/original/exif
│   │       └── galleries.py # CRUD + reorder
│   ├── alembic/             # migrations (env.py + versions/0001_initial.py)
│   ├── requirements.txt
│   ├── Dockerfile           # python:3.11-slim
│   ├── start.sh             # alembic upgrade head && uvicorn
│   └── .env.example
├── frontend/
│   ├── src/app/
│   │   ├── app.component.ts        # public chrome + theme toggle
│   │   ├── app.config.ts           # providers (router, http, interceptor)
│   │   ├── app.routes.ts           # lazy routes + auth guard on /admin
│   │   ├── config.ts / models.ts   # runtime-config token + TS interfaces
│   │   ├── services/               # api, auth, auth.guard, auth.interceptor, theme
│   │   ├── components/             # lightbox, reveal.directive
│   │   ├── pages/                  # landing, galleries, gallery-detail
│   │   └── admin/                  # login, admin shell, photos, galleries, settings
│   ├── src/styles.scss             # design tokens (colors, fonts, skeletons)
│   ├── Dockerfile                  # node:18 build → nginx:alpine serve
│   ├── nginx.conf                  # SPA fallback + cache headers
│   └── docker-entrypoint.sh        # renders assets/config.json from API_BASE_URL
└── docker-compose.yml              # local full stack (db + backend + frontend)
```

---

## Local development

**Prerequisites:** Python 3.11, Node 16+ (Angular 16 builds on 18 in Docker but
serves fine on 16 for dev), and a reachable PostgreSQL. No Docker required for
dev, though `docker compose up` runs the whole stack if you have it.

### Backend

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate        # Windows Git Bash; use bin/activate on *nix
pip install -r requirements.txt

cp .env.example .env                  # then edit DATABASE_URL, SECRET_KEY, ADMIN_*
alembic upgrade head                  # create the tables
uvicorn app.main:app --reload --port 8000
```

- Interactive API docs: <http://localhost:8000/docs>
- The admin user is seeded from `.env` on first boot — watch for
  `[captionato] seeded admin user '<name>'` in the logs.

### Frontend

```bash
cd frontend
npm install
npm start                             # ng serve → http://localhost:4200
```

`src/assets/config.json` points dev at `http://localhost:8000` by default. Make
sure the backend's `ALLOWED_ORIGINS` includes `http://localhost:4200`.

### Full stack with Docker

```bash
docker compose up --build             # frontend :8080, backend :8000, postgres
```

---

## Environment variables

### Backend (`backend/.env.example`)

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Postgres DSN — **must** start `postgresql://` | `postgresql://photos:pw@db:5432/captionato_photos` |
| `SECRET_KEY` | JWT signing secret | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ADMIN_USERNAME` | Initial admin (seeded once) | `capcap` |
| `ADMIN_PASSWORD` | Initial admin password (bcrypt-hashed on seed) | `your-password` |
| `PHOTOS_ORIGINAL_PATH` | Volume path for originals | `/data/photos/originals` |
| `PHOTOS_THUMB_PATH` | Volume path for thumbnails | `/data/photos/thumbs` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `https://photos.captionato.tech,http://localhost:4200` |

Optional: `THUMB_MAX_EDGE` (default 1600), `JWT_EXPIRE_MINUTES` (default 1 week).

### Frontend

| Variable | Description | Example |
|---|---|---|
| `API_BASE_URL` | Backend base URL (baked into `config.json` at start) | `https://api.photos.captionato.tech` |

---

## Deploying on Coolify

Three resources in **one Coolify project** (so they share an internal network):

1. **PostgreSQL** — `+ New → Database → PostgreSQL`. Copy its **internal**
   connection URL.
2. **Backend** — `+ New → Application → Public Repository`, **Base Directory
   `/backend`**, build pack **Dockerfile**. Domain `api.photos.captionato.tech`,
   port `8000`. Add the backend env vars, and a **persistent volume mounted at
   `/data/photos`** (so uploads survive redeploys).
3. **Frontend** — same, **Base Directory `/frontend`**. Domain
   `photos.captionato.tech`, port `80`. Set `API_BASE_URL` to the backend URL.

**Order:** Postgres → backend (it runs migrations + seeds the admin on boot) →
frontend. Verify `https://api.photos.captionato.tech/health` returns
`{"status":"ok"}`, then log in at `photos.captionato.tech/admin/login`.

---

## Gotchas & lessons learned

Real issues hit while shipping this — documented so you don't re-hit them:

- **Git branch must be `main`.** Coolify defaults to deploying `main`; if your
  repo is on `master` the clone fails with *"Remote branch main not found"*.
  Rename: `git branch -m master main && git push -u origin main`.
- **`postgres://` vs `postgresql://`.** Coolify hands you a `postgres://` URL,
  but SQLAlchemy **rejects** that scheme. Change the prefix to `postgresql://`.
  Use the **internal** URL, not the public one.
- **Coolify volume names can't contain spaces.** Naming a persistent storage
  *"Photos Store"* generates an invalid compose file
  (`volumes additional properties '... Photos Store' not allowed`). Use
  `photos-store`. The **mount path** (`/data/photos`) is what actually matters.
- **EXIF NUL bytes break Postgres.** Some cameras (e.g. OPPO phones) NUL-pad
  their EXIF string fields. PostgreSQL **cannot store ` `** in text/JSONB,
  so the photo INSERT fails — and the browser misreports it as a **CORS error**
  (the failed response just lacks the CORS header). `imaging.py` now strips NUL
  and control chars from every EXIF string. If you ever see a phantom CORS error
  on a *write*, check the backend logs for the real exception.
- **Big images and memory.** Without `img.draft()`, decoding a high-megapixel
  JPEG expands to its full raster (tens to hundreds of MB) and can OOM-kill a
  small container. Draft mode + chunked streaming keeps it light.
- **The lightbox loads the true original**, which can be large. The skeleton +
  spinner make the download obvious; for snappier viewing see the roadmap.
- **Node 16 locally** can't build modern Angular — this project pins **Angular
  16**, which dev-serves on Node 16 and builds on **Node 18** inside Docker.

---

## API reference

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/login` | – | Get a JWT |
| GET | `/auth/me` | ✔ | Current admin |
| POST | `/auth/password` | ✔ | Change password |
| GET | `/photos` | – | Landing feed (visible, paginated) |
| GET | `/photos/admin` | ✔ | All photos incl. hidden (+ gallery ids) |
| POST | `/photos` | ✔ | Upload (multipart, one or many) |
| PATCH | `/photos/{id}` | ✔ | Title / caption / visibility / gallery membership |
| DELETE | `/photos/{id}` | ✔ | Delete photo + files |
| GET | `/photos/{id}/thumb` | – | Thumbnail |
| GET | `/photos/{id}/original` | – | Original (inline; `?download=1` to download) |
| GET | `/photos/{id}/exif` | – | EXIF JSON |
| GET | `/galleries` | – | Gallery index (with cover + count) |
| GET | `/galleries/{slug}` | – | Gallery detail with ordered photos |
| POST | `/galleries` | ✔ | Create |
| PATCH | `/galleries/{id}` | ✔ | Update |
| DELETE | `/galleries/{id}` | ✔ | Delete (photos kept, just unassigned) |
| POST | `/galleries/reorder` | ✔ | Reorder galleries (`{ ids: [...] }`) |
| POST | `/galleries/{id}/photos/reorder` | ✔ | Reorder photos within a gallery |
| GET | `/health` | – | Liveness check |

---

## Roadmap

- **Three-size image logic** *(planned)*: add a display-resolution derivative
  (~2560px, ~1–2MB) generated on upload for the lightbox, so large originals
  don't have to download in full just to be viewed. Thumbnails stay for grids;
  the true original is reserved for the download button. Needs a `/display`
  endpoint, a DB column for the derivative path, and a one-time backfill of
  existing photos.
- Mobile responsiveness audit (masonry, lightbox, admin).
- Photo migration from the previous Next.js gallery.
```


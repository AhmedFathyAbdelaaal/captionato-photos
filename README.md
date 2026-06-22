# Captionato Photos

A photography showcase — a living archive, not a portfolio template.
Public-facing galleries with per-gallery personality; a locked admin panel.

**Stack:** FastAPI (Python) · Angular 16 · PostgreSQL · Docker · Coolify
Replaces the previous Next.js/Prisma implementation. Same subdomain:
`photos.captionato.tech`.

```
captionato-photos/
├── backend/    # FastAPI + SQLAlchemy + Alembic + Pillow
├── frontend/   # Angular 16 (standalone components)
└── docker-compose.yml
```

## Local development

### Backend
Requires Python 3.11 and a reachable PostgreSQL (set `DATABASE_URL`).

```bash
cd backend
python -m venv .venv && source .venv/Scripts/activate   # Windows Git Bash
pip install -r requirements.txt
cp .env.example .env        # edit DATABASE_URL, SECRET_KEY, ADMIN_*
alembic upgrade head        # create tables
uvicorn app.main:app --reload --port 8000
```

API docs at http://localhost:8000/docs. The admin user is seeded from
`ADMIN_USERNAME` / `ADMIN_PASSWORD` on first boot.

### Frontend
```bash
cd frontend
npm install
npm start                   # ng serve on http://localhost:4200
```

`src/assets/config.json` points the app at the API (default
`http://localhost:8000`). In production this file is rendered at container
start from `API_BASE_URL`.

### Full stack via Docker
```bash
docker compose up --build   # frontend :8080, backend :8000, postgres
```

## Deploy (Coolify)

Two apps pointed at the sub-folders (same pattern as Death Bot), plus a managed
Postgres:

- **backend** → builds `backend/`, exposes `:8000`, mount a persistent volume at
  `/data/photos`. Route to `api.photos.captionato.tech`.
- **frontend** → builds `frontend/`, serves on `:80`. Route to
  `photos.captionato.tech`. Set `API_BASE_URL` to the backend URL.

See `backend/.env.example` for the full environment-variable reference.

## API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/login` | – | Get JWT |
| POST | `/auth/password` | ✔ | Change admin password |
| GET | `/photos` | – | Landing feed (visible, paginated) |
| GET | `/photos/admin` | ✔ | All photos incl. hidden |
| POST | `/photos` | ✔ | Upload (multipart, one or many) |
| PATCH | `/photos/{id}` | ✔ | Title/caption/visibility/galleries |
| DELETE | `/photos/{id}` | ✔ | Delete photo + files |
| GET | `/photos/{id}/thumb` · `/original` · `/exif` | – | Image + metadata serving |
| GET | `/galleries` | – | Gallery index |
| GET | `/galleries/{slug}` | – | Gallery detail with photos |
| POST · PATCH · DELETE | `/galleries…` | ✔ | Gallery CRUD |
| POST | `/galleries/reorder` | ✔ | Reorder galleries |
| POST | `/galleries/{id}/photos/reorder` | ✔ | Reorder photos in a gallery |

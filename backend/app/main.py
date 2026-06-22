from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from .config import settings
from .database import SessionLocal
from .models import AdminUser
from .routers import auth, galleries, photos
from .security import hash_password


def seed_admin() -> None:
    """Create the initial admin from env vars if no admin exists yet."""
    with SessionLocal() as db:
        existing = db.scalar(select(AdminUser).limit(1))
        if existing is None:
            db.add(
                AdminUser(
                    username=settings.ADMIN_USERNAME,
                    password_hash=hash_password(settings.ADMIN_PASSWORD),
                )
            )
            db.commit()
            print(f"[captionato] seeded admin user '{settings.ADMIN_USERNAME}'")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure the storage volumes exist, then seed the admin user.
    Path(settings.PHOTOS_ORIGINAL_PATH).mkdir(parents=True, exist_ok=True)
    Path(settings.PHOTOS_THUMB_PATH).mkdir(parents=True, exist_ok=True)
    try:
        seed_admin()
    except Exception as exc:  # noqa: BLE001 — don't crash boot if DB not ready
        print(f"[captionato] admin seed skipped: {exc}")
    yield


app = FastAPI(title="Captionato Photos API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(photos.router)
app.include_router(galleries.router)


@app.get("/health")
def health():
    return {"status": "ok"}

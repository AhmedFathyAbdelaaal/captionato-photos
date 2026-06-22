from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, loaded from environment variables (or a local
    .env file during development). See .env.example for the full reference."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── Database ──
    DATABASE_URL: str = "postgresql://photos:photos@localhost:5432/captionato_photos"

    # ── Auth / JWT ──
    SECRET_KEY: str = "change-me-generate-with-secrets-token_hex-32"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # one week

    # Seeded on first boot if no admin exists yet.
    ADMIN_USERNAME: str = "capcap"
    ADMIN_PASSWORD: str = "changeme"

    # ── Image storage (mapped to a Coolify persistent volume) ──
    PHOTOS_ORIGINAL_PATH: str = "/data/photos/originals"
    PHOTOS_THUMB_PATH: str = "/data/photos/thumbs"
    THUMB_MAX_EDGE: int = 1600  # longest-edge px for grid/lightbox thumbnails

    # ── CORS ──
    # Comma-separated list of allowed origins, e.g.
    # "https://photos.captionato.tech,http://localhost:4200"
    ALLOWED_ORIGINS: str = "http://localhost:4200"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

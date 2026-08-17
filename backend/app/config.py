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
    PHOTOS_DISPLAY_PATH: str = "/data/photos/display"
    THUMB_MAX_EDGE: int = 1600  # longest-edge px for grid/lightbox thumbnails
    # Longest-edge px for the lightbox "display" derivative — high quality but a
    # fraction of the original's weight, so viewing never pulls the full file.
    DISPLAY_MAX_EDGE: int = 2560

    # ── Collage maker ──
    # One-off collage images (not part of the permanent library) live here,
    # in a subfolder per collage id, and are deleted on export / sweep.
    COLLAGE_ONEOFF_PATH: str = "/data/photos/collage-oneoffs"
    # Drafts untouched for this many days get their one-off images swept.
    COLLAGE_SWEEP_DAYS: int = 30
    # JPEG quality for exported collages.
    COLLAGE_EXPORT_QUALITY: int = 92
    # Border color for layers with border enabled (site accent).
    COLLAGE_BORDER_COLOR: str = "#B23A52"

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

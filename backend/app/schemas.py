import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ── Auth ──
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


# ── Photos ──
class PhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    filename: str
    title: str | None = None
    caption: str | None = None
    visible: bool
    width: int | None = None
    height: int | None = None
    exif: dict | None = None
    uploaded_at: datetime
    thumbnail_url: str
    original_url: str
    # Populated only in the admin listing so the editor can pre-check galleries.
    gallery_ids: list[uuid.UUID] | None = None


class PhotoUpdate(BaseModel):
    title: str | None = None
    caption: str | None = None
    visible: bool | None = None
    gallery_ids: list[uuid.UUID] | None = None  # replaces gallery membership


class PhotoPage(BaseModel):
    items: list[PhotoOut]
    total: int
    page: int
    page_size: int


# ── Bulk photo actions ──
class BulkIds(BaseModel):
    photo_ids: list[uuid.UUID]


class BulkVisibility(BulkIds):
    visible: bool


class BulkAddGalleries(BulkIds):
    gallery_ids: list[uuid.UUID]  # photos are appended to each (membership kept)


# ── Galleries ──
class GalleryBase(BaseModel):
    name: str
    slug: str
    description: str | None = None
    cover_photo_id: uuid.UUID | None = None
    layout: str = "masonry"
    force_theme: str = "system"
    accent_color: str | None = None


class GalleryCreate(GalleryBase):
    pass


class GalleryUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    cover_photo_id: uuid.UUID | None = None
    layout: str | None = None
    force_theme: str | None = None
    accent_color: str | None = None
    display_order: int | None = None


class GalleryOut(GalleryBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_order: int
    created_at: datetime
    photo_count: int = 0
    cover_thumbnail_url: str | None = None


class GalleryDetailOut(GalleryOut):
    photos: list[PhotoOut] = []


class ReorderRequest(BaseModel):
    """Ordered list of gallery (or photo) ids; index becomes display_order."""
    ids: list[uuid.UUID]

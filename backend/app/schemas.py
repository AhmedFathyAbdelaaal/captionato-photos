import uuid
from datetime import datetime
from typing import Literal

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


# ── Collage maker ──
# Layer geometry is normalized: pos/size as fractions of canvas width/height,
# crop bounds as fractions of the source image. Rotation in degrees, clockwise.
class CollageLayerGeometry(BaseModel):
    pos_x: float
    pos_y: float
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    rotation: float = 0
    crop_x: float = Field(0, ge=0, le=1)
    crop_y: float = Field(0, ge=0, le=1)
    crop_width: float = Field(1, gt=0, le=1)
    crop_height: float = Field(1, gt=0, le=1)
    border_enabled: bool = False
    z_index: int = 0


class CollageLayerCreate(CollageLayerGeometry):
    # Exactly one of the two source references must be set.
    photo_id: uuid.UUID | None = None
    one_off_path: str | None = None


class CollageLayerUpdate(BaseModel):
    pos_x: float | None = None
    pos_y: float | None = None
    width: float | None = Field(None, gt=0)
    height: float | None = Field(None, gt=0)
    rotation: float | None = None
    crop_x: float | None = Field(None, ge=0, le=1)
    crop_y: float | None = Field(None, ge=0, le=1)
    crop_width: float | None = Field(None, gt=0, le=1)
    crop_height: float | None = Field(None, gt=0, le=1)
    border_enabled: bool | None = None
    z_index: int | None = None


class CollageLayerOut(CollageLayerGeometry):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    photo_id: uuid.UUID | None = None
    one_off_path: str | None = None
    thumb_url: str  # editor working image (thumbnail resolution)


class CollageCreate(BaseModel):
    format: Literal["story", "post"]
    background_color: str = "#000000"


class CollageUpdate(BaseModel):
    background_color: str | None = None
    status: Literal["draft", "exported"] | None = None


class CollageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    format: str
    background_color: str
    status: str
    created_at: datetime
    updated_at: datetime
    exported_at: datetime | None = None
    layer_count: int = 0


class CollageDetailOut(CollageOut):
    layers: list[CollageLayerOut] = []


class OneOffUploadOut(BaseModel):
    one_off_path: str
    thumb_url: str
    width: int | None = None
    height: int | None = None


class GenerateAutoRequest(BaseModel):
    format: Literal["story", "post"]
    photo_ids: list[uuid.UUID] = Field(min_length=2)

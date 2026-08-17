import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    original_path: Mapped[str] = mapped_column(Text, nullable=False)
    thumb_path: Mapped[str] = mapped_column(Text, nullable=False)
    # ~2560px lightbox derivative; nullable + generated lazily for old photos.
    display_path: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(Text)
    caption: Mapped[str | None] = mapped_column(Text)
    visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Stored aspect-ratio hint so the masonry grid can size cells before the
    # image loads (avoids layout shift / skeleton mis-sizing).
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)

    exif: Mapped[dict | None] = mapped_column(JSONB)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    gallery_links: Mapped[list["GalleryPhoto"]] = relationship(
        back_populates="photo", cascade="all, delete-orphan"
    )


class Gallery(Base):
    __tablename__ = "galleries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    cover_photo_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("photos.id", ondelete="SET NULL")
    )
    layout: Mapped[str] = mapped_column(
        String(20), default="masonry", nullable=False
    )  # masonry|grid|editorial|slideshow|moodboard
    force_theme: Mapped[str] = mapped_column(
        String(10), default="system", nullable=False
    )  # system|light|dark
    accent_color: Mapped[str | None] = mapped_column(String(9))  # hex, nullable
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    photo_links: Mapped[list["GalleryPhoto"]] = relationship(
        back_populates="gallery", cascade="all, delete-orphan"
    )


class GalleryPhoto(Base):
    __tablename__ = "gallery_photos"

    gallery_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("galleries.id", ondelete="CASCADE"),
        primary_key=True,
    )
    photo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("photos.id", ondelete="CASCADE"),
        primary_key=True,
    )
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    gallery: Mapped["Gallery"] = relationship(back_populates="photo_links")
    photo: Mapped["Photo"] = relationship(back_populates="gallery_links")


class Collage(Base):
    """A collage draft/project built in the admin Collage Maker.

    Layer geometry is stored normalized: pos/size are fractions of the canvas
    width/height (0..1), so the editor (working resolution) and the export
    renderer (full 1080x1080 / 1080x1920) share the same coordinates.
    """

    __tablename__ = "collages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    format: Mapped[str] = mapped_column(String(10), nullable=False)  # story|post
    background_color: Mapped[str] = mapped_column(
        String(9), default="#000000", nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(10), default="draft", nullable=False
    )  # draft|exported
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    exported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    layers: Mapped[list["CollageLayer"]] = relationship(
        back_populates="collage",
        cascade="all, delete-orphan",
        order_by="CollageLayer.z_index",
    )


class CollageLayer(Base):
    __tablename__ = "collage_layers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    collage_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("collages.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Exactly one of photo_id / one_off_path is set per layer.
    photo_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("photos.id", ondelete="CASCADE")
    )
    one_off_path: Mapped[str | None] = mapped_column(Text)

    pos_x: Mapped[float] = mapped_column(Float, nullable=False)
    pos_y: Mapped[float] = mapped_column(Float, nullable=False)
    width: Mapped[float] = mapped_column(Float, nullable=False)
    height: Mapped[float] = mapped_column(Float, nullable=False)
    rotation: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    # Normalized 0-1 crop bounds on the source image.
    crop_x: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    crop_y: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    crop_width: Mapped[float] = mapped_column(Float, default=1, nullable=False)
    crop_height: Mapped[float] = mapped_column(Float, default=1, nullable=False)
    border_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    z_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    collage: Mapped["Collage"] = relationship(back_populates="layers")
    photo: Mapped["Photo | None"] = relationship()


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    username: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)

"""Model -> response-schema helpers, centralised so image URL construction
lives in one place. URLs are API-relative; the frontend prefixes them with its
configured apiBaseUrl."""
from .models import Gallery, Photo
from .schemas import GalleryOut, PhotoOut


def thumb_url(photo: Photo) -> str:
    return f"/photos/{photo.id}/thumb"


def original_url(photo: Photo) -> str:
    return f"/photos/{photo.id}/original"


def photo_out(photo: Photo, include_galleries: bool = False) -> PhotoOut:
    return PhotoOut(
        id=photo.id,
        filename=photo.filename,
        title=photo.title,
        caption=photo.caption,
        visible=photo.visible,
        width=photo.width,
        height=photo.height,
        exif=photo.exif,
        uploaded_at=photo.uploaded_at,
        thumbnail_url=thumb_url(photo),
        original_url=original_url(photo),
        gallery_ids=(
            [link.gallery_id for link in photo.gallery_links]
            if include_galleries
            else None
        ),
    )


def gallery_out(gallery: Gallery, cover: Photo | None = None) -> GalleryOut:
    return GalleryOut(
        id=gallery.id,
        name=gallery.name,
        slug=gallery.slug,
        description=gallery.description,
        cover_photo_id=gallery.cover_photo_id,
        layout=gallery.layout,
        force_theme=gallery.force_theme,
        accent_color=gallery.accent_color,
        display_order=gallery.display_order,
        created_at=gallery.created_at,
        photo_count=len(gallery.photo_links),
        cover_thumbnail_url=thumb_url(cover) if cover else None,
    )

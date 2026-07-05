"""Model -> response-schema helpers, centralised so image URL construction
lives in one place. URLs are API-relative; the frontend prefixes them with its
configured apiBaseUrl."""
from pathlib import Path

from .models import Collage, CollageLayer, Gallery, Photo
from .schemas import CollageDetailOut, CollageLayerOut, CollageOut, GalleryOut, PhotoOut


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


def one_off_thumb_name(one_off_path: str) -> str:
    return f"{Path(one_off_path).stem}_thumb.jpg"


def collage_layer_out(layer: CollageLayer) -> CollageLayerOut:
    if layer.photo_id is not None:
        thumb = f"/photos/{layer.photo_id}/thumb"
    else:
        thumb = (
            f"/collages/{layer.collage_id}/one-off/"
            f"{one_off_thumb_name(layer.one_off_path or '')}"
        )
    return CollageLayerOut(
        id=layer.id,
        photo_id=layer.photo_id,
        one_off_path=layer.one_off_path,
        thumb_url=thumb,
        pos_x=layer.pos_x,
        pos_y=layer.pos_y,
        width=layer.width,
        height=layer.height,
        rotation=layer.rotation,
        crop_x=layer.crop_x,
        crop_y=layer.crop_y,
        crop_width=layer.crop_width,
        crop_height=layer.crop_height,
        border_enabled=layer.border_enabled,
        z_index=layer.z_index,
    )


def collage_out(collage: Collage) -> CollageOut:
    return CollageOut(
        id=collage.id,
        format=collage.format,
        background_color=collage.background_color,
        status=collage.status,
        created_at=collage.created_at,
        updated_at=collage.updated_at,
        exported_at=collage.exported_at,
        layer_count=len(collage.layers),
    )


def collage_detail_out(collage: Collage) -> CollageDetailOut:
    base = collage_out(collage)
    return CollageDetailOut(
        **base.model_dump(),
        layers=[collage_layer_out(l) for l in collage.layers],
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

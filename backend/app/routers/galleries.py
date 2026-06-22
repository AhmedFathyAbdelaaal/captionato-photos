import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..deps import get_current_admin, get_db
from ..models import Gallery, GalleryPhoto, Photo
from ..schemas import (
    GalleryCreate,
    GalleryDetailOut,
    GalleryOut,
    GalleryUpdate,
    ReorderRequest,
)
from ..serializers import gallery_out, photo_out

router = APIRouter(prefix="/galleries", tags=["galleries"])


def _cover_for(db: Session, gallery: Gallery) -> Photo | None:
    if gallery.cover_photo_id:
        cover = db.get(Photo, gallery.cover_photo_id)
        if cover:
            return cover
    # Fall back to the first photo in the gallery's order.
    link = db.scalar(
        select(GalleryPhoto)
        .where(GalleryPhoto.gallery_id == gallery.id)
        .order_by(GalleryPhoto.display_order)
        .limit(1)
    )
    return link.photo if link else None


# ── Public list ──
@router.get("", response_model=list[GalleryOut])
def list_galleries(db: Session = Depends(get_db)):
    galleries = db.scalars(
        select(Gallery)
        .options(selectinload(Gallery.photo_links))
        .order_by(Gallery.display_order, Gallery.created_at)
    ).all()
    return [gallery_out(g, _cover_for(db, g)) for g in galleries]


# ── Public detail by slug ──
@router.get("/{slug}", response_model=GalleryDetailOut)
def get_gallery(slug: str, db: Session = Depends(get_db)):
    gallery = db.scalar(
        select(Gallery)
        .where(Gallery.slug == slug)
        .options(selectinload(Gallery.photo_links).selectinload(GalleryPhoto.photo))
    )
    if gallery is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gallery not found")

    ordered = sorted(gallery.photo_links, key=lambda link: link.display_order)
    base = gallery_out(gallery, _cover_for(db, gallery))
    return GalleryDetailOut(
        **base.model_dump(),
        photos=[photo_out(link.photo) for link in ordered],
    )


# ── Create ──
@router.post("", response_model=GalleryOut, status_code=status.HTTP_201_CREATED)
def create_gallery(
    body: GalleryCreate,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if db.scalar(select(Gallery).where(Gallery.slug == body.slug)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Slug already in use")
    # New galleries go to the end of the display order.
    max_order = db.scalar(select(Gallery.display_order).order_by(Gallery.display_order.desc()).limit(1))
    gallery = Gallery(**body.model_dump(), display_order=(max_order or 0) + 1)
    db.add(gallery)
    db.commit()
    db.refresh(gallery)
    return gallery_out(gallery, _cover_for(db, gallery))


# ── Update ──
@router.patch("/{gallery_id}", response_model=GalleryOut)
def update_gallery(
    gallery_id: uuid.UUID,
    body: GalleryUpdate,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    gallery = db.get(Gallery, gallery_id)
    if gallery is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gallery not found")

    data = body.model_dump(exclude_unset=True)
    if "slug" in data and data["slug"] != gallery.slug:
        if db.scalar(select(Gallery).where(Gallery.slug == data["slug"])):
            raise HTTPException(status.HTTP_409_CONFLICT, "Slug already in use")
    for field, value in data.items():
        setattr(gallery, field, value)

    db.commit()
    db.refresh(gallery)
    return gallery_out(gallery, _cover_for(db, gallery))


# ── Delete (photos are unassigned, not deleted) ──
@router.delete("/{gallery_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_gallery(
    gallery_id: uuid.UUID,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    gallery = db.get(Gallery, gallery_id)
    if gallery is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gallery not found")
    db.delete(gallery)  # cascade clears gallery_photos; photos themselves remain
    db.commit()


# ── Reorder galleries ──
@router.post("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_galleries(
    body: ReorderRequest,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    for index, gid in enumerate(body.ids):
        gallery = db.get(Gallery, gid)
        if gallery:
            gallery.display_order = index
    db.commit()


# ── Reorder photos within a gallery ──
@router.post("/{gallery_id}/photos/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_gallery_photos(
    gallery_id: uuid.UUID,
    body: ReorderRequest,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    for index, pid in enumerate(body.ids):
        link = db.get(GalleryPhoto, (gallery_id, pid))
        if link:
            link.display_order = index
    db.commit()

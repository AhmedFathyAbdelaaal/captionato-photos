import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..deps import (
    can_download_anywhere,
    get_approved_user,
    get_current_admin,
    get_db,
)
from ..models import Gallery, GalleryPhoto, Photo, User, UserGallery
from ..schemas import (
    GalleryCreate,
    GalleryDetailOut,
    GalleryOut,
    GalleryUnlock,
    GalleryUpdate,
    ReorderRequest,
)
from ..security import (
    hash_password,
    sign_image_path,
    verify_image_sig,
    verify_password,
)
from ..serializers import gallery_out, photo_out
from ..zipstream import stream_zip, unique_names

router = APIRouter(prefix="/galleries", tags=["galleries"])

# Slugs that would shadow the admin subroute; validated on create/update.
RESERVED_SLUGS = {"admin", "reorder"}


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


def _granted_ids(db: Session, user: User) -> set[uuid.UUID]:
    return set(
        db.scalars(
            select(UserGallery.gallery_id).where(UserGallery.user_id == user.id)
        ).all()
    )


def _load_by_slug(db: Session, slug: str) -> Gallery:
    gallery = db.scalar(
        select(Gallery)
        .where(Gallery.slug == slug)
        .options(selectinload(Gallery.photo_links).selectinload(GalleryPhoto.photo))
    )
    if gallery is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gallery not found")
    return gallery


def _zip_path(gallery: Gallery) -> str:
    return f"/galleries/{gallery.id}/zip"


def _detail(
    gallery: Gallery,
    cover: Photo | None,
    *,
    locked: bool,
    can_download: bool = False,
) -> GalleryDetailOut:
    """Build the detail response, hiding photos when locked. Original + zip
    URLs are only included when the viewer may download here."""
    base = gallery_out(gallery, cover)
    if locked:
        return GalleryDetailOut(**base.model_dump(), photos=[], locked=True)
    ordered = sorted(gallery.photo_links, key=lambda link: link.display_order)
    return GalleryDetailOut(
        **base.model_dump(),
        photos=[photo_out(link.photo, can_download=can_download) for link in ordered],
        locked=False,
        download_all_url=(
            sign_image_path(_zip_path(gallery)) if can_download and ordered else None
        ),
    )


# ── The caller's galleries: everything for admin, granted ones for others ──
# Password galleries that aren't granted stay link-only (not listed).
@router.get("", response_model=list[GalleryOut])
def list_galleries(
    user: User = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    stmt = (
        select(Gallery)
        .options(selectinload(Gallery.photo_links))
        .order_by(Gallery.display_order, Gallery.created_at)
    )
    if user.role != "admin":
        stmt = stmt.join(UserGallery, UserGallery.gallery_id == Gallery.id).where(
            UserGallery.user_id == user.id
        )
    galleries = db.scalars(stmt).all()
    return [gallery_out(g, _cover_for(db, g)) for g in galleries]


# ── Admin list (all galleries, with full metadata) ──
@router.get("/admin", response_model=list[GalleryOut])
def list_admin_galleries(
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    galleries = db.scalars(
        select(Gallery)
        .options(selectinload(Gallery.photo_links))
        .order_by(Gallery.display_order, Gallery.created_at)
    ).all()
    return [gallery_out(g, _cover_for(db, g)) for g in galleries]


# ── Admin detail by id (always full, regardless of visibility/password) ──
@router.get("/admin/{gallery_id}", response_model=GalleryDetailOut)
def get_admin_gallery(
    gallery_id: uuid.UUID,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    gallery = db.scalar(
        select(Gallery)
        .where(Gallery.id == gallery_id)
        .options(selectinload(Gallery.photo_links).selectinload(GalleryPhoto.photo))
    )
    if gallery is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gallery not found")
    return _detail(gallery, _cover_for(db, gallery), locked=False, can_download=True)


# ── Detail by slug (approved users) ──
# Granted (or admin) → full. Otherwise a password gallery returns a locked stub
# until POST /unlock; anything else is a 404 so its existence isn't revealed.
# Downloads: granted users (and admin) always; password-unlockers only when
# Elevated.
@router.get("/{slug}", response_model=GalleryDetailOut)
def get_gallery(
    slug: str,
    user: User = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    gallery = _load_by_slug(db, slug)
    if user.role == "admin" or gallery.id in _granted_ids(db, user):
        return _detail(gallery, _cover_for(db, gallery), locked=False, can_download=True)
    if gallery.visibility == "password" and gallery.password_hash:
        return _detail(gallery, _cover_for(db, gallery), locked=True)
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Gallery not found")


# ── Unlock a password-gated gallery (approved users) ──
@router.post("/{slug}/unlock", response_model=GalleryDetailOut)
def unlock_gallery(
    slug: str,
    body: GalleryUnlock,
    user: User = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    gallery = _load_by_slug(db, slug)
    if user.role == "admin" or gallery.id in _granted_ids(db, user):
        # Already has access — return the full detail so a stale UI recovers.
        return _detail(gallery, _cover_for(db, gallery), locked=False, can_download=True)
    if gallery.visibility != "password" or not gallery.password_hash:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gallery not found")
    if not verify_password(body.password, gallery.password_hash):
        # 403, not 401: a wrong gallery password must not log the user out.
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Wrong password")
    return _detail(
        gallery,
        _cover_for(db, gallery),
        locked=False,
        can_download=can_download_anywhere(user),
    )


# ── Download every original as one zip (signed URL from the detail response) ──
@router.get("/{gallery_id}/zip")
def download_gallery_zip(
    gallery_id: uuid.UUID,
    exp: int | None = Query(None),
    sig: str | None = Query(None),
    db: Session = Depends(get_db),
):
    if not verify_image_sig(f"/galleries/{gallery_id}/zip", exp, sig):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid or expired link")
    gallery = db.scalar(
        select(Gallery)
        .where(Gallery.id == gallery_id)
        .options(selectinload(Gallery.photo_links).selectinload(GalleryPhoto.photo))
    )
    if gallery is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gallery not found")
    ordered = sorted(gallery.photo_links, key=lambda link: link.display_order)
    # Resolve everything now — the DB session is closed once streaming starts.
    names = unique_names(link.photo.filename for link in ordered)
    entries = [(n, Path(link.photo.original_path)) for n, link in zip(names, ordered)]
    return StreamingResponse(
        stream_zip(entries),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{gallery.slug}.zip"'},
    )


# ── Create ──
@router.post("", response_model=GalleryOut, status_code=status.HTTP_201_CREATED)
def create_gallery(
    body: GalleryCreate,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if body.slug in RESERVED_SLUGS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Slug is reserved")
    if db.scalar(select(Gallery).where(Gallery.slug == body.slug)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Slug already in use")
    if body.visibility == "password" and not body.password:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Password-gated galleries need a password.",
        )
    # New galleries go to the end of the display order.
    max_order = db.scalar(
        select(Gallery.display_order).order_by(Gallery.display_order.desc()).limit(1)
    )
    data = body.model_dump(exclude={"password"})
    gallery = Gallery(
        **data,
        display_order=(max_order or 0) + 1,
        password_hash=hash_password(body.password) if body.password else None,
    )
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
        if data["slug"] in RESERVED_SLUGS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Slug is reserved")
        if db.scalar(select(Gallery).where(Gallery.slug == data["slug"])):
            raise HTTPException(status.HTTP_409_CONFLICT, "Slug already in use")

    # Password handling: empty string clears; otherwise hash. Only touched when
    # explicitly present in the payload.
    if "password" in data:
        pw = data.pop("password")
        if pw == "" or pw is None:
            gallery.password_hash = None
        else:
            gallery.password_hash = hash_password(pw)

    # Guard: switching to password visibility without an existing hash needs one.
    new_visibility = data.get("visibility", gallery.visibility)
    if new_visibility == "password" and not gallery.password_hash:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Set a password before switching to password visibility.",
        )
    # Leaving password visibility — drop the hash so we don't stash unused secrets.
    if (
        new_visibility != "password"
        and gallery.visibility == "password"
        and "password" not in body.model_fields_set
    ):
        gallery.password_hash = None

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


# ── Remove a single photo from a gallery (photo stays in the library) ──
@router.delete(
    "/{gallery_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT
)
def remove_photo_from_gallery(
    gallery_id: uuid.UUID,
    photo_id: uuid.UUID,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    link = db.get(GalleryPhoto, (gallery_id, photo_id))
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not in this gallery")
    db.delete(link)
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

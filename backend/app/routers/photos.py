import shutil
import uuid
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session, selectinload

from ..config import settings
from ..deps import (
    can_download_anywhere,
    get_current_admin,
    get_db,
    get_portfolio_user,
    get_viewer,
)
from ..imaging import generate_display, parse_exif_taken, process_upload
from ..models import Gallery, GalleryPhoto, Photo, User
from ..schemas import (
    BulkAddGalleries,
    BulkIds,
    BulkTags,
    BulkVisibility,
    PhotoOut,
    PhotoPage,
    PhotoUpdate,
)
from ..security import verify_image_sig
from ..serializers import photo_out

router = APIRouter(prefix="/photos", tags=["photos"])

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}

# The reserved tag that drives the public homepage hero feed.
FEATURED_TAG = "featured"
# The hero is the one public window into the archive, so it's capped to a
# single page — anonymous visitors can't page through it to scrape everything.
FEATURED_MAX = 40

# Signed URLs rotate every few hours, so per-URL caching is safe but must stay
# out of shared caches.
IMAGE_CACHE = {"Cache-Control": "private, max-age=86400"}


def normalize_tags(tags: list[str]) -> list[str]:
    """Lowercase, trim, drop empties, cap length, and de-dupe (order-preserving).
    Keeps the tag vocabulary tidy so 'Street', ' street ' and 'street' collapse."""
    seen: list[str] = []
    for raw in tags:
        t = (raw or "").strip().lower()[:40]
        if t and t not in seen:
            seen.append(t)
    return seen[:30]


def _delete_photo_files(photo: Photo) -> None:
    """Remove a photo's original, thumbnail, and display files from disk."""
    Path(photo.original_path).unlink(missing_ok=True)
    Path(photo.thumb_path).unlink(missing_ok=True)
    if photo.display_path:
        Path(photo.display_path).unlink(missing_ok=True)


def _paginate(
    db: Session,
    stmt,
    page: int,
    page_size: int,
    include_galleries: bool = False,
    sort: str = "taken",
    can_download: bool = False,
) -> PhotoPage:
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    if include_galleries:
        stmt = stmt.options(selectinload(Photo.gallery_links))
    # "taken" sorts by capture date, falling back to upload date for photos with
    # no EXIF date; "uploaded" sorts purely by when it was added.
    order_col = (
        func.coalesce(Photo.taken_at, Photo.uploaded_at)
        if sort == "taken"
        else Photo.uploaded_at
    )
    rows = db.scalars(
        # id is a stable, unique tiebreaker — without it, photos sharing a
        # timestamp (a whole upload batch gets one) order unpredictably across
        # pages, so OFFSET paging repeats/skips rows.
        stmt.order_by(order_col.desc(), Photo.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return PhotoPage(
        items=[
            photo_out(p, include_galleries=include_galleries, can_download=can_download)
            for p in rows
        ],
        total=total or 0,
        page=page,
        page_size=page_size,
    )


# ── Portfolio feed (visible photos only; verified users + admin) ──
@router.get("", response_model=PhotoPage)
def list_portfolio_photos(
    page: int = Query(1, ge=1),
    page_size: int = Query(60, ge=1, le=200),
    sort: str = Query("taken", pattern="^(taken|uploaded)$"),
    user: User = Depends(get_portfolio_user),
    db: Session = Depends(get_db),
):
    stmt = select(Photo).where(Photo.visible.is_(True))
    return _paginate(
        db, stmt, page, page_size, sort=sort, can_download=can_download_anywhere(user)
    )


# ── Admin: every photo, including hidden ──
@router.get("/admin", response_model=PhotoPage)
def list_admin_photos(
    page: int = Query(1, ge=1),
    page_size: int = Query(60, ge=1, le=200),
    sort: str = Query("taken", pattern="^(taken|uploaded)$"),
    tag: str | None = Query(None),
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    stmt = select(Photo)
    if tag:
        stmt = stmt.where(Photo.tags.any(tag.strip().lower()))
    return _paginate(
        db, stmt, page, page_size, include_galleries=True, sort=sort, can_download=True
    )


# ── Public: homepage hero feed (visible + reserved "featured" tag) ──
# Falls back to the most recent visible photos when nothing is featured yet, so
# the hero is never empty. Always page 1 (see FEATURED_MAX).
@router.get("/featured", response_model=PhotoPage)
def list_featured_photos(
    page_size: int = Query(30, ge=1, le=FEATURED_MAX),
    viewer: User | None = Depends(get_viewer),
    db: Session = Depends(get_db),
):
    featured = select(Photo).where(
        Photo.visible.is_(True), Photo.tags.any(FEATURED_TAG)
    )
    has_featured = db.scalar(select(func.count()).select_from(featured.subquery()))
    if not has_featured:
        featured = select(Photo).where(Photo.visible.is_(True))
    return _paginate(
        db, featured, 1, page_size, sort="taken", can_download=can_download_anywhere(viewer)
    )


# ── Admin: distinct tag vocabulary (for autocomplete + the tag picker) ──
@router.get("/tags", response_model=list[str])
def list_tags(
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    # SELECT DISTINCT unnest(tags) — flattens every photo's tag array into a
    # distinct vocabulary list.
    rows = db.scalars(select(func.unnest(Photo.tags)).distinct()).all()
    return sorted(t for t in rows if t)


# ── Upload (one or many) ──
@router.post("", response_model=list[PhotoOut], status_code=status.HTTP_201_CREATED)
def upload_photos(
    files: list[UploadFile] = File(...),
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    originals_dir = Path(settings.PHOTOS_ORIGINAL_PATH)
    thumbs_dir = Path(settings.PHOTOS_THUMB_PATH)
    display_dir = Path(settings.PHOTOS_DISPLAY_PATH)
    originals_dir.mkdir(parents=True, exist_ok=True)
    thumbs_dir.mkdir(parents=True, exist_ok=True)
    display_dir.mkdir(parents=True, exist_ok=True)

    created: list[Photo] = []
    for upload in files:
        ext = Path(upload.filename or "").suffix.lower()
        if ext not in ALLOWED_EXT:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"Unsupported file type: {ext or '(none)'}",
            )

        photo_id = uuid.uuid4()
        original_abs = originals_dir / f"{photo_id}{ext}"
        thumb_abs = thumbs_dir / f"{photo_id}.jpg"
        display_abs = display_dir / f"{photo_id}.jpg"

        # Stream to disk in chunks so a 25MB+ file never sits fully in memory.
        with original_abs.open("wb") as out:
            shutil.copyfileobj(upload.file, out, length=1024 * 1024)

        try:
            exif, width, height = process_upload(original_abs, thumb_abs)
        except Exception as exc:  # noqa: BLE001 — surface as a clean 422
            original_abs.unlink(missing_ok=True)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Could not process image {upload.filename}: {exc}",
            ) from exc

        # The display derivative is non-critical: if it fails, leave it null and
        # let the /display endpoint regenerate it lazily later.
        display_path: str | None = None
        try:
            generate_display(original_abs, display_abs)
            display_path = str(display_abs)
        except Exception as exc:  # noqa: BLE001
            print(f"[captionato] display derivative failed for {photo_id}: {exc}")

        photo = Photo(
            id=photo_id,
            filename=upload.filename or f"{photo_id}{ext}",
            original_path=str(original_abs),
            thumb_path=str(thumb_abs),
            display_path=display_path,
            exif=exif or None,
            width=width,
            height=height,
            taken_at=parse_exif_taken(exif),
            visible=True,
        )
        db.add(photo)
        created.append(photo)

    db.commit()
    for p in created:
        db.refresh(p)
    return [photo_out(p, can_download=True) for p in created]


# ── Bulk actions ──
@router.post("/bulk/visibility", status_code=status.HTTP_204_NO_CONTENT)
def bulk_set_visibility(
    body: BulkVisibility,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if body.photo_ids:
        db.execute(
            update(Photo)
            .where(Photo.id.in_(body.photo_ids))
            .values(visible=body.visible)
        )
        db.commit()


@router.post("/bulk/delete", status_code=status.HTTP_204_NO_CONTENT)
def bulk_delete(
    body: BulkIds,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    photos = db.scalars(select(Photo).where(Photo.id.in_(body.photo_ids))).all()
    for photo in photos:
        _delete_photo_files(photo)
        db.delete(photo)
    db.commit()


@router.post("/bulk/tags", status_code=status.HTTP_204_NO_CONTENT)
def bulk_tags(
    body: BulkTags,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Add and/or remove tags across the selected photos in one pass."""
    add = normalize_tags(body.add)
    remove = set(normalize_tags(body.remove))
    if not body.photo_ids or (not add and not remove):
        return
    photos = db.scalars(select(Photo).where(Photo.id.in_(body.photo_ids))).all()
    for photo in photos:
        current = [t for t in (photo.tags or []) if t not in remove]
        for t in add:
            if t not in current:
                current.append(t)
        # Reassign a new list so SQLAlchemy detects the change (ARRAY isn't
        # mutation-tracked in place).
        photo.tags = current
    db.commit()


@router.post("/bulk/galleries", status_code=status.HTTP_204_NO_CONTENT)
def bulk_add_to_galleries(
    body: BulkAddGalleries,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Append the selected photos to each gallery, skipping any that are already
    members (existing memberships are preserved)."""
    for gid in body.gallery_ids:
        if db.get(Gallery, gid) is None:
            continue
        next_order = (
            db.scalar(
                select(func.coalesce(func.max(GalleryPhoto.display_order), -1))
                .where(GalleryPhoto.gallery_id == gid)
            )
            + 1
        )
        for pid in body.photo_ids:
            if db.get(GalleryPhoto, (gid, pid)) is None:
                db.add(
                    GalleryPhoto(gallery_id=gid, photo_id=pid, display_order=next_order)
                )
                next_order += 1
    db.commit()


# ── Update metadata / visibility / gallery membership ──
@router.patch("/{photo_id}", response_model=PhotoOut)
def update_photo(
    photo_id: uuid.UUID,
    body: PhotoUpdate,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    photo = db.get(Photo, photo_id)
    if photo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")

    if body.title is not None:
        photo.title = body.title
    if body.caption is not None:
        photo.caption = body.caption
    if body.visible is not None:
        photo.visible = body.visible
    if body.tags is not None:
        photo.tags = normalize_tags(body.tags)

    if body.gallery_ids is not None:
        # Replace gallery membership wholesale, appending to each gallery's end.
        db.execute(delete(GalleryPhoto).where(GalleryPhoto.photo_id == photo_id))
        for gid in body.gallery_ids:
            next_order = db.scalar(
                select(func.coalesce(func.max(GalleryPhoto.display_order), -1) + 1)
                .where(GalleryPhoto.gallery_id == gid)
            )
            db.add(
                GalleryPhoto(
                    gallery_id=gid, photo_id=photo_id, display_order=next_order or 0
                )
            )

    db.commit()
    db.refresh(photo)
    return photo_out(photo, can_download=True)


@router.delete("/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(
    photo_id: uuid.UUID,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    photo = db.get(Photo, photo_id)
    if photo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")
    _delete_photo_files(photo)
    db.delete(photo)
    db.commit()


# ── EXIF (public) ──
@router.get("/{photo_id}/exif")
def get_exif(photo_id: uuid.UUID, db: Session = Depends(get_db)):
    photo = db.get(Photo, photo_id)
    if photo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")
    return photo.exif or {}


# ── Image serving (signed URLs only — see security.sign_image_path) ──
def _require_sig(path: str, exp: int | None, sig: str | None) -> None:
    if not verify_image_sig(path, exp, sig):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid or expired image link")


@router.get("/{photo_id}/thumb")
def serve_thumb(
    photo_id: uuid.UUID,
    exp: int | None = Query(None),
    sig: str | None = Query(None),
    db: Session = Depends(get_db),
):
    _require_sig(f"/photos/{photo_id}/thumb", exp, sig)
    photo = db.get(Photo, photo_id)
    if photo is None or not Path(photo.thumb_path).exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Thumbnail not found")
    return FileResponse(
        photo.thumb_path,
        media_type="image/jpeg",
        headers=IMAGE_CACHE,
    )


@router.get("/{photo_id}/display")
def serve_display(
    photo_id: uuid.UUID,
    exp: int | None = Query(None),
    sig: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """The lightbox image: a ~2560px derivative. Generated on upload; for older
    photos (or if generation failed) it's created lazily on first request and
    the path cached. Falls back to the original if it can't be produced."""
    _require_sig(f"/photos/{photo_id}/display", exp, sig)
    photo = db.get(Photo, photo_id)
    if photo is None or not Path(photo.original_path).exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")

    display_path = photo.display_path
    if not display_path or not Path(display_path).exists():
        display_abs = Path(settings.PHOTOS_DISPLAY_PATH) / f"{photo.id}.jpg"
        try:
            generate_display(Path(photo.original_path), display_abs)
            photo.display_path = str(display_abs)
            db.commit()
            display_path = str(display_abs)
        except Exception as exc:  # noqa: BLE001 — fall back to the original
            print(f"[captionato] lazy display gen failed for {photo.id}: {exc}")
            return FileResponse(
                photo.original_path,
                headers=IMAGE_CACHE,
            )

    return FileResponse(
        display_path,
        media_type="image/jpeg",
        headers=IMAGE_CACHE,
    )


@router.get("/{photo_id}/original")
def serve_original(
    photo_id: uuid.UUID,
    download: bool = Query(False),
    exp: int | None = Query(None),
    sig: str | None = Query(None),
    db: Session = Depends(get_db),
):
    _require_sig(f"/photos/{photo_id}/original", exp, sig)
    photo = db.get(Photo, photo_id)
    if photo is None or not Path(photo.original_path).exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Original not found")
    headers = IMAGE_CACHE
    if download:
        # Force a browser download with the original filename.
        return FileResponse(photo.original_path, filename=photo.filename, headers=headers)
    # Inline — served for display in the lightbox <img>.
    return FileResponse(photo.original_path, headers=headers)

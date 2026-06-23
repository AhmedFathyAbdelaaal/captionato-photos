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
from ..deps import get_current_admin, get_db
from ..imaging import process_upload
from ..models import Gallery, GalleryPhoto, Photo
from ..schemas import (
    BulkAddGalleries,
    BulkIds,
    BulkVisibility,
    PhotoOut,
    PhotoPage,
    PhotoUpdate,
)
from ..serializers import photo_out

router = APIRouter(prefix="/photos", tags=["photos"])

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}


def _paginate(
    db: Session, stmt, page: int, page_size: int, include_galleries: bool = False
) -> PhotoPage:
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    if include_galleries:
        stmt = stmt.options(selectinload(Photo.gallery_links))
    rows = db.scalars(
        stmt.order_by(Photo.uploaded_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return PhotoPage(
        items=[photo_out(p, include_galleries=include_galleries) for p in rows],
        total=total or 0,
        page=page,
        page_size=page_size,
    )


# ── Public: landing feed (visible photos only) ──
@router.get("", response_model=PhotoPage)
def list_public_photos(
    page: int = Query(1, ge=1),
    page_size: int = Query(60, ge=1, le=200),
    db: Session = Depends(get_db),
):
    stmt = select(Photo).where(Photo.visible.is_(True))
    return _paginate(db, stmt, page, page_size)


# ── Admin: every photo, including hidden ──
@router.get("/admin", response_model=PhotoPage)
def list_admin_photos(
    page: int = Query(1, ge=1),
    page_size: int = Query(60, ge=1, le=200),
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return _paginate(db, select(Photo), page, page_size, include_galleries=True)


# ── Upload (one or many) ──
@router.post("", response_model=list[PhotoOut], status_code=status.HTTP_201_CREATED)
def upload_photos(
    files: list[UploadFile] = File(...),
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    originals_dir = Path(settings.PHOTOS_ORIGINAL_PATH)
    thumbs_dir = Path(settings.PHOTOS_THUMB_PATH)
    originals_dir.mkdir(parents=True, exist_ok=True)
    thumbs_dir.mkdir(parents=True, exist_ok=True)

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

        photo = Photo(
            id=photo_id,
            filename=upload.filename or f"{photo_id}{ext}",
            original_path=str(original_abs),
            thumb_path=str(thumb_abs),
            exif=exif or None,
            width=width,
            height=height,
            visible=True,
        )
        db.add(photo)
        created.append(photo)

    db.commit()
    for p in created:
        db.refresh(p)
    return [photo_out(p) for p in created]


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
        Path(photo.original_path).unlink(missing_ok=True)
        Path(photo.thumb_path).unlink(missing_ok=True)
        db.delete(photo)
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
    return photo_out(photo)


@router.delete("/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(
    photo_id: uuid.UUID,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    photo = db.get(Photo, photo_id)
    if photo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")
    # Remove files from disk; ignore if already gone.
    Path(photo.original_path).unlink(missing_ok=True)
    Path(photo.thumb_path).unlink(missing_ok=True)
    db.delete(photo)
    db.commit()


# ── EXIF (public) ──
@router.get("/{photo_id}/exif")
def get_exif(photo_id: uuid.UUID, db: Session = Depends(get_db)):
    photo = db.get(Photo, photo_id)
    if photo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")
    return photo.exif or {}


# ── Image serving (public) ──
@router.get("/{photo_id}/thumb")
def serve_thumb(photo_id: uuid.UUID, db: Session = Depends(get_db)):
    photo = db.get(Photo, photo_id)
    if photo is None or not Path(photo.thumb_path).exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Thumbnail not found")
    return FileResponse(
        photo.thumb_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.get("/{photo_id}/original")
def serve_original(
    photo_id: uuid.UUID,
    download: bool = Query(False),
    db: Session = Depends(get_db),
):
    photo = db.get(Photo, photo_id)
    if photo is None or not Path(photo.original_path).exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Original not found")
    headers = {"Cache-Control": "public, max-age=31536000, immutable"}
    if download:
        # Force a browser download with the original filename.
        return FileResponse(photo.original_path, filename=photo.filename, headers=headers)
    # Inline — served for display in the lightbox <img>.
    return FileResponse(photo.original_path, headers=headers)

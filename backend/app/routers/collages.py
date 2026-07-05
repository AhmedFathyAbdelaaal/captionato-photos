"""Admin-only Collage Maker API: draft CRUD, layers, one-off uploads,
auto-chaotic generation and full-res export."""
import re
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..collage_layout import generate_layout
from ..collage_render import FORMAT_DIMS, one_off_abs_path, render_collage
from ..config import settings
from ..deps import get_current_admin, get_db
from ..imaging import process_upload
from ..models import Collage, CollageLayer, Photo
from ..schemas import (
    CollageCreate,
    CollageDetailOut,
    CollageLayerCreate,
    CollageLayerOut,
    CollageLayerUpdate,
    CollageUpdate,
    GenerateAutoRequest,
    OneOffUploadOut,
)
from ..serializers import collage_detail_out, collage_layer_out, one_off_thumb_name

router = APIRouter(prefix="/collages", tags=["collages"])

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}
# One-off files are stored as "<uuid><ext>" inside a per-collage folder; the
# strict pattern doubles as a path-traversal guard for client-sent names.
ONE_OFF_NAME_RE = re.compile(r"^[0-9a-f-]{36}(_thumb)?\.[a-z]+$")


def _get_collage(db: Session, collage_id: uuid.UUID) -> Collage:
    collage = db.scalar(
        select(Collage)
        .where(Collage.id == collage_id)
        .options(selectinload(Collage.layers).selectinload(CollageLayer.photo))
    )
    if collage is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Collage not found")
    return collage


def _one_off_dir(collage_id: uuid.UUID) -> Path:
    return Path(settings.COLLAGE_ONEOFF_PATH) / str(collage_id)


def _delete_one_off_files(layer: CollageLayer) -> None:
    if not layer.one_off_path:
        return
    one_off_abs_path(layer.collage_id, layer.one_off_path).unlink(missing_ok=True)
    one_off_abs_path(
        layer.collage_id, one_off_thumb_name(layer.one_off_path)
    ).unlink(missing_ok=True)


def _purge_one_offs(db: Session, collage: Collage) -> None:
    """Remove all one-off files (and their layers) for a collage — used after
    export and by the abandoned-draft sweep."""
    for layer in list(collage.layers):
        if layer.one_off_path:
            db.delete(layer)
    shutil.rmtree(_one_off_dir(collage.id), ignore_errors=True)


def sweep_abandoned_one_offs(db: Session) -> int:
    """Delete one-off images (files + layers) of drafts untouched for
    COLLAGE_SWEEP_DAYS+ days. Returns the number of collages cleaned."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.COLLAGE_SWEEP_DAYS)
    stale = db.scalars(
        select(Collage)
        .where(Collage.status == "draft", Collage.updated_at < cutoff)
        .options(selectinload(Collage.layers))
    ).all()
    cleaned = 0
    for collage in stale:
        if any(l.one_off_path for l in collage.layers) or _one_off_dir(collage.id).exists():
            _purge_one_offs(db, collage)
            cleaned += 1
    if cleaned:
        db.commit()
    return cleaned


# ── Draft CRUD ──
@router.get("", response_model=list[CollageDetailOut])
def list_collages(
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    collages = db.scalars(
        select(Collage)
        .options(selectinload(Collage.layers))
        .order_by(Collage.updated_at.desc())
    ).all()
    return [collage_detail_out(c) for c in collages]


@router.post("", response_model=CollageDetailOut, status_code=status.HTTP_201_CREATED)
def create_collage(
    body: CollageCreate,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    collage = Collage(format=body.format, background_color=body.background_color)
    db.add(collage)
    db.commit()
    db.refresh(collage)
    return collage_detail_out(collage)


# ── Auto-Chaotic Mode ──
# (Defined before the /{collage_id} routes so "generate-auto" never gets
# parsed as a collage id.)
@router.post(
    "/generate-auto",
    response_model=list[CollageDetailOut],
    status_code=status.HTTP_201_CREATED,
)
def generate_auto(
    body: GenerateAutoRequest,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Produce 3 differently-seeded arrangements of the selected photos. Each
    is a full draft; the client keeps the picked one and deletes the rest."""
    photos = db.scalars(select(Photo).where(Photo.id.in_(body.photo_ids))).all()
    if len(photos) < 2:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Need at least 2 existing photos to generate a collage",
        )
    # Keep the client's selection order (affects shuffling deterministically).
    by_id = {p.id: p for p in photos}
    ordered = [by_id[pid] for pid in body.photo_ids if pid in by_id]

    base_seed = uuid.uuid4().int & 0xFFFFFFFF
    drafts: list[Collage] = []
    for option in range(3):
        collage = Collage(format=body.format)
        db.add(collage)
        db.flush()
        for layer in generate_layout(ordered, body.format, seed=base_seed + option):
            db.add(CollageLayer(collage_id=collage.id, **layer))
        drafts.append(collage)
    db.commit()
    return [collage_detail_out(_get_collage(db, c.id)) for c in drafts]


@router.get("/{collage_id}", response_model=CollageDetailOut)
def get_collage(
    collage_id: uuid.UUID,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return collage_detail_out(_get_collage(db, collage_id))


@router.patch("/{collage_id}", response_model=CollageDetailOut)
def update_collage(
    collage_id: uuid.UUID,
    body: CollageUpdate,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    collage = _get_collage(db, collage_id)
    if body.background_color is not None:
        collage.background_color = body.background_color
    if body.status is not None:
        collage.status = body.status
    db.commit()
    return collage_detail_out(_get_collage(db, collage_id))


@router.delete("/{collage_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collage(
    collage_id: uuid.UUID,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    collage = _get_collage(db, collage_id)
    shutil.rmtree(_one_off_dir(collage.id), ignore_errors=True)
    db.delete(collage)
    db.commit()


# ── Layers ──
@router.post(
    "/{collage_id}/layers",
    response_model=CollageLayerOut,
    status_code=status.HTTP_201_CREATED,
)
def add_layer(
    collage_id: uuid.UUID,
    body: CollageLayerCreate,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    collage = _get_collage(db, collage_id)
    if (body.photo_id is None) == (body.one_off_path is None):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Layer needs exactly one of photo_id or one_off_path",
        )
    if body.photo_id is not None and db.get(Photo, body.photo_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")
    if body.one_off_path is not None:
        if not ONE_OFF_NAME_RE.match(body.one_off_path):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Bad one-off path")
        if not one_off_abs_path(collage.id, body.one_off_path).exists():
            raise HTTPException(status.HTTP_404_NOT_FOUND, "One-off image not found")

    layer = CollageLayer(collage_id=collage.id, **body.model_dump())
    db.add(layer)
    collage.updated_at = func.now()
    db.commit()
    db.refresh(layer)
    return collage_layer_out(layer)


@router.patch("/{collage_id}/layers/{layer_id}", response_model=CollageLayerOut)
def update_layer(
    collage_id: uuid.UUID,
    layer_id: uuid.UUID,
    body: CollageLayerUpdate,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    layer = db.get(CollageLayer, layer_id)
    if layer is None or layer.collage_id != collage_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Layer not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(layer, field, value)
    layer.collage.updated_at = func.now()
    db.commit()
    db.refresh(layer)
    return collage_layer_out(layer)


@router.delete(
    "/{collage_id}/layers/{layer_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_layer(
    collage_id: uuid.UUID,
    layer_id: uuid.UUID,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    layer = db.get(CollageLayer, layer_id)
    if layer is None or layer.collage_id != collage_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Layer not found")
    _delete_one_off_files(layer)
    layer.collage.updated_at = func.now()
    db.delete(layer)
    db.commit()


# ── One-off images ──
@router.post("/{collage_id}/upload-one-off", response_model=OneOffUploadOut)
def upload_one_off(
    collage_id: uuid.UUID,
    file: UploadFile = File(...),
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    collage = _get_collage(db, collage_id)
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type: {ext or '(none)'}",
        )

    one_off_dir = _one_off_dir(collage.id)
    one_off_dir.mkdir(parents=True, exist_ok=True)
    file_id = uuid.uuid4()
    original_abs = one_off_dir / f"{file_id}{ext}"
    thumb_abs = one_off_dir / f"{file_id}_thumb.jpg"

    with original_abs.open("wb") as out:
        shutil.copyfileobj(file.file, out, length=1024 * 1024)
    try:
        _exif, width, height = process_upload(original_abs, thumb_abs)
    except Exception as exc:  # noqa: BLE001 — surface as a clean 422
        original_abs.unlink(missing_ok=True)
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not process image {file.filename}: {exc}",
        ) from exc

    return OneOffUploadOut(
        one_off_path=original_abs.name,
        thumb_url=f"/collages/{collage.id}/one-off/{thumb_abs.name}",
        width=width,
        height=height,
    )


@router.get("/{collage_id}/one-off/{filename}")
def serve_one_off(collage_id: uuid.UUID, filename: str):
    # Served without auth (like photo thumbs) so the editor's <img> tags work;
    # names are unguessable UUIDs. The regex blocks any traversal attempt.
    if not ONE_OFF_NAME_RE.match(filename):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    path = one_off_abs_path(collage_id, filename)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return FileResponse(path, headers={"Cache-Control": "private, max-age=86400"})


# ── Export ──
@router.post("/{collage_id}/export")
def export_collage(
    collage_id: uuid.UUID,
    format: str = Query("jpg", pattern="^(jpg|png)$"),
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    collage = _get_collage(db, collage_id)
    if collage.format not in FORMAT_DIMS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown format")
    if not collage.layers:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Collage is empty")

    out_format = "png" if format == "png" else "jpeg"
    data = render_collage(collage, out_format=out_format)

    collage.status = "exported"
    collage.exported_at = func.now()
    _purge_one_offs(db, collage)
    db.commit()

    ext = "png" if out_format == "png" else "jpg"
    filename = f"collage-{collage.format}-{str(collage.id)[:8]}.{ext}"
    return Response(
        content=data,
        media_type=f"image/{out_format}",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

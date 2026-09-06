"""Admin-only multi-slide Posts API. Each slide is a Collage (reusing the whole
collage editor + renderer). Exporting a Post renders every slide and returns a
ZIP of the images, ready to upload to Instagram."""
import io
import re
import uuid
import zipfile

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..collage_render import FORMAT_DIMS, render_collage
from ..deps import get_current_admin, get_db
from ..models import Collage, CollageLayer, Post
from ..schemas import (
    PostCreate,
    PostDetailOut,
    PostOut,
    PostUpdate,
    ReorderRequest,
    SlideCreate,
)
from ..serializers import collage_detail_out, post_detail_out, post_out
from .collages import _one_off_dir, _purge_one_offs

router = APIRouter(prefix="/posts", tags=["posts"])

MAX_SLIDES = 20  # Instagram's carousel cap.


def _load_post(db: Session, post_id: uuid.UUID) -> Post:
    post = db.scalar(
        select(Post)
        .where(Post.id == post_id)
        .options(
            selectinload(Post.slides)
            .selectinload(Collage.layers)
            .selectinload(CollageLayer.photo)
        )
    )
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    return post


def _slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", name).strip("-").lower()
    return s or "post"


# ── Post CRUD ──
@router.get("", response_model=list[PostOut])
def list_posts(
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    posts = db.scalars(
        select(Post)
        .options(selectinload(Post.slides).selectinload(Collage.layers))
        .order_by(Post.updated_at.desc())
    ).all()
    return [post_out(p) for p in posts]


@router.post("", response_model=PostDetailOut, status_code=status.HTTP_201_CREATED)
def create_post(
    body: PostCreate,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    # Start every post with one square slide so the editor opens on a canvas.
    post = Post(name=body.name.strip())
    post.slides.append(Collage(format="square", slide_order=0))
    db.add(post)
    db.commit()
    return post_detail_out(_load_post(db, post.id))


@router.get("/{post_id}", response_model=PostDetailOut)
def get_post(
    post_id: uuid.UUID,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return post_detail_out(_load_post(db, post_id))


@router.patch("/{post_id}", response_model=PostDetailOut)
def update_post(
    post_id: uuid.UUID,
    body: PostUpdate,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    post = _load_post(db, post_id)
    if body.name is not None:
        post.name = body.name.strip()
    if body.status is not None:
        post.status = body.status
    db.commit()
    return post_detail_out(_load_post(db, post_id))


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: uuid.UUID,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    post = _load_post(db, post_id)
    # Remove each slide's one-off image directory from disk before the cascade
    # deletes the slide rows.
    import shutil

    for slide in post.slides:
        shutil.rmtree(_one_off_dir(slide.id), ignore_errors=True)
    db.delete(post)
    db.commit()


# ── Slides ──
@router.post(
    "/{post_id}/slides",
    response_model=PostDetailOut,
    status_code=status.HTTP_201_CREATED,
)
def add_slide(
    post_id: uuid.UUID,
    body: SlideCreate,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    post = _load_post(db, post_id)
    if len(post.slides) >= MAX_SLIDES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"A post can hold at most {MAX_SLIDES} slides.",
        )
    next_order = max((s.slide_order for s in post.slides), default=-1) + 1
    db.add(Collage(format=body.format, post_id=post.id, slide_order=next_order))
    post.updated_at = func.now()
    db.commit()
    return post_detail_out(_load_post(db, post_id))


@router.post("/{post_id}/slides/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_slides(
    post_id: uuid.UUID,
    body: ReorderRequest,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    post = _load_post(db, post_id)
    order = {sid: i for i, sid in enumerate(body.ids)}
    for slide in post.slides:
        if slide.id in order:
            slide.slide_order = order[slide.id]
    post.updated_at = func.now()
    db.commit()


@router.delete(
    "/{post_id}/slides/{slide_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_slide(
    post_id: uuid.UUID,
    slide_id: uuid.UUID,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    slide = db.get(Collage, slide_id)
    if slide is None or slide.post_id != post_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Slide not found")
    if len(_load_post(db, post_id).slides) <= 1:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "A post needs at least one slide.",
        )
    import shutil

    shutil.rmtree(_one_off_dir(slide.id), ignore_errors=True)
    db.delete(slide)
    db.execute(
        Post.__table__.update()
        .where(Post.id == post_id)
        .values(updated_at=func.now())
    )
    db.commit()


# ── Export (ZIP of every slide, in order) ──
@router.post("/{post_id}/export")
def export_post(
    post_id: uuid.UUID,
    format: str = Query("jpg", pattern="^(jpg|png)$"),
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    post = _load_post(db, post_id)
    slides = sorted(post.slides, key=lambda s: s.slide_order)
    if not slides:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Post has no slides")
    for i, slide in enumerate(slides, 1):
        if slide.format not in FORMAT_DIMS:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Slide {i} has an unknown size.",
            )
        if not slide.layers:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Slide {i} is empty — add photos or remove it before exporting.",
            )

    out_format = "png" if format == "png" else "jpeg"
    ext = "png" if out_format == "png" else "jpg"
    slug = _slug(post.name)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, slide in enumerate(slides, 1):
            data = render_collage(slide, out_format=out_format)
            zf.writestr(f"{slug}-{i:02d}.{ext}", data)

    # One-offs are single-use: drop them (files + layers) once exported.
    for slide in slides:
        _purge_one_offs(db, slide)
        slide.status = "exported"
        slide.exported_at = func.now()
    post.status = "exported"
    post.exported_at = func.now()
    db.commit()

    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{slug}.zip"'},
    )

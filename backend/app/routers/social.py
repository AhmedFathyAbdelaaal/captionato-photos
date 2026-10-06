import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..deps import get_approved_user, get_current_admin, get_db
from ..models import Comment, PhotoCapy, User
from ..schemas import (
    CapyOut,
    CommentAuthor,
    CommentContextGallery,
    CommentContextPhoto,
    CommentCreate,
    CommentFeed,
    CommentFeedItem,
    CommentOut,
    CommentUpdate,
)
from ..serializers import thumb_url
from ..social import can_join_context

router = APIRouter(tags=["social"])

# Per-user posting limit: at most this many comments per rolling minute.
COMMENTS_PER_MINUTE = 8


def _author(user: User) -> CommentAuthor:
    return CommentAuthor(id=user.id, username=user.username, is_admin=user.role == "admin")


def _comment_out(c: Comment, viewer: User, replies: list[CommentOut] | None = None) -> CommentOut:
    return CommentOut(
        id=c.id,
        body=c.body,
        created_at=c.created_at,
        edited_at=c.edited_at,
        author=_author(c.user),
        mine=c.user_id == viewer.id,
        can_delete=c.user_id == viewer.id or viewer.role == "admin",
        replies=replies or [],
    )


def _require_context(db: Session, user: User, gallery_id, photo_id) -> None:
    if gallery_id is None and photo_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Say where: gallery_id and/or photo_id")
    if not can_join_context(db, user, gallery_id, photo_id):
        # 404, not 403: don't confirm that a private gallery/photo exists.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")


def _get_comment(db: Session, comment_id: uuid.UUID) -> Comment:
    c = db.scalar(
        select(Comment).where(Comment.id == comment_id).options(selectinload(Comment.user))
    )
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    return c


# ── Read a thread (top-level comments oldest-first, each with its replies) ──
@router.get("/comments", response_model=list[CommentOut])
def list_comments(
    gallery_id: uuid.UUID | None = Query(None),
    photo_id: uuid.UUID | None = Query(None),
    user: User = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    _require_context(db, user, gallery_id, photo_id)
    rows = db.scalars(
        select(Comment)
        .where(
            Comment.gallery_id.is_(None) if gallery_id is None else Comment.gallery_id == gallery_id,
            Comment.photo_id.is_(None) if photo_id is None else Comment.photo_id == photo_id,
        )
        .options(selectinload(Comment.user))
        .order_by(Comment.created_at, Comment.id)
    ).all()
    replies: dict[uuid.UUID, list[CommentOut]] = {}
    for c in rows:
        if c.parent_id is not None:
            replies.setdefault(c.parent_id, []).append(_comment_out(c, user))
    return [_comment_out(c, user, replies.get(c.id)) for c in rows if c.parent_id is None]


# ── Post ──
@router.post("/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
def create_comment(
    body: CommentCreate,
    user: User = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    text = body.body.strip()
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Comment is empty")
    _require_context(db, user, body.gallery_id, body.photo_id)

    if body.parent_id is not None:
        parent = db.get(Comment, body.parent_id)
        same_place = (
            parent is not None
            and parent.gallery_id == body.gallery_id
            and parent.photo_id == body.photo_id
        )
        if not same_place:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reply target not found here")
        if parent.parent_id is not None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Replies are one level deep")

    since = datetime.now(timezone.utc) - timedelta(minutes=1)
    recent = db.scalar(
        select(func.count())
        .select_from(Comment)
        .where(Comment.user_id == user.id, Comment.created_at >= since)
    )
    if recent and recent >= COMMENTS_PER_MINUTE:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "Easy there — try again in a minute."
        )

    c = Comment(
        user_id=user.id,
        gallery_id=body.gallery_id,
        photo_id=body.photo_id,
        parent_id=body.parent_id,
        body=text,
    )
    db.add(c)
    db.commit()
    return _comment_out(_get_comment(db, c.id), user)


# ── Edit (author only) ──
@router.patch("/comments/{comment_id}", response_model=CommentOut)
def edit_comment(
    comment_id: uuid.UUID,
    body: CommentUpdate,
    user: User = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    c = _get_comment(db, comment_id)
    if c.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the author can edit this")
    text = body.body.strip()
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Comment is empty")
    if text != c.body:
        c.body = text
        c.edited_at = datetime.now(timezone.utc)
        db.commit()
    return _comment_out(c, user)


# ── Delete (author or admin; replies go with their parent) ──
@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: uuid.UUID,
    user: User = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    c = _get_comment(db, comment_id)
    if c.user_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not yours to delete")
    db.delete(c)
    db.commit()


# ── Admin feed: newest first, with where each comment lives ──
@router.get("/comments/admin/feed", response_model=CommentFeed)
def comment_feed(
    limit: int = Query(100, ge=1, le=300),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    read_at = admin.comments_read_at
    rows = db.scalars(
        select(Comment)
        .options(
            selectinload(Comment.user),
            selectinload(Comment.gallery),
            selectinload(Comment.photo),
        )
        .order_by(Comment.created_at.desc(), Comment.id.desc())
        .limit(limit)
    ).all()

    def is_unread(c: Comment) -> bool:
        return c.user_id != admin.id and (read_at is None or c.created_at > read_at)

    unread_q = select(func.count()).select_from(Comment).where(Comment.user_id != admin.id)
    if read_at is not None:
        unread_q = unread_q.where(Comment.created_at > read_at)
    items = [
        CommentFeedItem(
            id=c.id,
            body=c.body,
            created_at=c.created_at,
            edited_at=c.edited_at,
            author=_author(c.user),
            parent_id=c.parent_id,
            gallery=(
                CommentContextGallery(id=c.gallery.id, slug=c.gallery.slug, name=c.gallery.name)
                if c.gallery
                else None
            ),
            photo=(
                CommentContextPhoto(
                    id=c.photo.id, thumbnail_url=thumb_url(c.photo), filename=c.photo.filename
                )
                if c.photo
                else None
            ),
            unread=is_unread(c),
        )
        for c in rows
    ]
    return CommentFeed(items=items, unread=db.scalar(unread_q) or 0)


@router.post("/comments/admin/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_comments_read(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    admin.comments_read_at = datetime.now(timezone.utc)
    db.commit()


# ── Capys (the capybara like) ──
def _capy_state(db: Session, user: User, photo_id: uuid.UUID) -> CapyOut:
    count = db.scalar(
        select(func.count()).select_from(PhotoCapy).where(PhotoCapy.photo_id == photo_id)
    )
    return CapyOut(
        capy_count=count or 0,
        capied=db.get(PhotoCapy, (user.id, photo_id)) is not None,
    )


@router.put("/photos/{photo_id}/capy", response_model=CapyOut)
def give_capy(
    photo_id: uuid.UUID,
    gallery_id: uuid.UUID | None = Query(None),
    user: User = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Idempotent. `gallery_id` says where the viewer sees the photo (omit for
    the portfolio) — that's what authorises it."""
    _require_context(db, user, gallery_id, photo_id)
    if db.get(PhotoCapy, (user.id, photo_id)) is None:
        db.add(PhotoCapy(user_id=user.id, photo_id=photo_id))
        try:
            db.commit()
        except IntegrityError:  # double-tap race: the other request won
            db.rollback()
    return _capy_state(db, user, photo_id)


@router.delete("/photos/{photo_id}/capy", response_model=CapyOut)
def take_capy_back(
    photo_id: uuid.UUID,
    user: User = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    capy = db.get(PhotoCapy, (user.id, photo_id))
    if capy is not None:
        db.delete(capy)
        db.commit()
    return _capy_state(db, user, photo_id)

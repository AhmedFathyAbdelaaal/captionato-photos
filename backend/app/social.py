"""Who may comment / give capys where, and the per-photo social counts.

A *context* is (gallery_id, photo_id) — see models.Comment. The rule: you can
take part in a context if you can see it as a member, i.e.

  gallery context   → admin, or the gallery is granted to you
  portfolio context → verified/admin, and the photo is visible

Password-unlocked galleries are view-only: the unlock isn't remembered
server-side, so there's nothing to authorise later comment calls against.
"""
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .deps import APPROVED_ROLES, PORTFOLIO_ROLES
from .models import Comment, GalleryPhoto, Photo, PhotoCapy, User, UserGallery
from .schemas import PhotoOut


def can_join_gallery(db: Session, user: User, gallery_id: uuid.UUID) -> bool:
    if user.role not in APPROVED_ROLES:
        return False
    if user.role == "admin":
        return True
    return db.get(UserGallery, (user.id, gallery_id)) is not None


def can_join_context(
    db: Session,
    user: User,
    gallery_id: uuid.UUID | None,
    photo_id: uuid.UUID | None,
) -> bool:
    if user.role not in APPROVED_ROLES or (gallery_id is None and photo_id is None):
        return False
    if gallery_id is not None:
        if not can_join_gallery(db, user, gallery_id):
            return False
        # A photo context must be a photo that's actually in this gallery.
        return photo_id is None or db.get(GalleryPhoto, (gallery_id, photo_id)) is not None
    photo = db.get(Photo, photo_id)
    return user.role in PORTFOLIO_ROLES and photo is not None and photo.visible


def _context_filter(gallery_id: uuid.UUID | None):
    return Comment.gallery_id.is_(None) if gallery_id is None else Comment.gallery_id == gallery_id


def apply_engagement(
    db: Session, photos: list[PhotoOut], gallery_id: uuid.UUID | None, user: User
) -> None:
    """Fill comment_count (this context), capy_count and capied in place, with
    three grouped queries regardless of page size."""
    ids = [p.id for p in photos]
    if not ids:
        return
    comments = dict(
        db.execute(
            select(Comment.photo_id, func.count())
            .where(Comment.photo_id.in_(ids), _context_filter(gallery_id))
            .group_by(Comment.photo_id)
        ).all()
    )
    capys = dict(
        db.execute(
            select(PhotoCapy.photo_id, func.count())
            .where(PhotoCapy.photo_id.in_(ids))
            .group_by(PhotoCapy.photo_id)
        ).all()
    )
    mine = set(
        db.scalars(
            select(PhotoCapy.photo_id).where(
                PhotoCapy.user_id == user.id, PhotoCapy.photo_id.in_(ids)
            )
        ).all()
    )
    for p in photos:
        p.comment_count = comments.get(p.id, 0)
        p.capy_count = capys.get(p.id, 0)
        p.capied = p.id in mine


def gallery_comment_count(db: Session, gallery_id: uuid.UUID) -> int:
    return db.scalar(
        select(func.count())
        .select_from(Comment)
        .where(Comment.gallery_id == gallery_id, Comment.photo_id.is_(None))
    ) or 0

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, delete, select
from sqlalchemy.orm import Session, selectinload

from ..deps import get_current_admin, get_db
from ..models import Gallery, User, UserGallery
from ..schemas import PasswordReset, UserOut, UserRole, UserUpdate
from ..security import hash_password

router = APIRouter(prefix="/users", tags=["users"])


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        role=user.role,
        note=user.note,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        gallery_ids=[g.gallery_id for g in user.gallery_grants],
    )


def _get_user(db: Session, user_id: uuid.UUID) -> User:
    user = db.scalar(
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.gallery_grants))
    )
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


# ── List (pending first, then newest) ──
@router.get("", response_model=list[UserOut])
def list_users(
    role: UserRole | None = Query(None),
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    stmt = select(User).options(selectinload(User.gallery_grants))
    if role:
        stmt = stmt.where(User.role == role)
    stmt = stmt.order_by(
        case((User.role == "pending", 0), else_=1), User.created_at.desc()
    )
    return [user_out(u) for u in db.scalars(stmt).all()]


# ── Change role and/or gallery grants ──
@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    user = _get_user(db, user_id)
    if body.role is not None and body.role != user.role:
        if user.id == admin.id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "You can't change your own role."
            )
        user.role = body.role
    if body.gallery_ids is not None:
        wanted = set(body.gallery_ids)
        existing = set(db.scalars(select(Gallery.id).where(Gallery.id.in_(wanted))).all())
        if existing != wanted:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown gallery id")
        db.execute(delete(UserGallery).where(UserGallery.user_id == user.id))
        db.add_all(UserGallery(user_id=user.id, gallery_id=gid) for gid in wanted)
    db.commit()
    db.expire(user)
    return user_out(_get_user(db, user_id))


# ── Admin password reset (there's no email, so this is the recovery path) ──
@router.post("/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    user_id: uuid.UUID,
    body: PasswordReset,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    user = _get_user(db, user_id)
    user.password_hash = hash_password(body.new_password)
    db.commit()


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: uuid.UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    user = _get_user(db, user_id)
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't delete yourself.")
    db.delete(user)
    db.commit()

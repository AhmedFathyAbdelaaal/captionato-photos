from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db
from ..models import User
from ..schemas import (
    LoginRequest,
    MeOut,
    PasswordChange,
    RegisterRequest,
    TokenResponse,
)
from ..security import (
    create_access_token,
    hash_password,
    verify_password,
    verify_turnstile,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def find_user(db: Session, username: str) -> User | None:
    """Case-insensitive username lookup (matches the lower(username) index)."""
    return db.scalar(
        select(User).where(func.lower(User.username) == username.strip().lower())
    )


def _require_turnstile(token: str | None) -> None:
    if not verify_turnstile(token):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Captcha check failed — please try again."
        )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    _require_turnstile(body.turnstile_token)
    if find_user(db, body.username):
        raise HTTPException(status.HTTP_409_CONFLICT, "That username is taken")
    user = User(
        username=body.username.strip(),
        password_hash=hash_password(body.password),
        role="pending",
        note=(body.note or "").strip() or None,
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # lost a race with an identical sign-up
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That username is taken")
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    _require_turnstile(body.turnstile_token)
    user = find_user(db, body.username)
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.get("/me", response_model=MeOut)
def me(current: User = Depends(get_current_user)):
    return MeOut(
        id=current.id,
        username=current.username,
        role=current.role,
        can_download=current.can_download,
    )


@router.post("/password")
def change_password(
    body: PasswordChange,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, current.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    current.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}

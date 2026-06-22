from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import get_current_admin, get_db
from ..models import AdminUser
from ..schemas import LoginRequest, PasswordChange, TokenResponse
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(AdminUser).where(AdminUser.username == body.username))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    return TokenResponse(access_token=create_access_token(user.username))


@router.get("/me")
def me(current: AdminUser = Depends(get_current_admin)):
    return {"username": current.username}


@router.post("/password")
def change_password(
    body: PasswordChange,
    current: AdminUser = Depends(get_current_admin),
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

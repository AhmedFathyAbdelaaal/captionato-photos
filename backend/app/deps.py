import uuid
from collections.abc import Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import SessionLocal
from .models import User
from .security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)

# Roles allowed past the "awaiting verification" wall, and roles that see the
# full portfolio (the master gallery).
APPROVED_ROLES = {"client", "verified", "admin"}
PORTFOLIO_ROLES = {"verified", "admin"}


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_optional_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """The caller, or None when anonymous. A token that is present but invalid
    (expired, deleted user) is a 401, so the client drops it instead of quietly
    rendering a logged-out view while thinking it's logged in."""
    if creds is None:
        return None
    subject = decode_access_token(creds.credentials)
    try:
        user_id = uuid.UUID(subject or "")
    except ValueError:
        raise _unauthorized()
    user = db.get(User, user_id)
    if user is None:
        raise _unauthorized()
    return user


def get_viewer(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """Like get_optional_user, but a bad token just means anonymous. For public
    routes that only *enrich* their response for logged-in users, so a stale
    token never turns a public page into a 401."""
    try:
        return get_optional_user(creds, db)
    except HTTPException:
        return None


def can_download_anywhere(user: User | None) -> bool:
    """Admin, or an approved user flagged Elevated (can_download)."""
    if user is None or user.role not in APPROVED_ROLES:
        return False
    return user.role == "admin" or user.can_download


def get_current_user(user: User | None = Depends(get_optional_user)) -> User:
    if user is None:
        raise _unauthorized()
    return user


def _require_role(user: User, roles: set[str]) -> User:
    if user.role not in roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")
    return user


def get_approved_user(user: User = Depends(get_current_user)) -> User:
    return _require_role(user, APPROVED_ROLES)


def get_portfolio_user(user: User = Depends(get_current_user)) -> User:
    return _require_role(user, PORTFOLIO_ROLES)


def get_current_admin(user: User = Depends(get_current_user)) -> User:
    return _require_role(user, {"admin"})

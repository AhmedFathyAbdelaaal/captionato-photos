import hashlib
import hmac
import json
import math
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> str | None:
    """Return the token subject (user id) if valid, else None."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        return payload.get("sub")
    except JWTError:
        return None


# ── Signed image URLs ──
# <img> tags can't send a Bearer header, so image routes are authorised by the
# URL itself: the API only hands out signed URLs for photos the caller may see.


def _image_sig(path: str, exp: int) -> str:
    msg = f"{path}:{exp}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()[:32]


def sign_image_path(path: str) -> str:
    """Append exp + sig to an API-relative image path. Expiry is rounded up to a
    half-TTL bucket so the same photo keeps the same URL (cache hits) for hours."""
    bucket = max(settings.IMAGE_URL_TTL_HOURS * 3600 // 2, 60)
    exp = math.ceil((time.time() + settings.IMAGE_URL_TTL_HOURS * 3600) / bucket) * bucket
    return f"{path}?exp={exp}&sig={_image_sig(path, exp)}"


def verify_image_sig(path: str, exp: int | None, sig: str | None) -> bool:
    if exp is None or not sig or exp < time.time():
        return False
    return hmac.compare_digest(_image_sig(path, exp), sig)


# ── Cloudflare Turnstile ──
TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def verify_turnstile(token: str | None) -> bool:
    """Server-side check of a Turnstile widget token. Skipped (always True) when
    no secret is configured, so local dev works without Cloudflare."""
    if not settings.TURNSTILE_SECRET_KEY:
        return True
    if not token:
        return False
    data = urllib.parse.urlencode(
        {"secret": settings.TURNSTILE_SECRET_KEY, "response": token}
    ).encode()
    try:
        with urllib.request.urlopen(TURNSTILE_VERIFY_URL, data=data, timeout=10) as resp:
            return bool(json.load(resp).get("success"))
    except Exception as exc:  # noqa: BLE001 — treat Cloudflare outages as a fail
        print(f"[captionato] turnstile verify failed: {exc}")
        return False

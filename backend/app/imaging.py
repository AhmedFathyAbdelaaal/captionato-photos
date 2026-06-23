"""Thumbnail generation and EXIF extraction with Pillow.

Originals are stored untouched (the old site's "no compression, ever" value is
preserved). Thumbnails are downscaled to a long-edge bound for fast grids and
lightbox display; full-res is only ever served from the original.
"""
from fractions import Fraction
from pathlib import Path

from PIL import ExifTags, Image, ImageFile, ImageOps

from .config import settings

# Uploads are admin-only (trusted), so lift Pillow's decompression-bomb guard
# to allow very large panoramas / high-megapixel files, and tolerate slightly
# truncated JPEGs rather than failing the whole upload.
Image.MAX_IMAGE_PIXELS = None
ImageFile.LOAD_TRUNCATED_IMAGES = True

# Reverse lookup: human-readable tag name -> numeric EXIF id.
_TAG_IDS = {name: num for num, name in ExifTags.TAGS.items()}


def _rational_to_float(value) -> float | None:
    try:
        if isinstance(value, tuple):  # legacy (num, den)
            return value[0] / value[1]
        return float(value)
    except (TypeError, ZeroDivisionError, ValueError):
        return None


def _format_shutter(value) -> str | None:
    secs = _rational_to_float(value)
    if secs is None:
        return None
    if secs >= 1:
        return f"{secs:g}s"
    frac = Fraction(secs).limit_denominator(8000)
    return f"{frac.numerator}/{frac.denominator}s"


def extract_exif(img: Image.Image) -> dict:
    """Pull the photographic EXIF fields the lightbox displays. Missing values
    are simply omitted so the UI never renders an empty field."""
    raw = img.getexif()
    if not raw:
        return {}

    exif: dict[str, object] = {}

    make = raw.get(_TAG_IDS.get("Make"))
    model = raw.get(_TAG_IDS.get("Model"))
    if make or model:
        exif["camera"] = " ".join(str(p).strip() for p in (make, model) if p)

    # Lens / aperture / shutter / iso / focal live in the Exif sub-IFD.
    try:
        sub = raw.get_ifd(ExifTags.IFD.Exif)
    except (AttributeError, KeyError):
        sub = {}

    def sub_get(name):
        return sub.get(_TAG_IDS.get(name))

    lens = sub_get("LensModel")
    if lens:
        exif["lens"] = str(lens).strip()

    focal = _rational_to_float(sub_get("FocalLength"))
    if focal:
        exif["focal_length"] = f"{focal:g}mm"

    fnum = _rational_to_float(sub_get("FNumber"))
    if fnum:
        exif["aperture"] = f"f/{fnum:g}"

    shutter = _format_shutter(sub_get("ExposureTime"))
    if shutter:
        exif["shutter_speed"] = shutter

    iso = sub_get("ISOSpeedRatings") or sub_get("PhotographicSensitivity")
    if iso:
        exif["iso"] = f"ISO {iso}"

    taken = sub_get("DateTimeOriginal") or raw.get(_TAG_IDS.get("DateTime"))
    if taken:
        exif["date_taken"] = str(taken).strip()

    return exif


def process_upload(original_abs: Path, thumb_abs: Path) -> tuple[dict, int | None, int | None]:
    """Given an already-saved original, generate its thumbnail and return
    (exif_dict, width, height). The original file is never modified.

    Memory-light: EXIF and dimensions are read from the file header (no full
    decode), and `draft()` lets the JPEG decoder downscale during decode so a
    high-megapixel photo never expands to its full raster in RAM.
    """
    thumb_abs.parent.mkdir(parents=True, exist_ok=True)
    edge = settings.THUMB_MAX_EDGE

    with Image.open(original_abs) as img:
        # Read from headers before any decode — cheap and full-resolution.
        exif = extract_exif(img)

        # Ask the (JPEG) decoder to load at a reduced scale near the thumb size.
        # No-op for formats that don't support it; harmless either way.
        img.draft("RGB", (edge, edge))

        thumb = ImageOps.exif_transpose(img)  # decodes + honours orientation
        thumb.thumbnail((edge, edge), Image.LANCZOS)
        # The thumbnail's dimensions carry the (orientation-correct) aspect
        # ratio the masonry grid needs.
        width, height = thumb.size

        if thumb.mode in ("RGBA", "P", "LA"):
            thumb = thumb.convert("RGB")
        thumb.save(thumb_abs, format="JPEG", quality=85, optimize=True)

    return exif, width, height

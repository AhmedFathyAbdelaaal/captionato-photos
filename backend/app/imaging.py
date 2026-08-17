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


def _clean(value) -> str:
    """Normalise an EXIF string for storage. Some cameras (e.g. OPPO) NUL-pad
    their string fields; PostgreSQL text/JSONB cannot hold NUL (\\u0000), so we
    strip NULs and other C0 control chars, collapse stray whitespace, and trim.
    """
    text = str(value).replace("\x00", "")
    text = "".join(ch for ch in text if ch >= " " or ch in "\t")
    return text.strip()


def extract_exif(img: Image.Image) -> dict:
    """Pull the photographic EXIF fields the lightbox displays. Missing values
    are simply omitted so the UI never renders an empty field."""
    raw = img.getexif()
    if not raw:
        return {}

    exif: dict[str, object] = {}

    make = _clean(raw.get(_TAG_IDS.get("Make")) or "")
    model = _clean(raw.get(_TAG_IDS.get("Model")) or "")
    camera = " ".join(p for p in (make, model) if p)
    if camera:
        exif["camera"] = camera

    # Lens / aperture / shutter / iso / focal live in the Exif sub-IFD.
    try:
        sub = raw.get_ifd(ExifTags.IFD.Exif)
    except (AttributeError, KeyError):
        sub = {}

    def sub_get(name):
        return sub.get(_TAG_IDS.get(name))

    lens = _clean(sub_get("LensModel") or "")
    if lens:
        exif["lens"] = lens

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

    taken = _clean(sub_get("DateTimeOriginal") or raw.get(_TAG_IDS.get("DateTime")) or "")
    if taken:
        exif["date_taken"] = taken

    # Defensive final pass: guarantee no NUL/control chars reach Postgres,
    # whatever the camera wrote.
    return {
        k: (_clean(v) if isinstance(v, str) else v)
        for k, v in exif.items()
        if not (isinstance(v, str) and not _clean(v))
    }


def _downscale_jpeg(
    original_abs: Path, out_abs: Path, max_edge: int, quality: int, progressive: bool
) -> tuple[int, int]:
    """Write a downscaled, orientation-correct JPEG of `original_abs` bounded to
    `max_edge` on its longest side, and return the output's (width, height).

    Memory-light: `draft()` lets the JPEG decoder load at a reduced scale so a
    high-megapixel photo never expands to its full raster in RAM. Never upscales
    (a small original just yields a same-size derivative).
    """
    out_abs.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(original_abs) as img:
        img.draft("RGB", (max_edge, max_edge))
        im = ImageOps.exif_transpose(img)  # decodes + honours orientation
        im.thumbnail((max_edge, max_edge), Image.LANCZOS)
        size = im.size
        if im.mode in ("RGBA", "P", "LA"):
            im = im.convert("RGB")
        im.save(
            out_abs,
            format="JPEG",
            quality=quality,
            optimize=True,
            progressive=progressive,
        )
    return size


def generate_display(original_abs: Path, display_abs: Path) -> tuple[int, int]:
    """Create the ~2560px lightbox derivative from an original. Returns its size."""
    return _downscale_jpeg(
        original_abs,
        display_abs,
        settings.DISPLAY_MAX_EDGE,
        quality=88,
        progressive=True,
    )


def process_upload(original_abs: Path, thumb_abs: Path) -> tuple[dict, int | None, int | None]:
    """Given an already-saved original, generate its thumbnail and return
    (exif_dict, width, height). The original file is never modified.

    Memory-light: EXIF and dimensions are read from the file header (no full
    decode), and `draft()` lets the JPEG decoder downscale during decode so a
    high-megapixel photo never expands to its full raster in RAM.
    """
    edge = settings.THUMB_MAX_EDGE
    with Image.open(original_abs) as img:
        # Read from headers before any decode — cheap and full-resolution.
        exif = extract_exif(img)

    # The thumbnail's dimensions carry the (orientation-correct) aspect ratio
    # the masonry grid needs.
    width, height = _downscale_jpeg(
        original_abs, thumb_abs, edge, quality=85, progressive=False
    )
    return exif, width, height

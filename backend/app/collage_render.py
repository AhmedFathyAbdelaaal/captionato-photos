"""Server-side collage composition with Pillow.

The editor works on thumbnails at a scaled-down working resolution; this module
re-renders the same normalized layer geometry against the full-resolution
originals at the final 1080x1080 / 1080x1920 output size.

Geometry conventions (shared with the Angular editor):
- pos_x / width are fractions of canvas width; pos_y / height of canvas height.
- (pos_x, pos_y) is the top-left of the *unrotated* frame; rotation is in
  degrees, clockwise, around the frame center (CSS `transform: rotate`).
- crop bounds are fractions of the source image; the cropped region fills the
  frame exactly.
"""
import io
from pathlib import Path

from PIL import Image, ImageOps

from .config import settings
from .models import Collage, CollageLayer

FORMAT_DIMS: dict[str, tuple[int, int]] = {
    "story": (1080, 1920),
    "post": (1080, 1080),
}

# Border stroke as a fraction of the canvas short edge (~8px at 1080).
BORDER_FRAC = 8 / 1080


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    try:
        return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]
    except ValueError:
        return (0, 0, 0)


def one_off_abs_path(collage_id, filename: str) -> Path:
    return Path(settings.COLLAGE_ONEOFF_PATH) / str(collage_id) / filename


def layer_source_path(layer: CollageLayer) -> Path | None:
    if layer.photo_id is not None and layer.photo is not None:
        return Path(layer.photo.original_path)
    if layer.one_off_path:
        return one_off_abs_path(layer.collage_id, layer.one_off_path)
    return None


def render_collage(collage: Collage, out_format: str = "jpeg") -> bytes:
    canvas_w, canvas_h = FORMAT_DIMS[collage.format]
    canvas = Image.new(
        "RGB", (canvas_w, canvas_h), hex_to_rgb(collage.background_color)
    )
    border_px = max(2, round(BORDER_FRAC * min(canvas_w, canvas_h)))
    border_rgb = hex_to_rgb(settings.COLLAGE_BORDER_COLOR)

    for layer in sorted(collage.layers, key=lambda l: l.z_index):
        src_path = layer_source_path(layer)
        if src_path is None or not src_path.exists():
            # Source removed (deleted library photo / swept one-off) — skip.
            continue
        with Image.open(src_path) as src:
            img = ImageOps.exif_transpose(src)
            sw, sh = img.size

            # Crop region in source pixels, clamped to the image bounds.
            left = min(max(round(layer.crop_x * sw), 0), sw - 1)
            top = min(max(round(layer.crop_y * sh), 0), sh - 1)
            right = min(max(round((layer.crop_x + layer.crop_width) * sw), left + 1), sw)
            bottom = min(max(round((layer.crop_y + layer.crop_height) * sh), top + 1), sh)
            img = img.crop((left, top, right, bottom))

            frame_w = max(1, round(layer.width * canvas_w))
            frame_h = max(1, round(layer.height * canvas_h))
            img = img.resize((frame_w, frame_h), Image.LANCZOS)

            if img.mode != "RGBA":
                img = img.convert("RGBA")
            if layer.border_enabled:
                img = ImageOps.expand(img, border=border_px, fill=border_rgb)
            if layer.rotation:
                # Pillow rotates counter-clockwise; CSS clockwise.
                img = img.rotate(
                    -layer.rotation, expand=True, resample=Image.BICUBIC
                )

            center_x = (layer.pos_x + layer.width / 2) * canvas_w
            center_y = (layer.pos_y + layer.height / 2) * canvas_h
            canvas.paste(
                img,
                (round(center_x - img.width / 2), round(center_y - img.height / 2)),
                img,
            )

    buf = io.BytesIO()
    if out_format == "png":
        canvas.save(buf, format="PNG")
    else:
        canvas.save(
            buf,
            format="JPEG",
            quality=settings.COLLAGE_EXPORT_QUALITY,
            optimize=True,
        )
    return buf.getvalue()

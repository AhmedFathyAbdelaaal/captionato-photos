"""Seeded "organized mess" collage layout generation.

Not scatter-and-rotate: this builds a *justified mosaic*. Photos flow into
rows of 1–3, each row scaled to fill the full canvas width, and the whole
stack scaled to fill the height — so edges stay flush with thin even gutters
(the "organized" part). The "mess" comes from varied row heights, landscape
photos promoted to full-width bands, and reserved blank slots (a music disc,
sometimes a text band) dropped into the flow — all reproducible per seed but
different across the 3 generated options.

Cells are cover-cropped: each photo fills its cell with a centered crop, so
nothing is distorted and every row is edge-to-edge. Blank slots emit no layer
— the canvas background shows through, ready for an Instagram sticker.
"""
import random

from .collage_render import FORMAT_DIMS
from .models import Photo

# Gutter between cells, as a fraction of the canvas width (~9px at 1080).
GUTTER_FRAC = 0.015
# A photo this wide (w/h) can be promoted to its own full-width band.
LANDSCAPE_ASPECT = 1.7
# Guard so a row of wide photos doesn't collapse to a sliver.
MAX_ROW_ASPECT_SUM = 5.4
# Per-row height jitter (applied before the stack is renormalized to fit).
ROW_HEIGHT_JITTER = (0.8, 1.28)


def _aspect(item: dict) -> float:
    return item["aspect"]


def _plan_slots(rng: random.Random, n_photos: int) -> list[dict]:
    """Reserved blank cells: usually a square music-disc slot, sometimes a
    wider text band instead/as well. Kept modest relative to photo count."""
    slots: list[dict] = []
    if n_photos >= 3 and rng.random() < 0.75:
        slots.append({"slot": True, "aspect": rng.uniform(0.92, 1.08)})  # disc
    if n_photos >= 5 and rng.random() < 0.35:
        slots.append({"slot": True, "aspect": rng.uniform(2.2, 3.2)})  # text band
    return slots


def _interleave(photos: list[dict], slots: list[dict], rng: random.Random) -> list[dict]:
    """Drop slots into the photo sequence, never at the very top-left."""
    seq = list(photos)
    for slot in slots:
        lo = 1 if len(seq) > 1 else 0
        seq.insert(rng.randint(lo, len(seq)), slot)
    return seq


def _partition_rows(seq: list[dict], rng: random.Random) -> list[list[dict]]:
    """Greedily group cells into rows of 1–3, with landscape photos often
    taking a row of their own. Blank slots always share their row with a
    photo (a disc sits beside an image, never as a full-width band)."""
    rows: list[list[dict]] = []
    i, n = 0, len(seq)
    prev_solo = False
    while i < n:
        cell = seq[i]
        # A wide photo may become a full-width solo band — but not two in a row.
        if (
            not cell.get("slot")
            and cell["aspect"] >= LANDSCAPE_ASPECT
            and not prev_solo
            and rng.random() < 0.5
        ):
            rows.append([cell])
            i += 1
            prev_solo = True
            continue

        size = rng.choices([1, 2, 3], weights=[1, 4, 3])[0]
        if cell.get("slot"):
            size = max(size, 2)  # a slot must be paired with a photo
        row = seq[i : i + min(size, n - i)]
        # Trim if the combined width demand would make the row too short.
        while len(row) > 1 and sum(_aspect(c) for c in row) > MAX_ROW_ASPECT_SUM:
            row = row[:-1]
        # Never leave a row of only blank slots — pull in the next photo.
        if all(c.get("slot") for c in row) and i + len(row) < n:
            row = row + [seq[i + len(row)]]
        rows.append(row)
        i += len(row)
        prev_solo = False
    return rows


def _place_rows(
    rows: list[list[dict]],
    canvas_w: int,
    canvas_h: int,
    rng: random.Random,
) -> list[dict]:
    gx = GUTTER_FRAC * canvas_w
    gy = gx  # same pixel gutter vertically
    inner_w = canvas_w - 2 * gx
    inner_h = canvas_h - 2 * gx

    # Natural height per row = width it must fill / sum of its aspect ratios,
    # times a per-row jitter for rhythm.
    nat_heights: list[float] = []
    for row in rows:
        avail = inner_w - gx * (len(row) - 1)
        h = avail / sum(_aspect(c) for c in row)
        nat_heights.append(h * rng.uniform(*ROW_HEIGHT_JITTER))

    # Renormalize so all rows + gutters exactly fill the inner height (full-bleed).
    total = sum(nat_heights) + gy * (len(rows) - 1)
    scale = (inner_h - gy * (len(rows) - 1)) / (total - gy * (len(rows) - 1))
    heights = [h * scale for h in nat_heights]

    layers: list[dict] = []
    z = 0
    y = gx
    for row, row_h in zip(rows, heights):
        avail = inner_w - gx * (len(row) - 1)
        row_sum = sum(_aspect(c) for c in row)
        x = gx
        for cell in row:
            cw = avail * (_aspect(cell) / row_sum)
            if not cell.get("slot"):
                layers.append(
                    _photo_layer(cell, x, y, cw, row_h, canvas_w, canvas_h, z)
                )
                z += 1
            x += cw + gx
        y += row_h + gy
    return layers


def _photo_layer(
    cell: dict,
    x: float,
    y: float,
    cw: float,
    ch: float,
    canvas_w: int,
    canvas_h: int,
    z: int,
) -> dict:
    """Normalized geometry + centered cover-crop so the photo fills the cell."""
    cell_aspect = cw / ch
    ap = cell["aspect"]
    crop_x = crop_y = 0.0
    crop_w = crop_h = 1.0
    if ap >= cell_aspect:  # photo wider than cell → trim sides
        crop_w = cell_aspect / ap
        crop_x = (1 - crop_w) / 2
    else:  # photo taller than cell → trim top/bottom
        crop_h = ap / cell_aspect
        crop_y = (1 - crop_h) / 2

    return {
        "photo_id": cell["id"],
        "pos_x": max(0.0, x / canvas_w),
        "pos_y": max(0.0, y / canvas_h),
        "width": min(1.0, cw / canvas_w),
        "height": min(1.0, ch / canvas_h),
        "rotation": 0.0,
        "crop_x": crop_x,
        "crop_y": crop_y,
        "crop_width": crop_w,
        "crop_height": crop_h,
        "z_index": z,
    }


def generate_layout(photos: list[Photo], fmt: str, seed: int) -> list[dict]:
    """Return layer dicts (normalized geometry, keyed like CollageLayerCreate)
    for one "organized mess" arrangement of `photos` on a `fmt` canvas."""
    canvas_w, canvas_h = FORMAT_DIMS[fmt]
    rng = random.Random(seed)

    cells = [
        {"id": p.id, "aspect": (p.width or 3) / (p.height or 2)} for p in photos
    ]
    rng.shuffle(cells)

    seq = _interleave(cells, _plan_slots(rng, len(cells)), rng)
    rows = _partition_rows(seq, rng)
    return _place_rows(rows, canvas_w, canvas_h, rng)

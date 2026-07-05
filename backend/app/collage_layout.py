"""Seeded "auto-chaotic" collage layout generation.

Same spirit as the landing page's mood-board: stable, reproducible per seed,
randomized within bounds. Photos are scattered over a jittered grid so the
whole canvas is covered, with varied size tiers, slight rotation and
intentional overlap.
"""
import math
import random

from .collage_render import FORMAT_DIMS
from .models import Photo

# Relative size multipliers: some photos dominate, some sit small behind.
SIZE_TIERS = [1.5, 1.15, 0.85]
TIER_WEIGHTS = [2, 3, 2]
MAX_ROTATION_DEG = 15
# How much a photo overflows its grid cell — >1 creates the overlap/scatter look.
CELL_FILL = 1.35
# Photos may bleed slightly off-canvas for a less boxed-in composition.
BLEED = 0.04


def generate_layout(photos: list[Photo], fmt: str, seed: int) -> list[dict]:
    """Return layer dicts (normalized geometry, keyed like CollageLayerCreate)
    for one arrangement of `photos` on a `fmt` canvas."""
    canvas_w, canvas_h = FORMAT_DIMS[fmt]
    canvas_aspect = canvas_w / canvas_h
    rng = random.Random(seed)

    order = list(photos)
    rng.shuffle(order)
    n = len(order)

    # Grid sized so cells are roughly square on the chosen canvas.
    cols = max(1, round(math.sqrt(n * canvas_aspect)))
    rows = math.ceil(n / cols)
    cell_w, cell_h = 1 / cols, 1 / rows
    cells = [(c, r) for r in range(rows) for c in range(cols)]
    rng.shuffle(cells)

    layers: list[dict] = []
    z_order = list(range(n))
    rng.shuffle(z_order)
    for i, photo in enumerate(order):
        col, row = cells[i]
        tier = rng.choices(SIZE_TIERS, weights=TIER_WEIGHTS)[0]
        photo_aspect = (photo.width or 3) / (photo.height or 2)

        # Width as canvas fraction; height follows the photo's aspect ratio
        # converted into normalized canvas units.
        w = min(0.95, cell_w * CELL_FILL * tier)
        h = w * canvas_w / photo_aspect / canvas_h
        max_h = min(0.92, cell_h * CELL_FILL * 1.6)
        if h > max_h:
            h = max_h
            w = h * canvas_h * photo_aspect / canvas_w

        center_x = (col + 0.5) * cell_w + rng.uniform(-0.3, 0.3) * cell_w
        center_y = (row + 0.5) * cell_h + rng.uniform(-0.3, 0.3) * cell_h
        pos_x = min(max(center_x - w / 2, -BLEED), 1 - w + BLEED)
        pos_y = min(max(center_y - h / 2, -BLEED), 1 - h + BLEED)

        layers.append(
            {
                "photo_id": photo.id,
                "pos_x": pos_x,
                "pos_y": pos_y,
                "width": w,
                "height": h,
                "rotation": rng.uniform(-MAX_ROTATION_DEG, MAX_ROTATION_DEG),
                "z_index": z_order[i],
            }
        )
    return layers

#!/usr/bin/env python3
"""Sample the AP Solid Shot silhouettes from the three newest reference frames.

Regenerate the sampled reference art and the side-by-side (in that order, the
side-by-side needs the rendered lattice frames):

    npx tsx scripts/render_round.ts && python3 scripts/sample_projectile.py

It reads IMG_4966.png (in flight), IMG_4967.png (x-ray) and IMG_4968.png
(damage) from the repository root, levels the in-flight shell by its own axis,
quantises the silhouette onto the 8.5 px pixel grid the footage is drawn on
(24 cells long, 6 tall) and prints the ART rows that
`src/game/sim/projectile-shell.ts` is built from, plus the x-ray core ranges.

Output lands in `artifacts/ref/` (reference crops + the sampled silhouette), and
`artifacts/ap-solid-shot-compare.png` is assembled by the companion
`scripts/render_round.ts` run (rendered lattice vs the reference).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "artifacts" / "ref"
OUT.mkdir(parents=True, exist_ok=True)

COLS, ROWS = 24, 6


def find_shell(mask: np.ndarray) -> np.ndarray:
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    big = int(np.argsort(sizes)[::-1][0]) + 1
    return lab == big


def levelled(path: str, box, thresh: float = 120.0):
    a = np.array(Image.open(ROOT / path).convert("RGB")).astype(float)
    x0, x1, y0, y1 = box
    sub = a[y0:y1, x0:x1]
    shell = find_shell(sub.mean(axis=2) > thresh)
    ys, xs = np.nonzero(shell)
    centre = (float(xs.mean()), float(ys.mean()))
    rot = Image.fromarray(sub.astype("uint8")).rotate(
        -6.34, resample=Image.NEAREST, center=centre
    )
    return np.array(rot).astype(float), shell


def grid(mask: np.ndarray, region: tuple[int, int, int, int]) -> list[str]:
    x0, x1, y0, y1 = region
    out = []
    for r in range(ROWS):
        line = ""
        for c in range(COLS):
            xa = int(round(x0 + (x1 - x0) * c / COLS))
            xb = int(round(x0 + (x1 - x0) * (c + 1) / COLS))
            ya = int(round(y0 + (y1 - y0) * r / ROWS))
            yb = int(round(y0 + (y1 - y0) * (r + 1) / ROWS))
            block = mask[ya:yb, xa:xb]
            cov = block.sum() / max(1, block.size)
            line += "#" if cov >= 0.45 else ("+" if cov >= 0.2 else ".")
        out.append(line)
    return out


def renders() -> dict[str, Image.Image]:
    """The lattice frames rendered by `scripts/render_round.ts`."""
    out = {}
    for name in ("pristine", "crushed", "wreck"):
        path = OUT / f"round_{name}.ppm"
        if not path.exists():
            continue
        data = path.read_bytes()
        header, pixels = data.split(b"\n", 3)[1], data.split(b"\n", 3)[3]
        w, h = map(int, header.split())
        out[name] = Image.frombytes("RGB", (w, h), pixels)
    return out


BG = (14, 22, 36)


def panel(img: Image.Image, width: int, label: str) -> Image.Image:
    from PIL import ImageDraw

    ratio = width / img.width
    im = img.resize((width, max(1, int(img.height * ratio))), Image.NEAREST)
    canvas = Image.new("RGB", (width, im.height + 28), BG)
    canvas.paste(im, (0, 28))
    ImageDraw.Draw(canvas).text((8, 8), label, fill=(215, 228, 238))
    return canvas


def compose(lattice: dict[str, Image.Image]) -> None:
    """Reference vs lattice, one row per newest frame."""
    if not lattice:
        return
    from PIL import ImageDraw

    rows = [
        (panel(Image.open(OUT / 'inflight_frame.png'), 600, 'REFERENCE  IMG_4966 in flight'),
         panel(lattice['pristine'], 600, 'LATTICE  pristine (sampled)')),
        (panel(Image.open(OUT / 'xray_frame.png'), 600, 'REFERENCE  IMG_4967 x-ray'),
         panel(lattice['crushed'], 600, 'LATTICE  crushing (0.16 s)')),
        (panel(Image.open(OUT / 'damage_frame.png'), 600, 'REFERENCE  IMG_4968 damage'),
         panel(lattice['wreck'], 600, 'LATTICE  wreck (0.55 s)')),
    ]
    heights = [max(a.height, b.height) for a, b in rows]
    total = Image.new("RGB", (600 * 2 + 64, sum(heights) + 22 * len(rows) + 46), (8, 14, 22))
    draw = ImageDraw.Draw(total)
    draw.text((16, 14), 'AP SOLID SHOT - silhouettes sampled from the three newest frames',
              fill=(240, 246, 250))
    y = 46
    for (a, b), h in zip(rows, heights):
        total.paste(a, (16, y))
        total.paste(b, (616, y))
        y += h + 22
    out = ROOT / 'artifacts' / 'ap-solid-shot-compare.png'
    total.save(out)
    print('wrote', out.relative_to(ROOT))


def main() -> int:
    # --- in flight -------------------------------------------------------
    ra, _ = levelled("IMG_4966.png", (990, 1250, 515, 620))
    rm = ra.mean(axis=2) > 110
    shell = find_shell(rm)
    ys, xs = np.nonzero(shell)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1

    # the pale blue trail merges into the left edge of the shell at this
    # threshold; the solid body starts a little further right, so the lattice
    # origin is offset by ~13 px (about one and a half cells).
    left = x0 + 13
    silhouette = grid(shell, (left, x1, y0, y0 + int(round((x1 - left) / (COLS / ROWS)))))

    # --- x-ray -----------------------------------------------------------
    a = np.array(Image.open(ROOT / "IMG_4967.png").convert("RGB")).astype(int)
    sub = a[480:590, 1140:1430]
    r, g, b = sub[:, :, 0], sub[:, :, 1], sub[:, :, 2]
    orange = (r > 110) & (r - b > 45)
    grey = (np.abs(r - b) < 40) & (sub.mean(axis=2) > 115) & (sub.mean(axis=2) < 200) & (~orange)
    hull = ndimage.binary_closing(orange, np.ones((9, 9)))
    hull = ndimage.binary_fill_holes(hull)
    core = grey & hull
    jys, jxs = np.nonzero(hull)
    jacket = (int(jxs.min()), int(jxs.max()) + 1, int(jys.min()), int(jys.max()) + 1)
    core_grid = grid(core, jacket)

    # --- damage frame -----------------------------------------------------
    damage = Image.open(ROOT / "IMG_4968.png").convert("RGB").crop((1380, 330, 1900, 740))
    damage.save(OUT / "damage_frame.png")
    Image.open(ROOT / "IMG_4966.png").convert("RGB").crop((995, 525, 1235, 615)).save(
        OUT / "inflight_frame.png"
    )
    Image.open(ROOT / "IMG_4967.png").convert("RGB").crop((1140, 480, 1430, 590)).save(
        OUT / "xray_frame.png"
    )

    compose(lattice=renders())

    # sampled silhouette rendered next to the grid it floors
    cell = 16
    plate = np.zeros((ROWS * cell, COLS * cell, 3), dtype=np.uint8)
    plate[:, :] = (14, 22, 36)
    for r_i, line in enumerate(silhouette):
        for c_i, ch in enumerate(line):
            if ch == "#":
                plate[r_i * cell : (r_i + 1) * cell, c_i * cell : (c_i + 1) * cell] = (141, 156, 167)
    Image.fromarray(plate).save(OUT / "sampled_silhouette.png")

    print(f"in-flight silhouette {COLS}x{ROWS} (leveled, {x1 - x0}px long, {y1 - y0}px tall)")
    for line in silhouette:
        print("  " + line)
    print("x-ray core inside the jacket:")
    for line in core_grid:
        print("  " + line)
    print()
    print("Wrote", ", ".join(p.name for p in OUT.glob("*.png")))
    return 0


if __name__ == "__main__":
    sys.exit(main())

import type { Polygon } from '../sim/fracture';

/** Material swatches used by the square-cell wall raster. */
export interface WallColors {
  base: number;
  light: number;
  dark: number;
}

/** One horizontal row of same-coloured square cells. */
export interface PixelRun {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
}

/** Even-odd point test in a wall polygon. */
export function pointInPolygon(x: number, y: number, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Square-cell raster of one polygon, merged into horizontal runs.
 *
 * The wall is still a true polygon for collision, but every visible pixel is an
 * axis-aligned square. Merging same-coloured neighbours into runs is purely a
 * draw-call optimisation: the covered cells are identical to filling each cell
 * one at a time. Kept free of Phaser so tests can verify that equivalence.
 */
export function pixelRuns(poly: Polygon, colors: WallColors, cell: number): PixelRun[] {
  if (poly.length < 3) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const x0 = Math.floor(minX / cell) * cell;
  const y0 = Math.floor(minY / cell) * cell;
  const x1 = Math.ceil(maxX / cell) * cell;
  const y1 = Math.ceil(maxY / cell) * cell;
  const half = cell / 2;
  const runs: PixelRun[] = [];
  let painted = 0;
  for (let y = y0; y < y1; y += cell) {
    let runStart = x0;
    let runColor = -1;
    for (let x = x0; x < x1; x += cell) {
      let color = -1;
      if (pointInPolygon(x + half, y + half, poly)) {
        color = colors.base;
        // Top and bottom exposed cells take the light/dark swatch, which keeps
        // the slab readable without gradients, curves or outlines.
        if (!pointInPolygon(x + half, y - half, poly)) color = colors.light;
        else if (!pointInPolygon(x + half, y + cell + half, poly)) color = colors.dark;
        painted += 1;
      }
      if (color !== runColor) {
        if (runColor !== -1) {
          runs.push({ x: runStart, y, w: x - runStart, h: cell, color: runColor });
        }
        runColor = color;
        runStart = x;
      }
    }
    if (runColor !== -1) runs.push({ x: runStart, y, w: x1 - runStart, h: cell, color: runColor });
  }
  // Sub-cell plates must survive: a 5px truss beam can miss every centre at a
  // coarse zoom, and silently vanishing steel reads as a damage bug.
  if (painted === 0) {
    runs.push({
      x: Math.floor(((minX + maxX) / 2) / cell) * cell,
      y: Math.floor(((minY + maxY) / 2) / cell) * cell,
      w: cell,
      h: cell,
      color: colors.base,
    });
  }
  return runs;
}

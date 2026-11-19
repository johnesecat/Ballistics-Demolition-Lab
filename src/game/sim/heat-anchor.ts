import type { Point, Polygon, Wall } from './fracture';
import { pointInPolygon } from './walls';

/** Area-weighted centroid of one polygon. */
export function polygonCentroid(poly: Polygon): Point {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 0.001) {
    let sx = 0;
    let sy = 0;
    for (const p of poly) { sx += p.x; sy += p.y; }
    return { x: sx / poly.length, y: sy / poly.length };
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

/**
 * A heat anchor that is guaranteed to sit on surviving geometry: the nearest
 * remaining vertex nudged toward its own chunk's centre. A bbox-centre stamp
 * lands in the breach on a punched plate, leaving only a cold fringe.
 */
export function survivorHeatPoint(wall: Wall, origin: Point, maxDist = 46): Point | null {
  let best: { poly: Polygon; vertex: Point; dist: number } | null = null;
  for (const poly of wall.polygons) {
    for (const p of poly) {
      const d = Math.hypot(p.x - origin.x, p.y - origin.y);
      if (!best || d < best.dist) best = { poly, vertex: p, dist: d };
    }
  }
  if (!best || best.dist > maxDist) return null;
  const c = polygonCentroid(best.poly);
  const dx = c.x - best.vertex.x;
  const dy = c.y - best.vertex.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return best.vertex;
  const step = Math.min(4, len * 0.5);
  const p = { x: best.vertex.x + (dx / len) * step, y: best.vertex.y + (dy / len) * step };
  return pointInPolygon(p, best.poly) ? p : best.vertex;
}

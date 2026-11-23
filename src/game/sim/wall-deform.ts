import { MATERIALS, type MaterialId } from '../materials';
import type { Polygon, Wall } from './fracture';
import { polygonArea } from './fracture';
import type { WallHeatRegion, WallState } from './walls';

/**
 * Physical wall deformation: heat plus impact actually moves metal.
 *
 * A steel plate that is hit and heated sags, bows away from the burn and tears
 * at the rim. Those displacements are written back into the wall polygons, so
 * collision (`traceWalls`), support (`detachUnsupported`) and cover
 * (`coreCoverFraction`) all read the bent shape -- the bend is not a rendering
 * trick layered on top of straight geometry.
 *
 * Polygons are split into convex strips before they move. A bent plate is no
 * longer convex, and the swept projectile tracer only handles convex pieces; the
 * strips keep every collider convex while still expressing the bow. This is the
 * only place the geometry gains pieces, and it gains them to *show* the
 * deformation, never to fake it.
 */

const MAX_STRIPS = 14;
const MAX_BEND = 26;

interface Strip {
  poly: Polygon;
  /** Normalized position along the plate, 0 at one end, 1 at the other. */
  t: number;
  /** Outward normal of the strip (away from the material thickness). */
  nx: number;
  ny: number;
}

function bounds(poly: Polygon): { x0: number; x1: number; y0: number; y1: number } {
  return {
    x0: Math.min(...poly.map((p) => p.x)),
    x1: Math.max(...poly.map((p) => p.x)),
    y0: Math.min(...poly.map((p) => p.y)),
    y1: Math.max(...poly.map((p) => p.y)),
  };
}

/** Split a convex polygon across the axis it is longest on. */
function strips(poly: Polygon): Strip[] {
  const b = bounds(poly);
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const horizontal = w >= h;
  const count = Math.max(1, Math.min(MAX_STRIPS, Math.round((horizontal ? w : h) / 9)));
  if (count <= 1) return [{ poly: poly.map((p) => ({ ...p })), t: 0.5, nx: 0, ny: horizontal ? -1 : 0 }];
  const out: Strip[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = i / count;
    const c = (i + 1) / count;
    const clipped = horizontal
      ? clipAxis(poly, 'x', b.x0 + w * a, b.x0 + w * c)
      : clipAxis(poly, 'y', b.y0 + h * a, b.y0 + h * c);
    if (clipped.length < 3) continue;
    out.push({
      poly: clipped,
      t: (a + c) / 2,
      nx: horizontal ? 0 : -1,
      ny: horizontal ? -1 : 0,
    });
  }
  return out;
}

function clipAxis(poly: Polygon, axis: 'x' | 'y', min: number, max: number): Polygon {
  let out = poly.map((p) => ({ ...p }));
  for (const [boundary, lower] of [[min, false], [max, true]] as const) {
    if (out.length === 0) return [];
    const next: Polygon = [];
    let prev = out[out.length - 1]!;
    let prevIn = lower ? prev[axis] <= boundary : prev[axis] >= boundary;
    for (const cur of out) {
      const curIn = lower ? cur[axis] <= boundary : cur[axis] >= boundary;
      if (curIn !== prevIn) {
        const d = cur[axis] - prev[axis] || 1e-9;
        const t = (boundary - prev[axis]) / d;
        next.push({ x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t });
      }
      if (curIn) next.push({ ...cur });
      prev = cur;
      prevIn = curIn;
    }
    out = next;
  }
  return out.length >= 3 ? out : [];
}

/** Hottest bloom touching a point, with the heat value it contributes. */
function hottestBloom(state: WallState, x: number, y: number): { heat: number; x: number; y: number } | null {
  let best: { heat: number; x: number; y: number } | null = null;
  for (const bloom of state.heat) {
    const radius = bloom.radius > 0 ? bloom.radius : 24;
    const d = Math.hypot(bloom.x - x, bloom.y - y);
    if (d > radius) continue;
    const value = bloom.heat * Math.pow(1 - d / radius, 1.4);
    if (!best || value > best.heat) best = { heat: value, x: bloom.x, y: bloom.y };
  }
  return best;
}

/** Heat contribution at a point, 0..1, from the blooms that touch this wall. */
function heatAt(state: WallState, x: number, y: number): number {
  return hottestBloom(state, x, y)?.heat ?? 0;
}

/**
 * Bend and tear metal walls toward their heat blooms.
 *
 * - Bowing: each strip moves outward along the wall normal, proportional to the
 *   local heat and the material's sag factor, so a hot plate bulges.
 * - Sag: heat softens the material and gravity pulls the bulge down, which is
 *   what makes a heated column lean instead of merely swelling.
 * - Permanent: the result is written back, so cooling never restores the shape
 *   and later shots collide with the bent plate.
 */
export function deformHeatedWalls(state: WallState, options: { maxShift?: number } = {}): void {
  const maxShift = options.maxShift ?? MAX_BEND;
  if (state.heat.length === 0) return;
  const walls: Wall[] = [];
  for (const wall of state.walls) {
    const def = MATERIALS[wall.material];
    // Only ductile material bows. Brick, concrete and timber crack instead, and
    // that removal is handled by the fracture path.
    if (!def.isMetal && def.sag < 0.3) {
      walls.push(wall);
      continue;
    }
    const polygons: Polygon[] = [];
    // A wall that has already been split for its bend keeps its pieces; further
    // deformation displaces them instead of re-splitting, so the polygon count
    // stays bounded over a five-shot mission.
    const saturated = wall.polygons.length >= 36;
    for (const poly of wall.polygons) {
      // Cold geometry is left byte-identical. Only the hot region is split, so
      // bending cannot quietly change the support graph of a wall it never
      // touched (which used to keep blast-shredded cover standing).
      const centre0 = poly.reduce((s, p) => ({ x: s.x + p.x / poly.length, y: s.y + p.y / poly.length }), { x: 0, y: 0 });
      if (heatAt(state, centre0.x, centre0.y) < 0.15) {
        polygons.push(poly);
        continue;
      }
      const pieces = saturated ? [{ poly: poly.map((p) => ({ ...p })), t: 0.5, nx: 0, ny: -1 }] : strips(poly);
      if (pieces.length === 1) {
        polygons.push(pieces[0]!.poly);
        continue;
      }
      for (const piece of pieces) {
        const centre = piece.poly.reduce((s, p) => ({ x: s.x + p.x / piece.poly.length, y: s.y + p.y / piece.poly.length }), { x: 0, y: 0 });
        const bloom = hottestBloom(state, centre.x, centre.y);
        if (!bloom || bloom.heat < 0.02) {
          polygons.push(piece.poly);
          continue;
        }
        const heat = bloom.heat;
        // Bow away from the burn, not across it: heated metal stretches away
        // from the hot spot (that is what opens a breach instead of closing
        // it), with a smaller out-of-plane component along the face normal.
        const bow = Math.min(maxShift, heat * 26 * def.sag);
        // Softened steel also sags under its own weight.
        const sag = Math.min(maxShift * 0.5, heat * heat * 16 * def.sag);
        const shifted = piece.poly.map((point) => {
          const dx = point.x - bloom.x;
          const dy = point.y - bloom.y;
          const len = Math.hypot(dx, dy);
          const ux = len > 0.6 ? dx / len : piece.nx;
          const uy = len > 0.6 ? dy / len : piece.ny;
          return {
            x: point.x + ux * bow * 0.85 + piece.nx * bow * 0.35,
            y: point.y + uy * bow * 0.85 + piece.ny * bow * 0.35 + sag * 0.5,
          };
        });
        // Tearing rim: points near the hottest bloom are pulled outward along
        // the surface as the metal peels open.
        const torn = shifted.map((point) => {
          const local = heatAt(state, point.x, point.y);
          if (local < 0.45) return point;
          const dx = point.x - centre.x;
          const dy = point.y - centre.y;
          const len = Math.hypot(dx, dy) || 1;
          const pull = local * local * 6;
          return { x: point.x + (dx / len) * pull, y: point.y + (dy / len) * pull };
        });
        if (polygonArea(torn) > 0.5) polygons.push(torn);
      }
    }
    if (polygons.length > 0) walls.push({ ...wall, polygons });
  }
  state.walls = walls;
}

/** True when any metal wall carries heat blooms large enough to deform. */
export function hasDeformableHeat(state: WallState): boolean {
  if (state.heat.length === 0) return false;
  return state.heat.some((bloom: WallHeatRegion) => bloom.heat > 0.2);
}

/**
 * Bend a rim of survivors outward after a bore. The hole is already cut; this
 * makes the surviving metal around it peel away from the channel, which is the
 * torn, opened-out lip the footage shows around a penetration.
 */
export function tearRim(
  walls: Wall[],
  at: { x: number; y: number },
  radius: number,
  material: MaterialId,
  energy: number,
): Wall[] {
  const def = MATERIALS[material];
  if (!def.isMetal && def.sag < 0.3) return walls;
  const peel = Math.min(9, 2 + energy * 0.05) * def.sag;
  if (peel < 0.4) return walls;
  return walls.map((wall) => {
    if (wall.material !== material) return wall;
    return {
      ...wall,
      polygons: wall.polygons.map((poly) => {
        const centre = poly.reduce((s, p) => ({ x: s.x + p.x / poly.length, y: s.y + p.y / poly.length }), { x: 0, y: 0 });
        if (Math.hypot(centre.x - at.x, centre.y - at.y) > radius * 8) return poly;
        // Subdivide the edges around the hole first. A torn lip is a curve: two
        // far-away corners cannot express it, so the outline gains vertices
        // exactly where the tear happens and nowhere else.
        const step = Math.max(2.2, radius * 0.6);
        const dense: Polygon = [];
        for (let i = 0; i < poly.length; i += 1) {
          const a = poly[i]!;
          const b = poly[(i + 1) % poly.length]!;
          const parts = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
          for (let s = 0; s < parts; s += 1) {
            const t = s / parts;
            dense.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
          }
        }
        // Only the lip around the hole moves. Points well away from the channel
        // keep their place, so opening a bore enlarges the hole instead of
        // growing the whole plate (which would silently add cover).
        const lip = radius * 1.8;
        return dense.map((point) => {
          const d = Math.hypot(point.x - at.x, point.y - at.y);
          if (d > lip) return point;
          const pull = (1 - Math.min(1, d / lip)) * peel;
          const dx = point.x - at.x;
          const dy = point.y - at.y;
          const len = Math.hypot(dx, dy) || 1;
          return { x: point.x + (dx / len) * pull, y: point.y + (dy / len) * pull };
        });
      }),
    };
  });
}

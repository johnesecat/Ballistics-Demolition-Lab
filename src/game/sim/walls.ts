import type { MaterialId } from '../materials';
import type { StageSnapshot } from '../stages/types';
import type { FractureFragment, Point, Polygon, Wall } from './fracture';
import { polygonArea } from './fracture';

/**
 * Grid-free wall world (P0). Walls are the authoritative damage geometry:
 * one wall = one object with a stable id and continuous convex polygons.
 * Snapshot serialization is wall-first (walls + heat + groundY). The gridded
 * raster is retained only as the generator's build artifact and is converted
 * to walls at stage construction; damage, penetration, collapse, preview,
 * replay, HUD and saves never read cell hp.
 */

export interface WallHeatRegion {
  x: number;
  y: number;
  /** Peak temperature at the centre of the bloom, 0..1. */
  heat: number;
  /** World-space radius of the bloom. Grows with the charge that stamped it. */
  radius: number;
  /** Material the bloom landed on. Heat only exists on metals (thermal rule). */
  material?: MaterialId;
}

export interface WallState {
  walls: Wall[];
  /**
   * Persistent heat stains on the structure surface (presentation only).
   *
   * This is deliberately flat rather than keyed by wall id: fracturing rebuilds
   * a wall under a fresh id, which orphaned every stain recorded against the old
   * id and left breached walls with no scorch at all. Blooms are clipped to the
   * surviving geometry at render time, so a surface-level list is both simpler
   * and stable across damage.
   */
  heat: WallHeatRegion[];
  groundY: number;
  version: 1;
}

export function cloneWalls(walls: Wall[]): Wall[] {
  return walls.map(w => ({ ...w, polygons: w.polygons.map(p => p.map(pt => ({ ...pt }))) }));
}

export function wallsFromSnapshot(snapshot: StageSnapshot): WallState {
  if (snapshot.wallState) return cloneWallState(snapshot.wallState);
  const grid = snapshot.grid;
  const tile = grid.tile;
  const walls: Wall[] = [];
  let id = 0;
  const slopePoly = (col: number, row: number, shape: string): Polygon => {
    const x = grid.originX + col * tile;
    const y = grid.originY + row * tile;
    if (shape === 'slopeL') return [{ x, y }, { x, y: y + tile }, { x: x + tile, y: y + tile }];
    return [{ x, y: y + tile }, { x: x + tile, y }, { x: x + tile, y: y + tile }];
  };
  // Merge vertical runs of same-material block cells into one wall per column-run.
  const visited = new Set<string>();
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const cell = grid.cells[row]?.[col];
      if (!cell) continue;
      const key = `${col},${row}`;
      if (visited.has(key)) continue;
      if (cell.shape !== 'block') {
        walls.push({ id: `w${id++}`, material: cell.material, polygons: [slopePoly(col, row, cell.shape)] });
        visited.add(key);
        continue;
      }
      // extend right
      let endCol = col;
      while (endCol + 1 < grid.cols) {
        const n = grid.cells[row]?.[endCol + 1];
        if (!n || n.shape !== 'block' || n.material !== cell.material) break;
        endCol += 1;
      }
      // extend down while full width matches
      let endRow = row;
      outer: while (endRow + 1 < grid.rows) {
        for (let c = col; c <= endCol; c += 1) {
          const n = grid.cells[endRow + 1]?.[c];
          if (!n || n.shape !== 'block' || n.material !== cell.material || visited.has(`${c},${endRow + 1}`)) break outer;
        }
        endRow += 1;
      }
      const x = grid.originX + col * tile;
      const y = grid.originY + row * tile;
      const w = (endCol - col + 1) * tile;
      const h = (endRow - row + 1) * tile;
      walls.push({ id: `w${id++}`, material: cell.material, polygons: [[{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]] });
      for (let r = row; r <= endRow; r += 1) for (let c = col; c <= endCol; c += 1) visited.add(`${c},${r}`);
    }
  }
  return { walls, heat: [], groundY: snapshot.grid.originY + snapshot.grid.rows * snapshot.grid.tile, version: 1 };
}

export function cloneWallState(state: WallState): WallState {
  return {
    walls: cloneWalls(state.walls),
    heat: state.heat.map(r => ({ ...r })),
    groundY: state.groundY,
    version: 1,
  };
}

export function pointInPolygon(p: Point, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!; const b = poly[j]!;
    if (((a.y > p.y) !== (b.y > p.y)) && (p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)) inside = !inside;
  }
  return inside;
}

export function pointInWalls(walls: Wall[], p: Point): boolean {
  return walls.some(w => w.polygons.some(poly => pointInPolygon(p, poly)));
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  const cross = (ox: number, oy: number, ax: number, ay: number, bx: number, by: number): number => {
    const abx = bx - ax;
    const aby = by - ay;
    const l = Math.hypot(abx, aby) || 1;
    return Math.abs((ox - ax) * aby - (oy - ay) * abx) / l;
  };
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const cdx = d.x - c.x;
  const cdy = d.y - c.y;
  const denom = abx * cdy - aby * cdx;
  if (Math.abs(denom) > 1e-9) {
    const t = ((c.x - a.x) * cdy - (c.y - a.y) * cdx) / denom;
    const u = ((c.x - a.x) * aby - (c.y - a.y) * abx) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(
    cross(a.x, a.y, c.x, c.y, d.x, d.y),
    cross(b.x, b.y, c.x, c.y, d.x, d.y),
    cross(c.x, c.y, a.x, a.y, b.x, b.y),
    cross(d.x, d.y, a.x, a.y, b.x, b.y),
  );
}

/**
 * True only for real contact: a vertex inside the other polygon or edges within
 * the tolerance. The old bbox-only check treated two blocks with overlapping
 * bounding boxes but a wide air gap as physically connected, which kept
 * floating debris standing after its supports were gone.
 */
export function polysTouch(a: Polygon, b: Polygon, tolerance = 1.6): boolean {
  const ab = { x0: Math.min(...a.map(p => p.x)), x1: Math.max(...a.map(p => p.x)), y0: Math.min(...a.map(p => p.y)), y1: Math.max(...a.map(p => p.y)) };
  const bb = { x0: Math.min(...b.map(p => p.x)), x1: Math.max(...b.map(p => p.x)), y0: Math.min(...b.map(p => p.y)), y1: Math.max(...b.map(p => p.y)) };
  if (ab.x1 < bb.x0 - tolerance || bb.x1 < ab.x0 - tolerance || ab.y1 < bb.y0 - tolerance || bb.y1 < ab.y0 - tolerance) return false;
  for (const p of a) if (pointInPolygon(p, b)) return true;
  for (const p of b) if (pointInPolygon(p, a)) return true;
  for (let i = 0; i < a.length; i += 1) {
    const a1 = a[i]!;
    const a2 = a[(i + 1) % a.length]!;
    for (let j = 0; j < b.length; j += 1) {
      const b1 = b[j]!;
      const b2 = b[(j + 1) % b.length]!;
      if (segmentDistance(a1, a2, b1, b2) <= tolerance) return true;
    }
  }
  return false;
}

function grounded(poly: Polygon, groundY: number): boolean {
  return Math.max(...poly.map(p => p.y)) >= groundY - 1.5;
}

/**
 * Support from wall adjacency (P0-6): a polygon is supported if grounded or
 * touching a supported polygon. Iterate to fixpoint. Returns unsupported
 * polygons as fragments to detach.
 */
export function detachUnsupported(walls: Wall[], groundY: number): { walls: Wall[]; detached: FractureFragment[] } {
  const entries: Array<{ wall: Wall; poly: Polygon; supported: boolean }> = [];
  // Anchored geometry is bolted in place until it is hit. Without this, the
  // authored test range's display blocks (separated by air gaps) would all
  // detach on the first phase of the first shot.
  walls.forEach(w => w.polygons.forEach(poly => entries.push({ wall: w, poly, supported: w.anchored === true || grounded(poly, groundY) })));
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of entries) {
      if (e.supported) continue;
      for (const o of entries) {
        if (o !== e && o.supported && polysTouch(e.poly, o.poly)) { e.supported = true; changed = true; break; }
      }
    }
  }
  const detached: FractureFragment[] = entries.filter(e => !e.supported).map(e => ({ wallId: e.wall.id, material: e.wall.material, polygon: e.poly.map(p => ({ ...p })) }));
  const kept = walls.map(w => ({ ...w, polygons: entries.filter(e => e.wall === w && e.supported).map(e => e.poly.map(p => ({ ...p }))) })).filter(w => w.polygons.length > 0);
  return { walls: kept, detached };
}

export function wallsArea(walls: Wall[]): number {
  return walls.reduce((s, w) => s + w.polygons.reduce((a, p) => a + polygonArea(p), 0), 0);
}

export function materialAt(walls: Wall[], p: Point): MaterialId | null {
  for (const w of walls) if (w.polygons.some(poly => pointInPolygon(p, poly))) return w.material;
  return null;
}

/**
ex * Persist a heat bloom on the structure surface.
 *
 * Repeated hits on the same face must not stack into an opaque blob: a new
 * bloom is folded into any existing one whose centre it covers, keeping the
 * hotter peak and the wider spread. Overlapping stains then read as one burn,
 * which is what the footage shows after sustained fire on a single wall.
 */
export function addHeat(
  state: WallState, x: number, y: number, heat: number, radius: number,
  material?: MaterialId,
): void {
  // Every material leaves a scorch; metal simply holds a tighter, brighter
  // bloom (the caller passes a smaller radius for masonry). The reference
  // footage shows embers around brick and timber breaches, not only steel.
  const list = state.heat;
  for (const region of list) {
    if (Math.hypot(region.x - x, region.y - y) <= Math.max(region.radius, radius) * 0.25) {
      const total = region.heat + heat * 0.35;
      region.x = (region.x + x) / 2;
      region.y = (region.y + y) / 2;
      region.heat = Math.min(1, total);
      region.radius = Math.min(220, Math.max(region.radius, radius) * (1 + 0.06 * heat));
      return;
    }
  }
  list.push({ x, y, heat: Math.min(1, heat), radius, material });
  if (list.length > HEAT_REGION_LIMIT) pruneHeat(state);
}

/**
 * Cooling: the white-hot core falls back toward a warm, permanent scorch.
 * The old 0.02/s decay erased every bloom within fifty seconds of real time,
 * so a paused aiming screen lost its burns and a later zoom repaint cleared
 * the visible stain. Heat is damage evidence now: it cools to 0.42 and stays
 * until the wall it sits on is destroyed.
 */
export function coolHeat(state: WallState, dt: number): void {
  if (dt <= 0) return;
  const decay = dt * 0.004;
  for (const r of state.heat) r.heat = Math.max(0.42, r.heat - decay);
}

const HEAT_REGION_LIMIT = 320;

/**
 * Drop blooms that no longer touch any surviving wall, then fold the closest
 * overlapping pairs together. Keeps the stain list bounded over a 5-shot budget
 * without ever discarding a mark the player can still see.
 */
function pruneHeat(state: WallState): void {
  const touches = (r: WallHeatRegion): boolean => state.walls.some((w) => w.polygons.some((poly) => {
    for (const p of poly) {
      if (Math.hypot(p.x - r.x, p.y - r.y) <= r.radius) return true;
    }
    return pointInPolygon(r, poly);
  }));
  state.heat = state.heat.filter(touches);
  if (state.heat.length <= HEAT_REGION_LIMIT) return;
  // Still over budget: merge the two nearest blooms and keep the hotter, wider
  // result. Deterministic because the list order is deterministic.
  while (state.heat.length > HEAT_REGION_LIMIT) {
    let bestI = 0; let bestJ = 1; let bestD = Infinity;
    for (let i = 0; i < state.heat.length; i += 1) {
      for (let j = i + 1; j < state.heat.length; j += 1) {
        const a = state.heat[i]!; const b = state.heat[j]!;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < bestD) { bestD = d; bestI = i; bestJ = j; }
      }
    }
    const a = state.heat[bestI]!; const b = state.heat[bestJ]!;
    const merged: WallHeatRegion = {
      x: (a.x * a.heat + b.x * b.heat) / (a.heat + b.heat),
      y: (a.y * a.heat + b.y * b.heat) / (a.heat + b.heat),
      heat: Math.min(1, a.heat + b.heat * 0.3),
      radius: Math.min(240, Math.max(a.radius, b.radius) * 1.05),
    };
    state.heat[bestI] = merged;
    state.heat.splice(bestJ, 1);
  }
}

/** Core cover from wall geometry (P0-9): fraction of core perimeter blocked. */
export function coreCoverFraction(state: WallState, core: { x: number; y: number; radius: number }): number {
  const samples = 24;
  let covered = 0;
  for (let i = 0; i < samples; i += 1) {
    const a = (i / samples) * Math.PI * 2;
    const p = { x: core.x + Math.cos(a) * (core.radius + 6), y: core.y + Math.sin(a) * (core.radius + 6) };
    if (pointInWalls(state.walls, p)) covered += 1;
  }
  return covered / samples;
}

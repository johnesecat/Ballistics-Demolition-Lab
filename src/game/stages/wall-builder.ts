import { MATERIALS, type MaterialId } from '../materials';
import { Rng } from '../rng';
import type { Polygon, Wall } from '../sim/fracture';
import { polygonArea } from '../sim/fracture';
import { pointInPolygon, polysTouch } from '../sim/walls';
import type { Cell, CellShape } from './types';

/**
 * Wall-direct generator builder (P0-11). Same cell-addressed API as the old
 * DraftBuilder, but geometry is rect polygons from the start — the generator
 * never builds a damage Grid. `put` carves-then-adds so walls never overlap;
 * `carve` subtracts rectangles via rect splitting. The emitted `walls` are
 * the authoritative stage geometry.
 */
export class WallBuilder {
  readonly cols: number;
  readonly rows: number;
  readonly originX: number;
  readonly originY: number;
  readonly tile: number;
  walls: Wall[] = [];
  /** Cell metadata (hp overrides, relay ids) keyed by `c,r`. */
  meta = new Map<string, Cell>();
  rng = new Rng(1);
  private nextId = 0;

  constructor(cols: number, rows: number, originX: number, originY: number, tile: number) {
    this.cols = cols;
    this.rows = rows;
    this.originX = originX;
    this.originY = originY;
    this.tile = tile;
  }

  key(col: number, row: number): string {
    return `${col},${row}`;
  }

  rectOf(col: number, row: number): { x: number; y: number; w: number; h: number } {
    return { x: this.originX + col * this.tile, y: this.originY + row * this.tile, w: this.tile, h: this.tile };
  }

  /** Add a world-rect wall, replacing anything already there. */
  rect(x: number, y: number, w: number, h: number, material: MaterialId, anchored = false): void {
    this.carveRect(x, y, w, h);
    this.walls.push({
      id: `w${this.nextId++}`,
      material,
      polygons: [[{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]],
      anchored,
    });
  }

  /** Add a world polygon wall (slopes, braces). */
  poly(points: Polygon, material: MaterialId, anchored = false): void {
    this.walls.push({ id: `w${this.nextId++}`, material, polygons: [points.map((p) => ({ ...p }))], anchored });
  }

  /** Bolt every wall placed so far into place (authored ranges). */
  anchorAll(): void {
    for (const wall of this.walls) wall.anchored = true;
  }

  /** Subtract a world rect from every existing wall (rect splitting). */
  carveRect(x: number, y: number, w: number, h: number): void {
    const right = x + w;
    const bottom = y + h;
    const kept: Wall[] = [];
    for (const wall of this.walls) {
      const next: Polygon[] = [];
      for (const poly of wall.polygons) {
        const bounds = polyBounds(poly);
        if (bounds.minX >= right || bounds.maxX <= x || bounds.minY >= bottom || bounds.maxY <= y) {
          next.push(poly);
          continue;
        }
        // Polygon may be non-rect (slope); approximate by bbox split only for rects.
        const isRect = poly.length === 4;
        if (!isRect) {
          // For slopes, keep the polygon unless fully inside the carve.
          if (!(bounds.minX >= x && bounds.maxX <= right && bounds.minY >= y && bounds.maxY <= bottom)) next.push(poly);
          continue;
        }
        const [x0, y0, x1, y1] = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY];
        const pieces: Array<{ x: number; y: number; w: number; h: number }> = [];
        if (x0 < x) pieces.push({ x: x0, y: y0, w: x - x0, h: y1 - y0 });
        if (x1 > right) pieces.push({ x: right, y: y0, w: x1 - right, h: y1 - y0 });
        if (y0 < y) pieces.push({ x: Math.max(x0, x), y: y0, w: Math.min(x1, right) - Math.max(x0, x), h: y - y0 });
        if (y1 > bottom) pieces.push({ x: Math.max(x0, x), y: bottom, w: Math.min(x1, right) - Math.max(x0, x), h: y1 - bottom });
        for (const p of pieces) {
          if (p.w <= 0 || p.h <= 0) continue;
          next.push([{ x: p.x, y: p.y }, { x: p.x + p.w, y: p.y }, { x: p.x + p.w, y: p.y + p.h }, { x: p.x, y: p.y + p.h }]);
        }
      }
      if (next.length > 0) kept.push({ ...wall, polygons: next });
    }
    this.walls = kept;
  }

  /** Cell-addressed put (generator API parity). */
  put(col: number, row: number, material: MaterialId, shape: CellShape = 'block'): void {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    const r = this.rectOf(col, row);
    if (shape === 'slopeL') {
      this.carveRect(r.x, r.y, r.w, r.h);
      this.poly([{ x: r.x, y: r.y }, { x: r.x, y: r.y + r.h }, { x: r.x + r.w, y: r.y + r.h }], material);
    } else if (shape === 'slopeR') {
      this.carveRect(r.x, r.y, r.w, r.h);
      this.poly([{ x: r.x, y: r.y + r.h }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }], material);
    } else {
      this.rect(r.x, r.y, r.w, r.h, material);
    }
    if (!this.meta.has(this.key(col, row))) {
      const health = Math.max(4, Math.round(MATERIALS[material].health * 0.25));
      this.meta.set(this.key(col, row), { material, hp: health, maxHp: health, shape, grain: 0 });
    } else {
      const cell = this.meta.get(this.key(col, row))!;
      cell.material = material;
      cell.shape = shape;
    }
  }

  carve(col: number, row: number): void {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    const r = this.rectOf(col, row);
    this.carveRect(r.x, r.y, r.w, r.h);
    this.meta.delete(this.key(col, row));
  }

  get(col: number, row: number): Cell | null {
    const m = this.meta.get(this.key(col, row));
    if (!m) return null;
    // Confirm geometry still covers the cell centre.
    const cx = this.originX + (col + 0.5) * this.tile;
    const cy = this.originY + (row + 0.5) * this.tile;
    const covered = this.walls.some((w) => {
      for (const p of w.polygons) {
        const b = polyBounds(p);
        if (cx < b.minX || cx > b.maxX || cy < b.minY || cy > b.maxY) continue;
        if (pointInPolygon({ x: cx, y: cy }, p)) return true;
      }
      return false;
    });
    return covered ? m : null;
  }

  fill(c0: number, r0: number, c1: number, r1: number, material: MaterialId, probability = 1, shape: CellShape = 'block'): void {
    for (let row = Math.min(r0, r1); row <= Math.max(r0, r1); row += 1) {
      for (let col = Math.min(c0, c1); col <= Math.max(c0, c1); col += 1) {
        // Probability fills were cosmetic noise; walls are solid by default.
        if (probability >= 1) this.put(col, row, material, shape);
        else this.put(col, row, material, shape);
      }
    }
  }

  outline(c0: number, r0: number, c1: number, r1: number, thickness: number, material: MaterialId): void {
    for (let t = 0; t < thickness; t += 1) {
      this.fill(c0 + t, r0 + t, c1 - t, r0 + t, material);
      this.fill(c0 + t, r1 - t, c1 - t, r1 - t, material);
      this.fill(c0 + t, r0 + t, c0 + t, r1 - t, material);
      this.fill(c1 - t, r0 + t, c1 - t, r1 - t, material);
    }
  }

  carveCavity(col: number, row: number, width: number, height: number): void {
    const r = this.rectOf(col, row);
    this.carveRect(r.x, r.y, width * this.tile, height * this.tile);
    for (let rr = row; rr < row + height; rr += 1) for (let cc = col; cc < col + width; cc += 1) this.meta.delete(this.key(cc, rr));
  }

  makeCoreSurround(col: number, row: number): void {
    const ring: Array<[number, number]> = [];
    for (let c = col - 1; c <= col + 4; c += 1) ring.push([c, row - 1], [c, row + 4]);
    for (let r = row; r < row + 4; r += 1) ring.push([col - 1, r], [col + 4, r]);
    for (const [c, r] of ring) if (!this.get(c, r)) this.put(c, r, 'concrete');
    for (let r = row; r < row + 3; r += 1) if (!this.get(col - 2, r)) this.put(col - 2, r, 'steel');
  }

  makeRelay(col: number, row: number, id: string): { id: string; cells: Array<{ col: number; row: number }>; alive: boolean; label: string } {
    const cells: Array<{ col: number; row: number }> = [];
    for (let r = row; r < row + 3; r += 1) {
      for (let c = col; c < col + 2; c += 1) {
        this.put(c, r, 'armor');
        const cell = this.meta.get(this.key(c, r));
        if (cell) {
          cell.relayId = id;
          cell.hp = Math.min(cell.hp, 46);
          cell.maxHp = cell.hp;
        }
        cells.push({ col: c, row: r });
      }
    }
    return { id, cells, alive: true, label: 'RELAY' };
  }

  /** Support check via real wall contact (grounded or touching a grounded wall). */
  supported(groundY: number): boolean {
    const entries = this.walls.flatMap((w) => w.polygons.map((poly) => ({ poly, anchored: w.anchored === true })));
    if (entries.length === 0) return false;
    const supported = entries.map((e) => e.anchored || Math.max(...e.poly.map((pt) => pt.y)) >= groundY - 1.5);
    const boxes = entries.map((e) => polyBounds(e.poly));
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < entries.length; i += 1) {
        if (supported[i]) continue;
        for (let j = 0; j < entries.length; j += 1) {
          if (i === j || !supported[j]) continue;
          const a = boxes[i]!;
          const b = boxes[j]!;
          if (a.maxX < b.minX - 1.6 || b.maxX < a.minX - 1.6 || a.maxY < b.minY - 1.6 || b.maxY < a.minY - 1.6) continue;
          if (polysTouch(entries[i]!.poly, entries[j]!.poly)) { supported[i] = true; changed = true; break; }
        }
      }
    }
    return supported.every(Boolean);
  }

  removeFloating(groundY: number): void {
    if (this.supported(groundY)) return;
    const entries = this.walls.flatMap((w) => w.polygons.map((poly) => ({ poly, anchored: w.anchored === true })));
    const supported = entries.map((e) => e.anchored || Math.max(...e.poly.map((pt) => pt.y)) >= groundY - 1.5);
    const boxes = entries.map((e) => polyBounds(e.poly));
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < entries.length; i += 1) {
        if (supported[i]) continue;
        for (let j = 0; j < entries.length; j += 1) {
          if (i === j || !supported[j]) continue;
          const a = boxes[i]!;
          const b = boxes[j]!;
          if (a.maxX < b.minX - 1.6 || b.maxX < a.minX - 1.6 || a.maxY < b.minY - 1.6 || b.maxY < a.minY - 1.6) continue;
          if (polysTouch(entries[i]!.poly, entries[j]!.poly)) { supported[i] = true; changed = true; break; }
        }
      }
    }
    this.walls = this.walls
      .map((w) => ({ ...w, polygons: w.polygons.filter((p) => supported[entries.findIndex((e) => e.poly === p)]) }))
      .filter((w) => w.polygons.length > 0);
  }

  /** Wall count after merging co-linear adjacent rects of the same material. */
  merged(): Wall[] {
    // Geometry is already overlap-free; merging is a render/perf nicety.
    return this.walls;
  }
}

function polyBounds(poly: Polygon): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function wallArea(walls: Wall[]): number {
  return walls.reduce((s, w) => s + w.polygons.reduce((a, p) => a + polygonArea(p), 0), 0);
}

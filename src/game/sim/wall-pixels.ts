import type { MaterialId } from '../materials';
import { MATERIALS, MATERIAL_ORDER } from '../materials';
import type { Wall } from './fracture';
import type { BodyWorld } from './body-sim';
import { PIXEL } from './body-sim';

/**
 * The solid world, as pixels -- and, where the round touches it, as a soft body.
 *
 * Every wall is rasterised once per shot onto a 2-unit pixel grid. The raster is
 * the collision surface. Around the first solid pixel the round touches, the
 * raster is also rigged as a mass-spring lattice:
 *
 *  - every solid pixel is a particle with mass = density x area, carrying the
 *    material it was built from;
 *  - every particle is linked to its four axial neighbours and four diagonals,
 *    so a push on one pixel is carried through every connected pixel;
 *  - a contact applies a mass- and speed-weighted positional correction to the
 *    touched pixel, and the springs carry that displacement outward. Strains
 *    past the material's yield point become plastic, so the rim keeps the dent
 *    after the round has gone;
 *  - links accumulate damage and tear. A pixel whose cell the round has paid to
 *    destroy detaches from the lattice and becomes debris; that is the hole.
 *
 * The patch wakes only around the impact, so a phone pays for the pixels that
 * are actually being worked, not for the whole wall.
 */

interface WallNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  restX: number;
  restY: number;
  mass: number;
  material: MaterialId;
  cell: number;
  col: number;
  row: number;
  wall: number;
  pinned: boolean;
  detached: boolean;
  damage: number;
  /** Seconds of simulation left before this pixel is allowed to sleep again. */
  awake: number;
}

interface WallLink {
  a: number;
  b: number;
  rest: number;
  rest0: number;
  damage: number;
  broken: boolean;
  /** Axial links are stiffer than diagonals, as in a square lattice. */
  axial: boolean;
  /** Precomputed spring constants: no material lookups on the hot path. */
  k: number;
  damp: number;
  yieldStrain: number;
  tearRate: number;
  creep: number;
  /** Last substep this link was integrated on (each link is paid for once). */
  stepId: number;
}

/** Radius of the soft-body patch armed at a contact, world units. */
const PATCH_RADIUS = 22;
/** Spring stiffness per unit of material strength. */
const WALL_SPRING = 26000;
/** Permanent displacement is capped so a repeated hit cannot smear a wall. */
const MAX_PLASTIC = 5;
/** How long a touched pixel stays awake, seconds. */
const WAKE_TIME = 0.32;

export class WallPixels implements BodyWorld {
  readonly groundY: number;
  readonly groundMaterial: MaterialId = 'concrete';
  /** Material index + 1 per pixel (0 = air). */
  private cells: Uint8Array;
  /** Wall index + 1 per pixel; kept after a carve so the damage is attributed. */
  private owner: Int16Array;
  private cols: number;
  private rows: number;
  private x0: number;
  private y0: number;
  /** Pixels this shot has removed, for the geometry pass. */
  readonly carved: Array<{ x: number; y: number; wall: number; material: MaterialId }> = [];

  private nodes: WallNode[] = [];
  private links: WallLink[] = [];
  /** Links touching each node, so a push never scans the whole lattice. */
  private nodeLinks: number[][] = [];
  private nodeAtCell = new Map<number, number>();
  /** Only the pixels near a live contact are integrated; the rest sleep. */
  private awake: number[] = [];
  private stepId = 0;
  /** Permanent offsets baked when the patch moves to a second layer. */
  private baked = new Map<number, { x: number; y: number }>();
  private patchX = Number.NaN;
  private patchY = Number.NaN;

  constructor(walls: readonly Wall[], groundY: number) {
    this.groundY = groundY;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const wall of walls) {
      for (const poly of wall.polygons) {
        for (const p of poly) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
      }
    }
    if (!Number.isFinite(minX)) {
      minX = 0; minY = 0; maxX = PIXEL; maxY = PIXEL;
    }
    // Snap the grid outward so pixel centres line up with the world grid the
    // renderer paints on.
    this.x0 = Math.floor(minX / PIXEL) * PIXEL;
    this.y0 = Math.floor(minY / PIXEL) * PIXEL;
    this.cols = Math.max(1, Math.ceil((maxX - this.x0) / PIXEL) + 1);
    this.rows = Math.max(1, Math.ceil((maxY - this.y0) / PIXEL) + 1);
    this.cells = new Uint8Array(this.cols * this.rows);
    this.owner = new Int16Array(this.cols * this.rows);
    const half = PIXEL * 0.5;
    walls.forEach((wall, wallIndex) => {
      const mat = MATERIAL_ORDER.indexOf(wall.material) + 1;
      for (const poly of wall.polygons) {
        if (poly.length < 3) continue;
        let px0 = Infinity; let py0 = Infinity; let px1 = -Infinity; let py1 = -Infinity;
        for (const p of poly) {
          px0 = Math.min(px0, p.x); py0 = Math.min(py0, p.y);
          px1 = Math.max(px1, p.x); py1 = Math.max(py1, p.y);
        }
        const c0 = Math.max(0, Math.floor((px0 - this.x0) / PIXEL));
        const c1 = Math.min(this.cols - 1, Math.ceil((px1 - this.x0) / PIXEL));
        const r0 = Math.max(0, Math.floor((py0 - this.y0) / PIXEL));
        const r1 = Math.min(this.rows - 1, Math.ceil((py1 - this.y0) / PIXEL));
        for (let r = r0; r <= r1; r += 1) {
          const cy = this.y0 + r * PIXEL + half;
          for (let c = c0; c <= c1; c += 1) {
            const cx = this.x0 + c * PIXEL + half;
            if (!pointInPolygon(cx, cy, poly)) continue;
            const at = r * this.cols + c;
            // First wall to claim a pixel owns it; generated walls never overlap.
            if (this.cells[at] === 0) {
              this.cells[at] = mat;
              this.owner[at] = wallIndex + 1;
            }
          }
        }
      }
    });
  }

  private index(x: number, y: number): number {
    const c = Math.floor((x - this.x0) / PIXEL);
    const r = Math.floor((y - this.y0) / PIXEL);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  materialAt(x: number, y: number): MaterialId | null {
    const at = this.index(x, y);
    if (at < 0) return null;
    const mat = this.cells[at]!;
    return mat === 0 ? null : MATERIAL_ORDER[mat - 1] ?? null;
  }

  wallAt(x: number, y: number): number {
    const at = this.index(x, y);
    if (at < 0) return -1;
    return this.owner[at]! - 1;
  }

  carve(x: number, y: number): MaterialId | null {
    const at = this.index(x, y);
    if (at < 0) return null;
    const mat = this.cells[at]!;
    if (mat === 0) return null;
    this.cells[at] = 0;
    const material = MATERIAL_ORDER[mat - 1]!;
    this.carved.push({ x, y, wall: this.owner[at]! - 1, material });
    const nodeIndex = this.nodeAtCell.get(at);
    if (nodeIndex !== undefined) this.nodes[nodeIndex]!.detached = true;
    return material;
  }

  /** Pixels still solid (diagnostics / tests). */
  get solidCount(): number {
    let n = 0;
    for (let i = 0; i < this.cells.length; i += 1) if (this.cells[i] !== 0) n += 1;
    return n;
  }

  // ---------------------------------------------------------------------------
  // Pixel soft body
  // ---------------------------------------------------------------------------

  /** Rig the solid pixels around a contact as a connected mass-spring patch. */
  armSoftBody(x: number, y: number, radius = PATCH_RADIUS): void {
    if (this.nodes.length > 0 && Math.hypot(x - this.patchX, y - this.patchY) < radius * 0.5) return;
    if (this.nodes.length > 0) this.bake();
    this.nodes = [];
    this.links = [];
    this.nodeLinks = [];
    this.nodeAtCell.clear();
    this.awake = [];
    this.stepId = 0;
    this.patchX = x;
    this.patchY = y;
    const half = PIXEL * 0.5;
    const c0 = Math.max(0, Math.floor((x - radius - this.x0) / PIXEL));
    const c1 = Math.min(this.cols - 1, Math.floor((x + radius - this.x0) / PIXEL));
    const r0 = Math.max(0, Math.floor((y - radius - this.y0) / PIXEL));
    const r1 = Math.min(this.rows - 1, Math.floor((y + radius - this.y0) / PIXEL));
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const at = r * this.cols + c;
        const mat = this.cells[at]!;
        if (mat === 0) continue;
        const cx = this.x0 + c * PIXEL + half;
        const cy = this.y0 + r * PIXEL + half;
        const dist = Math.hypot(cx - x, cy - y);
        if (dist > radius) continue;
        const material = MATERIAL_ORDER[mat - 1]!;
        const def = MATERIALS[material];
        this.nodeAtCell.set(at, this.nodes.length);
        this.nodes.push({
          x: cx, y: cy,
          vx: 0, vy: 0,
          restX: cx, restY: cy,
          mass: Math.max(0.5, def.density * PIXEL * PIXEL),
          material,
          cell: at,
          col: c,
          row: r,
          wall: this.owner[at]! - 1,
          // Only the outer ring is pinned to the wall behind the patch; the
          // pixels the round can reach are free to move and tear.
          pinned: dist > radius - PIXEL * 2.2,
          detached: false,
          damage: 0,
          awake: 0,
        });
      }
    }
    this.nodeLinks = this.nodes.map(() => []);
    const link = (a: number, b: number, axial: boolean): void => {
      if (a === b) return;
      const na = this.nodes[a]!;
      const nb = this.nodes[b]!;
      const rest = Math.hypot(nb.restX - na.restX, nb.restY - na.restY);
      const strength = Math.min(MATERIALS[na.material].strength, MATERIALS[nb.material].strength);
      const index = this.links.length;
      this.links.push({
        a, b, rest, rest0: rest, damage: 0, broken: false, axial,
        k: WALL_SPRING * (axial ? 1 : 0.42) * (0.35 + strength),
        damp: 2 * Math.sqrt(WALL_SPRING * (axial ? 1 : 0.42) * (0.35 + strength) * 0.5) * 0.35,
        yieldStrain: Math.min(MATERIALS[na.material].yieldStrain, MATERIALS[nb.material].yieldStrain),
        tearRate: 14 + (1 - strength) * 30,
        creep: 0.25 + Math.max(MATERIALS[na.material].sag, MATERIALS[nb.material].sag),
        stepId: 0,
      });
      this.nodeLinks[a]!.push(index);
      this.nodeLinks[b]!.push(index);
    };
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const a = this.nodeAtCell.get(r * this.cols + c);
        if (a === undefined) continue;
        const right = this.nodeAtCell.get(r * this.cols + c + 1);
        const down = this.nodeAtCell.get((r + 1) * this.cols + c);
        const downRight = this.nodeAtCell.get((r + 1) * this.cols + c + 1);
        const downLeft = this.nodeAtCell.get((r + 1) * this.cols + c - 1);
        if (right !== undefined) link(a, right, true);
        if (down !== undefined) link(a, down, true);
        if (downRight !== undefined) link(a, downRight, false);
        if (downLeft !== undefined) link(a, downLeft, false);
      }
    }
  }

  /** Fold the live patch's permanent offsets into the baked field. */
  private bake(): void {
    for (const node of this.nodes) {
      if (node.detached) continue;
      const dx = node.x - node.restX;
      const dy = node.y - node.restY;
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;
      const prev = this.baked.get(node.cell);
      this.baked.set(node.cell, { x: (prev?.x ?? 0) + dx, y: (prev?.y ?? 0) + dy });
    }
  }

  private wake(index: number, seconds: number): void {
    const node = this.nodes[index]!;
    if (node.awake <= 0) this.awake.push(index);
    node.awake = Math.max(node.awake, seconds);
  }

  /**
   * One contact: the touched pixel is pushed along the round's travel and the
   * displacement is mass- and material-weighted. The spring network carries it
   * to every connected pixel on the next substeps; this is the deformation the
   * old code faked with a rotated stamp.
   */
  push(x: number, y: number, vx: number, vy: number, mass: number): void {
    let at = this.index(x, y);
    if (at < 0) return;
    if (!this.nodeAtCell.has(at)) {
      // A second plate (or a pixel outside the first patch): rig it now.
      this.armSoftBody(x, y);
      at = this.index(x, y);
    }
    const nodeIndex = this.nodeAtCell.get(at);
    if (nodeIndex === undefined) return;
    const node = this.nodes[nodeIndex]!;
    if (node.detached) return;
    const speed = Math.hypot(vx, vy) || 1;
    const dirX = vx / speed;
    const dirY = vy / speed;
    const def = MATERIALS[node.material];
    // How far the pixel gives: harder and denser material gives less, a faster
    // and heavier pixel gives more. The depth is capped at one pixel per step.
    const give =
      (1 - def.strength * 0.75) *
      Math.min(1, speed / 500) *
      (0.6 + (0.4 * mass) / (mass + node.mass));
    const step = Math.min(PIXEL, speed / 240) * give * 1.2;
    node.x += dirX * step;
    node.y += dirY * step;
    const dx = node.x - node.restX;
    const dy = node.y - node.restY;
    const stretch = Math.hypot(dx, dy);
    if (stretch > MAX_PLASTIC) {
      node.x = node.restX + (dx / stretch) * MAX_PLASTIC;
      node.y = node.restY + (dy / stretch) * MAX_PLASTIC;
    }
    node.damage = Math.min(1, node.damage + Math.min(0.02, (speed * mass) / 40000));
    this.wake(nodeIndex, WAKE_TIME);
    // The pixels it is touching move first -- a shock ring, not the whole wall.
    for (const linkIndex of this.nodeLinks[nodeIndex] ?? []) {
      const link = this.links[linkIndex]!;
      const otherIndex = link.a === nodeIndex ? link.b : link.a;
      const other = this.nodes[otherIndex]!;
      if (other.pinned || other.detached) continue;
      other.x += dirX * step * 0.35;
      other.y += dirY * step * 0.35;
      this.wake(otherIndex, WAKE_TIME * 0.6);
    }
  }

  /** Integrate the awake patch: springs, plastic flow, tear, sleep. */
  stepSoftBody(dt: number): void {
    if (this.awake.length === 0) return;
    this.stepId += 1;
    const stepId = this.stepId;
    for (const index of this.awake) {
      const node = this.nodes[index]!;
      if (node.detached || node.awake <= 0) continue;
      for (const linkIndex of this.nodeLinks[index] ?? []) {
        const link = this.links[linkIndex]!;
        if (link.broken || link.stepId === stepId) continue;
        link.stepId = stepId;
        const a = this.nodes[link.a]!;
        const b = this.nodes[link.b]!;
        if (a.detached || b.detached) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const nx = dx / len;
        const ny = dy / len;
        const strain = (len - link.rest) / link.rest;
        const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        const force = link.k * strain + link.damp * vrel;
        if (!a.pinned && a.awake > 0) {
          a.vx += (nx * force * dt) / a.mass;
          a.vy += (ny * force * dt) / a.mass;
        }
        if (!b.pinned && b.awake > 0) {
          b.vx -= (nx * force * dt) / b.mass;
          b.vy -= (ny * force * dt) / b.mass;
        }
        // Plastic flow: past yield the rest length follows the stretch, so the
        // dent stays after the springs unload.
        const excess = Math.abs(strain) - link.yieldStrain;
        if (excess > 0) {
          // Worked metal flows: a strain past yield moves the rest length most of
          // the way to the stretched length every substep, which is what keeps a
          // dent after the spring unloads instead of springing straight back.
          link.rest += (len - link.rest) * Math.min(0.5, excess * 6) * link.creep;
          link.rest = Math.max(link.rest0 * 0.7, Math.min(link.rest0 * 1.35, link.rest));
          a.damage = Math.min(1, a.damage + excess * dt * 5);
          b.damage = Math.min(1, b.damage + excess * dt * 5);
          const tear = Math.abs(strain) - link.yieldStrain * 0.7;
          if (tear > 0) link.damage += tear * dt * link.tearRate;
          if (link.damage >= 1) link.broken = true;
        }
      }
    }
    let live = 0;
    const drag = Math.exp(-2.4 * dt);
    for (const index of this.awake) {
      const node = this.nodes[index]!;
      node.awake = Math.max(0, node.awake - dt);
      if (node.pinned || node.detached || node.awake <= 0) continue;
      node.vx *= drag;
      node.vy *= drag;
      node.x += node.vx * dt;
      node.y += node.vy * dt;
      const dx = node.x - node.restX;
      const dy = node.y - node.restY;
      const stretch = Math.sqrt(dx * dx + dy * dy);
      if (stretch > MAX_PLASTIC) {
        node.x = node.restX + (dx / stretch) * MAX_PLASTIC;
        node.y = node.restY + (dy / stretch) * MAX_PLASTIC;
        node.vx *= 0.2;
        node.vy *= 0.2;
      }
      this.awake[live++] = index;
    }
    this.awake.length = live;
  }

  /**
   * Permanent displacement of the surviving pixels near a point. Used to bend
   * the wall polygons around a hole after the shot: the rim is where the soft
   * body pushed it, not a drawn lip.
   */
  deformationAt(x: number, y: number): { x: number; y: number } | null {
    let best: WallNode | null = null;
    let bestDist = Infinity;
    for (const node of this.nodes) {
      if (node.detached) continue;
      const d = Math.hypot(node.restX - x, node.restY - y);
      if (d < bestDist) {
        bestDist = d;
        best = node;
      }
    }
    if (best && bestDist <= 14) {
      const weight = 1 - bestDist / 14;
      return { x: (best.x - best.restX) * weight, y: (best.y - best.restY) * weight };
    }
    const at = this.index(x, y);
    if (at < 0) return null;
    const baked = this.baked.get(at);
    return baked ? { x: baked.x, y: baked.y } : null;
  }

  /** Velocity of the detached pixel at a point, for chip debris. */
  detachedVelocityAt(x: number, y: number): { x: number; y: number } | null {
    const at = this.index(x, y);
    if (at < 0) return null;
    const index = this.nodeAtCell.get(at);
    if (index === undefined) return null;
    const node = this.nodes[index]!;
    return node.detached ? { x: node.vx, y: node.vy } : null;
  }
}

function pointInPolygon(x: number, y: number, poly: readonly { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

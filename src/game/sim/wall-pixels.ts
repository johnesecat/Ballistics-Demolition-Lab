import type { MaterialId } from '../materials';
import { MATERIALS, MATERIAL_ORDER } from '../materials';
import type { Wall } from './fracture';
import type { BodyWorld } from './body-sim';
import { PIXEL } from './body-sim';

/**
 * The solid world, as pixels -- and, where the round touches it, as a soft body.
 *
 * Every wall is rasterised once per shot onto a 2-unit pixel grid. The raster is
 * the collision surface. The first solid pixel the round touches selects its
 * whole *connected* component -- every pixel reachable through touching steel,
 * not a disc around the hole -- and rigs all of it as one mass-spring lattice:
 *
 *  - every solid pixel is a particle with mass = density x area, carrying the
 *    material it was built from;
 *  - every particle is linked to its four axial neighbours and four diagonals,
 *    so a push on one pixel is carried through the plate to its far end;
 *  - the ends of the component (along its thin axis) are the bolted edges and
 *    stay pinned; its free surfaces are not, or a 5-pixel plate would have
 *    nothing left to bend;
 *  - a contact applies a mass- and speed-weighted positional correction to the
 *    touched pixel, and the springs carry that displacement outward. Strains
 *    past the material's yield point become plastic, so the rim keeps the dent
 *    after the round has gone;
 *  - links accumulate damage and tear. A pixel whose cell the round has paid to
 *    destroy detaches from the lattice and becomes debris; that is the hole.
 *    The surviving rim is pulled into the hole by its own plastic displacement;
 *    `lipPolygons()` hands that curled lip to the geometry pass.
 *
 * A whole wall can be tens of thousands of pixels, and a phone cannot integrate
 * that at 240 Hz. The rig is therefore complete (topology, mass, links) but the
 * integration is sparse: only pixels the shock has actually reached are awake,
 * capped at AWAKE_BUDGET. A pixel outside that budget keeps the shape it was
 * pushed into; it simply is not stepped until the wave reaches it.
 */

/** Pixels a single shot will rig. Beyond this the nearest pixels to the contact win. */
const MAX_RIG_NODES = 6000;
/** Pixels integrated per substep. The shock front, not the wall, is this big. */
const AWAKE_BUDGET = 320;
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

  // --- Soft-body rig (structure of arrays: no per-pixel objects on the heat
  // path, no allocation once the rig is built) -------------------------------
  private count = 0;
  private nX = new Float32Array(0);
  private nY = new Float32Array(0);
  private nVX = new Float32Array(0);
  private nVY = new Float32Array(0);
  private nRestX = new Float32Array(0);
  private nRestY = new Float32Array(0);
  private nMass = new Float32Array(0);
  private nMaterial = new Uint8Array(0);
  private nCell = new Int32Array(0);
  private nPinned = new Uint8Array(0);
  private nDetached = new Uint8Array(0);
  private nDamage = new Float32Array(0);
  private nAwakeTime = new Float32Array(0);
  private nPushStamp = new Int32Array(0);
  /** Links in CSR order: linkStart[i]..linkStart[i+1] belong to node i. */
  private linkStart = new Int32Array(0);
  private linkTo = new Int32Array(0);
  private linkRest = new Float32Array(0);
  private linkRest0 = new Float32Array(0);
  private linkDamage = new Float32Array(0);
  private linkK = new Float32Array(0);
  private linkDamp = new Float32Array(0);
  private linkYield = new Float32Array(0);
  private linkTear = new Float32Array(0);
  private linkCreep = new Float32Array(0);
  private linkStep = new Int32Array(0);
  private linkBroken = new Uint8Array(0);
  /** Cell -> node index, or -1. A flat array: a Map of 6000 entries was most
   * of the cost of rigging a wall. */
  private nodeIndex = new Int32Array(0);
  /** BFS visited stamps, so a rig build never allocates a Set. */
  private rigStamp = new Int32Array(0);
  private rigMark = 0;
  /** Node at a raster cell, or -1 when the cell is not in the rig. */
  private nodeIndexOf(at: number): number {
    if (at < 0 || at >= this.nodeIndex.length) return -1;
    return this.nodeIndex[at]!;
  }
  private awake: number[] = [];
  private stepId = 0;
  private pushId = 0;
  private peakAwake = 0;
  /** Rigs built this shot: one per connected wall the round reaches. */
  rigBuilds = 0;
  /** Diagnostics counters (profiling only). */
  linkEvals = 0;
  pushCalls = 0;
  /** Permanent offsets of rigs replaced by a later contact (a second plate). */
  private baked = new Map<number, { x: number; y: number }>();

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
    const nodeIndex = this.nodeIndexOf(at);
    if (nodeIndex >= 0) this.nDetached[nodeIndex] = 1;
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

  /**
   * Rig the whole connected wall the contact landed in. The optional radius is
   * kept for callers that want to bound the work; the shot uses the whole
   * component, capped at MAX_RIG_NODES nearest pixels.
   */
  armSoftBody(x: number, y: number, radius = Infinity): void {
    let startAt = this.index(x, y);
    if (startAt < 0) return;
    // The round's nose usually sits a fraction inside a pixel; a contact that
    // is still air means the solid is next door.
    if (this.cells[startAt] === 0) {
      const near = this.nearestSolid(startAt);
      if (near < 0) return;
      startAt = near;
    }
    // Already rigged and this contact is part of it: nothing to rebuild.
    if (this.count > 0 && this.nodeIndexOf(startAt) >= 0) {
      return;
    }
    if (this.count > 0) this.bake();
    this.buildRig(startAt, radius);
    this.rigBuilds += 1;
  }

  private nearestSolid(at: number): number {
    const c = at % this.cols;
    const r = (at - c) / this.cols;
    for (let ring = 1; ring <= 3; ring += 1) {
      for (let dr = -ring; dr <= ring; dr += 1) {
        for (let dc = -ring; dc <= ring; dc += 1) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const cc = c + dc;
          const rr = r + dr;
          if (cc < 0 || rr < 0 || cc >= this.cols || rr >= this.rows) continue;
          const next = rr * this.cols + cc;
          if (this.cells[next] !== 0) return next;
        }
      }
    }
    return -1;
  }

  private buildRig(startAt: number, radius: number): void {
    const cells = this.cells;
    const cols = this.cols;
    const rows = this.rows;
    const sc = startAt % cols;
    const sr = (startAt - sc) / cols;
    const cx0 = this.x0 + sc * PIXEL + PIXEL * 0.5;
    const cy0 = this.y0 + sr * PIXEL + PIXEL * 0.5;
    if (this.rigStamp.length !== cells.length) {
      this.rigStamp = new Int32Array(cells.length);
      this.nodeIndex = new Int32Array(cells.length);
      this.rigMark = 0;
    }
    this.rigMark += 1;
    const mark = this.rigMark;
    const stamp = this.rigStamp;
    const nodeIndex = this.nodeIndex;
    nodeIndex.fill(-1);
    // Breadth-first over the solid: nearest pixels first, so a component larger
    // than the cap is still rigged from the contact outwards. A flat stamp array
    // and an Int32 queue keep the whole rig at one pass with no allocation per
    // pixel.
    const order = new Int32Array(MAX_RIG_NODES);
    let n = 1;
    order[0] = startAt;
    stamp[startAt] = mark;
    const visit = (next: number, nc: number, nr: number): void => {
      if (n >= MAX_RIG_NODES || stamp[next] === mark || cells[next] === 0) return;
      if (radius !== Infinity) {
        const dx = this.x0 + nc * PIXEL + PIXEL * 0.5 - cx0;
        const dy = this.y0 + nr * PIXEL + PIXEL * 0.5 - cy0;
        if (Math.hypot(dx, dy) > radius) return;
      }
      stamp[next] = mark;
      order[n] = next;
      n += 1;
    };
    for (let head = 0; head < n; head += 1) {
      const at = order[head]!;
      const c = at % cols;
      const r = (at - c) / cols;
      if (c > 0) visit(at - 1, c - 1, r);
      if (c < cols - 1) visit(at + 1, c + 1, r);
      if (r > 0) visit(at - cols, c, r - 1);
      if (r < rows - 1) visit(at + cols, c, r + 1);
    }

    this.count = n;
    this.awake = [];
    this.stepId = 0;
    this.pushId = 0;
    this.nX = new Float32Array(n);
    this.nY = new Float32Array(n);
    this.nVX = new Float32Array(n);
    this.nVY = new Float32Array(n);
    this.nRestX = new Float32Array(n);
    this.nRestY = new Float32Array(n);
    this.nMass = new Float32Array(n);
    this.nMaterial = new Uint8Array(n);
    this.nCell = new Int32Array(n);
    this.nPinned = new Uint8Array(n);
    this.nDetached = new Uint8Array(n);
    this.nDamage = new Float32Array(n);
    this.nAwakeTime = new Float32Array(n);
    this.nPushStamp = new Int32Array(n);
    const half = PIXEL * 0.5;
    // The component's long axis is its span; its ends along the short axis are
    // where the plate is bolted. Pinning the free top/bottom surfaces of a thin
    // plate would leave nothing to deform.
    let minC = Infinity; let maxC = -Infinity; let minR = Infinity; let maxR = -Infinity;
    for (let i = 0; i < n; i += 1) {
      const at = order[i]!;
      const c = at % cols;
      const r = (at - c) / cols;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      const mat = cells[at]!;
      const material = MATERIAL_ORDER[mat - 1]!;
      const def = MATERIALS[material];
      const cx = this.x0 + c * PIXEL + half;
      const cy = this.y0 + r * PIXEL + half;
      this.nRestX[i] = cx;
      this.nRestY[i] = cy;
      this.nX[i] = cx;
      this.nY[i] = cy;
      this.nMaterial[i] = mat;
      this.nCell[i] = at;
      this.nMass[i] = Math.max(0.5, def.density * PIXEL * PIXEL);
      nodeIndex[at] = i;
    }
    // The ends of the component along its thin axis are the bolted edges. A
    // plate is held at its ends; its long free surfaces have to bend.
    const pinX = (maxC - minC) >= (maxR - minR);
    for (let i = 0; i < n; i += 1) {
      const at = order[i]!;
      const c = at % cols;
      const r = (at - c) / cols;
      let pinned = pinX
        ? (c === minC || c === maxC) ? 1 : 0
        : (r === minR || r === maxR) ? 1 : 0;
      if (!pinned) {
        // A pixel whose neighbour is solid but outside the rig is a cut edge.
        const cut = (c > 0 && cells[at - 1] !== 0 && this.nodeIndexOf(at - 1) < 0)
          || (c < cols - 1 && cells[at + 1] !== 0 && this.nodeIndexOf(at + 1) < 0)
          || (r > 0 && cells[at - cols] !== 0 && this.nodeIndexOf(at - cols) < 0)
          || (r < rows - 1 && cells[at + cols] !== 0 && this.nodeIndexOf(at + cols) < 0);
        if (cut) pinned = 1;
      }
      this.nPinned[i] = pinned;
    }

    // Links: four directions (right, down, both diagonals). Each undirected
    // link appears in both adjacency lists; it is computed and priced once.
    const degree = new Int32Array(n);
    for (let i = 0; i < n; i += 1) {
      const at = order[i]!;
      const c = at % cols;
      const r = (at - c) / cols;
      if (c + 1 < cols) { const j = nodeIndex[at + 1]!; if (j >= 0) { degree[i] = degree[i]! + 1; degree[j] = degree[j]! + 1; } }
      if (r + 1 < rows) { const j = nodeIndex[at + cols]!; if (j >= 0) { degree[i] = degree[i]! + 1; degree[j] = degree[j]! + 1; } }
      if (r + 1 < rows && c + 1 < cols) { const j = nodeIndex[at + cols + 1]!; if (j >= 0) { degree[i] = degree[i]! + 1; degree[j] = degree[j]! + 1; } }
      if (r + 1 < rows && c > 0) { const j = nodeIndex[at + cols - 1]!; if (j >= 0) { degree[i] = degree[i]! + 1; degree[j] = degree[j]! + 1; } }
    }
    const start = new Int32Array(n + 1);
    let linkCount = 0;
    for (let i = 0; i < n; i += 1) {
      start[i] = linkCount;
      linkCount += degree[i]!;
    }
    start[n] = linkCount;
    const cursor = start.slice(0, n);
    this.linkStart = start;
    this.linkTo = new Int32Array(linkCount);
    this.linkRest = new Float32Array(linkCount);
    this.linkRest0 = new Float32Array(linkCount);
    this.linkDamage = new Float32Array(linkCount);
    this.linkK = new Float32Array(linkCount);
    this.linkDamp = new Float32Array(linkCount);
    this.linkYield = new Float32Array(linkCount);
    this.linkTear = new Float32Array(linkCount);
    this.linkCreep = new Float32Array(linkCount);
    this.linkStep = new Int32Array(linkCount);
    this.linkBroken = new Uint8Array(linkCount);
    const write = (i: number, j: number): void => {
      if (j < 0) return;
      const rest = Math.hypot(this.nRestX[j]! - this.nRestX[i]!, this.nRestY[j]! - this.nRestY[i]!);
      const axial = Math.abs(this.nRestX[j]! - this.nRestX[i]!) < 1e-3 || Math.abs(this.nRestY[j]! - this.nRestY[i]!) < 1e-3;
      const ma = MATERIALS[MATERIAL_ORDER[this.nMaterial[i]! - 1]!];
      const mb = MATERIALS[MATERIAL_ORDER[this.nMaterial[j]! - 1]!];
      const strength = Math.min(ma.strength, mb.strength);
      const stiffness = WALL_SPRING * (axial ? 1 : 0.42) * (0.35 + strength);
      const a = cursor[i]!;
      const b = cursor[j]!;
      cursor[i] = a + 1;
      cursor[j] = b + 1;
      this.linkTo[a] = j;
      this.linkTo[b] = i;
      this.linkRest[a] = rest;
      this.linkRest[b] = rest;
      this.linkRest0[a] = rest;
      this.linkRest0[b] = rest;
      this.linkK[a] = stiffness;
      this.linkK[b] = stiffness;
      this.linkDamp[a] = 2 * Math.sqrt(stiffness * 0.5) * 0.35;
      this.linkDamp[b] = this.linkDamp[a]!;
      this.linkYield[a] = Math.min(ma.yieldStrain, mb.yieldStrain);
      this.linkYield[b] = this.linkYield[a]!;
      this.linkTear[a] = 14 + (1 - strength) * 30;
      this.linkTear[b] = this.linkTear[a]!;
      this.linkCreep[a] = 0.25 + Math.max(ma.sag, mb.sag);
      this.linkCreep[b] = this.linkCreep[a]!;
    };
    for (let i = 0; i < n; i += 1) {
      const at = order[i]!;
      const c = at % cols;
      const r = (at - c) / cols;
      if (c + 1 < cols) write(i, nodeIndex[at + 1]!);
      if (r + 1 < rows) write(i, nodeIndex[at + cols]!);
      if (r + 1 < rows && c + 1 < cols) write(i, nodeIndex[at + cols + 1]!);
      if (r + 1 < rows && c > 0) write(i, nodeIndex[at + cols - 1]!);
    }
  }

  /** Fold the rig's permanent offsets into the baked field. */
  private bake(): void {
    for (let i = 0; i < this.count; i += 1) {
      if (this.nDetached[i]) continue;
      const dx = this.nX[i]! - this.nRestX[i]!;
      const dy = this.nY[i]! - this.nRestY[i]!;
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;
      const cell = this.nCell[i]!;
      const prev = this.baked.get(cell);
      this.baked.set(cell, { x: (prev?.x ?? 0) + dx, y: (prev?.y ?? 0) + dy });
    }
  }

  private wake(index: number, seconds: number): void {
    if (this.nDetached[index] || this.nPinned[index]) return;
    if (this.nAwakeTime[index]! <= 0) {
      // The front is bounded: a phone integrates the pixels being worked, and
      // the wall beyond the front keeps whatever shape the shock gave it.
      if (this.awake.length >= AWAKE_BUDGET) return;
      this.awake.push(index);
      if (this.awake.length > this.peakAwake) this.peakAwake = this.awake.length;
    }
    const now = this.nAwakeTime[index]!;
    if (seconds > now) this.nAwakeTime[index] = seconds;
  }

  /**
   * One contact: the touched pixel is pushed along the round's travel and the
   * displacement is mass- and material-weighted. The spring network carries it
   * to every connected pixel; the immediate neighbourhood takes the first rings
   * of the shock directly, which is what keeps a narrow plate bowing smoothly
   * instead of creasing on one pixel.
   */
  push(x: number, y: number, vx: number, vy: number, mass: number): void {
    this.pushCalls += 1;
    if (this.count === 0) this.armSoftBody(x, y);
    const at = this.index(x, y);
    if (at < 0) return;
    let nodeIndex = this.nodeIndexOf(at);
    if (nodeIndex < 0) {
      this.armSoftBody(x, y);
      nodeIndex = this.nodeIndexOf(at);
    }
    if (nodeIndex < 0) return;
    if (this.nDetached[nodeIndex] || this.nPinned[nodeIndex]) return;
    const speed = Math.hypot(vx, vy) || 1;
    const dirX = vx / speed;
    const dirY = vy / speed;
    const material = MATERIAL_ORDER[this.nMaterial[nodeIndex]! - 1]!;
    const def = MATERIALS[material];
    // How far the pixel gives: harder and denser material gives less, a faster
    // and heavier pixel gives more. The depth is capped at one pixel per step.
    const give =
      (1 - def.strength * 0.75) *
      Math.min(1, speed / 500) *
      (0.6 + (0.4 * mass) / (mass + this.nMass[nodeIndex]!));
    const step = Math.min(PIXEL, speed / 240) * give * 1.2;
    this.displace(nodeIndex, dirX, dirY, step);
    this.nDamage[nodeIndex] = Math.min(1, this.nDamage[nodeIndex]! + Math.min(0.02, (speed * mass) / 40000));

    // The pixels it is touching move first -- a shock ring, not the whole wall.
    // Three rings of attenuation is what a plate a few pixels thick actually
    // transmits before damping takes the rest.
    this.pushId += 1;
    this.nPushStamp[nodeIndex] = this.pushId;
    let frontier: number[] = [nodeIndex];
    let amount = step;
    for (let ring = 0; ring < 3 && frontier.length > 0; ring += 1) {
      // The first ring is what the round is actually touching: it takes most of
      // the push. Further rings are the elastic carry into the plate.
      amount *= ring === 0 ? 0.8 : 0.55;
      const next: number[] = [];
      for (const index of frontier) {
        for (let k = this.linkStart[index]!; k < this.linkStart[index + 1]!; k += 1) {
          const other = this.linkTo[k]!;
          if (this.nPushStamp[other] === this.pushId) continue;
          this.nPushStamp[other] = this.pushId;
          if (this.nDetached[other] || this.nPinned[other]) continue;
          this.displace(other, dirX, dirY, amount);
          this.wake(other, WAKE_TIME * (1 - ring * 0.22));
          next.push(other);
        }
      }
      frontier = next;
    }
    this.wake(nodeIndex, WAKE_TIME);
  }

  private displace(index: number, dirX: number, dirY: number, amount: number): void {
    this.nX[index] = this.nX[index]! + dirX * amount;
    this.nY[index] = this.nY[index]! + dirY * amount;
    const dx = this.nX[index]! - this.nRestX[index]!;
    const dy = this.nY[index]! - this.nRestY[index]!;
    const stretch = Math.hypot(dx, dy);
    if (stretch > MAX_PLASTIC) {
      this.nX[index] = this.nRestX[index]! + (dx / stretch) * MAX_PLASTIC;
      this.nY[index] = this.nRestY[index]! + (dy / stretch) * MAX_PLASTIC;
    }
  }

  /** Integrate the awake front: springs, plastic flow, tear, sleep. */
  stepSoftBody(dt: number): void {
    if (this.awake.length === 0) return;
    this.stepId += 1;
    const stepId = this.stepId;
    for (const index of this.awake) {
      if (this.nDetached[index] || this.nAwakeTime[index]! <= 0) continue;
      for (let k = this.linkStart[index]!; k < this.linkStart[index + 1]!; k += 1) {
        if (this.linkBroken[k] || this.linkStep[k] === stepId) continue;
        this.linkStep[k] = stepId;
        this.linkEvals += 1;
        const other = this.linkTo[k]!;
        if (this.nDetached[other]) continue;
        const dx = this.nX[other]! - this.nX[index]!;
        const dy = this.nY[other]! - this.nY[index]!;
        const len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const nx = dx / len;
        const ny = dy / len;
        const strain = (len - this.linkRest[k]!) / this.linkRest[k]!;
        const vrel = (this.nVX[other]! - this.nVX[index]!) * nx + (this.nVY[other]! - this.nVY[index]!) * ny;
        const force = this.linkK[k]! * strain + this.linkDamp[k]! * vrel;
        if (!this.nPinned[index] && this.nAwakeTime[index]! > 0) {
          this.nVX[index] = this.nVX[index]! + (nx * force * dt) / this.nMass[index]!;
          this.nVY[index] = this.nVY[index]! + (ny * force * dt) / this.nMass[index]!;
        }
        if (!this.nPinned[other] && this.nAwakeTime[other]! > 0) {
          this.nVX[other] = this.nVX[other]! - (nx * force * dt) / this.nMass[other]!;
          this.nVY[other] = this.nVY[other]! - (ny * force * dt) / this.nMass[other]!;
        }
        // Plastic flow: past yield the rest length follows the stretch, so the
        // dent stays after the springs unload.
        const excess = Math.abs(strain) - this.linkYield[k]!;
        if (excess > 0) {
          this.linkRest[k] = this.linkRest[k]! + (len - this.linkRest[k]!) * Math.min(0.5, excess * 6) * this.linkCreep[k]!;
          this.linkRest[k] = Math.max(this.linkRest0[k]! * 0.7, Math.min(this.linkRest0[k]! * 1.35, this.linkRest[k]!));
          this.nDamage[index] = Math.min(1, this.nDamage[index]! + excess * dt * 5);
          this.nDamage[other] = Math.min(1, this.nDamage[other]! + excess * dt * 5);
          // Yielding wakes the next ring: the bend travels through the plate
          // instead of stopping at the pixels the round happened to touch.
          this.wake(index, WAKE_TIME * 0.5);
          this.wake(other, WAKE_TIME * 0.5);
          const tear = Math.abs(strain) - this.linkYield[k]! * 0.7;
          if (tear > 0) this.linkDamage[k] = this.linkDamage[k]! + tear * dt * this.linkTear[k]!;
          if (this.linkDamage[k]! >= 1) this.linkBroken[k] = 1;
        }
      }
    }
    let live = 0;
    const drag = Math.exp(-2.4 * dt);
    for (const index of this.awake) {
      const time = Math.max(0, this.nAwakeTime[index]! - dt);
      this.nAwakeTime[index] = time;
      if (this.nPinned[index] || this.nDetached[index] || time <= 0) continue;
      this.nVX[index] = this.nVX[index]! * drag;
      this.nVY[index] = this.nVY[index]! * drag;
      this.nX[index] = this.nX[index]! + this.nVX[index]! * dt;
      this.nY[index] = this.nY[index]! + this.nVY[index]! * dt;
      const dx = this.nX[index]! - this.nRestX[index]!;
      const dy = this.nY[index]! - this.nRestY[index]!;
      const stretch = Math.sqrt(dx * dx + dy * dy);
      if (stretch > MAX_PLASTIC) {
        this.nX[index] = this.nRestX[index]! + (dx / stretch) * MAX_PLASTIC;
        this.nY[index] = this.nRestY[index]! + (dy / stretch) * MAX_PLASTIC;
        this.nVX[index] = this.nVX[index]! * 0.2;
        this.nVY[index] = this.nVY[index]! * 0.2;
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
    const at = this.index(x, y);
    if (at >= 0 && this.count > 0) {
      const c = at % this.cols;
      const r = (at - c) / this.cols;
      let best = -1;
      let bestDist = Infinity;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          const cc = c + dc;
          const rr = r + dr;
          if (cc < 0 || rr < 0 || cc >= this.cols || rr >= this.rows) continue;
          const index = this.nodeIndexOf(rr * this.cols + cc);
          if (index < 0 || this.nDetached[index]) continue;
          const d = Math.hypot(this.nRestX[index]! - x, this.nRestY[index]! - y);
          if (d < bestDist) { bestDist = d; best = index; }
        }
      }
      if (best >= 0 && bestDist <= 4) {
        const weight = 1 - bestDist / 4;
        return {
          x: (this.nX[best]! - this.nRestX[best]!) * weight,
          y: (this.nY[best]! - this.nRestY[best]!) * weight,
        };
      }
      const baked = this.baked.get(at);
      if (baked) return baked;
    }
    return null;
  }

  /**
   * The curled lip: the torn metal around a hole, folded into the breach.
   *
   * Every surviving pixel on the edge of the hole whose own plastic
   * displacement points into it is a rim cell. Adjacent rim cells are one
   * continuous edge, so they fold into ONE tongue -- emitting a quad per pixel
   * gave a comb of hairs, which is not what a torn plate looks like. The tongue
   * is rooted on the rim, reaches as far as the metal was actually dragged, and
   * sags under its own weight, which is the broad downward flap the footage
   * shows under the entry.
   *
   * Bounded (limit) and deterministic: pixels are walked in raster order and the
   * runs are sorted along the face.
   */
  lipPolygons(dirX: number, dirY: number, limit = 96): Array<Array<{ x: number; y: number }>> {
    const out: Array<Array<{ x: number; y: number }>> = [];
    if (this.count === 0) return out;
    const LIMIT = Math.max(0, limit);
    const norm = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / norm;
    const uy = dirY / norm;
    // Face tangent, and the raster step into the bore.
    const tx = -uy;
    const ty = ux;
    const stepX = Math.abs(ux) >= Math.abs(uy) ? (ux > 0 ? 1 : -1) : 0;
    const stepY = stepX === 0 ? (uy > 0 ? 1 : -1) : 0;
    const cells = this.cells;

    // Rim cells, in face coordinates: `t` along the rim, `a` along the bore.
    const rimT: number[] = [];
    const rimA: number[] = [];
    const rimDX: number[] = [];
    const rimDY: number[] = [];
    for (let i = 0; i < this.count; i += 1) {
      if (this.nDetached[i] || this.nPinned[i]) continue;
      const dx = this.nX[i]! - this.nRestX[i]!;
      const dy = this.nY[i]! - this.nRestY[i]!;
      if (Math.hypot(dx, dy) < 0.2) continue;
      const cell = this.nCell[i]!;
      if (cells[cell] === 0) continue;
      // Only pixels being pushed into a hole make a lip. A pixel pushed toward
      // open air at the outer silhouette is just a dented edge.
      const ahead = cell + stepY * this.cols + stepX;
      if (ahead < 0 || ahead >= cells.length || cells[ahead] !== 0) continue;
      rimT.push(this.nX[i]! * tx + this.nY[i]! * ty);
      rimA.push(this.nX[i]! * ux + this.nY[i]! * uy);
      rimDX.push(dx);
      rimDY.push(dy);
    }
    if (rimT.length === 0) return out;

    // Sort along the face and cut into contiguous runs: a gap in the rim is the
    // end of that fold, not a reason to bridge across solid metal.
    const order = rimT.map((_, i) => i).sort((p, q) => rimT[p]! - rimT[q]!);
    const runs: number[][] = [];
    let run: number[] = [order[0]!];
    for (let i = 1; i < order.length; i += 1) {
      const at = order[i]!;
      if (rimT[at]! - rimT[order[i - 1]!]! > PIXEL * 1.6) {
        runs.push(run);
        run = [];
      }
      run.push(at);
    }
    runs.push(run);

    const toX = (t: number, a: number): number => t * tx + a * ux;
    const toY = (t: number, a: number): number => t * ty + a * uy;
    for (const group of runs) {
      if (out.length >= LIMIT) break;
      let tMin = Infinity;
      let tMax = -Infinity;
      let aSum = 0;
      let dxSum = 0;
      let dySum = 0;
      for (const at of group) {
        tMin = Math.min(tMin, rimT[at]!);
        tMax = Math.max(tMax, rimT[at]!);
        aSum += rimA[at]!;
        dxSum += rimDX[at]!;
        dySum += rimDY[at]!;
      }
      const rootA = aSum / group.length;
      const dragged = Math.hypot(dxSum / group.length, dySum / group.length);
      // The tongue reaches as far as the metal was dragged, capped so a deep
      // bore cannot grow a spike. It is a flap the width of the breach and about
      // as tall again: a nib at the hole's edge reads as a torn pixel, not as a
      // plate that folded.
      const reach = Math.min(18, 5 + dragged * 5);
      // The fold spans the rim it grew from: a hole's whole edge folds, leaving
      // the rest of the breach dark.
      const mid = (tMin + tMax) * 0.5;
      const halfSpan = Math.min(tMax - tMin, PIXEL * 7) * 0.5 + PIXEL;
      // Metal punched by a round petals BACK toward the shooter and sags: it
      // does not keep travelling into the bore, where it would be hidden behind
      // the plate. This is the direction the flap is visible from.
      const foldX = -ux * 0.55;
      const foldY = -uy * 0.55 + 0.85;
      const foldLen = Math.hypot(foldX, foldY) || 1;
      const tipX = foldX / foldLen;
      const tipY = foldY / foldLen;
      const rootX = toX(mid, rootA);
      const rootY = toY(mid, rootA);
      // Tapered tongue: the free end is narrower than the fold line.
      const narrow = halfSpan * 0.55;
      out.push([
        { x: rootX - tx * halfSpan, y: rootY - ty * halfSpan },
        { x: rootX + tx * halfSpan, y: rootY + ty * halfSpan },
        { x: rootX + tx * narrow + tipX * reach, y: rootY + ty * narrow + tipY * reach },
        { x: rootX - tx * narrow + tipX * reach, y: rootY - ty * narrow + tipY * reach },
      ]);
    }
    return out;
  }

  /** Velocity of the detached pixel at a point, for chip debris. */
  detachedVelocityAt(x: number, y: number): { x: number; y: number } | null {
    const at = this.index(x, y);
    if (at < 0) return null;
    const index = this.nodeIndexOf(at);
    if (index < 0 || !this.nDetached[index]) return null;
    return { x: this.nVX[index]!, y: this.nVY[index]! };
  }

  /** Diagnostics for the profile harness and the soft-body checks. */
  softBodyStats(): { nodes: number; links: number; awakePeak: number; pinned: number; moved: number; rigBuilds: number; linkEvals: number; pushCalls: number } {
    let pinned = 0;
    let moved = 0;
    for (let i = 0; i < this.count; i += 1) {
      if (this.nPinned[i]) pinned += 1;
      if (Math.hypot(this.nX[i]! - this.nRestX[i]!, this.nY[i]! - this.nRestY[i]!) > 0.01) moved += 1;
    }
    return {
      nodes: this.count,
      links: this.linkTo.length,
      awakePeak: this.peakAwake,
      pinned,
      moved,
      rigBuilds: this.rigBuilds,
      linkEvals: this.linkEvals,
      pushCalls: this.pushCalls,
    };
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


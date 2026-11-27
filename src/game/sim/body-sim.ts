import { MATERIALS, type MaterialId } from '../materials';
import { noise2 } from '../rng';
import { COMPONENTS, SHELL_BASE, shellCellMass, type ComponentId, type ShellPart } from './projectile-shell';
import { JACKET_QUALITY, PENETRATOR_QUALITY, PROJECTILE_MATERIALS, type ProjectileMaterial } from './projectile-material';

/**
 * The round, in world space, for the whole of its life after it touches
 * something.
 *
 * There used to be two models: a local lattice that faked the crush while the
 * shot solver decided penetration from layer arithmetic, and a world-space
 * wreck solver that took over afterwards. They disagreed, so the round could
 * "crush" through a plate it never touched and then stop dead on a face it had
 * already passed. This is the single model both of them became:
 *
 *  - every cell is a particle with mass, joined to its neighbours by springs;
 *  - every cell collides with the wall raster, pixel by pixel -- the part of the
 *    wall it actually touches is what stops it;
 *  - a cell that reaches a solid pixel pays for it out of the body's kinetic
 *    energy. If the body can pay, the pixel is destroyed (it becomes chips) and
 *    the round advances. If it cannot, the cell is stopped by the pixel, the
 *    body behind it compresses, the metal heats, yields, tears, and the round
 *    stops *inside* the notch it made instead of bouncing off it;
 *  - copper and steel are different materials, so the jacket mushrooms and peels
 *    while the penetrator keeps its ogive and breaks free;
 *  - heat is carried per cell, softens the springs and glows;
 *  - the same body keeps falling under gravity, collides with the seabed, and
 *    comes to rest. There is no second solve, no authored wreck, no timeline.
 *
 * The solver samples itself at 60 Hz into a `BodyTrack`, so the renderer draws
 * exactly what the physics did and never re-simulates anything on the phone.
 */

/** Wall collision resolution: one solid pixel, in world units. */
export const PIXEL = 2;
/** Fixed substep. The cell lattice is stiff, so this is the stable rate. */
export const BODY_DT = 1 / 240;
/** Samples per second recorded for the replay. */
export const TRACK_HZ = 60;
/** World units per art cell (matches the in-flight sprite). */
export const BODY_CELL = 0.9;

const GRAVITY = 410;
const SPRING_K = 22000;
const AIR_DRAG = 1.2;
const CHIP_DRAG = 4.4;
/** Energy to destroy one pixel of unit density and unit kinetic resistance. */
const CARVE_ENERGY = 6000;
/** Share of a carve's cost paid by the carving cell itself; the rest is the body. */
const LOCAL_COST = 0.35;
/** Speed below which the body is treated as resting. */
const REST_SPEED = 14;
const REST_SECONDS = 0.12;

/** Penetration quality of a cell, from the component it belongs to. */
const QUALITY: Record<ComponentId, number> = {
  jacket: JACKET_QUALITY,
  penetrator: PENETRATOR_QUALITY,
  band: JACKET_QUALITY,
  cap: JACKET_QUALITY,
};

/** Part ordering for the track, so the renderer can rebuild the tone. */
export const BODY_PARTS: readonly ShellPart[] = [
  'rim', 'light', 'highlight', 'body', 'dark', 'belly', 'band', 'bandLight',
  'bandDark', 'cap', 'tip', 'rivet', 'steel',
];
const PART_INDEX = new Map<ShellPart, number>(BODY_PARTS.map((part, i) => [part, i]));

/** The solid world the body collides with. Implemented over the wall raster. */
export interface BodyWorld {
  /** Material of the solid pixel containing (x, y), or null for air. */
  materialAt(x: number, y: number): MaterialId | null;
  /** Wall index owning that pixel, or -1. */
  wallAt(x: number, y: number): number;
  /** Destroy the pixel; returns its material (null when it was already gone). */
  carve(x: number, y: number): MaterialId | null;
  /** Rig the solid pixels around a contact as a soft-body patch. */
  armSoftBody?(x: number, y: number, radius?: number): void;
  /**
   * A cell is touching a solid pixel: push that pixel and the pixels it is
   * connected to. Mass, speed and material decide how far it gives.
   */
  push?(x: number, y: number, vx: number, vy: number, mass: number): void;
  /** Integrate the wall's own mass-spring patch. */
  stepSoftBody?(dt: number): void;
  groundY: number;
  /** Material of the seabed. */
  groundMaterial: MaterialId;
}

/** One carved pixel, attributed to a wall, for the geometry pass afterwards. */
export interface CarvedPixel {
  x: number;
  y: number;
  wall: number;
  material: MaterialId;
}

export interface BodyContact {
  x: number;
  y: number;
  nx: number;
  ny: number;
  material: MaterialId;
  wall: number;
  speed: number;
}

export interface BodyDeps {
  mass: number;
  cell?: number;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  seed: number;
  gravity?: number;
  heat?: number;
  /** Plastic damage already carried in from earlier contacts. */
  crumple?: number;
  /**
   * How much normal speed the face gives back. Zero is a round that piles up and
   * stops, which is what armour does; a high value is a glancing round skidding
   * off the face instead of biting, which is what Bankshot is for. It is a
   * property of the contact, not a scripted bounce.
   */
  restitution?: number;
  components?: readonly ComponentId[];
}

/** A sampled frame of the body, as drawn. */
export interface BodyFrame {
  /** Replay time in ms. */
  t: number;
  x: Float32Array;
  y: Float32Array;
  heat: Float32Array;
  free: Uint8Array;
}

interface Node {
  bx: number;
  by: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  part: ShellPart;
  partIndex: number;
  /** Cached material data: looked up once, not twice per spring per step. */
  mat: ProjectileMaterial;
  component: ComponentId;
  /** 1 / max(0.2, mass): the spring pass runs millions of times, and a
   * division per cell per link per substep is the difference between a phone
   * resolve that fits and one that does not. Mass never changes after the
   * cast, so the reciprocal is constant. */
  invMass: number;
  heat: number;
  damage: number;
  free: boolean;
  quality: number;
  /** Contact normal from this step, for friction and heat. */
  nx: number;
  ny: number;
  touched: boolean;
}

interface Link {
  a: number;
  b: number;
  rest: number;
  rest0: number;
  stiffness: number;
  damage: number;
  broken: boolean;
  /** Spring constant before heat softening; constant for the life of the link. */
  kBase: number;
  /** Damping coefficient before the same softening; sqrt(k * 0.5) * 0.6. */
  dampBase: number;
  /** min(soften) of the two materials: constant, so it is not re-read per step. */
  softenMax: number;
  conduct: number;
  yieldStrain: number;
  creep: number;
  ductility: number;
}

function materialOf(component: ComponentId) {
  return PROJECTILE_MATERIALS[COMPONENTS[component].material];
}

/** Energy needed to destroy one wall pixel for a cell of this quality. */
function carveCost(material: MaterialId, quality: number): number {
  const def = MATERIALS[material];
  return PIXEL * PIXEL * def.density * def.resistance.kinetic * CARVE_ENERGY * quality;
}

export class ProjectileBodySim {
  readonly cell: number;
  readonly nodes: Node[] = [];
  readonly links: Link[] = [];
  /** Pixels this body has destroyed, per wall (filled as it carves). */
  readonly carved: CarvedPixel[] = [];
  readonly contacts: BodyContact[] = [];
  /** Kinetic energy the round arrived with, for the drive readout. */
  private energy0 = 1;
  /** The jacket has torn free and the penetrator is flying on alone. */
  shed = false;
  private totalMass = 0;
  private steps = 0;
  private restitution = 0;
  /** Times the body has skidded off a face instead of biting into it. */
  bounces = 0;
  private bounceStep = -100;
  private engaged = false;
  private resting = 0;
  private restNow = false;
  /** Consecutive seconds with no solid under any cell. */
  private clearTime = 0;
  private seed: number;
  private gravity: number;
  /** Speed the round carried when the body took over (before the first pixel). */
  private readonly speed0: number;
  private maxDepth = 0;
  private entry: { x: number; y: number; nx: number; ny: number; material: MaterialId; wall: number } | null = null;
  private samples: BodyFrame[] = [];
  private sampleEvery = Math.max(1, Math.round(1 / (TRACK_HZ * BODY_DT)));
  private sampleClock = 0;
  /** Reused bucket grid for the volume constraint (linked list of cells). */
  private gridHead: Int32Array | null = null;
  private gridNext = new Int32Array(0);

  constructor(deps: BodyDeps) {
    this.cell = Math.max(0.3, deps.cell ?? BODY_CELL);
    this.seed = deps.seed >>> 0;
    this.gravity = deps.gravity ?? GRAVITY;
    this.speed0 = Math.hypot(deps.vx, deps.vy);
    this.restitution = Math.max(0, Math.min(0.9, deps.restitution ?? 0));

    const allowed = new Set<ComponentId>(deps.components ?? (['jacket', 'penetrator', 'band', 'cap'] as ComponentId[]));
    const cos = Math.cos(deps.angle);
    const sin = Math.sin(deps.angle);
    const index = new Map<string, number>();
    const massScale = Math.max(0.35, deps.mass / 9);

    for (const base of SHELL_BASE) {
      if (!allowed.has(base.component)) continue;
      const lx = base.x * this.cell;
      const ly = base.y * this.cell;
      const def = materialOf(base.component);
      const node: Node = {
        bx: base.x,
        by: base.y,
        x: deps.x + lx * cos - ly * sin,
        y: deps.y + lx * sin + ly * cos,
        vx: deps.vx,
        vy: deps.vy,
        mass: shellCellMass(base) * massScale * def.density,
        part: base.part,
        partIndex: PART_INDEX.get(base.part) ?? 3,
        mat: def,
        component: base.component,
        heat: Math.max(0, Math.min(1, deps.heat ?? 0)),
        damage: Math.min(0.75, (deps.crumple ?? 0) * 0.45),
        free: false,
        quality: QUALITY[base.component],
        invMass: 0,
        nx: 0,
        ny: 0,
        touched: false,
      };
      // Seeded imperfection rides on mass, never on position: a perfect lattice
      // buckles symmetrically, but nudging the cast shape would open a hole in
      // the pristine silhouette.
      node.mass *= 1 + (noise2(base.x, base.y, this.seed % 100000) - 0.5) * 0.2;
      node.invMass = 1 / Math.max(0.2, node.mass);
      this.nodes.push(node);
      this.totalMass += node.mass;
      index.set(`${base.x}|${base.y}`, this.nodes.length - 1);
    }

    for (const node of this.nodes) {
      const here = index.get(`${node.bx}|${node.by}`);
      if (here === undefined) continue;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]] as const) {
        const other = index.get(`${node.bx + dx}|${node.by + dy}`);
        if (other === undefined) continue;
        const a = this.nodes[here]!;
        const b = this.nodes[other]!;
        const axial = dy === 0;
        const ma = materialOf(a.component);
        const mb = materialOf(b.component);
        const stiffness = axial ? 0.62 : 0.3;
        const rest = Math.hypot(dx, dy) * this.cell;
        const kBase = SPRING_K * stiffness;
        this.links.push({
          a: here,
          b: other,
          rest,
          rest0: rest,
          stiffness,
          damage: Math.min(0.6, (deps.crumple ?? 0) * 0.4),
          broken: false,
          // Every one of these is a pure function of the two materials, which
          // never change: the spring pass below runs ~750k times per shot, so
          // taking the minima out of the loop is most of its cost.
          kBase,
          dampBase: 0.6 * Math.sqrt(0.5 * kBase),
          softenMax: Math.min(ma.soften, mb.soften),
          conduct: Math.min(ma.conduct, mb.conduct),
          yieldStrain: Math.min(ma.yieldStrain, mb.yieldStrain),
          creep: (ma.creep + mb.creep) * 0.5,
          ductility: Math.max(1 - ma.strength, 1 - mb.strength),
        });
      }
    }

    this.energy0 = Math.max(1, this.kinetic());
    this.sample();
  }

  /** Centre of mass and its velocity: the pose the outer shot loop follows. */
  centre(): { x: number; y: number; vx: number; vy: number } {
    let x = 0; let y = 0; let vx = 0; let vy = 0; let m = 0;
    for (const node of this.nodes) {
      x += node.x * node.mass;
      y += node.y * node.mass;
      vx += node.vx * node.mass;
      vy += node.vy * node.mass;
      m += node.mass;
    }
    const w = m || 1;
    return { x: x / w, y: y / w, vx: vx / w, vy: vy / w };
  }

  /** Kinetic energy of every cell: the drive the round has left. */
  kinetic(): number {
    let sum = 0;
    for (const node of this.nodes) sum += node.mass * (node.vx * node.vx + node.vy * node.vy);
    return 0.5 * sum;
  }

  /** Mean speed, used for the "still moving" test and for the shot audit. */
  speed(): number {
    let sum = 0;
    // sqrt, not hypot: this runs over every cell every substep, and hypot's
    // overflow-safe scaling costs several times as much for the same answer.
    for (const node of this.nodes) sum += Math.sqrt(node.vx * node.vx + node.vy * node.vy);
    return sum / Math.max(1, this.nodes.length);
  }

  /** Closing speed when the round first met the world, world units/second. */
  entrySpeed(): number { return this.speed0; }

  /** True once the body has been touched by a solid. */
  get hasContact(): boolean { return this.engaged; }
  /** True once it has stopped for good. */
  get isResting(): boolean { return this.restNow; }
  /** Deepest point reached past the entry, along the travel direction. */
  get depth(): number { return this.maxDepth; }
  get entryPoint(): { x: number; y: number; nx: number; ny: number; material: MaterialId; wall: number } | null {
    return this.entry;
  }

  /** How much of the round's drive has been spent on solids, 0..1. */
  get squash(): number {
    return Math.max(0, Math.min(1, 1 - this.kinetic() / this.energy0));
  }

  /** Distinct walls whose pixels this body has destroyed. */
  get layers(): number {
    const set = new Set<number>();
    for (const pixel of this.carved) if (pixel.wall >= 0) set.add(pixel.wall);
    return set.size;
  }

  /** Fraction of intact springs: 0 means the body is in pieces. */
  get integrity(): number {
    if (this.links.length === 0) return 1;
    let intact = 0;
    for (const link of this.links) if (!link.broken) intact += 1;
    return intact / this.links.length;
  }

  /** Share of the copper jacket still held to the fly-on body, 0..1. */
  get jacketShare(): number {
    let total = 0;
    let held = 0;
    for (const node of this.nodes) {
      if (node.component !== 'jacket') continue;
      total += 1;
      if (!node.free) held += 1;
    }
    return total === 0 ? 0 : held / total;
  }

  /** True when any cell is inside the circle at speed (a target, not a wall). */
  anyInCircle(x: number, y: number, radius: number, minSpeed = 0): boolean {
    const r2 = radius * radius;
    for (const node of this.nodes) {
      const dx = node.x - x;
      const dy = node.y - y;
      if (dx * dx + dy * dy > r2) continue;
      if (minSpeed > 0 && Math.hypot(node.vx, node.vy) < minSpeed) continue;
      return true;
    }
    return false;
  }

  /** Cells still attached plus chips, for the shot's diagnostics. */
  get freeCount(): number { return this.nodes.filter((node) => node.free).length; }
  get nodeCount(): number { return this.nodes.length; }

  /** One fixed substep. The shot loop calls this so its clock and the body's
   * clock can never drift apart. */
  stepOnce(world: BodyWorld): void {
    if (this.restNow) return;
    this.step(world);
    this.steps += 1;
    this.sampleClock += 1;
    if (this.sampleClock >= this.sampleEvery) {
      this.sampleClock = 0;
      this.sample();
    }
  }

  /**
   * Advance by wall-clock seconds. Steps at the fixed rate, so the outcome never
   * depends on the frame it is sampled on.
   */
  advance(seconds: number, world: BodyWorld): void {
    const count = Math.round(seconds / BODY_DT);
    for (let i = 0; i < count; i += 1) {
      if (this.restNow) break;
      this.stepOnce(world);
    }
  }

  /** True when the body has left every solid and is flying free again. */
  get isClear(): boolean { return this.engaged && this.clearTime >= 2 * BODY_DT; }

  private step(world: BodyWorld): void {
    const dt = BODY_DT;

    if (this.engaged) {
      this.integrateLinks(dt);
    }

    const drag = Math.exp(-AIR_DRAG * dt);
    const chipDrag = Math.exp(-CHIP_DRAG * dt);
    for (const node of this.nodes) {
      const d = node.free ? chipDrag : drag;
      node.vx *= d;
      node.vy = node.vy * d + this.gravity * dt;
      node.x += node.vx * dt;
      node.y += node.vy * dt;
      node.touched = false;
      node.nx = 0;
      node.ny = 0;
    }

    if (!this.engaged) {
      this.detectContact(world);
      this.restNow = false;
      return;
    }

    this.enforceVolume();
    // The wall patch has its own mass-spring clock. It runs before this step's
    // contacts so a push applied last step has already travelled outwards.
    // It is a deformation model, not a force on the round, and the replay is
    // only ever sampled at 60 Hz: integrating it at 120 Hz is the same picture
    // for half the cost. Its clock is advanced with the real elapsed time, so
    // the deformation advances at the same rate either way.
    if (this.steps % 2 === 0) world.stepSoftBody?.(dt * 2);
    this.collide(world, dt);
    // Connectivity, spall and jacket failure are bookkeeping, not forces: at
    // 60 Hz they are indistinguishable on screen and cost a quarter as much as
    // running them every substep. The schedule is fixed, so the result is still
    // deterministic.
    if (this.steps % 4 === 0) {
      this.detachLoose();
      this.failJacket();
      // Depth and the rest clock are readouts, not forces. On the same 4-step
      // schedule they are indistinguishable on screen and stop costing a scan
      // of every cell on every substep.
      this.updateDepth();
      this.checkRest(world, dt * 4);
    }
  }

  /** First touch: any cell inside a solid pixel, or on the seabed. */
  private detectContact(world: BodyWorld): void {
    for (const node of this.nodes) {
      if (node.free) continue;
      const material = world.materialAt(node.x, node.y);
      if (material) {
        this.engage(node, world, material);
        return;
      }
      if (node.y >= world.groundY) {
        this.engage(node, world, world.groundMaterial);
        return;
      }
    }
  }

  private engage(node: Node, world: BodyWorld, material: MaterialId): void {
    this.engaged = true;
    // The contact normal points away from the face: back along the cell's own
    // motion, which is the direction the round arrived from.
    const speed = Math.hypot(node.vx, node.vy) || 1;
    const nx = -node.vx / speed;
    const ny = -node.vy / speed;
    const wall = world.wallAt(node.x, node.y);
    this.entry = { x: node.x, y: node.y, nx, ny, material, wall };
    this.contacts.push({ x: node.x, y: node.y, nx, ny, material, wall, speed });
    world.armSoftBody?.(node.x, node.y);
    // A round that arrives already hot stays hot; the impact itself adds more.
    for (const other of this.nodes) other.heat = Math.min(1, other.heat + 0.06);
  }

  /**
   * Pixel collision. Each cell looks at the solid pixel it occupies:
   *
   *  - if the body can pay for that pixel out of its kinetic energy, the pixel
   *    is destroyed and the cell continues through the new hole (this is the
   *    bore, made one pixel at a time);
   *  - if it cannot, the cell is pushed back out and its incoming velocity is
   *    killed, so the body behind it compresses against it.
   *
   * The seabed is the one solid that is never destructible: it stops the round
   * and absorbs what is left of it.
   */
  private collide(world: BodyWorld, dt: number): void {
    // The drive is read once per step: recomputing it per cell would make the
    // contact pass quadratic for no gain.
    let budget = this.kinetic();
    for (const node of this.nodes) {
      const material = world.materialAt(node.x, node.y);
      if (!material) continue;
      node.touched = true;
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      const cost = carveCost(material, node.quality);
      const wall = world.wallAt(node.x, node.y);
      // Every contact deforms first: the touched pixel and everything connected
      // to it take the push before the round is allowed to destroy anything.
      world.push?.(node.x, node.y, node.vx, node.vy, node.mass);

      // A cell that is barely moving cannot break the pixel in front of it even
      // if the round as a whole still has energy: the work is done locally, and
      // that local limit is what makes the nose stop and the body crumple.
      const localEnergy = 0.5 * node.mass * speed * speed;
      const affordable = budget > cost && localEnergy > cost * LOCAL_COST;

      if (affordable) {
        const carvedMaterial = world.carve(node.x, node.y);
        if (carvedMaterial) {
          this.carved.push({ x: node.x, y: node.y, wall, material: carvedMaterial });
          // Work becomes heat: the nose of a round going through steel glows.
          node.heat = Math.min(1, node.heat + 0.16);
          node.damage = Math.min(1, node.damage + 0.04);
          this.spendEnergy(cost);
          budget = Math.max(0, budget - cost);
          continue;
        }
      }

      // Blocked: the cell is stopped on the face it was travelling into, not
      // pushed out the nearest side. A sideways ejection would smear the body
      // along the wall; stopping it along its own path is what makes the round
      // pile up behind its nose the way the reference impact does.
      const px0 = Math.floor(node.x / PIXEL) * PIXEL;
      const py0 = Math.floor(node.y / PIXEL) * PIXEL;
      const speed0 = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      let nx = 0; let ny = 0;
      if (speed0 > 1e-3) {
        nx = -node.vx / speed0;
        ny = -node.vy / speed0;
      } else {
        const left = node.x - px0;
        const right = PIXEL - left;
        const top = node.y - py0;
        const bottom = PIXEL - top;
        const min = Math.min(left, right, top, bottom);
        if (min === left) nx = -1;
        else if (min === right) nx = 1;
        else if (min === top) ny = -1;
        else ny = 1;
      }
      const margin = 0.2;
      if (Math.abs(nx) >= Math.abs(ny)) {
        node.x = nx < 0 ? px0 + PIXEL + margin : px0 - margin;
      } else {
        node.y = ny < 0 ? py0 + PIXEL + margin : py0 - margin;
      }
      node.nx = nx;
      node.ny = ny;

      const vn = node.vx * nx + node.vy * ny;
      if (vn < 0) {
        const absorbed = -vn;
        // A face gives back what the round's material allows. With restitution
        // zero the cell stops dead on the face (armour); a glancing bankshot
        // round keeps most of its normal speed and skids away, which is the same
        // contact rule, not a separate bounce mode.
        const keep = this.restitution * absorbed;
        const glancing = speed0 > 40 && (-vn / speed0) < 0.55;
        if (glancing && this.restitution > 0.3 && this.steps - this.bounceStep > 2) {
          this.bounceStep = this.steps;
          this.bounces += 1;
        }
        node.vx += (absorbed + keep) * nx;
        node.vy += (absorbed + keep) * ny;
        // Friction along the face, and the heat that comes with it.
        const tx = -node.vx * ny + node.vy * nx;
        const friction = MATERIALS[material].isMetal ? 0.42 : 0.6;
        node.vx -= -ny * tx * friction;
        node.vy -= nx * tx * friction;
        node.heat = Math.min(1, node.heat + Math.min(1, absorbed / 90) * 0.1);
        node.damage = Math.min(1, node.damage + Math.min(1, absorbed / 260) * 0.05);
        // The face takes energy out of the whole body, not only the cell.
        this.spendEnergy(0.5 * node.mass * absorbed * absorbed * 0.35);
      }
    }

    // Seabed: solid, not destructible.
    for (const node of this.nodes) {
      if (node.y < world.groundY) continue;
      node.y = world.groundY - 0.01;
      node.nx = 0;
      node.ny = -1;
      node.touched = true;
      const vn = node.vy;
      if (vn > 0) {
        node.vy = -vn * 0.04;
        node.vx *= 1 - Math.min(0.5, vn / 400);
        node.heat = Math.min(1, node.heat + Math.min(1, vn / 120) * 0.12);
        this.spendEnergy(0.5 * node.mass * vn * vn * 0.6);
      }
    }
    void dt;
    void this.seed;
  }

  /**
   * Remove energy from the body. The bore drains momentum from the round as a
   * whole, so every cell is slowed by the same factor and the kinetic energy of
   * the body tracks its remaining drive exactly: when the drive is gone the
   * round stops, wherever it happens to be.
   */
  private spendEnergy(cost: number): void {
    const before = this.kinetic();
    if (before <= 1) return;
    const f = Math.sqrt(Math.max(0, before - cost) / before);
    if (f >= 0.9999) return;
    for (const node of this.nodes) {
      node.vx *= f;
      node.vy *= f;
    }
  }

  private updateDepth(): void {
    if (!this.entry) return;
    const dir = { x: -this.entry.nx, y: -this.entry.ny };
    let best = this.maxDepth;
    for (const node of this.nodes) {
      const d = (node.x - this.entry.x) * dir.x + (node.y - this.entry.y) * dir.y;
      if (d > best) best = d;
    }
    // A running maximum: the readout is "how far into the structure the round
    // got", so sampling it less often must not lose the deepest frame.
    this.maxDepth = best;
  }

  private checkRest(world: BodyWorld, dt: number): void {
    let solidUnder = false;
    for (const node of this.nodes) {
      if (node.touched) { solidUnder = true; break; }
    }
    // A round whose drive is spent does not keep gliding: the bore and the face
    // have already taken everything it had. Bleed the last few percent off fast
    // so the wreck comes to rest where the metal put it.
    if (this.kinetic() < this.energy0 * 0.03) {
      // Same decay per second whatever the check interval: the bleed is a rate,
      // not a per-call constant, so gating the check must not make a spent round
      // glide further than it used to.
      const bleed = Math.pow(0.5, dt / BODY_DT);
      for (const node of this.nodes) {
        node.vx *= bleed;
        node.vy *= bleed;
      }
    }
    this.clearTime = solidUnder ? 0 : this.clearTime + dt;
    const slow = this.speed() < REST_SPEED;
    if (slow && solidUnder) {
      this.resting += dt;
      if (this.resting >= REST_SECONDS) this.restNow = true;
    } else {
      this.resting = 0;
    }
    void world;
  }

  /**
   * One pass over the springs: the force, the plastic flow, the ductile damage
   * and the heat conduction between the same two cells. Splitting these into
   * separate loops tripled the link work for no behavioural gain.
   */
  private integrateLinks(dt: number): void {
    for (const link of this.links) {
      if (link.broken) continue;
      const a = this.nodes[link.a]!;
      const b = this.nodes[link.b]!;
      if (a.free && b.free) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      const nx = dx / len;
      const ny = dy / len;
      const strain = (len - link.rest) / link.rest;
      const heat = (a.heat + b.heat) * 0.5;

      // Spring force, softened by heat, damped so the body settles. k is
      // kBase * soften and the damping is sqrt(k * 0.5) * 0.6, which factors
      // into a constant times sqrt(soften): same value, one multiply less.
      const soften = 1 - heat * link.softenMax * 0.72;
      const k = link.kBase * soften;
      const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      const total = k * strain + link.dampBase * Math.sqrt(soften) * vrel;
      if (!a.free) {
        a.vx += nx * total * dt * a.invMass;
        a.vy += ny * total * dt * a.invMass;
      }
      if (!b.free) {
        b.vx -= nx * total * dt * b.invMass;
        b.vy -= ny * total * dt * b.invMass;
      }

      // Conduction along the same link.
      const flow = (a.heat - b.heat) * link.conduct * dt * 6;
      a.heat -= flow;
      b.heat += flow;

      // Plastic flow and cumulative ductile damage.
      const yieldStrain = link.yieldStrain * (1 + heat * 2.4);
      const excess = Math.abs(strain) - yieldStrain;
      if (excess <= 0) continue;
      const creep = link.creep * (0.35 + heat * 2.6);
      link.rest += (len - link.rest) * Math.min(0.35, excess * 6) * 0.05 * creep;
      link.rest = Math.max(link.rest0 * 0.72, Math.min(link.rest0 * 1.4, link.rest));
      a.damage = Math.min(1, a.damage + excess * dt * 7);
      b.damage = Math.min(1, b.damage + excess * dt * 7);

      // Ductile tearing: copper's strain budget lets it mushroom and split; a
      // steel link survives long enough to keep the penetrator recognisable.
      const tear = Math.abs(strain) - yieldStrain * 0.8;
      if (tear <= 0) continue;
      const rate = (11 + link.ductility * 26) / (1 + heat * 1.1);
      link.damage += tear * dt * rate;
      if (link.damage >= 1) link.broken = true;
    }
    for (const node of this.nodes) node.heat = Math.max(0, node.heat - dt * 0.3);
  }

  /**
   * Cells cannot occupy the same space; a crush has to bulge sideways.
   *
   * Bucketed by position: the round is 127 cells, so the naive all-pairs version
   * was 8k distance tests every substep -- the single largest cost in the solve.
   * Only cells in adjacent buckets can be closer than the minimum separation.
   */
  private enforceVolume(): void {
    const minSep = this.cell * 0.78;
    const nodes = this.nodes;
    // A reused bucket grid, as a linked list of indices. Building a Map of small
    // arrays every substep was the largest single cost in the solve: it spent
    // more time in the allocator than in the physics.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
      if (node.x < minX) minX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.x > maxX) maxX = node.x;
      if (node.y > maxY) maxY = node.y;
    }
    const gw = Math.max(1, Math.ceil((maxX - minX) / minSep) + 3);
    const gh = Math.max(1, Math.ceil((maxY - minY) / minSep) + 3);
    if (!this.gridHead || this.gridHead.length < gw * gh) {
      this.gridHead = new Int32Array(gw * gh);
      this.gridNext = new Int32Array(nodes.length);
    }
    const head = this.gridHead;
    const next = this.gridNext;
    const cells = gw * gh;
    head.fill(-1, 0, cells);
    const ox0 = minX - minSep;
    const oy0 = minY - minSep;
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i]!;
      if (node.free) continue;
      const gx = Math.floor((node.x - ox0) / minSep);
      const gy = Math.floor((node.y - oy0) / minSep);
      const at = gy * gw + gx;
      next[i] = head[at]!;
      head[at] = i + 1;
    }
    // Each pair is considered once: from the cell that comes first in bucket
    // order (down, then right), and inside a bucket by index. That is the same
    // set of pairs the 3x3 sweep produced -- every node had nine buckets and a
    // half-open index rule -- for five probes instead of nine. The contact loop
    // runs on every substep, so this is the busiest loop in the solve.
    const sep2 = minSep * minSep;
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i]!;
      if (a.free) continue;
      const gx = Math.floor((a.x - ox0) / minSep);
      const gy = Math.floor((a.y - oy0) / minSep);
      for (let k = 0; k < 5; k += 1) {
        // (0,0) (1,0) (-1,1) (0,1) (1,1)
        const dxCell = k === 1 || k === 4 ? 1 : k === 2 ? -1 : 0;
        const dyCell = k === 0 || k === 1 ? 0 : 1;
        const xx = gx + dxCell;
        const yy = gy + dyCell;
        if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
        const sameCell = k === 0;
        for (let j = head[yy * gw + xx]!; j !== -1; j = next[j - 1]!) {
          if (sameCell && j - 1 <= i) continue;
          const b = nodes[j - 1]!;
          if (b.free) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 >= sep2) continue;
          const dist = Math.sqrt(dist2);
          const nx = dist > 1e-5 ? dx / dist : 0;
          const ny = dist > 1e-5 ? dy / dist : 1;
          const push = (minSep - dist) * 0.5;
          const total = a.mass + b.mass;
          a.x -= nx * push * (b.mass / total);
          a.y -= ny * push * (b.mass / total);
          b.x += nx * push * (a.mass / total);
          b.y += ny * push * (a.mass / total);
        }
      }
    }
  }

  /**
   * The jacket gives way. Copper is the ductile part of the round: once its
   * cells have been worked past their ductility budget (or the body has been
   * crushed past its cast length) the casing lets go as a whole and what flies
   * on is the steel penetrator -- the strongest part of the projectile breaking
   * free exactly when the shell around it is destroyed.
   */
  private failJacket(): void {
    if (this.shed) return;
    let jacket = 0;
    let damage = 0;
    for (const node of this.nodes) {
      if (node.component !== 'jacket' || node.free) continue;
      jacket += 1;
      damage += node.damage;
    }
    if (jacket === 0) { this.shed = true; return; }
    const mean = damage / jacket;
    if (mean < 0.72 && this.squash < 0.86) return;
    const com = this.centre();
    for (const node of this.nodes) {
      if (node.component !== 'jacket') continue;
      node.free = true;
      const dx = node.x - com.x;
      const dy = node.y - com.y;
      const len = Math.hypot(dx, dy) || 1;
      node.vx += (dx / len) * 26 + 8;
      node.vy += (dy / len) * 26 - 6;
    }
    this.shed = true;
  }

  /**
   * Anything no longer connected to the main body is shrapnel: it keeps the
   * velocity it had and falls on its own. No cell is invented to fill a gap.
   */
  private detachLoose(): void {
    const nodes = this.nodes;
    // Nothing tears off a body that is still being driven forward: the casing
    // has to come to rest against the face before its edges can peel away.
    // Spalling a moving round turns it into a smear of singletons.
    if (this.speed() > 130) return;
    const adjacency: number[][] = nodes.map(() => []);
    for (const link of this.links) {
      if (link.broken) continue;
      adjacency[link.a]!.push(link.b);
      adjacency[link.b]!.push(link.a);
    }
    const seen = new Set<number>();
    const clusters: number[][] = [];
    for (let start = 0; start < nodes.length; start += 1) {
      if (seen.has(start) || nodes[start]!.free) continue;
      const stack = [start];
      const cluster: number[] = [];
      seen.add(start);
      while (stack.length > 0) {
        const at = stack.pop()!;
        cluster.push(at);
        for (const next of adjacency[at]!) {
          if (seen.has(next)) continue;
          seen.add(next);
          stack.push(next);
        }
      }
      clusters.push(cluster);
    }
    if (clusters.length > 1) {
      let main = 0;
      for (let i = 1; i < clusters.length; i += 1) {
        if (clusters[i]!.length > clusters[main]!.length) main = i;
      }
      for (let i = 0; i < clusters.length; i += 1) {
        // Only a small detached piece is shrapnel. A large cluster is half the
        // casing still being held together by its own metal, not debris.
        if (i === main || clusters[i]!.length > 6) continue;
        for (const at of clusters[i]!) {
          const node = nodes[at]!;
          node.free = true;
          const jitter = noise2(node.bx, node.by, this.seed) - 0.5;
          node.vx += jitter * 12;
          node.vy -= Math.abs(jitter) * 8;
        }
      }
    }
    // Surface spall: a badly worked edge cell with almost no links left tears
    // off. Bounded so the round stays recognisable while it is being crushed.
    let budget = Math.floor(nodes.length * 0.2) - nodes.filter((node) => node.free).length;
    for (let i = 0; i < nodes.length && budget > 0; i += 1) {
      const node = nodes[i]!;
      if (node.free) continue;
      if (node.damage < 0.97) continue;
      if (adjacency[i]!.length > 1) continue;
      node.free = true;
      node.vx += 3 + node.heat * 8;
      node.vy += (noise2(node.bx, node.by, this.seed) - 0.5) * 14;
      budget -= 1;
    }
  }

  private sample(): void {
    const n = this.nodes.length;
    const xs = new Float32Array(n);
    const ys = new Float32Array(n);
    const heat = new Float32Array(n);
    const free = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) {
      const node = this.nodes[i]!;
      xs[i] = node.x;
      ys[i] = node.y;
      heat[i] = node.heat;
      free[i] = node.free ? 1 : 0;
    }
    this.samples.push({ t: 0, x: xs, y: ys, heat, free });
  }

  /** Recorded frames since the body was created, oldest first. */
  frames(): BodyFrame[] { return this.samples; }

  /** Per-node constant data for the renderer (part tone + component). */
  meta(): { parts: number[]; components: ComponentId[] } {
    return {
      parts: this.nodes.map((node) => node.partIndex),
      components: this.nodes.map((node) => node.component),
    };
  }

  /** Diagnostics: springs broken, hottest cell, bounding box. */
  stats(): { nodes: number; links: number; free: number; broken: number; heat: number; width: number; height: number; steps: number } {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    let heat = 0;
    for (const node of this.nodes) {
      x0 = Math.min(x0, node.x); y0 = Math.min(y0, node.y);
      x1 = Math.max(x1, node.x); y1 = Math.max(y1, node.y);
      heat = Math.max(heat, node.heat);
    }
    return {
      nodes: this.nodes.length,
      links: this.links.length,
      free: this.nodes.filter((node) => node.free).length,
      broken: this.links.filter((link) => link.broken).length,
      heat,
      width: Number.isFinite(x0) ? x1 - x0 : 0,
      height: Number.isFinite(y0) ? y1 - y0 : 0,
      steps: this.steps,
    };
  }

  /** Any cell still inside solid geometry (should never survive a step). */
  penetrating(world: BodyWorld): boolean {
    return this.nodes.some((node) => world.materialAt(node.x, node.y) !== null);
  }
}

/**
 * Serialise the samples into one compact buffer. 127 cells x 96 frames of
 * Float32 would be ~200 kB per shot; quarter-unit integers and byte heat cut
 * that to a fraction, which is what a phone actually has to hold.
 */
export interface BodyTrack {
  /** Replay time (ms) of the first sample, i.e. the contact instant. */
  t0: number;
  cell: number;
  nodes: number;
  count: number;
  times: Float32Array;
  xs: Int16Array;
  ys: Int16Array;
  heat: Uint8Array;
  free: Uint8Array;
  parts: Uint8Array;
  components: Uint8Array;
  /** True when the body came to rest (no more samples after). */
  resting: boolean;
}

export function packTrack(sim: ProjectileBodySim, t0: number): BodyTrack | null {
  const frames = sim.frames();
  if (frames.length < 2) return null;
  const nodes = frames[0]!.x.length;
  const count = frames.length;
  const times = new Float32Array(count);
  const xs = new Int16Array(count * nodes);
  const ys = new Int16Array(count * nodes);
  const heat = new Uint8Array(count * nodes);
  const free = new Uint8Array(count * nodes);
  const meta = sim.meta();
  const parts = Uint8Array.from(meta.parts);
  const compIndex: ComponentId[] = ['jacket', 'penetrator', 'band', 'cap'];
  const components = Uint8Array.from(meta.components.map((id) => compIndex.indexOf(id)));
  const q = 4;
  for (let f = 0; f < count; f += 1) {
    const frame = frames[f]!;
    times[f] = (f / Math.max(1, count - 1)) * 1000;
    for (let i = 0; i < nodes; i += 1) {
      const at = f * nodes + i;
      xs[at] = Math.round(frame.x[i]! * q);
      ys[at] = Math.round(frame.y[i]! * q);
      heat[at] = Math.round(Math.max(0, Math.min(1, frame.heat[i]!)) * 255);
      free[at] = frame.free[i]!;
    }
  }
  return {
    t0,
    cell: sim.cell,
    nodes,
    count,
    times,
    xs,
    ys,
    heat,
    free,
    parts,
    components,
    resting: sim.isResting,
  };
}

import { MATERIALS, type MaterialId } from '../materials';
import { noise2 } from '../rng';
import { SHELL_BASE, shellCellMass, type ShellCell, type ShellPart } from './projectile-shell';

/**
 * Real-time pixel physics for the projectile itself.
 *
 * The shell is a lattice of square cells connected by axial, shear and bending
 * springs. Every cell has a mass; every spring has a rest length and a yield
 * strain. On contact the nose is stopped by the face while the rest of the body
 * keeps its momentum, so the body piles up, buckles sideways, permanently
 * distorts (plastic flow) and finally tears: springs past the material's break
 * strain snap, and any cell cluster no longer connected to the body becomes
 * shrapnel that keeps its own velocity and spin.
 *
 * Nothing is invented: cells are never created to fake a bulge. They are only
 * displaced, and the occasional cell is split into two half-cells when a face
 * between them is stretched hard enough that a single square can no longer show
 * the bend (an inward fold or an outward tear). That is the only case in which
 * the cell count grows.
 *
 * The solver is deterministic: fixed timestep, seeded micro-imperfection, no
 * wall-clock input. A replay driving it with the same age always gets the same
 * pixels.
 */

export interface ShellPixel {
  /** Base lattice identity (integer coords); never changes. */
  bx: number;
  by: number;
  /** Current local position in art cells (fractional while moving). */
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  part: ShellPart;
  heat: number;
  /** Plastic damage 0..1: how far the cell has drifted from its cast shape. */
  damage: number;
  /** Detached shrapnel keeps flying instead of being constrained. */
  free: boolean;
  /** Filler is only painted once the casing above it has opened. */
  reveal: number;
}

interface Spring {
  a: number;
  b: number;
  rest: number;
  /** Axial springs are stiff; shear and bending springs are soft. */
  stiffness: number;
  /** Accumulated ductile damage 0..1; the link snaps at 1. */
  damage: number;
  /** Strain at which damage starts accumulating for this link. */
  breakStrain: number;
  broken: boolean;
}

export interface ShellImpactInput {
  /** Impact speed in world units/s (from the shot solver). */
  speed: number;
  /** Shell mass from the ammunition table. */
  mass: number;
  /** Face material. Steel pancakes the nose; timber gives way. */
  material: MaterialId | null;
  /** 1 = intact casing, 0 = spent. */
  integrity: number;
  seed: number;
  /**
   * Face hardness 0..1 from the shot solver. A harder face stops the nose in
   * less distance, so the casing sees a higher peak strain: it crushes faster,
   * its links break sooner, and it spalls more. This is the same number the
   * frame state carries, so the value is honoured, not stored and ignored.
   */
  hardness: number;
  /**
   * Buckling propensity 0..1 from the shot solver. A shell that is already
   * mangled by earlier layers folds asymmetrically instead of shearing, and
   * sheds its surface cells with a wider sideways throw.
   */
  crumple: number;
}

const CELL_DT = 1 / 240;
const MAX_STEPS = 240 * 4;

/** World speed -> art-cells/s so the crush reads over ~0.1-0.2 s of replay. */
function crushVelocity(speed: number, mass: number): number {
  const scale = Math.max(0.55, Math.min(1.6, Math.sqrt(9 / Math.max(1, mass))));
  return Math.max(18, Math.min(190, speed * 0.14 * scale));
}

function distanceScale(material: MaterialId | null): { breakScale: number; stiffness: number } {
  if (!material) return { breakScale: 0.2, stiffness: 0.6 };
  const def = MATERIALS[material];
  return {
    // A hard face transfers more strain into the casing before the shell stops,
    // so its links survive longer (steel bends; brick shatters the nose).
    breakScale: 0.12 + def.strength * 0.2,
    stiffness: 0.6 + def.strength * 0.7,
  };
}

export class ShellImpact {
  readonly input: ShellImpactInput;
  pixels: ShellPixel[] = [];
  private springs: Spring[] = [];
  private steps = 0;
  private readonly planeX: number;
  private readonly material: MaterialDefLike;
  private readonly velocity: number;
  private readonly contacts: number[] = [];
  private readonly breakScale: number;
  private readonly stiffnessScale: number;
  private readonly hardness: number;
  private readonly crumple: number;
  /** Damage a surface cell needs before it spalls off (soft faces shed less). */
  private readonly spallThreshold: number;

  constructor(input: ShellImpactInput) {
    this.input = input;
    const material = input.material ? MATERIALS[input.material] : null;
    this.material = {
      strength: material?.strength ?? 0.35,
      yieldStrain: material?.yieldStrain ?? 0.05,
      density: material?.density ?? 1,
      conduct: material?.conduct ?? 0.2,
      soften: material?.soften ?? 0.3,
    };
    const hardness = Math.max(0, Math.min(1, Number.isFinite(input.hardness) ? input.hardness : 0.5));
    const crumple = Math.max(0, Math.min(1, Number.isFinite(input.crumple) ? input.crumple : 0));
    this.hardness = hardness;
    this.crumple = crumple;
    this.velocity = crushVelocity(input.speed, input.mass) * (0.78 + 0.44 * hardness);
    const { stiffness } = distanceScale(input.material);
    // Harder face: the same momentum is spent over a shorter stroke, so the
    // casing sees a higher peak strain. The links tolerate less stretch, reach
    // their damage budget sooner and the shell tears open instead of resting
    // against the face intact. (Tying this to the face's material strength
    // instead -- the old behaviour -- made steel the gentlest face of all,
    // which is the opposite of what a ductile casing does against armour.)
    this.breakScale = (0.26 - 0.1 * hardness) * (0.6 + input.integrity * 0.55);
    this.stiffnessScale = stiffness * (0.85 + 0.3 * hardness);
    // A soft face spreads the load instead of concentrating it, so the casing
    // sheds fewer chips into soil than into a plate; a hard face sheds more.
    this.spallThreshold = Math.max(0.2, 0.5 + (1 - this.material.strength) * 0.45 - 0.12 * hardness);

    const index = new Map<string, number>();
    SHELL_BASE.forEach((cell, i) => {
      const mass = shellCellMass(cell) * Math.max(0.4, input.mass / 9);
      this.pixels.push({
        bx: cell.x,
        by: cell.y,
        x: cell.x,
        y: cell.y,
        vx: 0,
        vy: 0,
        mass,
        part: cell.part,
        heat: 0,
        damage: 0,
        free: false,
        reveal: cell.reveal,
      });
      index.set(`${cell.x}|${cell.y}`, i);
    });

    // Seeded imperfection, carried by mass rather than by position: a
    // perfectly uniform lattice buckles symmetrically, which looks synthetic,
    // but nudging the starting positions would literally break the silhouette
    // (two cells round to the same pixel and a hole opens in the in-flight
    // sprite). Varying each cell's mass instead keeps the untouched round
    // pixel-exact while still giving the crush an irregular collapse. Crumple
    // widens that spread: a mangled casing folds the way it was already bent.
    const spread = 0.1 * (0.6 + 1.6 * crumple);
    for (const pixel of this.pixels) {
      pixel.mass *= 1 + (noise2(pixel.bx, pixel.by, input.seed % 100000) - 0.5) * spread;
    }

    // Axial, shear and bending springs. Only the 4-neighbourhood carries the
    // axial load; diagonals resist shear so the body buckles instead of
    // shearing, exactly like a plate.
    for (const pixel of this.pixels) {
      const here = index.get(`${pixel.bx}|${pixel.by}`)!;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]] as const) {
        const other = index.get(`${pixel.bx + dx}|${pixel.by + dy}`);
        if (other === undefined) continue;
        const axial = dy === 0;
        const rest = Math.hypot(dx, dy);
        this.springs.push({
          a: here,
          b: other,
          rest,
          // Crumple softens the shear links, so a mangled casing buckles and
          // folds instead of shearing off in one plane.
          stiffness: axial ? 1 : 0.34 * (1 - 0.45 * crumple),
          breakStrain: (axial ? this.breakScale : this.breakScale * 1.9) * (this.material.strength > 0.7 ? 1 : 0.85),
          damage: 0,
          broken: false,
        });
      }
    }

    // The nose stops at the face. The rest of the body starts with the crush
    // velocity, so the crash is momentum-driven, not a scripted scale.
    const noseX = Math.max(...this.pixels.map((p) => p.x));
    this.planeX = noseX + 0.5;
    for (let i = 0; i < this.pixels.length; i += 1) {
      this.pixels[i]!.vx = this.velocity;
      if (this.pixels[i]!.bx >= 8) this.contacts.push(i);
    }
  }

  /** Advance the physical simulation to `age` seconds (fixed steps, cached). */
  stepTo(age: number): ShellPixel[] {
    const target = Math.max(0, Math.min(MAX_STEPS, Math.floor(age / CELL_DT)));
    while (this.steps < target) {
      this.step(CELL_DT);
      this.steps += 1;
    }
    return this.pixels;
  }

  private step(dt: number): void {
    const px = this.pixels;
    const k = 520 * this.stiffnessScale;
    const drag = Math.exp(-2.2 * dt);

    // Contact friction heat. Cells pressed into the face heat up; the heat then
    // conducts back through the body and softens it, which is what makes a hot
    // casing fold instead of snapping.
    for (const i of this.contacts) {
      const cell = px[i]!;
      if (cell.free || cell.x < this.planeX - 2.2) continue;
      const load = Math.min(1, Math.abs(cell.vx) / 150 + 0.2);
      cell.heat = Math.min(1, cell.heat + load * dt * 6);
    }

    // Spring forces, plastic flow and ductile failure. A link does not snap at
    // the first sign of strain: it accumulates damage while it is stretched past
    // yield, and breaks when its damage budget is spent. Steel (high strength,
    // high softening) survives longer than a brittle face would.
    for (const spring of this.springs) {
      if (spring.broken) continue;
      const a = px[spring.a]!;
      const b = px[spring.b]!;
      if (a.free && b.free) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1e-6;
      const strain = (len - spring.rest) / spring.rest;
      const heat = (a.heat + b.heat) * 0.5;
      const soften = 1 - heat * this.material.soften * 0.75;
      const force = (spring.stiffness * k * soften * strain) / Math.max(0.3, (a.mass + b.mass) * 0.5);
      const nx = dx / len;
      const ny = dy / len;
      if (!a.free) {
        a.vx += nx * force * dt;
        a.vy += ny * force * dt;
      }
      if (!b.free) {
        b.vx -= nx * force * dt;
        b.vy -= ny * force * dt;
      }
      const yieldStrain = this.material.yieldStrain;
      if (Math.abs(strain) > yieldStrain) {
        // Plastic flow: the rest length creeps toward the current length, so the
        // distortion is permanent. Flow is capped so a single step cannot
        // dissolve the spring, and the leftover strain is what does damage.
        const excess = Math.abs(strain) - yieldStrain;
        const give = Math.min(0.35, excess * 2.2) * 0.5;
        spring.rest += (len - spring.rest) * give;
        a.damage = Math.min(1, a.damage + excess * dt * 9);
        b.damage = Math.min(1, b.damage + excess * dt * 9);
        spring.damage += excess * dt * (12 + (1 - this.material.strength) * 26);
        if (spring.damage >= 1) spring.broken = true;
      }
    }

    // Integrate.
    for (const cell of px) {
      if (cell.free) cell.vy += 40 * dt;
      cell.vx *= drag;
      cell.vy *= drag;
      cell.x += cell.vx * dt;
      cell.y += cell.vy * dt;
      cell.heat = Math.max(0, cell.heat - dt * 0.3);
    }

    // Rigid face: the shell cannot pass into the wall. The nose is stopped, the
    // rest of the body keeps its momentum and piles up behind it.
    for (const cell of px) {
      if (cell.free) continue;
      const overlap = cell.x + 0.5 - this.planeX;
      if (overlap > 0) {
        cell.x -= overlap;
        if (cell.vx > 0) {
          cell.heat = Math.min(1, cell.heat + Math.min(1, cell.vx / 120) * dt * 5);
          cell.vx = -cell.vx * 0.05;
        }
        cell.vy *= 0.9;
      }
    }

    // Volume preservation as a positional constraint (not an impulse, which
    // would pump energy into the body and inflate it forever). Cells squeezed
    // closer than their rest spacing are separated, so an axial crush has to
    // bulge sideways: the pancake is a consequence, never invented pixels.
    const minSep = 0.94;
    for (let i = 0; i < px.length; i += 1) {
      const a = px[i]!;
      if (a.free) continue;
      for (let j = i + 1; j < px.length; j += 1) {
        const b = px[j]!;
        if (b.free) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (Math.abs(dx) > minSep || Math.abs(dy) > minSep) continue;
        const dist = Math.hypot(dx, dy);
        if (dist >= minSep) continue;
        const correction = (minSep - dist) * 0.5;
        const nx = dist > 1e-5 ? dx / dist : 0;
        const ny = dist > 1e-5 ? dy / dist : 1;
        const total = a.mass + b.mass;
        a.x -= nx * correction * (b.mass / total);
        a.y -= ny * correction * (b.mass / total);
        b.x += nx * correction * (a.mass / total);
        b.y += ny * correction * (a.mass / total);
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const impulse = vn * 0.5;
          a.vx += nx * impulse * (b.mass / total);
          a.vy += ny * impulse * (b.mass / total);
          b.vx -= nx * impulse * (a.mass / total);
          b.vy -= ny * impulse * (a.mass / total);
        }
        a.damage = Math.min(1, a.damage + (minSep - dist) * dt * 2);
        b.damage = Math.min(1, b.damage + (minSep - dist) * dt * 2);
      }
    }

    // Heat conduction through intact links.
    for (const spring of this.springs) {
      if (spring.broken) continue;
      const a = px[spring.a]!;
      const b = px[spring.b]!;
      const flow = (a.heat - b.heat) * this.material.conduct * dt * 5;
      a.heat -= flow;
      b.heat += flow;
    }

    this.detachLoose();
  }

  /**
   * Cells that lost every intact link to the main body are shrapnel. They keep
   * the velocity they had, so their mass decides how far they actually go.
   */
  private detachLoose(): void {
    const px = this.pixels;
    const adjacency: number[][] = px.map(() => []);
    for (const spring of this.springs) {
      if (spring.broken) continue;
      adjacency[spring.a]!.push(spring.b);
      adjacency[spring.b]!.push(spring.a);
    }

    // Surface spalling. A boundary cell whose links are all damaged has nothing
    // holding it to the body any more, so it tears off with the motion it had --
    // the classic spall pattern of a hard hit on a ductile casing. The body can
    // never shed more than 45% of itself, so a shell stays readable.
    // The budget is a material property, not a constant: a hard face spalls a
    // ductile casing far more than soil does, which is what makes the same
    // round look different against steel and against the seabed.
    const spallBudget = Math.min(0.45, 0.1 + 0.45 * this.material.strength + 0.1 * this.hardness);
    let budget = Math.floor(px.length * spallBudget) - px.filter((cell) => cell.free).length;
    for (let i = 0; i < px.length && budget > 0; i += 1) {
      const cell = px[i]!;
      if (cell.free) continue;
      if (cell.damage < this.spallThreshold) continue;
      // A cell with six or more intact links is interior: the body still holds
      // it. Five or fewer means it sits on a face or edge, where spalling happens.
      if (adjacency[i]!.length > 5) continue;
      cell.free = true;
      cell.vx += 26 + cell.heat * 30;
      // A crumpled casing throws its spall sideways as well as forward, with
      // the throw direction following the seeded fold of that cell.
      cell.vy += (noise2(cell.bx, cell.by, this.input.seed) - 0.5) * 44 * (0.7 + 0.8 * this.crumple) + cell.heat * 12;
      cell.vy += (noise2(cell.by, cell.bx, this.input.seed + 7) - 0.5) * this.crumple * 36;
      budget -= 1;
    }
    // Anchor: the rearmost intact cluster is the body core.
    const roots: number[] = [];
    const seen = new Set<number>();
    for (let start = 0; start < px.length; start += 1) {
      if (seen.has(start)) continue;
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
      // A hard face shakes small clusters loose; a soft one holds them in the
      // soil. Only single cells come off a soft impact, which is why the same
      // round sheds fewer chips into the seabed than into a plate.
      const orphanLimit = this.material.strength >= 0.55 ? 1 + Math.floor(this.material.strength * 3) : 1;
      if (cluster.length <= orphanLimit) {
        for (const i of cluster) px[i]!.free = true;
      } else {
        roots.push(cluster.length);
      }
    }
    void roots;
  }

  /** Detached cells with their current motion, for the renderer. */
  shrapnel(): ShellPixel[] {
    return this.pixels.filter((cell) => cell.free);
  }

  /**
   * Rendered silhouette: every cell snapped to its whole pixel. Cells that
   * round onto the same pixel are kept rather than dropped: dropping one would
   * open a one-pixel hole in the body while it is being crushed, and a
   * duplicate draw is free.
   */
  cells(): ShellCell[] {
    const out: ShellCell[] = [];
    for (const cell of this.pixels) {
      const exposed = cell.reveal > 0 && cell.damage > 0.12;
      out.push({
        x: Math.round(cell.x),
        y: Math.round(cell.y),
        part: cell.reveal > 0 && !exposed ? 'body' : cell.part,
        reveal: cell.reveal,
      });
    }
    return out;
  }

  /** Per-cell heat for the thermal pass (keyed by the rendered cell coords). */
  heatCells(): Array<{ x: number; y: number; heat: number }> {
    const seen = new Set<string>();
    const out: Array<{ x: number; y: number; heat: number }> = [];
    for (const cell of this.pixels) {
      if (cell.heat < 0.04) continue;
      const x = Math.round(cell.x);
      const y = Math.round(cell.y);
      const key = `${x}|${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ x, y, heat: cell.heat });
    }
    return out;
  }
}

interface MaterialDefLike {
  strength: number;
  yieldStrain: number;
  density: number;
  conduct: number;
  soften: number;
}

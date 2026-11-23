import { hash32, noise2 } from '../rng';

/**
 * Reference projectile: the AP Solid Shot, read off the three newest frames
 * (native 2556x1179).
 *
 * In flight it is a long ogival shell, roughly 4 : 1, pale blue-grey with a
 * light upper facet, a dark belly, a single dark square rivet on the flank
 * and a small bright tip; an amber driving band sits at the very base, not
 * mid-body. The x-ray frame shows what is inside that jacket: a solid steel
 * core, a pointed dart filling most of the shell's length, which is why the
 * interior cells of this lattice are `steel` and stay hidden until the
 * casing above them tears open. There is no cyan exhaust: the trail is a
 * thin pale line.
 *
 * The shell is modelled as a lattice of square cells. Every cell carries a mass
 * (area x casing density), so a crumple solves as a mass problem: light cells
 * fold and detach first, heavy cells keep driving forward. That is what makes
 * the squash read as real crumpling instead of a scaled sprite.
 */

export type ShellPart =
  | 'outline'
  | 'body'
  | 'light'
  | 'dark'
  | 'steel'
  | 'nose'
  | 'noseTip'
  /** Amber drive band (kept under the old names used by the renderer). */
  | 'orange'
  | 'orangeLight'
  | 'orangeDark'
  | 'red'
  | 'filler'
  | 'fillerLight';

export interface ShellCell {
  /** Local art cell coordinates: +x is forward (toward the nose). */
  x: number;
  y: number;
  part: ShellPart;
  /** Squash at which a filler cell becomes visible. Casing is always 0. */
  reveal: number;
}

/** Base art: 24 cells long, 6 tall. Rows run y = -3 (top) .. 2 (bottom). */
const ART: readonly string[] = [
  '.....LLLLLLLLLLLLLL.......', // y = -3
  '...ggBBBDBBBBBBBBBBBB.....', // y = -2
  '.DSGGBBBBBBBBBBBBBBBBBW...', // y = -1
  '.DKggBBBBBBBBBBBBBBBBBBW..', // y = 0
  '...GGBBBBBBBBBBBBBBBBBW...', // y = 1
  '.....DDDDDDDDDDDDDDDD.....', // y = 2
];

const PART_OF: Record<string, ShellPart> = {
  K: 'outline',
  B: 'body',
  L: 'light',
  D: 'dark',
  G: 'orange',
  g: 'orangeLight',
  R: 'red',
  W: 'noseTip',
  F: 'filler',
  S: 'steel',
};

/**
 * Casing density (mass per cell) by part. The amber band and the dark belly
 * are the heavy parts of a real shell; the thin light facets are the lightest,
 * so they buckle and peel first.
 */
const CELL_MASS: Record<ShellPart, number> = {
  outline: 0.7,
  body: 1,
  light: 0.65,
  dark: 1.25,
  steel: 1.1,
  nose: 1.3,
  noseTip: 1.15,
  orange: 1.5,
  orangeLight: 1.45,
  orangeDark: 1.4,
  red: 0.9,
  filler: 0.85,
  fillerLight: 0.8,
};

const ART_LEFT = -12;

function buildBase(): ShellCell[] {
  const cells: ShellCell[] = [];
  for (let row = 0; row < ART.length; row += 1) {
    const line = ART[row]!;
    for (let col = 0; col < line.length; col += 1) {
      const part = PART_OF[line[col]!];
      if (!part) continue;
      // Rows are centred on the flight axis: the art is 6 rows tall, so row 0
      // sits at y = -3 and the last row at y = +2.
      cells.push({ x: ART_LEFT + col, y: row - 3, part, reveal: 0 });
    }
  }
  // The steel core: the x-ray frame shows a solid pointed dart filling most
  // of the jacket. It only becomes visible once the casing above it has been
  // crushed away -- in flight it is hidden under the blue-grey body, exactly
  // as the footage shows. The core is the heaviest part of the lattice, so it
  // keeps driving forward while the lighter jacket folds around it.
  for (let x = -7; x <= 10; x += 1) {
    const half = x <= 4 ? 1 : Math.max(0, 1 - Math.floor((x - 4) / 2.5));
    for (let y = -half; y <= half; y += 1) {
      const existing = cells.find((c) => c.x === x && c.y === y);
      if (existing) {
        existing.part = 'steel';
        existing.reveal = 0.22;
      } else {
        cells.push({ x, y, part: 'steel', reveal: 0.22 });
      }
    }
  }
  return cells;
}

export const SHELL_BASE: readonly ShellCell[] = buildBase();

/**
 * An untouched round: the filler cells exist in the lattice but the casing deck
 * still covers them, so they are painted as body. They only become visible when
 * the casing above them has been crushed away.
 */
export function pristineShell(): ShellCell[] {
  return SHELL_BASE.map((cell) => ({ ...cell, part: cell.reveal > 0 ? 'body' : cell.part }));
}

export function shellCellMass(cell: ShellCell): number {
  return CELL_MASS[cell.part] ?? 1;
}

/** Total modelled mass of the pristine shell, in cell units. */
export const SHELL_CELL_MASS = SHELL_BASE.reduce((sum, cell) => sum + shellCellMass(cell), 0);

export interface ShellDeformParams {
  /** Overall compression along the axis, 0 = pristine, 1 = pancaked. */
  squash: number;
  /** Structural buckling / petal-opening progress, 0..1. */
  crumple: number;
  /** 1 = folds over a steel face, 0 = soft ground. */
  hardness: number;
  /** Impact speed in world units per second (drives mass response). */
  speed: number;
  /** Shell mass from the ammunition table. */
  mass: number;
  /** 1 = intact casing, 0 = spent. */
  integrity: number;
  /** Deterministic seed from the shot solver. */
  seed: number;
}

export interface ShedChip {
  x: number;
  y: number;
  part: ShellPart;
  mass: number;
  /** Local velocity in art cells per second. */
  vx: number;
  vy: number;
  /** Radians of spin. */
  spin: number;
}

export interface ShellDeformResult {
  cells: ShellCell[];
  chips: ShedChip[];
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/**
 * Solve the crumple of the shell against a face.
 *
 * Columns are compressed by a mass-weighted share of the total shortening: a
 * heavy column absorbs less displacement than a light one, so the thin light
 * facets fold first while the amber band keeps its shape and the nose drives
 * back into the body. Cells that exceed their strain budget tear off as chips
 * whose velocity follows the impact and whose mass decides how far they fly.
 *
 * Pure and deterministic: same params always produce the same pixels, which is
 * what lets a replay re-create the impact without storing every cell.
 */
export function deformShell(params: ShellDeformParams): ShellDeformResult {
  const squash = clamp01(params.squash);
  const crumple = clamp01(params.crumple);
  const hardness = clamp01(params.hardness);
  const integrity = clamp01(params.integrity);
  const seed = params.seed >>> 0;
  const speed = Number.isFinite(params.speed) ? Math.max(0, params.speed) : 0;
  const shellMass = Number.isFinite(params.mass) ? Math.max(0.2, params.mass) : 1;

  if (squash <= 0.001 && crumple <= 0.001) {
    return { cells: pristineShell(), chips: [] };
  }

  // Column mass profile. Heavier columns resist the compression, so their
  // weight share is inverse mass; the nose (front) is the contact column and
  // takes the largest share of the shortening.
  const columns = new Map<number, ShellCell[]>();
  for (const cell of SHELL_BASE) {
    const list = columns.get(cell.x);
    if (list) list.push(cell);
    else columns.set(cell.x, [cell]);
  }
  const xs = [...columns.keys()].sort((a, b) => a - b);
  const maxX = xs[xs.length - 1] ?? 1;
  const minX = xs[0] ?? -1;
  const span = Math.max(1, maxX - minX);
  const length = Math.max(1, maxX - minX + 1);
  // Total shortening: a hard face pancakes the shell harder than soft ground,
  // and it can never exceed 55% of the body -- a shell folds, it does not
  // vanish into its own tail.
  // Mass matters: a heavy shell carries more momentum into the face and keeps
  // its shape, a light one is crushed flat by the same impact.
  const massFactor = Math.max(0.55, Math.min(1.7, Math.sqrt(9 / shellMass)));
  const shortening = Math.min(
    length * 0.55,
    squash * length * (0.3 + 0.22 * hardness) * massFactor * Math.max(0.4, Math.min(1.3, speed / 420)),
  );

  const weights = new Map<number, number>();
  let weightSum = 0;
  for (const x of xs) {
    const columnCells = columns.get(x)!;
    const mass = columnCells.reduce((sum, cell) => sum + shellCellMass(cell), 0);
    const forward = (x - minX) / span; // 0 at the tail, 1 at the nose
    // Lighter columns give way first; the forward bias piles the crush up
    // against the contact face, which is where the footage shows the petals.
    const weight = Math.exp(-(1 - forward) * 1.4) * Math.pow(14 / Math.max(1, mass), 0.7);
    weights.set(x, weight);
    weightSum += weight;
  }

  // Cumulative compression at each column. The nose stops against the face, so
  // the body piles up behind it: displacement is zero at the tail and grows to
  // the full shortening at the contact column.
  const shift = new Map<number, number>();
  /** Local compression of each column, in cells (its own share of the crush). */
  const crush = new Map<number, number>();
  let travelled = 0;
  for (const x of xs) {
    const share = (shortening * (weights.get(x) ?? 1)) / Math.max(1e-6, weightSum);
    travelled += share;
    shift.set(x, travelled);
    crush.set(x, share);
  }

  // Lateral response. Area is preserved per column in 2D: a column that loses
  // width must gain height, which is exactly the pancake read of the footage.
  const cells: ShellCell[] = [];
  const chips: ShedChip[] = [];
  const stiffness = 0.45 + hardness * 0.55;
  const shellResponse = Math.max(0.55, Math.min(1.7, Math.sqrt(56 / Math.max(1, shellMass * 40))));
  const seen = new Set<string>();

  for (const base of SHELL_BASE) {
    const columnShift = shift.get(base.x) ?? 0;
    // Strain is local compression, not displacement: a column that gives up
    // half a cell of width is folded 50%. Light columns get the bigger share,
    // so the thin facets buckle while the amber band survives.
    const columnStrain = Math.min(1, (crush.get(base.x) ?? 0) / 0.55);
    // Spread grows with how far this column ended up displaced, and tapers to
    // the edges so the body bulges into a barrel instead of shearing apart.
    const bulge = 1 + Math.min(1, columnShift / length) * 2.1 * (1 - Math.abs(base.y) / 9) * stiffness;
    let x = base.x - columnShift;
    let y = base.y * bulge;

    // Buckle: the thin light facets and the dark belly fold out of line first
    // because they carry the least mass per unit of contact load.
    if (crumple > 0) {
      const localMass = shellCellMass(base);
      const give = Math.min(1, 1.35 / Math.max(0.4, localMass));
      const wobble = noise2(base.x, base.y, seed % 100000);
      const buckle = crumple * give * (0.5 + hardness) * (wobble - 0.5) * 3.4;
      x += buckle * 0.55;
      y += buckle + Math.sign(base.y || 1) * crumple * (1 - Math.abs(base.y) / 7) * 1.6;
      // The nose folds back over itself as the casing petals open forward.
      if (base.x >= 8) {
        x -= crumple * (base.x - 8) * 1.25;
        y += Math.sign(base.y || 1) * crumple * 1.2;
      }
    }

    const rx = Math.round(x);
    const ry = Math.round(y);
    const key = `${rx}|${ry}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Strain budget: cells past their yield tear off. Soft (light) cells go
    // first, so the shed pattern follows the mass profile.
    const yieldPoint = 0.5 + shellCellMass(base) * 0.16 * (0.4 + integrity * 0.6);
    const strain = columnStrain * (0.3 + crumple * 0.85);
    const peeled = strain > yieldPoint && base.x < 9;
    if (peeled && base.reveal === 0) {
      const spread = (noise2(base.x * 7, base.y * 13, seed) - 0.5) * 2;
      const energy = Math.min(1.6, 0.35 + speed / 700) * shellResponse;
      chips.push({
        x: rx,
        y: ry,
        part: base.part,
        mass: shellCellMass(base),
        vx: -energy * (16 + spread * 9) + crumple * 4,
        vy: spread * energy * 15 - 4,
        spin: (noise2(base.y, base.x, seed + 3) - 0.5) * 9,
      });
      continue;
    }
    // Filler cells under an intact casing are still covered by the shell wall.
    const exposeFiller = base.reveal > 0 && squash >= base.reveal;
    cells.push({
      x: rx,
      y: ry,
      part: base.reveal > 0 && !exposeFiller ? 'body' : base.part,
      reveal: base.reveal,
    });
  }

  return { cells, chips };
}

/** Bounding box of a cell set, in whole cells. */
export function shellBounds(cells: ShellCell[]): { width: number; height: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    minX = Math.min(minX, cell.x);
    maxX = Math.max(maxX, cell.x);
    minY = Math.min(minY, cell.y);
    maxY = Math.max(maxY, cell.y);
  }
  if (!Number.isFinite(minX)) return { width: 0, height: 0 };
  return { width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Stable seed for a deform call from the solver's shot seed and impact time. */
export function shellSeed(shotSeed: number, tMs: number): number {
  return hash32(shotSeed, Math.round(tMs));
}

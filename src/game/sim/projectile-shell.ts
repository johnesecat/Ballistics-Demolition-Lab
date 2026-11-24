/**
 * Reference projectile: the AP Solid Shot, rebuilt by reviewing the seven
 * reference frames (IMG_4966/4967/4968 in flight/x-ray/damage, and the four
 * newest IMG_4969/4971/4972/4974: far-zoom flight x3 plus the annotated
 * two-outline frame). Hand-built to those four rather than sampled by code,
 * which never matched the footage exactly.
 *
 * What the review shows, in flight (IMG_4969, horizontal): a long ogival dart,
 * 24 cells long, whose boat-tail cap is the dark strip at the very base
 * (columns 0-4), the amber driving band sits INSET at roughly 20-30% of the
 * length (columns 5-6), then the pale blue-grey casing, a single dark flank
 * rivet, and a smooth nose tapering over the last third to one pale tip cell.
 * The dart reads exactly the same at any flight angle: the lattice rotates
 * whole cells, never a scaled sprite, so the 0 deg look is the reference look.
 *
 * The annotated frame (IMG_4974) splits the round into two outlines: the
 * outer projectile shell (casing + band + cap) and the inner main projectile
 * (the steel dart), with the orange sleeve between them. That is the x-ray
 * look the round converts to when it gets close to an object (and stays):
 * the casing goes orange, the steel core is bright, the shell nose pokes one
 * cell past the core's point. The `steel` cells below are the main projectile;
 * `skin` hides them under the casing in flight so the silhouette stays the
 * flight frame's, and XRAY_PART_COLORS paints the conversion.
 *
 * The shell is modelled as a lattice of square cells. Every cell carries a mass
 * (area x casing density), so a crumple solves as a mass problem: light cells
 * fold and detach first, heavy cells keep driving forward.
 */

import type { Wall } from './fracture';

export type ShellPart =
  | 'rim'
  | 'light'
  | 'highlight'
  | 'body'
  | 'dark'
  | 'belly'
  | 'band'
  | 'bandLight'
  | 'bandDark'
  | 'cap'
  | 'tip'
  | 'rivet'
  | 'steel';

export interface ShellCell {
  /** Local art cell coordinates: +x is forward (toward the nose). */
  x: number;
  y: number;
  part: ShellPart;
  /** Casing colour hiding an interior cell (the steel core) while intact. */
  skin?: ShellPart;
  /** Damage a hidden cell needs before it becomes visible. Casing is always 0. */
  reveal: number;
}

/**
 * In-flight silhouette, reviewed from IMG_4969/4971/4972 (flight) and
 * IMG_4974 (annotated x-ray), 24 cells long, 6 tall.
 * Columns: 0-4 boat-tail cap, 5-6 driving band, 7-23 casing ogive.
 * Rows run y = -3 (top) .. 2 (bottom); the nose tip is the single cell at
 * (23, 0) and the belly (bottom row) runs longest, as in the frames.
 */
const ART: readonly string[] = [
  'CCCCCAA#############....',
  'CCCCCAA###############..',
  'CCCCCAA################.',
  'CCCCCAA#################',
  'CCCCCAA################.',
  'CCCCCAA#############....',
];

const PART_OF: Record<string, ShellPart> = {
  // Row tones, top to bottom (row index drives the colour in buildBase()).
  '#': 'body',
  // Driving band and boat-tail.
  A: 'band',
  C: 'cap',
  // Nose tip (the single pale cell at the point of the ogive).
  T: 'tip',
  // Single dark rivet on the flank.
  R: 'rivet',
};

/** Casing tone by row, read from the frame's row medians. */
const ROW_PART: readonly ShellPart[] = ['rim', 'light', 'highlight', 'body', 'dark', 'belly'];

/**
 * Casing density (mass per cell). The amber driving band and the dark belly are
 * the heavy parts of a real shell; the thin highlight facets are the lightest,
 * so they buckle and peel first.
 */
const CELL_MASS: Record<ShellPart, number> = {
  rim: 0.8,
  light: 0.7,
  highlight: 0.65,
  body: 1,
  dark: 1.1,
  belly: 1.25,
  band: 1.5,
  bandLight: 1.45,
  bandDark: 1.4,
  cap: 1.35,
  tip: 1.15,
  rivet: 1.05,
  steel: 1.1,
};

/** x of the leftmost art column. */
const ART_LEFT = -12;

/**
 * Main projectile (steel core) from the annotated x-ray frame (IMG_4974):
 * four rows tall inside the jacket, starting just behind the driving band
 * and tapering to a point one cell short of the shell's nose. Columns are art
 * indices (0..23); each range is inclusive.
 */
const CORE: ReadonlyArray<{ y: number; from: number; to: number }> = [
  { y: -2, from: 10, to: 19 },
  { y: -1, from: 7, to: 22 },
  { y: 0, from: 7, to: 22 },
  { y: 1, from: 7, to: 20 },
];

function buildBase(): ShellCell[] {
  const cells: ShellCell[] = [];
  const byKey = new Map<string, ShellCell>();
  for (let row = 0; row < ART.length; row += 1) {
    const line = ART[row]!;
    for (let col = 0; col < line.length; col += 1) {
      const ch = line[col]!;
      const mapped = PART_OF[ch];
      if (!mapped) continue;
      const part = ch === '#' ? ROW_PART[row] ?? 'body' : mapped;
      const cell: ShellCell = { x: ART_LEFT + col, y: row - 3, part, reveal: 0 };
      cells.push(cell);
      byKey.set(`${cell.x}|${cell.y}`, cell);
    }
  }
  // Nose point: the sampled tip cell is pale, one cell past the last full row.
  const nose = byKey.get(`${ART_LEFT + 23}|0`);
  if (nose) nose.part = 'tip';
  // The dark rim follows the silhouette: the bottom row of the casing is the
  // shadowed belly edge, exactly as the frame's lower outline reads.
  for (const cell of cells) {
    if (cell.y === 2 && cell.part !== 'bandDark' && cell.part !== 'cap') cell.part = 'rim';
  }
  // Flank rivet, 62% of the length down the lower highlight edge.
  const rivet = byKey.get(`${ART_LEFT + 15}|0`);
  if (rivet) rivet.part = 'rivet';
  // The blue-grey highlight runs the casing (only plain casing cells, so the
  // cap and the band keep their own colours).
  for (let col = 7; col <= 22; col += 1) {
    const cell = byKey.get(`${ART_LEFT + col}|-1`);
    if (cell && cell.part === 'body') cell.part = 'highlight';
  }

  // Driving-band shading, top to bottom: lit top facet, mid tone, dark base.
  for (let row = 0; row < ART.length; row += 1) {
    for (const col of [5, 6]) {
      const cell = byKey.get(`${ART_LEFT + col}|${row - 3}`);
      if (!cell) continue;
      cell.part = row === 0 ? 'bandLight' : row >= 4 ? 'bandDark' : 'band';
    }
  }

  // The band is proud: one extra cell of width under the driving band, so it
  // reads as a band rather than a painted stripe.
  cells.push({ x: ART_LEFT + 5, y: 3, part: 'bandDark', reveal: 0 });
  cells.push({ x: ART_LEFT + 6, y: 3, part: 'bandDark', reveal: 0 });

  // Hide the steel core under the casing. The core never adds a cell: the
  // in-flight silhouette stays exactly the sampled one.
  for (const span of CORE) {
    for (let col = span.from; col <= span.to; col += 1) {
      const host = byKey.get(`${ART_LEFT + col}|${span.y}`);
      if (!host) continue;
      host.skin = host.part;
      host.part = 'steel';
      host.reveal = 0.22;
    }
  }
  return cells;
}

export const SHELL_BASE: readonly ShellCell[] = buildBase();

/**
 * An untouched round: the steel core exists in the lattice but the casing deck
 * still covers it, so it is painted with its skin tone. It only becomes visible
 * when the casing above it has been crushed away.
 */
export function pristineShell(): ShellCell[] {
  return SHELL_BASE.map((cell) => ({ ...cell, part: cell.skin ?? cell.part }));
}

export function shellCellMass(cell: ShellCell): number {
  return CELL_MASS[cell.part] ?? 1;
}

/** Total modelled mass of the pristine shell, in cell units. */
export const SHELL_CELL_MASS = SHELL_BASE.reduce((sum, cell) => sum + shellCellMass(cell), 0);

/**
 * X-ray palette, reviewed from the annotated frame (IMG_4974) and the x-ray
 * frame (IMG_4967): the casing becomes the orange sleeve (lit toward the top,
 * dark toward the belly), the steel main projectile is bright pale steel, the
 * cap goes dark bronze and the nose tip pales to light orange. The renderer
 * paints these when the round has converted to x-ray near an object.
 */
export const XRAY_PART_COLORS: Record<ShellPart, number> = {
  rim: 0xd68a47,
  light: 0xca7c3e,
  highlight: 0xd99050,
  body: 0xc4763a,
  dark: 0xb46830,
  belly: 0x9a5a2a,
  band: 0x9a6127,
  bandLight: 0xa86c2e,
  bandDark: 0x7c4d20,
  cap: 0x5f4226,
  tip: 0xe2a75e,
  rivet: 0x4a3823,
  steel: 0xb9c9d4,
};

/** Distance from a point to the nearest wall polygon edge (0 inside a wall). */
export function nearestObstacleDistance(
  point: { x: number; y: number },
  walls: Wall[],
  core?: { x: number; y: number; radius: number },
): number {
  let best = Infinity;
  for (const wall of walls) {
    for (const poly of wall.polygons) {
      let inside = false;
      for (let i = 0; i < poly.length; i += 1) {
        const p = poly[i]!;
        const q = poly[(i + 1) % poly.length]!;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const len2 = dx * dx + dy * dy;
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((point.x - p.x) * dx + (point.y - p.y) * dy) / len2)) : 0;
        const d = Math.hypot(point.x - (p.x + dx * t), point.y - (p.y + dy * t));
        if (d < best) best = d;
        // Even-odd ray crossing for the inside test.
        if (p.y > point.y !== q.y > point.y && point.x < ((q.x - p.x) * (point.y - p.y)) / (q.y - p.y || 1e-9) + p.x) {
          inside = !inside;
        }
      }
      if (inside) return 0;
    }
  }
  if (core) best = Math.min(best, Math.max(0, Math.hypot(point.x - core.x, point.y - core.y) - core.radius));
  return best;
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

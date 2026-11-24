/**
 * Reference projectile: the AP Solid Shot, sampled from the three newest frames
 * (`IMG_4966.png` in flight, `IMG_4967.png` x-ray, `IMG_4968.png` damage).
 *
 * Sampling method (`scripts/sample_projectile.py`): the in-flight shell is
 * levelled by its own axis (-6.3 deg in that frame), then the silhouette is
 * quantised onto the 8.5 px pixel grid the footage is drawn on. That grid is
 * 24 cells long and 6 rows tall for the casing, with a seventh row where the
 * driving band is proud -- which is why this lattice is 24 x 6 and not the
 * stubby 23 x 6 of the old art. Row medians give the casing tones below (a
 * dark rim, the upper facet, a highlight, the body, the lower facet and the
 * dark belly); the amber driving band is two cells wide at the base and one
 * cell proud underneath, the dark boat-tail cap sits behind it, and the nose
 * tapers over the last third to a single pale tip cell.
 *
 * The x-ray frame shows what is inside the jacket: a solid steel core, a pointed
 * dart about four rows tall filling the middle of the body from 15% to 92% of
 * its length. Those cells carry `steel` under a `skin` that paints the casing
 * while it is intact, so the in-flight silhouette is pixel-identical to the
 * reference and the core only appears once the jacket above it tears away.
 *
 * The shell is modelled as a lattice of square cells. Every cell carries a mass
 * (area x casing density), so a crumple solves as a mass problem: light cells
 * fold and detach first, heavy cells keep driving forward.
 */

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
 * In-flight silhouette, sampled from IMG_4966. 24 cells long, 6 tall.
 * Columns: 0 boat-tail cap, 1-2 driving band, 3-23 casing.
 * Rows run y = -3 (top) .. 2 (bottom).
 */
const ART: readonly string[] = [
  '.AA################.....',
  'CAA##################...',
  'CAA###################..',
  'CAA#####################',
  'CAA###################..',
  'CAA###############......',
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
 * Steel core from the x-ray frame: rows 1..4 of the jacket, tapering to a point
 * toward the nose. Columns are art indices (0..23); each range is inclusive.
 */
const CORE: ReadonlyArray<{ y: number; from: number; to: number }> = [
  { y: -2, from: 10, to: 19 },
  { y: -1, from: 4, to: 22 },
  { y: 0, from: 4, to: 22 },
  { y: 1, from: 4, to: 20 },
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
  // The blue-grey highlight runs the full casing: row 2 of the sampled grid.
  for (let col = 3; col <= 22; col += 1) {
    const cell = byKey.get(`${ART_LEFT + col}|-1`);
    if (cell) cell.part = 'highlight';
  }

  // Driving-band shading, top to bottom: lit top facet, mid tone, dark base.
  for (let row = 0; row < ART.length; row += 1) {
    for (const col of [1, 2]) {
      const cell = byKey.get(`${ART_LEFT + col}|${row - 3}`);
      if (!cell) continue;
      cell.part = row === 0 ? 'bandLight' : row >= 4 ? 'bandDark' : 'band';
    }
  }

  // The band is proud: one extra cell of width at the base, so it reads as a
  // driving band rather than a painted stripe.
  cells.push({ x: ART_LEFT + 1, y: 3, part: 'bandDark', reveal: 0 });
  cells.push({ x: ART_LEFT + 2, y: 3, part: 'bandDark', reveal: 0 });

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

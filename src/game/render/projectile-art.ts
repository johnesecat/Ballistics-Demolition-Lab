/**
 * Reference projectile body (newest 11-18 recording), rebuilt as whole pixels.
 *
 * The footage round is a bulky grey-blue dart: light upper fin swept back,
 * smaller belly fin, stepped white nose, warm orange band behind the nose with
 * red flecks, cyan exhaust, dark casing edges and a yellow octagonal filler
 * that appears when the casing crumples. Every part below is a single square
 * cell (smaller than the wall raster's cells), and deformation snaps whole
 * cells to integer positions so the squash reads as pixel damage, not a scaled
 * sprite.
 */

export type ProjectilePart =
  | 'outline'
  | 'body'
  | 'light'
  | 'dark'
  | 'steel'
  | 'nose'
  | 'noseTip'
  | 'cyan'
  | 'orange'
  | 'orangeLight'
  | 'red'
  | 'filler'
  | 'fillerLight';

export interface ProjectileCell {
  x: number;
  y: number;
  part: ProjectilePart;
  /** Squash at which a filler cell becomes visible. Casing is always 0. */
  reveal: number;
}

interface BaseCell extends ProjectileCell {}

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function baseCells(): BaseCell[] {
  const cells: BaseCell[] = [];
  const add = (x: number, y: number, part: ProjectilePart, reveal = 0): void => {
    cells.push({ x, y, part, reveal });
  };

  // Casing: bulky grey-blue body with a light upper band and dark belly.
  for (let x = -11; x <= 10; x += 1) {
    for (let y = -6; y <= 6; y += 1) {
      if (Math.abs(y) === 6 && (x < -9 || x > 8)) continue;
      let part: ProjectilePart = 'body';
      if (Math.abs(y) === 6) part = 'outline';
      else if (y === -5 || y === -4) part = 'light';
      else if (y === 4 || y === 5) part = 'dark';
      add(x, y, part);
    }
  }

  // Rivets / ports: the close-up detail that reads against the sky.
  for (let x = -8; x <= 6; x += 4) {
    add(x, -3, 'steel');
    add(x + 2, 3, 'steel');
  }

  // Warm drive band behind the nose, with red flecks like the footage.
  for (let x = 4; x <= 6; x += 1) {
    for (let y = -5; y <= 5; y += 1) add(x, y, x === 6 ? 'orangeLight' : 'orange');
  }
  add(5, -2, 'red');
  add(6, 1, 'red');
  add(4, 4, 'red');
  add(5, 0, 'red');

  // Stepped light nose: four narrowing steps, then the white tip (the footage
  // tip is small and bright, not a white third of the body).
  const noseRows = [5, 4, 3, 2];
  for (let i = 0; i < noseRows.length; i += 1) {
    const x = 11 + i;
    const h = noseRows[i]!;
    for (let y = -h; y <= h; y += 1) {
      add(x, y, Math.abs(y) === h ? 'outline' : 'nose');
    }
  }
  add(15, 0, 'noseTip');
  add(15, -1, 'noseTip');
  add(15, 1, 'nose');

  // Rear exhaust ring.
  for (let x = -14; x <= -12; x += 1) {
    for (let y = -2; y <= 2; y += 1) add(x, y, Math.abs(y) < 2 ? 'cyan' : 'steel');
  }

  // Large upper fin, swept back and attached along the rear body edge.
  for (let x = -15; x <= -4; x += 1) {
    const top = -12 + Math.min(6, Math.max(0, x + 15));
    for (let y = top; y <= -6; y += 1) {
      add(x, y, y === top ? 'light' : x < -11 ? 'body' : 'dark');
    }
  }
  // Smaller lower stabiliser, attached to the belly.
  for (let x = -14; x <= -7; x += 1) {
    for (let y = 6; y <= 9; y += 1) add(x, y, y === 9 ? 'dark' : 'body');
  }

  // Yellow octagonal filler: hidden until the casing crumples open.
  for (let x = -4; x <= 4; x += 1) {
    for (let y = -3; y <= 3; y += 1) {
      if (Math.abs(x) * 0.55 + Math.abs(y) <= 3.2) {
        add(x, y, Math.abs(x) + Math.abs(y) <= 2 ? 'fillerLight' : 'filler', 0.28);
      }
    }
  }

  return cells;
}

const BASE = baseCells();

/**
 * Deform the body for a squash 0..1. The result is deterministic, deduplicated
 * and snapped to whole cells; the nose buckles back, the body swells, and the
 * filler is exposed as the casing opens.
 */
export function projectileCells(squash: number, integrity = 1): ProjectileCell[] {
  const s = Math.max(0, Math.min(1, squash));
  const squeeze = 1 - s * 0.45;
  const swell = 1 + s * 0.58;
  const dent = Math.max(0, Math.min(1, integrity));
  const filler: ProjectileCell[] = [];
  const casing: ProjectileCell[] = [];
  const seen = new Set<string>();

  const place = (target: ProjectileCell[], cell: BaseCell): void => {
    let x = cell.x * squeeze;
    let y = cell.y * swell;
    // The nose folds back into the body as it meets the plate.
    if (cell.x > 0) {
      const buckle = s * (cell.x / 16) * 3;
      x -= buckle;
      y += Math.sign(cell.y || 1) * buckle * 0.7;
    }
    // Discrete crumple: whole-cell offsets grow with squash.
    x += (hash(cell.x, cell.y) - 0.5) * s * 2.2;
    y += (hash(cell.x * 7, cell.y * 13) - 0.5) * s * 1.6;
    const rx = Math.round(x);
    const ry = Math.round(y);
    const key = `${rx}|${ry}`;
    if (seen.has(key)) return;
    // Bent casing sheds flakes; never remove the exposed filler.
    if (cell.reveal === 0 && dent < 0.75 && hash(cell.x * 3, cell.y * 5) < (0.75 - dent) * 0.25) return;
    seen.add(key);
    target.push({ x: rx, y: ry, part: cell.part, reveal: cell.reveal });
  };

  // Filler first, then detail overlays newest-first, then the casing. The
  // casing is added last so the orange band, rivets and red flecks are not
  // swallowed by the body cells underneath them.
  for (const cell of BASE) {
    if (cell.reveal > 0 && s >= cell.reveal) place(filler, cell);
  }
  for (let i = BASE.length - 1; i >= 0; i -= 1) {
    const cell = BASE[i]!;
    if (cell.reveal > 0) continue;
    place(casing, cell);
  }
  return [...casing, ...filler];
}

/** Bounding box in whole cells, for tests and diagnostics. */
export function projectileBounds(cells: ProjectileCell[]): { width: number; height: number } {
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
  return { width: maxX - minX + 1, height: maxY - minY + 1 };
}

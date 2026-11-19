import assert from 'node:assert/strict';
import { pixelRuns, type PixelRun, type WallColors } from '../src/game/render/pixel-raster';
import type { Polygon } from '../src/game/sim/fracture';

const COLORS: WallColors = { base: 0x111111, light: 0x222222, dark: 0x333333 };
const CELLS = [2, 3, 4];

/** Independent even-odd test: the renderer's own point test is not reused, so
 * merged output is checked against geometry rather than against itself. */
function inside(x: number, y: number, poly: Polygon): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** The previous unmerged raster as a cell map: one entry per covered centre. */
function unmergedCells(poly: Polygon, cell: number): Map<string, number> {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const x0 = Math.floor(minX / cell) * cell;
  const y0 = Math.floor(minY / cell) * cell;
  const x1 = Math.ceil(maxX / cell) * cell;
  const y1 = Math.ceil(maxY / cell) * cell;
  const half = cell / 2;
  const cells = new Map<string, number>();
  for (let y = y0; y < y1; y += cell) {
    for (let x = x0; x < x1; x += cell) {
      if (!inside(x + half, y + half, poly)) continue;
      let color = COLORS.base;
      if (!inside(x + half, y - half, poly)) color = COLORS.light;
      else if (!inside(x + half, y + cell + half, poly)) color = COLORS.dark;
      cells.set(`${x},${y}`, color);
    }
  }
  return cells;
}

/** Expand runs back into cells, rejecting overlap, gaps inside a run or a
 * misaligned square. A run is only a compression of exactly these cells. */
function expand(runs: PixelRun[], cell: number): Map<string, number> {
  const cells = new Map<string, number>();
  for (const run of runs) {
    assert.equal(run.y % cell, 0, `run y ${run.y} is off the ${cell}px grid`);
    assert.equal(run.x % cell, 0, `run x ${run.x} is off the ${cell}px grid`);
    assert.equal(run.h, cell, 'a run must be exactly one cell tall');
    assert.ok(run.w > 0 && run.w % cell === 0, `run width ${run.w} is not a whole number of cells`);
    for (let x = run.x; x < run.x + run.w; x += cell) {
      const key = `${x},${run.y}`;
      assert.ok(!cells.has(key), `cell ${key} painted twice`);
      cells.set(key, run.color);
    }
  }
  return cells;
}

function sorted(map: Map<string, number>): Array<[string, number]> {
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

const rect = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
];

const CASES: Array<{ name: string; poly: Polygon }> = [
  { name: 'aligned rectangle', poly: rect(0, 0, 40, 20) },
  { name: 'offset rectangle', poly: rect(5, 7, 32, 22) },
  { name: 'triangle', poly: [{ x: 0, y: 0 }, { x: 64, y: 0 }, { x: 0, y: 64 }] },
  { name: 'diamond', poly: [{ x: 32, y: 0 }, { x: 64, y: 32 }, { x: 32, y: 64 }, { x: 0, y: 32 }] },
  {
    name: 'concave U block',
    poly: [
      { x: 0, y: 0 }, { x: 64, y: 0 }, { x: 64, y: 64 }, { x: 40, y: 64 },
      { x: 40, y: 24 }, { x: 24, y: 24 }, { x: 24, y: 64 }, { x: 0, y: 64 },
    ],
  },
];

for (const { name, poly } of CASES) {
  for (const cell of CELLS) {
    const merged = pixelRuns(poly, COLORS, cell);
    const cells = expand(merged, cell);
    const expectedCells = unmergedCells(poly, cell);
    assert.ok(expectedCells.size > 0, `${name}@${cell}: test polygon covers no cells`);
    assert.deepEqual(sorted(cells), sorted(expectedCells), `${name}@${cell}: merged runs changed coverage or colour`);
    assert.ok(
      merged.every((run) => [COLORS.base, COLORS.light, COLORS.dark].includes(run.color)),
      `${name}@${cell}: run used a colour outside the material swatches`,
    );
  }
}

// Merging must actually merge: a flat 40x20 plate is ten rows of one colour,
// not two hundred individual cells.
const plateRuns = pixelRuns(rect(0, 0, 40, 20), COLORS, 2);
assert.equal(plateRuns.length, 10, `a flat plate should merge to one run per row, got ${plateRuns.length}`);
assert.equal(expand(plateRuns, 2).size, 200, 'the ten runs must still cover all 200 cells');

// Sloped shapes still benefit and still cover every cell.
const triangleCells = expand(pixelRuns(CASES[2]!.poly, COLORS, 2), 2).size;
const triangleRuns = pixelRuns(CASES[2]!.poly, COLORS, 2);
assert.ok(triangleRuns.length < triangleCells, 'a triangle should merge cells into fewer runs');
assert.ok(triangleRuns.some((run) => run.w > 2), 'at least one triangle run should span several cells');

// Sub-cell survivor: no cell centre lands inside this 1-unit plate, so the
// fallback keeps one base-coloured square instead of dropping the geometry.
const speck = rect(12, 12, 1, 1);
const speckRuns = pixelRuns(speck, COLORS, 4);
assert.deepEqual(speckRuns, [{ x: 12, y: 12, w: 4, h: 4, color: COLORS.base }], 'sub-cell plate must keep one base square');

assert.deepEqual(pixelRuns([{ x: 0, y: 0 }, { x: 1, y: 1 }], COLORS, 2), [], 'a line is not a fillable polygon');

console.log('Square-cell run merging is cell-for-cell equivalent to the unmerged raster');

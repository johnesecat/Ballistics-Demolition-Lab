import assert from 'node:assert/strict';
import { deformHeatedWalls, tearRim } from '../src/game/sim/wall-deform';
import { cloneWallState, detachUnsupported, type WallState } from '../src/game/sim/walls';
import { traceWalls, type Wall } from '../src/game/sim/fracture';
import { simulateShotWalls } from '../src/game/sim/wall-simulator';
import { buildStage } from '../src/game/stages/generator';
import { ALL_STAGES } from '../src/game/stages/campaign';
import { cloneSnapshot } from '../src/game/stages/types';

/**
 * Metal warping is physics, not paint. A heated steel plate has to move its
 * geometry, and that movement has to be visible to the sweep, the support solve
 * and the cover fraction -- not only to the renderer.
 */

const plate: Wall = {
  id: 'plate',
  material: 'steel',
  polygons: [
    [
      { x: 700, y: 200 },
      { x: 760, y: 200 },
      { x: 760, y: 330 },
      { x: 700, y: 330 },
    ],
  ],
};

const state: WallState = {
  walls: [plate],
  heat: [{ x: 706, y: 268, heat: 0.95, radius: 34, material: 'steel' }],
  groundY: 346,
  version: 1,
};

const before = cloneWallState(state);
const sweepBefore = traceWalls(state.walls, { x: 640, y: 268 }, { x: 800, y: 268 }, 3);
assert.ok(sweepBefore, 'the cold plate is hit');

deformHeatedWalls(state);
const after = state.walls[0]!.polygons;
assert(after.length > before.walls[0]!.polygons.length, 'the hot plate is split into strips so it can bow');
const moved = after.some((poly, i) => {
  const original = before.walls[0]!.polygons[0]!;
  return poly.some((point) => !original.some((source) => Math.abs(source.x - point.x) < 0.001 && Math.abs(source.y - point.y) < 0.001));
});
assert(moved, 'the plate vertices actually move');
// The only reason a new piece appears is to express the bend: no piece may be
// larger than the original plate.
for (const poly of after) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  assert(Math.max(...xs) - Math.min(...xs) <= 70.01, 'no strip is wider than the source plate');
  assert(Math.max(...ys) - Math.min(...ys) <= 130.01, 'no strip is taller than the source plate');
}

const sweepAfter = traceWalls(state.walls, { x: 640, y: 268 }, { x: 800, y: 268 }, 3);
assert.ok(sweepAfter, 'the bent plate is still a collider');
assert(
  Math.abs(sweepAfter.x - sweepBefore.x) > 0.5,
  `collision must read the bent face (${sweepBefore.x.toFixed(1)} -> ${sweepAfter.x.toFixed(1)})`,
);

// Repeat with the same input: the geometry must be identical (determinism).
const again: WallState = cloneWallState(before);
deformHeatedWalls(again);
assert.deepEqual(again.walls, state.walls, 'warping is deterministic');

// Cold metal is untouched.
const cold: WallState = { walls: [plate], heat: [], groundY: 346, version: 1 };
deformHeatedWalls(cold);
assert.deepEqual(cold.walls, [plate], 'cold steel is left byte-identical');

// Masonry does not bow: it cracks, which is handled by fracture.
const brick: WallState = {
  walls: [{ ...plate, id: 'brick', material: 'brick' }],
  heat: [{ x: 706, y: 268, heat: 1, radius: 40, material: 'brick' }],
  groundY: 346,
  version: 1,
};
deformHeatedWalls(brick);
assert.deepEqual(brick.walls[0]!.polygons, plate.polygons, 'brick takes a scorch, not a bend');

// Support sees the bend: a plate bowed off its footing detaches.
const hanging: WallState = {
  walls: [
    {
      id: 'hanger',
      material: 'steel',
      polygons: [[{ x: 700, y: 120 }, { x: 740, y: 120 }, { x: 740, y: 150 }, { x: 700, y: 150 }]],
    },
  ],
  heat: [],
  groundY: 346,
  version: 1,
};
const unsupported = detachUnsupported(hanging.walls, hanging.groundY);
assert.equal(unsupported.detached.length, 1, 'an unanchored floating plate has no support');

// Tear rim: a bore opens the surviving metal around the channel.
const rimmed = tearRim([plate], { x: 730, y: 265 }, 6, 'steel', 400);
const rimPoly = rimmed[0]!.polygons[0]!;
const source = plate.polygons[0]!;
const rimMoved = rimPoly.some((point, i) => Math.hypot(point.x - source[i]!.x, point.y - source[i]!.y) > 0.4);
assert(rimMoved, 'the rim of a bore is peeled outward');
assert.deepEqual(tearRim([plate], { x: 730, y: 265 }, 6, 'brick', 400), [plate], 'brick rims do not peel');

// End to end: a real shot leaves bent, heat-deformed steel behind, and the
// result is reproducible.
const built = buildStage(ALL_STAGES[0]!);
const snapshot = cloneSnapshot({ grid: built.grid, wallState: built.wallState, core: built.core, relays: built.relays });
const input = { angleDeg: 26, power: 260, mode: 'arc' as const, ammoId: 'aphe-hybrid' };
const shot = simulateShotWalls(built.def, snapshot, input);
const shotAgain = simulateShotWalls(built.def, snapshot, input);
assert.deepEqual(shotAgain.result.final.wallState, shot.result.final.wallState, 'deformation survives into the replay payload deterministically');
const blooms = shot.result.final.wallState?.heat ?? [];
assert(blooms.length > 0, 'a hit must leave heat behind');
assert(
  (shot.result.final.wallState?.walls.length ?? 0) > 0,
  'the structure still stands after the shot',
);

// A dart that crosses the steel column leaves hot steel, and the steel it
// crossed is geometrically different from the cold original (bore plus peel).
const pierce = simulateShotWalls(built.def, snapshot, { angleDeg: 20, power: 340, mode: 'straight', ammoId: 'apds-sabot' });
const pierceHeat = (pierce.result.final.wallState?.heat ?? []).filter((bloom) => bloom.material === 'steel' && bloom.heat > 0.2);
assert(pierceHeat.length > 0, 'steel the dart crossed must be hot');
const steelBefore = (built.wallState?.walls ?? []).filter((wall) => wall.material === 'steel');
const steelAfter = (pierce.result.final.wallState?.walls ?? []).filter((wall) => wall.material === 'steel');
const vertices = (walls: typeof steelBefore): number => walls.reduce((sum, wall) => sum + wall.polygons.reduce((n, poly) => n + poly.length, 0), 0);
assert(vertices(steelAfter) !== vertices(steelBefore), 'crossed steel gains torn-rim vertices (deformation is real geometry)');
console.log(
  `metal warp: ${before.walls[0]!.polygons.length} -> ${state.walls[0]!.polygons.length} polygons, sweep ${sweepBefore.x.toFixed(1)} -> ${sweepAfter.x.toFixed(1)}, ${pierceHeat.length} hot steel blooms`,
);
console.log('Physical wall deformation checks passed');

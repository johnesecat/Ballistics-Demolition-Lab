import assert from 'node:assert/strict';
import { MAX_RIM_VERTICES, deformHeatedWalls, tearRim } from '../src/game/sim/wall-deform';
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

// Tear rim: a bore opens the surviving metal around the channel. The survivor
// here is what the fracture pass actually leaves behind -- a plate with the
// channel already notched out of it -- because that is the lip that peels.
const survivor: Wall = {
  id: 'survivor',
  material: 'steel',
  polygons: [
    [
      { x: 700, y: 200 },
      { x: 760, y: 200 },
      { x: 760, y: 240 },
      { x: 736, y: 240 },
      { x: 736, y: 290 },
      { x: 760, y: 290 },
      { x: 760, y: 330 },
      { x: 700, y: 330 },
    ],
  ],
};
const channel = { x: 730, y: 265 };
const rimmed = tearRim([survivor], channel, 8, 'steel', 520);
const rimPoly = rimmed[0]!.polygons[0]!;
assert(rimPoly.length > survivor.polygons[0]!.length, 'the lip around the bore gains vertices');
const inward = (point: { x: number; y: number }): number => Math.hypot(point.x - channel.x, point.y - channel.y);
const lipBefore = survivor.polygons[0]!.filter((p) => inward(p) < 30).map(inward);
const lipAfter = rimPoly.filter((p) => inward(p) < 40).map(inward);
assert(
  Math.max(...lipAfter) > Math.max(...lipBefore) + 0.5,
  'the lip is pushed away from the channel (the hole opens)',
);
const brickPlate = { ...survivor, material: 'brick' as const };
assert.deepEqual(tearRim([brickPlate], channel, 8, 'brick', 520), [brickPlate], 'brick rims do not peel');

// A long mission hits the same plate again and again. Each bore may add a lip,
// but the vertex budget is hard: the twelfth bore through the same plate costs
// no more geometry than the third, which is what keeps an iPhone frame budget
// stable over a five-shot mission.
const density = (walls: Wall[]): number => walls.reduce((sum, wall) => sum + wall.polygons.reduce((n, poly) => n + poly.length, 0), 0);
let bored = [plate];
const growth: number[] = [];
for (let i = 0; i < 12; i += 1) {
  bored = tearRim(bored, { x: 706 + (i % 4) * 14, y: 216 + Math.floor(i / 4) * 40 }, 5, 'steel', 520);
  growth.push(density(bored));
}
const capped = Math.max(...bored.flatMap((wall) => wall.polygons.map((poly) => poly.length)));
assert(
  capped <= MAX_RIM_VERTICES,
  `a polygon may not exceed ${MAX_RIM_VERTICES} vertices, got ${capped} after 12 bores`,
);
// Once the lip has its vertices, further bores reuse them: the last third of
// the bores must not add a single vertex.
assert(
  new Set(growth.slice(7)).size === 1,
  `repeated bores must stop growing the outline (bores 3..12: ${growth.slice(2).join(', ')})`,
);
assert(growth[11]! < density([plate]) * 12, `twelve bores stay bounded, got ${growth[11]} vertices`);

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

import assert from 'node:assert/strict';
import { projectileBounds, projectileCells } from '../src/game/render/projectile-art';
import { buildStage } from '../src/game/stages/generator';
import { ALL_STAGES } from '../src/game/stages/campaign';
import { cloneSnapshot } from '../src/game/stages/types';
import { simulateShotWalls } from '../src/game/sim/wall-simulator';

/**
 * Projectile body checks: the reference silhouette is built from whole square
 * cells, squash deforms those cells in pixels, and the casing keeps a physical
 * post-impact timeline instead of freezing on the wall.
 */

const flight = projectileCells(0);
const flying = projectileBounds(flight);
assert(flight.length > 300, `reference body needs detail, got ${flight.length} cells`);
assert(flying.width > flying.height, `in flight the dart points along X, got ${flying.width}x${flying.height}`);
assert.equal(flight.filter((cell) => cell.part.startsWith('filler')).length, 0, 'filler stays inside an intact casing');
assert(flight.every((cell) => Number.isInteger(cell.x) && Number.isInteger(cell.y)), 'every cell is snapped to whole pixels');
assert.equal(new Set(flight.map((cell) => `${cell.x}|${cell.y}`)).size, flight.length, 'no duplicate cells');

const crushed = projectileCells(1, 0.5);
const crushedBounds = projectileBounds(crushed);
assert(crushedBounds.height > crushedBounds.width, `squash must pancake the body, got ${crushedBounds.width}x${crushedBounds.height}`);
assert(crushedBounds.width < flying.width * 0.75, `squash must shorten the body (${crushedBounds.width} vs ${flying.width})`);
assert(crushedBounds.height > flying.height * 1.35, `squash must widen the body (${crushedBounds.height} vs ${flying.height})`);
assert(crushed.filter((cell) => cell.part.startsWith('filler')).length > 10, 'heavy squash exposes the yellow filler');
assert.deepEqual(crushed, projectileCells(1, 0.5), 'deformation is deterministic');
console.log(`projectile pixels: ${flight.length} cells ${flying.width}x${flying.height} -> ${crushed.length} cells ${crushedBounds.width}x${crushedBounds.height}`);

const built = buildStage(ALL_STAGES[0]!);
const snapshot = cloneSnapshot({ grid: built.grid, wallState: built.wallState, core: built.core, relays: built.relays });

// A plate stop: the shell gets a wreck timeline after the flight frames.
const stop = simulateShotWalls(built.def, snapshot, { angleDeg: 26, power: 260, mode: 'arc', ammoId: 'aphe-hybrid' });
assert.equal(stop.result.impact?.kind, 'cell', 'opening shot must stop on the battery');
assert(stop.result.wreck.length > 30, `wreck needs a full physical tail, got ${stop.result.wreck.length}`);
const first = stop.result.wreck[0]!;
const last = stop.result.wreck[stop.result.wreck.length - 1]!;
assert(last.t > first.t + 500, 'wreck must last most of the replay');
assert(last.y <= built.wallState!.groundY + 2, `wreck must settle on the ground, got y=${last.y}`);
const stopAgain = simulateShotWalls(built.def, snapshot, { angleDeg: 26, power: 260, mode: 'arc', ammoId: 'aphe-hybrid' });
assert.equal(stopAgain.result.wreck.length, stop.result.wreck.length, 'wreck is deterministic');
console.log(`plate wreck: ${stop.result.wreck.length} frames, settled at ${Math.round(last.x)},${Math.round(last.y)}`);

// The same shell passes through a thin plate and keeps its flight; a core hit
// consumes the casing, so it has no wreck.
const direct = simulateShotWalls(built.def, snapshot, { angleDeg: 58, power: 280, mode: 'arc', ammoId: 'aphe-hybrid' });
assert(direct.result.coreDestroyed, 'direct core hit still clears');
assert.equal(direct.result.wreck.length, 0, 'a breaching core hit consumes the shell');

const ground = simulateShotWalls(built.def, snapshot, { angleDeg: 4, power: 40, mode: 'arc', ammoId: 'he-blast' });
assert.equal(ground.result.impact?.kind, 'ground', 'low shot lands on the seabed');
assert(ground.result.wreck.length > 30, 'grounded shell still tumbles');
console.log('projectile wreck physics: ok');

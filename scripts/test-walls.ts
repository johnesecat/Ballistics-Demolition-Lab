import { buildStage } from '../src/game/stages/generator';
import { ALL_STAGES } from '../src/game/stages/campaign';
import { cloneSnapshot } from '../src/game/stages/types';
import { traceWalls, raySpanInWall } from '../src/game/sim/fracture';
import { coreCoverFraction, detachUnsupported, wallsArea, wallsFromSnapshot } from '../src/game/sim/walls';
import { simulateShotWalls } from '../src/game/sim/wall-simulator';
import { previewShot } from '../src/game/sim/preview';
import { THICKNESS_CAP, crossLayer, makeProjectileBody } from '../src/game/sim/projectile-body';

function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }

const stage = buildStage(ALL_STAGES[0]!);
const snapshot = cloneSnapshot({ grid: stage.grid, wallState: stage.wallState, core: stage.core, relays: stage.relays });
const state = wallsFromSnapshot(snapshot);

// Wall-direct stage: geometry, not a raster, is what the stage carries.
const wallArea = wallsArea(state.walls);
assert(state.walls.length >= 10, `expected authored range walls, got ${state.walls.length}`);
assert(wallArea > 3000, `wall area too small: ${wallArea}`);
assert(snapshot.grid.cells.length === 0, 'grid cells adapter must stay retired');
console.log(`walls: ${state.walls.length} area ${Math.round(wallArea)} (no raster)`);

// Layer measurement + mass/speed penetration: a 3-unit wood plate is crossed,
// a 6-unit wood plate (above the 4-unit cap) always stops the same round.
const plate = { id: 'plate', material: 'wood' as const, polygons: [[{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 30 }, { x: 0, y: 30 }]] };
const span = raySpanInWall(plate, { x: -5, y: 15 }, { x: 1, y: 0 });
assert(Math.abs(span - 3) < 1e-6, `ray span should be 3, got ${span}`);
const body = makeProjectileBody(1, 400);
assert(crossLayer(body, 'wood', 3, 0.45) !== null, 'thin wood plate must be crossed');
const thick = makeProjectileBody(1, 400);
assert(crossLayer(thick, 'wood', 6, 0.45) === null, 'plate above the wood cap must stop the round');
assert(thick.squash === 1, 'a stopped round squashes against the plate');
assert(THICKNESS_CAP.steel === 5 && THICKNESS_CAP.armor === 7, 'caps steel 5 / armor 7');
console.log('layer span + cap: ok');

// traceWalls finds the structure
const contact = traceWalls(state.walls, { x: 100, y: 200 }, { x: 1100, y: 200 }, 2);
assert(contact !== null, 'traceWalls should hit structure');
console.log(`contact: ${contact!.wallId} ${contact!.material} @(${Math.round(contact!.x)},${Math.round(contact!.y)})`);

// Shot reduces wall area (damage authority is walls)
const before = wallsArea(state.walls);
const outcome = simulateShotWalls(stage.def, snapshot, { angleDeg: 21, power: 391, mode: 'arc', ammoId: 'heat-round' });
const after = wallsArea(outcome.wallState.walls);
assert(after <= before, 'wall area should not grow');
assert(outcome.bodies.length > 0, 'shot should spawn fragment bodies');
console.log(`area ${Math.round(before)} -> ${Math.round(after)} bodies=${outcome.bodies.length} impact=${outcome.result.impact ? 'yes' : 'no'}`);

// Determinism
const o2 = simulateShotWalls(stage.def, snapshot, { angleDeg: 21, power: 391, mode: 'arc', ammoId: 'heat-round' });
assert(o2.bodies.length === outcome.bodies.length, 'deterministic body count');
assert(Math.abs(wallsArea(o2.wallState.walls) - after) < 1, 'deterministic area');
console.log('deterministic replay: ok');

// Support detach: floating wall falls; anchored display blocks do not.
const floating = { walls: [{ id: 'f', material: 'brick' as const, polygons: [[{x:100,y:50},{x:140,y:50},{x:140,y:70},{x:100,y:70}]] }], heat: [], groundY: 346, version: 1 as const };
const det = detachUnsupported(floating.walls, 346);
assert(det.detached.length === 1, 'floating wall should detach');
const anchored = detachUnsupported([{ ...floating.walls[0]!, anchored: true }], 346);
assert(anchored.detached.length === 0, 'anchored range blocks must not fall on their own');
// A block floating above another with a wide air gap but overlapping bbox
// (the old support bug) must not count as supported.
const stacked = detachUnsupported([
  { id: 'ground', material: 'brick', polygons: [[{x:0,y:300},{x:40,y:300},{x:40,y:346},{x:0,y:346}]] },
  { id: 'float', material: 'brick', polygons: [[{x:0,y:200},{x:40,y:200},{x:40,y:240},{x:0,y:240}]] },
], 346);
assert(stacked.detached.length === 1, 'bbox overlap across an air gap is not support');
console.log('support + anchoring: ok');

// Core cover computable from walls
const cover = coreCoverFraction(state, snapshot.core);
assert(cover >= 0 && cover <= 1, 'cover fraction in range');
console.log(`core cover fraction: ${cover.toFixed(2)}`);

// Preview honesty: a shot stopped by the brick column must not claim a core
// hit. The preview now carries a penetration body instead of tracing a
// ballistic line straight through the wall.
const openingAim = { angleDeg: 26, power: 300, mode: 'arc' as const, ammoId: 'aphe-hybrid' };
const preview = previewShot(stage.def, snapshot, openingAim);
const openingShot = simulateShotWalls(stage.def, snapshot, openingAim);
const actualCoreHit = openingShot.result.final.core.hp < snapshot.core.hp;
assert(preview.willHitCore === actualCoreHit, `preview core claim ${preview.willHitCore} disagrees with shot ${actualCoreHit}`);
assert(!preview.willHitCore, 'opening aim must not promise a core hit through the brick column');
assert(preview.firstContact !== null, 'opening aim should still report its wall contact');
assert(openingShot.result.final.core.hp === snapshot.core.hp, 'opening shot must leave the core untouched');
console.log(`preview honesty: willHitCore=${preview.willHitCore} core=${openingShot.result.final.core.hp}/${snapshot.core.hp}`);

console.log('Wall-object simulation checks passed');

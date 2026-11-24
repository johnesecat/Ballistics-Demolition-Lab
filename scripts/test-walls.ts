import { buildStage } from '../src/game/stages/generator';
import { ALL_STAGES } from '../src/game/stages/campaign';
import { cloneSnapshot } from '../src/game/stages/types';
import { traceWalls, raySpanInWall } from '../src/game/sim/fracture';
import { coreCoverFraction, detachUnsupported, wallsArea, wallsFromSnapshot } from '../src/game/sim/walls';
import { snapshotCoreCoverFraction } from '../src/game/stages/generator';
import { deserializeWallState, simulateShotWalls } from '../src/game/sim/wall-simulator';
import { previewShot } from '../src/game/sim/preview';
import { crossLayer, makeProjectileBody } from '../src/game/sim/projectile-body';
import { mergeWallRects } from '../src/game/stages/wall-builder';

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

// Layer measurement + mass/speed penetration: penetration is paid for in
// speed, so a thin plate is crossed and a plate whose cost exceeds the round's
// remaining speed stops it.
const plate = { id: 'plate', material: 'wood' as const, polygons: [[{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 30 }, { x: 0, y: 30 }]] };
const span = raySpanInWall(plate, { x: -5, y: 15 }, { x: 1, y: 0 });
assert(Math.abs(span - 3) < 1e-6, `ray span should be 3, got ${span}`);
const body = makeProjectileBody(1, 400);
assert(crossLayer(body, 'wood', 3, 0.45) !== null, 'thin wood plate must be crossed');
const thicker = makeProjectileBody(1, 400);
assert(crossLayer(thicker, 'wood', 6, 0.45) !== null, 'a 6-unit timber plate is within reach of a 400 speed round');
const thick = makeProjectileBody(1, 400);
assert(crossLayer(thick, 'steel', 30, 0.78) === null, 'a plate whose speed cost exceeds the round stops it');
assert(thick.squash === 1, 'a stopped round squashes against the plate');
const fast = makeProjectileBody(1, 400);
assert(crossLayer(fast, 'steel', 6, 0.78) !== null, 'a thick steel plate is bored when the round can pay for it');
console.log('layer span + kinetic budget: ok');

// Wall coalescing must be an exact union: four touching cells become one wall
// with the same area, while an air gap or a different material never merges.
const cellRect = (x: number, y: number, material: 'brick' | 'steel' = 'brick') => ({
  id: `c${x}-${y}`,
  material,
  polygons: [[{ x, y }, { x: x + 6, y }, { x: x + 6, y: y + 6 }, { x, y: y + 6 }]],
});
const cells = [cellRect(0, 0), cellRect(6, 0), cellRect(0, 6), cellRect(6, 6)];
const mergedCells = mergeWallRects(cells);
assert(mergedCells.length === 1, `touching cells must merge into one wall, got ${mergedCells.length}`);
assert(Math.abs(wallsArea(mergedCells) - wallsArea(cells)) < 1e-6, 'merging must conserve area exactly');
assert(mergedCells[0]!.id === 'w0', 'merged ids are deterministic');
const gapCells = mergeWallRects([cellRect(0, 0), cellRect(9, 0)]);
assert(gapCells.length === 2, 'an air gap must not merge');
const mixedCells = mergeWallRects([cellRect(0, 0), cellRect(6, 0, 'steel')]);
assert(mixedCells.length === 2, 'different materials must not merge');
const tinyGap = mergeWallRects([cellRect(0, 0), cellRect(6.0000001, 0)]);
assert(tinyGap.length === 2, 'even a subpixel gap must not be filled by migration');
assert(tinyGap[1]!.polygons[0]![0]!.x === 6.0000001, 'migration must preserve exact coordinates');
console.log(`wall coalescing: ${cells.length} cells -> ${mergedCells.length} wall, area conserved`);

// Legacy snapshots must preserve actual holes, material boundaries, anchoring
// and heat while coalescing their old one-wall-per-cell geometry.
const legacyWalls = [
  ...cells,
  cellRect(18, 0),
  { ...cellRect(24, 0), anchored: true },
  cellRect(30, 0, 'steel'),
];
const savedHeat = [{ x: 3, y: 3, heat: 0.7, radius: 10, material: 'brick' }];
const loaded = deserializeWallState(JSON.stringify({ walls: legacyWalls, heat: savedHeat, groundY: 346, version: 1 }));
assert(loaded.walls.length === 4, `legacy cells should merge without bridging gaps or anchors, got ${loaded.walls.length}`);
assert(wallsArea(loaded.walls) === 252, 'migration must preserve the existing damaged geometry');
assert(JSON.stringify(loaded.heat) === JSON.stringify(savedHeat), 'migration must preserve saved heat');
assert(loaded.walls.some((w) => w.anchored), 'migration must preserve anchoring');
assert(traceWalls(loaded.walls, { x: 15, y: -5 }, { x: 15, y: 15 }) === null, 'migration must keep the breach open');
assert(JSON.stringify(deserializeWallState(JSON.stringify(loaded))) === JSON.stringify(loaded), 'loading migrated geometry must be stable');
console.log('legacy wall-state migration: ok');

// A smoke check for every authored campaign seed, independent of solution search.
assert(ALL_STAGES.length === 15, `expected 15 campaign stages, got ${ALL_STAGES.length}`);
for (const def of ALL_STAGES) {
  const built = buildStage(def);
  const walls = built.wallState.walls;
  assert(walls.length > 0, `${def.code}: expected wall geometry`);
  assert(built.diagnostics.warnings.length === 0, `${def.code}: generation warnings: ${built.diagnostics.warnings.join(', ')}`);
  assert(detachUnsupported(walls, built.wallState.groundY).detached.length === 0, `${def.code}: unsupported walls`);
  assert(new Set(walls.map((wall) => wall.id)).size === walls.length, `${def.code}: wall IDs must be unique`);
  assert(walls.every((wall) => wall.polygons.length > 0 && wall.polygons.every((poly) => poly.length >= 3 && poly.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))), `${def.code}: invalid wall geometry`);
  assert(wallsArea(walls) > 0, `${def.code}: expected nonzero wall area`);
  assert(Number.isFinite(built.core.x) && Number.isFinite(built.core.y) && built.core.hp > 0, `${def.code}: invalid core`);
  assert(JSON.stringify(walls) === JSON.stringify(buildStage(def).wallState.walls), `${def.code}: generation must be deterministic`);
  // AH-01 is a deliberately authored range of separate anchored parts, not
  // a cell-generated bunker; preserve those part identities.
  if (def.code !== 'AH-01') assert(mergeWallRects(walls).length === walls.length, `${def.code}: stage walls must already be merged`);
  console.log(`${def.code}: ${walls.length} walls, generated cleanly`);
}

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

// A core housed in a chamber (AH-02 expose-core) must not read zero cover just
// because its shell sits outside the immediate ring: that made the mission an
// instant win at deploy. Cover must be measurable and above its clear target.
const exposeStage = buildStage(ALL_STAGES[1]!);
const exposeCover = snapshotCoreCoverFraction({
  grid: exposeStage.grid,
  wallState: exposeStage.wallState,
  core: exposeStage.core,
  relays: exposeStage.relays,
});
assert(exposeCover > 0.05, `chambered core cover must be measured, got ${exposeCover}`);
assert(
  exposeCover > (exposeStage.def.objective.threshold ?? 0.3),
  `expose stage must start shielded, got ${exposeCover}`,
);
console.log(`chambered core cover: ${exposeCover.toFixed(2)}`);

// AH-02 stays clearable inside its 4-shot budget after the chamber-cover fix.
// Pinned two-shot proof (not a search): quake opens the shell, petal strips it
// below the 30% target while the 110 HP core survives.
let exposeSnap = cloneSnapshot({
  grid: exposeStage.grid,
  wallState: exposeStage.wallState,
  core: exposeStage.core,
  relays: exposeStage.relays,
});
const exposeSolution = [
  { angleDeg: 31, power: 330, mode: 'arc' as const, ammoId: 'quake' },
  { angleDeg: 43, power: 290, mode: 'arc' as const, ammoId: 'petal' },
];
for (const input of exposeSolution) {
  const shot = simulateShotWalls(exposeStage.def, exposeSnap, input);
  exposeSnap = shot.result.final;
  assert(!exposeSnap.core.destroyed && exposeSnap.core.hp > 0, 'expose shots must keep the core alive');
}
const exposedCover = snapshotCoreCoverFraction(exposeSnap);
assert(
  exposedCover <= (exposeStage.def.objective.threshold ?? 0.3),
  `AH-02 must reach the expose threshold, got ${exposedCover.toFixed(3)}`,
);
assert(exposeSolution.length <= exposeStage.def.shots, 'solution must fit the authored shot budget');
console.log(
  `AH-02 expose: cover ${exposeCover.toFixed(2)} -> ${exposedCover.toFixed(2)} in ${exposeSolution.length}/${exposeStage.def.shots} shots, core ${exposeSnap.core.hp}`,
);

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

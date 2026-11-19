import assert from 'node:assert/strict';
import { sweepCircleEntry } from '../src/game/sim/collision';
import { buildStage } from '../src/game/stages/generator';
import { ALL_STAGES } from '../src/game/stages/campaign';
import { cloneSnapshot } from '../src/game/stages/types';
import { previewShot } from '../src/game/sim/preview';
import { simulateShotWalls } from '../src/game/sim/wall-simulator';

/**
 * Collision checks: swept core entry, Bankshot ricochets in the live solver
 * (they used to exist only in the preview), and ground contact.
 */

// A thin segment that crosses a circle but ends outside it: the endpoint-only
// test the solver used before saw nothing here.
const graze = sweepCircleEntry({ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 15, y: 3, radius: 5 });
assert(graze !== null, 'swept core test must catch a crossing circle');
const entryX = 30 * graze!;
assert(Math.abs(Math.hypot(entryX - 15, 3) - 5) < 1e-6, 'entry point must sit on the circle edge');
assert(graze! > 0.3 && graze! < 0.45, `expected entry around 0.37, got ${graze}`);
assert.equal(sweepCircleEntry({ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 45, y: 0, radius: 5 }), null, 'miss must stay a miss');
assert.equal(sweepCircleEntry({ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 2, y: 0, radius: 4 }), 0, 'starting inside is contact at 0');
console.log('swept core entry: ok');

const def = ALL_STAGES[0]!;
const built = buildStage(def);
const snapshot = cloneSnapshot({ grid: built.grid, wallState: built.wallState, core: built.core, relays: built.relays });

// Bankshot: preview and live shot must agree that a ricochet happens.
for (const [angleDeg, power, expected] of [[15, 400, 1], [20, 320, 2], [30, 240, 2]] as const) {
  const input = { angleDeg, power, mode: 'arc' as const, ammoId: 'bankshot' };
  const preview = previewShot(def, snapshot, input);
  const live = simulateShotWalls(def, snapshot, input);
  const bounces = live.result.effects.filter((event) => event.kind === 'bounce').length;
  assert.equal(preview.ricochets, expected, `preview ricochets at ${angleDeg}/${power}`);
  assert.equal(bounces, expected, `live ricochets at ${angleDeg}/${power}`);
  assert.notEqual(live.result.impact, null, `bounced shot must still resolve an impact at ${angleDeg}/${power}`);
}
console.log('live ricochet matches preview: ok');

// Ground: a low shot that clears the battery must stop on the seabed, not fly
// through it. HE still bursts, so the impact carries its blast phase.
const ground = simulateShotWalls(def, snapshot, { angleDeg: 4, power: 40, mode: 'arc', ammoId: 'he-blast' });
assert.equal(ground.result.impact?.kind, 'ground', 'low shot must resolve on the ground');
const groundY = ground.result.impact!.y;
assert(groundY > 330 && groundY < 346, `ground contact expected near y=343, got ${groundY}`);
assert(ground.result.effects.some((event) => event.kind === 'blast'), 'ground hit must burst the warhead');
assert(ground.result.phaseWallStates.length >= 1, 'ground burst must produce a wall phase record');
console.log('ground contact + burst: ok');

// A direct core hit is still lethal after the swept test and the hit ordering.
const direct = simulateShotWalls(def, snapshot, { angleDeg: 58, power: 280, mode: 'arc', ammoId: 'aphe-hybrid' });
assert(direct.result.coreDestroyed, 'direct core hit still destroys the core');
assert(direct.result.coreDamage >= built.core.maxHp, 'core damage must cover the core pool');
console.log(`direct core hit: ${direct.result.coreDamage} damage`);

// Determinism: the new ordering and bounce path stay seed-stable.
const repeat = simulateShotWalls(def, snapshot, { angleDeg: 20, power: 320, mode: 'arc', ammoId: 'bankshot' });
assert.equal(repeat.result.coreDamage, simulateShotWalls(def, snapshot, { angleDeg: 20, power: 320, mode: 'arc', ammoId: 'bankshot' }).result.coreDamage, 'deterministic core damage');
assert.equal(repeat.result.effects.filter((event) => event.kind === 'bounce').length, 2, 'deterministic ricochets');
console.log('deterministic collision path: ok');

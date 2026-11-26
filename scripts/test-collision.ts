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

// There is one collision model now: no scripted bounce path. A glancing shot at
// a steel face either skids along it or bores through it -- in both cases the
// pixels decide, and the round must never pass through a plate without paying.
for (const [angleDeg, power] of [[15, 400], [20, 320], [26, 441]] as const) {
  const input = { angleDeg, power, mode: 'arc' as const, ammoId: 'bankshot' };
  const live = simulateShotWalls(def, snapshot, input);
  assert.notEqual(live.result.impact, null, `a bankshot must resolve an impact at ${angleDeg}/${power}`);
  assert(live.carved > 0, `a bankshot must engage the plate at ${angleDeg}/${power}`);
  assert(live.result.track, `the body must be simulated at ${angleDeg}/${power}`);
  const com = live.body!.centre();
  assert(com.x > live.result.impact!.x - 40, `the round must not be flung back off the plate at ${angleDeg}/${power}`);
  const again = simulateShotWalls(def, snapshot, input);
  assert.deepEqual(again.result.track?.xs, live.result.track!.xs, `deterministic body at ${angleDeg}/${power}`);
  assert.equal(again.result.effects.filter((event) => event.kind === 'bounce').length,
    live.result.effects.filter((event) => event.kind === 'bounce').length, `deterministic contacts at ${angleDeg}/${power}`);
}
console.log('glancing shots engage the plate through the same body: ok');

// Ground: a low shot that clears the battery must stop on the seabed, not fly
// through it. HE still bursts, so the impact carries its blast phase.
const ground = simulateShotWalls(def, snapshot, { angleDeg: 4, power: 40, mode: 'arc', ammoId: 'he-blast' });
assert.equal(ground.result.impact?.kind, 'ground', 'low shot must resolve on the ground');
const groundY = ground.result.impact!.y;
assert(groundY >= 340 && groundY <= 347, `ground contact expected on the seabed, got ${groundY}`);
assert(ground.result.effects.some((event) => event.kind === 'blast'), 'ground hit must burst the warhead');
assert(ground.result.phaseWallStates.length >= 1, 'ground burst must produce a wall phase record');
console.log('ground contact + burst: ok');

// A direct core hit is still lethal after the swept test and the hit ordering.
// A core is hardened: one round damages it but cannot finish it, because the
// damage it deals is the energy it still has when it arrives -- and a core takes
// more than one round's worth. That is the campaign's balance rule now.
const direct = simulateShotWalls(def, snapshot, { angleDeg: 58, power: 280, mode: 'arc', ammoId: 'aphe-hybrid' });
assert(direct.result.coreDamage > 0, 'a direct core hit must damage the core');
assert(!direct.result.coreDestroyed, 'a single APHE hit must not destroy a hardened core');
assert(direct.result.coreDamage < built.core.maxHp, 'one hit is less than the core pool');
console.log(`direct core hit: ${direct.result.coreDamage.toFixed(0)} / ${built.core.maxHp} core health`);

// Determinism: the new ordering and bounce path stay seed-stable.
const repeat = simulateShotWalls(def, snapshot, { angleDeg: 20, power: 320, mode: 'arc', ammoId: 'bankshot' });
assert.equal(repeat.result.coreDamage, simulateShotWalls(def, snapshot, { angleDeg: 20, power: 320, mode: 'arc', ammoId: 'bankshot' }).result.coreDamage, 'deterministic core damage');
assert.equal(repeat.carved, simulateShotWalls(def, snapshot, { angleDeg: 20, power: 320, mode: 'arc', ammoId: 'bankshot' }).carved, 'deterministic carving');
console.log('deterministic collision path: ok');

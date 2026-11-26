import assert from 'node:assert/strict';
import { projectileBounds, projectileCells } from '../src/game/render/projectile-art';
import { buildStage } from '../src/game/stages/generator';
import { ALL_STAGES } from '../src/game/stages/campaign';
import { cloneSnapshot } from '../src/game/stages/types';
import { simulateShotWalls } from '../src/game/sim/wall-simulator';
import { shotCameraFrame, WORLD } from '../src/game/config';

/**
 * Projectile body checks: the reference silhouette is built from whole square
 * cells, squash deforms those cells in pixels, and the casing keeps a physical
 * post-impact timeline instead of freezing on the wall.
 */

const flight = projectileCells(0);
const flying = projectileBounds(flight);
// The reference round is the AP Solid Shot: a long ogival shell about 3.8:1
// with an amber driving band at the base, read off the newest frames
// (native 2556x1179), not the old blunt APHE body or the earlier finned dart.
assert(flight.length > 100, `reference body needs detail, got ${flight.length} cells`);
assert(
  flying.width / flying.height > 3.2 && flying.width / flying.height < 4.4,
  `the shot is ~3.8:1, got ${flying.width}x${flying.height}`,
);
assert.equal(flying.width, 24, 'the sampled round is exactly 24 cells long');
assert.equal(flying.height, 7, 'the sampled round is the 6-row casing plus the proud band');
assert(flight.some((cell) => cell.part.startsWith('band')), 'the amber driving band must be part of the art');
assert(!flight.some((cell) => (cell.part as string) === 'cyan'), 'the reference round has no cyan exhaust');
assert(flying.width > flying.height, `in flight the shot points along X, got ${flying.width}x${flying.height}`);
assert.equal(flight.filter((cell) => cell.part === 'steel').length, 0, 'the steel core stays inside an intact casing');
assert(flight.some((cell) => cell.part === 'cap'), 'the boat-tail cap is part of the art');
assert(flight.some((cell) => cell.part === 'tip'), 'the nose point is part of the art');
// The band sits at the base of the round, not mid-body: every band cell must be
// behind the mid-point of the silhouette.
const bandXs = flight.filter((cell) => cell.part.startsWith('band')).map((cell) => cell.x);
assert(bandXs.length > 0, 'the driving band is drawn');
const minX = Math.min(...flight.map((cell) => cell.x));
const maxX = Math.max(...flight.map((cell) => cell.x));
assert(
  Math.max(...bandXs) < minX + (maxX - minX) * 0.35,
  `the band belongs at the base, band ends at ${Math.max(...bandXs)} of ${minX}..${maxX}`,
);
// The nose is a fine point, not a squared-off block: the extreme forward cell
// is a single cell wide.
const noseColumn = flight.filter((cell) => cell.x === maxX);
assert.equal(noseColumn.length, 1, 'the nose tapers to a single cell');
assert(flight.every((cell) => Number.isInteger(cell.x) && Number.isInteger(cell.y)), 'every cell is snapped to whole pixels');
assert.equal(new Set(flight.map((cell) => `${cell.x}|${cell.y}`)).size, flight.length, 'no duplicate cells');

const crushed = projectileCells(1, 0.5);
const crushedBounds = projectileBounds(crushed);
// The shot is a long 3.8:1 body, so a crushed round shortens and fattens: the
// checks are the exchange of the two, and that the casing has opened onto the
// core, not a specific pixel count (the crush is the solver's answer now).
assert(crushedBounds.width <= flying.width, `squash must not lengthen the body (${crushedBounds.width} vs ${flying.width})`);
assert(crushedBounds.height >= flying.height, `squash must widen the body (${crushedBounds.height} vs ${flying.height})`);
assert(
  crushed.filter((cell) => cell.part === 'steel').length > 10,
  'a crushed casing exposes the steel core',
);
assert.deepEqual(crushed, projectileCells(1, 0.5), 'deformation is deterministic');
console.log(`projectile pixels: ${flight.length} cells ${flying.width}x${flying.height} -> ${crushed.length} cells ${crushedBounds.width}x${crushedBounds.height}`);

const built = buildStage(ALL_STAGES[0]!);
const snapshot = cloneSnapshot({ grid: built.grid, wallState: built.wallState, core: built.core, relays: built.relays });

// One model, one body: the round hands itself to the solver at its first solid
// touch and the solver decides the rest. The shot reports the pixels it
// destroyed, the pose it came to rest in, and the frame samples it recorded.
const stop = simulateShotWalls(built.def, snapshot, { angleDeg: 26, power: 200, mode: 'arc', ammoId: 'aphe-hybrid' });
assert(stop.result.impact, 'the opening shot must reach the battery');
const track = stop.result.track;
assert(track, 'a round that touches a wall must hand its body to the solver');
assert(track.count > 4, `the track must sample the contact window, got ${track.count} frames`);
assert(track.nodes === 127, 'the track carries the whole cast lattice');
assert(stop.carved > 0, 'the round must destroy the pixels it passes through');
assert(stop.body?.isResting, 'a stopped round must come to rest');
const rest = stop.body!.centre();
assert(rest.x > 800, `the round must end forward on the battery, not bounce back (x=${rest.x.toFixed(0)})`);
assert(stop.result.effects.some((event) => event.kind === 'penetrate'), 'the bore must be reported as a penetration');
const firstTrackX = track.xs[0]! / 4;
assert(track.xs.length === track.count * track.nodes, 'the track buffer is frame-major and complete');
void firstTrackX;

const stopAgain = simulateShotWalls(built.def, snapshot, { angleDeg: 26, power: 200, mode: 'arc', ammoId: 'aphe-hybrid' });
assert.deepEqual(stopAgain.result.track?.xs, track.xs, 'the same shot bakes the same body');
assert.equal(stopAgain.carved, stop.carved, 'the same shot destroys the same pixels');
console.log(`body at rest: ${stop.body!.nodeCount} cells, ${stop.carved} pixels carved, depth ${stop.body!.depth.toFixed(0)}, ${track.count} frames`);

// Energy decides depth: the same round fired harder gets further into the same
// structure, and one that cannot pay stops inside the notch it made.
const soft = simulateShotWalls(built.def, snapshot, { angleDeg: 26, power: 200, mode: 'arc', ammoId: 'ap-solid-shot' });
const hard = simulateShotWalls(built.def, snapshot, { angleDeg: 26, power: 441, mode: 'arc', ammoId: 'ap-solid-shot' });
assert(soft.result.track && hard.result.track, 'both shots hand over their body');
assert(
  hard.body!.depth > soft.body!.depth,
  `a faster round must bore deeper (${hard.body!.depth.toFixed(0)} vs ${soft.body!.depth.toFixed(0)})`,
);
// A fast round can glance along a face and chew less than a slow one that digs
// in, so the invariant is depth, not pixel count: both must carve something.
assert(soft.carved > 0 && hard.carved > 0, 'both rounds must destroy material');
console.log(`depth: ${soft.body!.depth.toFixed(0)} @200 vs ${hard.body!.depth.toFixed(0)} @441`);

// A core is a target inside the body's world, not a wall: a round that reaches
// it does damage proportional to the energy it still has.
const direct = simulateShotWalls(built.def, snapshot, { angleDeg: 14, power: 441, mode: 'arc', ammoId: 'ap-solid-shot' });
assert(direct.result.coreDamage > 0, 'a round that reaches the core must damage it');
assert(direct.result.track, 'a core hit still leaves a simulated body');

// The seabed is solid: a miss ends on the bottom, not through it.
const ground = simulateShotWalls(built.def, snapshot, { angleDeg: 4, power: 40, mode: 'arc', ammoId: 'he-blast' });
assert.equal(ground.result.impact?.kind, 'ground', 'a low shot lands on the seabed');
assert(ground.result.track, 'a grounded round is still simulated as a body');
const groundLastFrame = ground.result.track!;
let lowest = -Infinity;
for (let i = 0; i < groundLastFrame.nodes; i += 1) {
  lowest = Math.max(lowest, groundLastFrame.ys[(groundLastFrame.count - 1) * groundLastFrame.nodes + i]! / 4);
}
assert(lowest <= WORLD.groundY + 2, `the round must rest on the seabed, lowest cell ${lowest.toFixed(1)}`);
console.log(`grounded round: rests at y=${lowest.toFixed(0)} (seabed ${WORLD.groundY})`);

// Camera framing must start wide, track the shell, hold briefly on impact, then
// return to the original view before playback finishes; pauses use replay time.
const wide = shotCameraFrame(0, 1400, 2600, 0.8, 1.8);
const following = shotCameraFrame(700, 1400, 2600, 0.8, 1.8);
const impactView = shotCameraFrame(1500, 1400, 2600, 0.8, 1.8);
const returned = shotCameraFrame(2600, 1400, 2600, 0.8, 1.8);
assert.equal(wide.tracking, 0);
assert.equal(wide.zoom, 0.8);
assert.equal(following.tracking, 1);
assert(following.zoom > wide.zoom, 'flight closes in on the shell');
assert.equal(impactView.tracking, 1);
assert(impactView.zoom >= following.zoom, 'impact remains in close-up');
assert.equal(returned.tracking, 0);
assert.equal(returned.zoom, 0.8);
assert.deepEqual(shotCameraFrame(700, 1400, 2600, 0.8, 1.8), following, 'camera framing is replay-time deterministic');
console.log('shot camera framing: ok');
// Reference impact close-ups are appreciably tighter than the shell-follow view.
assert(impactView.zoom >= following.zoom * 1.2, 'impact zoom should tighten beyond the flight framing');

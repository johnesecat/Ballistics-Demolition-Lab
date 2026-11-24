import assert from 'node:assert/strict';
import { projectileBounds, projectileCells } from '../src/game/render/projectile-art';
import { buildStage } from '../src/game/stages/generator';
import { ALL_STAGES } from '../src/game/stages/campaign';
import { cloneSnapshot } from '../src/game/stages/types';
import { simulateShotWalls } from '../src/game/sim/wall-simulator';
import { shotCameraFrame } from '../src/game/config';

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
// Reviewed by eye from the four newest frames (IMG_4969 / 4971 / 4972 flight,
// IMG_4974 annotated x-ray): the boat-tail cap leads the round (dark strip at
// the very base), then the amber band sits INSET at roughly 20-30% of the
// length (not flush with the base), then the long ogive casing. The old art
// had the band flush at columns 1-2.
const capXs = flight.filter((cell) => cell.part === 'cap').map((cell) => cell.x);
assert(capXs.length >= 12, `the cap leads the round, got ${capXs.length} cap cells`);
assert(Math.max(...capXs) < Math.min(...bandXs), 'the cap sits behind the driving band');
assert(
  Math.min(...bandXs) >= minX + (maxX - minX) * 0.15,
  `the band is inset from the base, starts at ${Math.min(...bandXs)} of ${minX}..${maxX}`,
);
assert(Math.min(...capXs) === minX, 'the cap is the rearmost thing on the round');
assert(flight.every((cell) => Number.isInteger(cell.x) && Number.isInteger(cell.y)), 'every cell is snapped to whole pixels');
assert.equal(new Set(flight.map((cell) => `${cell.x}|${cell.y}`)).size, flight.length, 'no duplicate cells');

const crushed = projectileCells(1, 0.5);
const crushedBounds = projectileBounds(crushed);
// The shot is a long 3.8:1 body, so a full squash shortens it hard and fattens
// it hard: the check is the exchange of the two, not that the result is taller
// than it is long (a 23-cell body cannot become taller than it is long without
// inventing volume).
assert(crushedBounds.width < flying.width * 0.7, `squash must shorten the body (${crushedBounds.width} vs ${flying.width})`);
assert(crushedBounds.height > flying.height * 1.4, `squash must widen the body (${crushedBounds.height} vs ${flying.height})`);
assert(
  crushedBounds.height / crushedBounds.width > 0.6,
  `a crushed long shell must read as a pancake, got ${crushedBounds.width}x${crushedBounds.height}`,
);
assert(
  crushed.filter((cell) => cell.part === 'steel').length > 10,
  'heavy squash opens the casing and exposes the core',
);
assert.deepEqual(crushed, projectileCells(1, 0.5), 'deformation is deterministic');
console.log(`projectile pixels: ${flight.length} cells ${flying.width}x${flying.height} -> ${crushed.length} cells ${crushedBounds.width}x${crushedBounds.height}`);

// Real-time pixel physics: the shell is a mass lattice. On a hard face the nose
// stops, the body piles up, volume is preserved by bulging sideways, and cells
// tear off as shrapnel. Nothing is invented: the cell count never exceeds the
// cast body, and the same inputs always produce the same pixels.
const { ShellImpact } = await import('../src/game/sim/shell-pixels');
const hitSteel = new ShellImpact({ speed: 640, mass: 9, material: 'steel', integrity: 0.65, seed: 991 });
const atRest = { ...projectileBounds(hitSteel.cells()) };
hitSteel.stepTo(0.22);
const crushedDeep = hitSteel.cells();
const deep = projectileBounds(crushedDeep);
assert(deep.width < atRest.width * 0.75, `the crush must shorten the shell, ${deep.width} vs ${atRest.width}`);
assert(deep.height > atRest.height * 1.3, `volume preservation must bulge the shell sideways, ${deep.height} vs ${atRest.height}`);
assert(crushedDeep.length <= flight.length, 'the lattice never invents pixels to fake a bulge');
const detachments = hitSteel.shrapnel().length;
assert(detachments > 0, `impact must tear pixels off as shrapnel, got ${detachments}`);
assert(hitSteel.pixels.every((cell) => Number.isFinite(cell.x) && Number.isFinite(cell.y)), 'deformed cells stay finite');
const repeat = new ShellImpact({ speed: 640, mass: 9, material: 'steel', integrity: 0.65, seed: 991 });
repeat.stepTo(0.22);
assert.deepEqual(repeat.cells(), crushedDeep, 'pixel physics is deterministic for the same shot');
assert.deepEqual(repeat.shrapnel().map((c) => [c.x, c.y]), hitSteel.shrapnel().map((c) => [c.x, c.y]), 'shrapnel is deterministic');

// Mass and material change the outcome, not just the colour.
const heavy = new ShellImpact({ speed: 640, mass: 22, material: 'steel', integrity: 0.65, seed: 991 });
heavy.stepTo(0.22);
const light = new ShellImpact({ speed: 640, mass: 4, material: 'steel', integrity: 0.65, seed: 991 });
light.stepTo(0.22);
assert(
  projectileBounds(heavy.cells()).width > projectileBounds(light.cells()).width,
  'a heavier shell resists the crush more than a light one',
);
// Compare over the whole wreck, not one frame: a hard face tears the casing
// open at once, so by the time the body settles it has shed more of itself.
const settledSteel = new ShellImpact({ speed: 640, mass: 9, material: 'steel', integrity: 0.65, seed: 991 });
settledSteel.stepTo(0.7);
const soft = new ShellImpact({ speed: 640, mass: 9, material: null, integrity: 0.65, seed: 991 });
soft.stepTo(0.7);
assert(
  soft.shrapnel().length < settledSteel.shrapnel().length,
  `a soft face must tear the casing less than steel (${soft.shrapnel().length} vs ${settledSteel.shrapnel().length})`,
);

// Face hardness and carried crumple are live inputs, not decoration: the same
// shot against a harder face crushes deeper and sheds more, and a crumpled
// casing folds wider than a pristine one.
const softFace = new ShellImpact({ speed: 640, mass: 9, material: 'steel', integrity: 0.65, seed: 991, hardness: 0.2, crumple: 0.3 });
softFace.stepTo(0.22);
const hardFace = new ShellImpact({ speed: 640, mass: 9, material: 'steel', integrity: 0.65, seed: 991, hardness: 0.9, crumple: 0.3 });
hardFace.stepTo(0.22);
const softFaceBounds = projectileBounds(softFace.cells());
const hardFaceBounds = projectileBounds(hardFace.cells());
assert(
  hardFaceBounds.width < softFaceBounds.width,
  `a harder face must crush the body shorter (${hardFaceBounds.width} vs ${softFaceBounds.width})`,
);
assert(
  hardFace.shrapnel().length > softFace.shrapnel().length,
  `a harder face must tear off more casing (${hardFace.shrapnel().length} vs ${softFace.shrapnel().length})`,
);
// Carried crumple is carried plastic damage, so a mangled casing sheds more of
// itself than a pristine one under the same impact.
const shedsOf = (crumple: number): number => {
  const hit = new ShellImpact({ speed: 640, mass: 9, material: 'steel', integrity: 0.65, seed: 991, hardness: 0.5, crumple });
  hit.stepTo(0.22);
  return hit.shrapnel().length;
};
assert(shedsOf(1) > shedsOf(0), `a crumpled casing must shed more (${shedsOf(1)} vs ${shedsOf(0)})`);
console.log(`shell lattice: ${atRest.width}x${atRest.height} -> ${deep.width}x${deep.height}, ${detachments} shrapnel cells, deterministic`);

// X-ray conversion (IMG_4974 / IMG_4967): once the round gets close to an
// object it converts to the x-ray look and stays that way. The x-ray palette
// is the orange jacket with a bright steel core, read off the annotated frame.
const { XRAY_PART_COLORS, nearestObstacleDistance } = await import('../src/game/sim/projectile-shell');
const xr = (part: keyof typeof XRAY_PART_COLORS) => XRAY_PART_COLORS[part];
const redOf = (c: number) => (c >> 16) & 0xff;
const blueOf = (c: number) => c & 0xff;
assert(redOf(xr('body')) > blueOf(xr('body')), 'x-ray casing is the orange sleeve, not steel blue');
assert(redOf(xr('rim')) > redOf(xr('body')), 'x-ray orange lightens toward the upper sleeve');
assert(redOf(xr('belly')) < redOf(xr('body')), 'x-ray orange darkens toward the belly');
assert(redOf(xr('steel')) > 150 && Math.abs(((xr('steel') >> 8) & 0xff) - redOf(xr('steel'))) < 25, 'x-ray core is bright pale steel');
assert(redOf(xr('cap')) < 120, 'x-ray cap is dark bronze, not amber');
// Proximity: distance from a point to the nearest wall edge / core surface.
const fakeWalls = [{ id: 'w', material: 'steel' as const, polygons: [[{ x: 100, y: 100 }, { x: 140, y: 100 }, { x: 140, y: 140 }, { x: 100, y: 140 }]] }];
assert(Math.abs(nearestObstacleDistance({ x: 60, y: 120 }, fakeWalls) - 40) < 1e-6, '40 units from the wall face');
assert(nearestObstacleDistance({ x: 500, y: 500 }, fakeWalls) > 300, 'far from the wall stays far');
assert(Math.abs(nearestObstacleDistance({ x: 120, y: 120 }, fakeWalls) - 0) < 1e-6, 'inside a wall is zero (contact)');
assert(
  nearestObstacleDistance({ x: 0, y: 0 }, [], { x: 100, y: 0, radius: 30 }) === 70,
  'the core counts as an object at its surface',
);
console.log('xray palette + proximity: orange sleeve, bright core, wall distance exact');

const built = buildStage(ALL_STAGES[0]!);
const snapshot = cloneSnapshot({ grid: built.grid, wallState: built.wallState, core: built.core, relays: built.relays });

// A plate stop: the shell gets a wreck timeline after the flight frames.
// 26 deg / 200 aphe-hybrid runs out of energy on the first steel face, so it
// squashes and stops there (a faster round bores through and keeps going).
const stop = simulateShotWalls(built.def, snapshot, { angleDeg: 26, power: 200, mode: 'arc', ammoId: 'aphe-hybrid' });
assert.equal(stop.result.impact?.kind, 'cell', 'opening shot must stop on the battery');
assert(stop.result.wreck.length > 30, `wreck needs a full physical tail, got ${stop.result.wreck.length}`);
const first = stop.result.wreck[0]!;
const last = stop.result.wreck[stop.result.wreck.length - 1]!;
assert(last.t > first.t + 500, 'wreck must last most of the replay');
assert(last.y <= built.wallState!.groundY + 2, `wreck must settle on the ground, got y=${last.y}`);
const stopAgain = simulateShotWalls(built.def, snapshot, { angleDeg: 26, power: 200, mode: 'arc', ammoId: 'aphe-hybrid' });
assert.equal(stopAgain.result.wreck.length, stop.result.wreck.length, 'wreck is deterministic');
console.log(`plate wreck: ${stop.result.wreck.length} frames, settled at ${Math.round(last.x)},${Math.round(last.y)}`);
assert(stop.result.wreck[0]!.shell && stop.result.wreck[0]!.shell!.age === 0, 'a direct stop starts the wreck lattice');

// A round that penetrates and keeps flying must not leave a pancake on the
// entry face. It bores a real hole (with chips) and keeps producing frames
// across the whole range.
const pierce = simulateShotWalls(built.def, snapshot, { angleDeg: 6, power: 300, mode: 'straight', ammoId: 'apds-sabot' });
assert(pierce.result.effects.some((event) => event.kind === 'penetrate'), 'fast dart must cross wall layers');
assert.equal(pierce.result.wreck.length, 0, 'a pass-through round must not leave a wreck at its entry');
const pierceLast = pierce.result.frames[pierce.result.frames.length - 1]!;
assert(pierceLast.x > 1200, `the penetrating round must keep flying, last frame x=${pierceLast.x}`);
const bores = pierce.result.damageEvents.filter((event) => event.label === 'PENETRATION');
assert(bores.length > 0, 'penetration must record a bore event');
assert(bores.every((event) => (event.spawnedBodies?.length ?? 0) > 0), 'each bore must shed cube chips');
assert(bores.every((event) => event.wallState !== undefined), 'each bore must publish its post-penetration walls');
console.log(`pass-through: ${bores.length} bores, ${pierce.bodies.length} chips, flight to x=${Math.round(pierceLast.x)}, no entry wreck`);
assert.equal(pierce.result.impact, null, 'a shell that flies out of bounds must not retain the entry as its terminal impact');
assert.equal(pierce.result.damageEvents.some((event) => event.label === 'SABOT CORE'), false, 'a pass-through must not trigger the terminal phase at its entry');
assert.equal(pierce.result.damageEvents.some((event) => event.label === 'PENETRATION'), true, 'the physical bore still remains');

// An explosive round that contacts a wall but then leaves the range must
// still fire its delayed charge: the fuse was lit at the entry wall, so the
// blast detonates there instead of never happening. aphe-hybrid at
// 10 deg / 300 straight bores one layer (contact @869,190), exits right
// (impact was null), and its DELAYED CHARGE must still count: the impact is
// recorded at the entry point and the blast adds damage beyond the bore.
// A pure-kinetic round (apds-sabot above) keeps the old do-nothing behavior,
// and a round that never touches anything (30 deg exits the top, contact
// null) must not detonate: there was no impact to light the fuse.
const oob = simulateShotWalls(built.def, snapshot, { angleDeg: 10, power: 300, mode: 'straight', ammoId: 'aphe-hybrid' });
assert(oob.result.firstContact, 'the explosive case must contact a wall first');
assert(oob.result.impact, 'an explosive round that bores and exits must record an impact');
const oobBlast = oob.result.damageEvents.filter((event) => event.label === 'DELAYED CHARGE');
assert(oobBlast.length === 1, 'the delayed charge must fire exactly once after the round leaves the range');
assert(oob.result.effects.some((event) => event.kind === 'blast'), 'the blast effect must be emitted');
assert(oob.result.messages.includes('CHARGE FIRED OUT OF RANGE'), 'the detonation must be visible in the shot summary');
assert(
  Math.hypot(oob.result.impact!.x - oob.result.firstContact!.x, oob.result.impact!.y - oob.result.firstContact!.y) < 5,
  'the charge detonates at the entry point where the fuse was lit',
);
assert.equal(oob.result.wreck.length, 0, 'the round left the range, so it must not leave a wreck at the entry');
const overTop = simulateShotWalls(built.def, snapshot, { angleDeg: 30, power: 300, mode: 'straight', ammoId: 'aphe-hybrid' });
assert.equal(overTop.result.impact, null, 'a round that never touches anything must not detonate');
assert.equal(overTop.result.damageEvents.some((event) => event.label === 'DELAYED CHARGE'), false, 'no contact, no charge');
console.log(`oob explosive: blast @${Math.round(oob.result.impact.x)},${Math.round(oob.result.impact.y)} cellDamage ${oob.result.cellDamage} (bore alone was 4), no wreck`);
// The blast also has to be able to ADD damage, not just register: HE Demolition
// at 6 deg / 300 straight bores six layers and exits (impact was null); its
// DEMOLITION CHARGE now fires at the entry wall and takes cellDamage from 11
// (bore-only) to 40.
const oobHe = simulateShotWalls(built.def, snapshot, { angleDeg: 6, power: 300, mode: 'straight', ammoId: 'he-demolition' });
assert(oobHe.result.impact, 'the HE ballistic must record an impact at the entry wall');
assert(oobHe.result.effects.some((event) => event.kind === 'blast'), 'HE blast effect must be emitted');
assert(oobHe.result.cellDamage > 11, `the exit blast must add damage beyond the bores, got ${oobHe.result.cellDamage}`);
console.log(`oob HE: blast @${Math.round(oobHe.result.impact!.x)},${Math.round(oobHe.result.impact!.y)} cellDamage ${Math.round(oobHe.result.cellDamage)} (bore-only was 11)`);

// The opposite case: a round that crosses layer after layer but is finally
// stopped by another wall gets its wreck at the stop, not at the first
// contact. The AP Solid Shot does exactly this: it bores through the timber
// and brick skin and pancakes on the steel shield around the core, like the
// reference damage frame where the round tears into the metal pillar.
const partial = simulateShotWalls(built.def, snapshot, { angleDeg: 20, power: 300, mode: 'arc', ammoId: 'ap-solid-shot' });
assert.equal(partial.result.impact?.material, 'steel', 'the penetrator must finally stop on the steel shield');
assert(partial.result.effects.filter((event) => event.kind === 'penetrate').length > 1, 'the round must bore through several layers before it stops');
assert(partial.result.effects.some((event) => event.kind === 'penetrate'), 'this shot must cross a layer before stopping');
assert(partial.result.wreck.length > 30, 'a stopped round still gets its physical tail');
assert(partial.result.impact && partial.result.firstContact, 'shot must report both contacts');
const entry = partial.result.firstContact!;
const stopAt = partial.result.impact!;
assert(Math.hypot(stopAt.x - entry.x, stopAt.y - entry.y) > 20, 'the terminal impact must differ from the entry contact');
const wreckStart = partial.result.wreck[0]!;
assert(
  Math.hypot(wreckStart.x - stopAt.x, wreckStart.y - stopAt.y) < 24,
  `wreck must start at the terminal impact, got ${Math.round(wreckStart.x)},${Math.round(wreckStart.y)} vs ${Math.round(stopAt.x)},${Math.round(stopAt.y)}`,
);
console.log(`terminal wreck: entry @${Math.round(entry.x)},${Math.round(entry.y)} -> stop @${Math.round(stopAt.x)},${Math.round(stopAt.y)}`);

// The round is a physical body, not a sprite on a parabola: once it touches
// anything the shell lattice starts driving, so it visibly crushes while it
// bores instead of flying through the wall untouched and snapping to a wreck
// afterwards. The wreck picks the lattice up from the same age, unchanged.
const bored = partial.result;
const engaged = bored.frames.filter((frame) => frame.shell && frame.shell.age > 0);
assert(engaged.length > 0, 'the lattice must engage before the round stops');
assert(engaged[0]!.t < bored.wreck[0]!.t || engaged.length > 1, 'the shell crushes during penetration');
const wreckAges = bored.wreck.map((frame) => frame.shell?.age ?? 0);
assert(wreckAges.every((age) => age > 0), 'the wreck continues the lattice instead of restarting it');
assert(wreckAges[0]! < wreckAges[wreckAges.length - 1]!, 'the wreck age advances');
console.log(`shell contact engagement: ${engaged.length} frames crumpling before the stop, wreck age ${wreckAges[0]!.toFixed(2)} -> ${wreckAges[wreckAges.length - 1]!.toFixed(2)}`);

// The same shell passes through a thin plate and keeps its flight; a core hit
// consumes the casing, so it has no wreck.
const direct = simulateShotWalls(built.def, snapshot, { angleDeg: 58, power: 280, mode: 'arc', ammoId: 'aphe-hybrid' });
assert(direct.result.coreDestroyed, 'direct core hit still clears');
assert.equal(direct.result.wreck.length, 0, 'a breaching core hit consumes the shell');

const ground = simulateShotWalls(built.def, snapshot, { angleDeg: 4, power: 40, mode: 'arc', ammoId: 'he-blast' });
assert.equal(ground.result.impact?.kind, 'ground', 'low shot lands on the seabed');
assert(ground.result.wreck.length > 30, 'grounded shell still tumbles');
console.log('projectile wreck physics: ok');

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

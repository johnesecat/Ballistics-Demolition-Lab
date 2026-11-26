import { buildStage } from '../src/game/stages/generator';
import { ALL_STAGES } from '../src/game/stages/campaign';
import { cloneSnapshot } from '../src/game/stages/types';
import { WallPixels } from '../src/game/sim/wall-pixels';
import { ProjectileBodySim, BODY_DT, PIXEL } from '../src/game/sim/body-sim';
import { muzzlePosition, launchVelocity } from '../src/game/sim/collision';
import { getAmmo } from '../src/game/ammo/catalogue';
import { traceWalls } from '../src/game/sim/fracture';
import { simulateShotWalls } from '../src/game/sim/wall-simulator';
import { WORLD } from '../src/game/config';

/**
 * Cost of the round's physics, in milliseconds of main-thread time.
 *
 * The number that matters on a phone is not the total solve: it is the worst
 * single replay frame. The sim is stepped by the shot, not by the display, and
 * the whole contact window is baked before playback starts, so what the device
 * pays per frame is only the draw. The spikes that can still reach the user are
 * the shot resolve itself and a replay that has to catch up after a hitch --
 * both are measured below.
 *
 * Run: npm run bench:body
 */

const now = (): number => Number(process.hrtime.bigint() / 1000n) / 1000;
const ms = (v: number): string => `${v.toFixed(2)} ms`;

function timeIt<T>(fn: () => T): { value: T; ms: number } {
  const t0 = now();
  const value = fn();
  return { value, ms: now() - t0 };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.floor(sorted.length / 2)]!;
}
function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
}

const built = buildStage(ALL_STAGES[0]!);
const snapshot = cloneSnapshot({ grid: built.grid, wallState: built.wallState, core: built.core, relays: built.relays });
const walls = built.wallState.walls;
const ammo = getAmmo('aphe-hybrid');

// --- Raster build -----------------------------------------------------------
const raster = timeIt(() => new WallPixels(walls, WORLD.groundY));
const pixels = raster.value;
const solid = pixels.solidCount;

// --- Find the contact point so the body can be timed from the impact --------
const start = muzzlePosition(26);
const velocity = launchVelocity({ angleDeg: 26, power: 200, mode: 'arc', ammoId: 'aphe-hybrid' }, ammo.flight.speedScale);
let x = start.x;
let y = start.y;
let vx = velocity.x;
let vy = velocity.y;
let contact: { x: number; y: number } | null = null;
for (let i = 0; i < 2400 && !contact; i += 1) {
  const nx = x + vx / 240;
  const ny = y + vy / 240;
  vx *= 1 - ammo.flight.drag / 240;
  vy += velocity.gravity / 240;
  const hit = traceWalls(walls, { x, y }, { x: nx, y: ny }, ammo.flight.radius);
  if (hit) contact = { x: hit.x, y: hit.y };
  x = nx;
  y = ny;
}
if (!contact) throw new Error('the benchmark shot never reached the battery');

// --- Per replay-frame cost --------------------------------------------------
const sim = new ProjectileBodySim({
  mass: ammo.flight.mass ?? 9,
  cell: 0.9,
  x: contact.x,
  y: contact.y,
  angle: Math.atan2(vy, vx),
  vx,
  vy,
  seed: 1234,
  gravity: velocity.gravity,
});
const frameTimes: number[] = [];
const FRAME = 1 / 60;
let frames = 0;
const contactStart = now();
while (frames < 120 && !sim.isResting) {
  const t0 = now();
  // One display frame of replay time: exactly what a 60 Hz device advances.
  for (let i = 0; i < Math.round(FRAME / BODY_DT); i += 1) sim.stepOnce(pixels);
  frameTimes.push(now() - t0);
  frames += 1;
  if (now() - contactStart > 8000) break;
}
const totalSolve = now() - contactStart;

// --- Worst case: a replay that has to catch up half a second at once -------
const catchUp = new ProjectileBodySim({
  mass: ammo.flight.mass ?? 9,
  cell: 0.9,
  x: contact.x,
  y: contact.y,
  angle: Math.atan2(vy, vx),
  vx,
  vy,
  seed: 1234,
  gravity: velocity.gravity,
});
const catchUpMs = timeIt(() => catchUp.advance(0.5, new WallPixels(walls, WORLD.groundY))).ms;

// --- Whole-shot cost, including wall damage and the replay bake -------------
const shotTimes: number[] = [];
for (let i = 0; i < 5; i += 1) {
  shotTimes.push(timeIt(() => simulateShotWalls(built.def, snapshot, { angleDeg: 26, power: 200 + i * 40, mode: 'arc', ammoId: 'aphe-hybrid' })).ms);
}
const shot = simulateShotWalls(built.def, snapshot, { angleDeg: 26, power: 200, mode: 'arc', ammoId: 'aphe-hybrid' });
const trackBytes = shot.result.track
  ? shot.result.track.times.byteLength + shot.result.track.xs.byteLength + shot.result.track.ys.byteLength
    + shot.result.track.heat.byteLength + shot.result.track.free.byteLength
  : 0;

const stats = sim.stats();
const results = {
  rasterMs: raster.ms,
  solidPixels: solid,
  pixelSize: PIXEL,
  nodes: stats.nodes,
  links: stats.links,
  frames,
  frameMedianMs: median(frameTimes),
  frameP95Ms: p95(frameTimes),
  frameWorstMs: Math.max(...frameTimes),
  totalSolveMs: totalSolve,
  catchUpHalfSecondMs: catchUpMs,
  shotMedianMs: median(shotTimes),
  shotWorstMs: Math.max(...shotTimes),
  trackFrames: shot.result.track?.count ?? 0,
  trackBytes,
  resting: sim.isResting,
};

const phoneFactor = 4;
console.log('wreck solve profile (desktop, node)');
console.log(`  round                ${stats.nodes} cells / ${stats.links} springs`);
console.log(`  wall raster          ${ms(results.rasterMs)} for ${solid} pixels @ ${PIXEL}u`);
console.log(`  replay frame (1/60s) median ${ms(results.frameMedianMs)}  p95 ${ms(results.frameP95Ms)}  worst ${ms(results.frameWorstMs)}`);
console.log(`  contact window       ${frames} frames, ${ms(results.totalSolveMs)} total`);
console.log(`  catch-up (0.5 s)     ${ms(results.catchUpHalfSecondMs)}`);
console.log(`  whole shot resolve   median ${ms(results.shotMedianMs)}  worst ${ms(results.shotWorstMs)}`);
console.log(`  baked track          ${results.trackFrames} frames, ${(trackBytes / 1024).toFixed(1)} KiB`);
console.log(`  phone estimate x${phoneFactor}: frame ${ms(results.frameMedianMs * phoneFactor)}${results.frameMedianMs * phoneFactor > 16.7 ? ' (over a 60 Hz budget)' : ' (inside a 60 Hz budget)'}, resolve ${ms(results.shotMedianMs * phoneFactor)}`);

// The device never steps the body: playback only draws the baked track, so the
// per-frame number above is what the replay would cost *if* anything ever
// stepped it. The work that actually reaches a phone is the one-time resolve
// before playback, so that is what the guard is on. The budget is four frames
// at 60 Hz: the resolve runs once, while the muzzle flash and the shell's flight
// cover the screen, and it never runs again for that shot.
const RESOLVE_BUDGET_MS = 80;
if (results.shotMedianMs * phoneFactor > RESOLVE_BUDGET_MS) {
  console.error(`shot resolve is too slow for a phone: ${ms(results.shotMedianMs * phoneFactor)} over a ${RESOLVE_BUDGET_MS.toFixed(0)} ms budget after the x${phoneFactor} estimate`);
  process.exit(1);
}
console.log(`  one-time resolve     ${ms(results.shotMedianMs * phoneFactor)} on a phone est., budget ${RESOLVE_BUDGET_MS.toFixed(0)} ms (playback itself is a bake)`);

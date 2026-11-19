import assert from 'node:assert/strict';
import { ALL_STAGES } from '../src/game/stages/campaign';
import { buildStage } from '../src/game/stages/generator';
import { simulateShotWalls } from '../src/game/sim/wall-simulator';
import { fractureWall, fractureWallBand, penetrateWalls, polygonArea, traceWalls, type Wall } from '../src/game/sim/fracture';

const wall: Wall = {
  id: 'wall-1',
  material: 'concrete',
  polygons: [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }, { x: 0, y: 40 }]],
};
const original = JSON.stringify(wall);
const missed = fractureWall(wall, { x: 150, y: 20 }, 10, 2);
assert.deepEqual(missed.wall, wall, 'a distant projectile leaves the wall intact');
assert.equal(missed.fragments.length, 0);

const hit = fractureWall(wall, { x: 50, y: 20 }, 10, 2);
assert.equal(hit.wall.id, wall.id);
assert.ok(hit.fragments.length > 1, 'a nearby impact produces small fragments');
assert.ok(hit.wall.polygons.length > 0, 'the rest of the wall remains');
assert.ok(hit.fragments.every((fragment) => polygonArea(fragment.polygon) <= 4.000001));
const remainingArea = hit.wall.polygons.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
const fragmentArea = hit.fragments.reduce((sum, fragment) => sum + polygonArea(fragment.polygon), 0);
assert.ok(Math.abs(remainingArea + fragmentArea - 4000) < 1e-6, 'fracture conserves area');
assert.ok(hit.wall.polygons.every((poly) => poly.every((p) => p.x <= 40 || p.x >= 60 || p.y <= 10 || p.y >= 30)), 'remaining geometry stays outside the local fracture zone');
assert.equal(JSON.stringify(wall), original, 'fracturing does not mutate the starting state');
assert.deepEqual(fractureWall(wall, { x: 50, y: 20 }, 10, 2), hit, 'fracture is deterministic');

const slope: Wall = { ...wall, id: 'slope', polygons: [[{ x: 0, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 40 }]] };
const slopedHit = fractureWall(slope, { x: 20, y: 20 }, 8, 2);
const slopeArea = slopedHit.wall.polygons.reduce((sum, p) => sum + polygonArea(p), 0) + slopedHit.fragments.reduce((sum, f) => sum + polygonArea(f.polygon), 0);
assert.ok(Math.abs(slopeArea - 800) < 1e-6, 'fracturing a sloped wall conserves area');
assert.throws(() => fractureWall(wall, { x: 0, y: 0 }, 10, 0), RangeError);
assert.throws(() => fractureWall(wall, { x: 0, y: 0 }, -1, 2), RangeError);
const contact = traceWalls([wall], { x: -20, y: 20 }, { x: 120, y: 20 });
assert.ok(contact);
assert.equal(contact.wallId, 'wall-1');
assert.ok(Math.abs(contact.x) < 1e-8 && Math.abs(contact.y - 20) < 1e-8);
assert.deepEqual({ x: contact.nx, y: contact.ny }, { x: -1, y: 0 });
assert.equal(traceWalls([wall], { x: -20, y: -20 }, { x: 120, y: -20 }), null);
const nearer: Wall = { id: 'nearer', material: 'brick', polygons: [[{ x: -10, y: 0 }, { x: -5, y: 0 }, { x: -5, y: 40 }, { x: -10, y: 40 }]] };
assert.equal(traceWalls([wall, nearer], { x: -20, y: 20 }, { x: 120, y: 20 })?.wallId, 'nearer', 'nearest wall wins regardless of input order');
assert.equal(traceWalls([hit.wall], { x: 50, y: 11 }, { x: 50, y: 29 }), null, 'projectile passes through a real breach');
const slopeContact = traceWalls([slope], { x: 45, y: 10 }, { x: 10, y: 10 });
assert.ok(slopeContact && Math.abs(slopeContact.x - 20) < 1e-8, 'projectile contacts the actual sloped surface');
const radiusHit = traceWalls([wall], { x: -20, y: 20 }, { x: 120, y: 20 }, 3);
assert.ok(radiusHit && Math.abs(radiusHit.x + 3) < 1e-8, 'projectile radius contacts the wall before its center');
assert.deepEqual({ x: radiusHit.nx, y: radiusHit.ny }, { x: -1, y: 0 });
const cornerHit = traceWalls([wall], { x: -10, y: -3 }, { x: 10, y: -3 }, 5);
assert.ok(cornerHit && Math.abs(cornerHit.x + 4) < 1e-8, 'swept radius detects a rounded corner');
assert.ok(Math.abs(cornerHit.nx + 0.8) < 1e-8 && Math.abs(cornerHit.ny + 0.6) < 1e-8);
const insideHit = traceWalls([wall], { x: 20, y: 20 }, { x: 30, y: 20 }, 1);
assert.ok(insideHit && insideHit.t === 0, 'a projectile starting inside a wall cannot escape collision');
assert.equal(traceWalls([hit.wall], { x: 50, y: 12 }, { x: 50, y: 28 }, 1), null, 'a small projectile fits inside a real breach');
assert.ok(traceWalls([hit.wall], { x: 41, y: 11 }, { x: 41, y: 29 }, 2), 'a projectile wider than the clearance hits the breach edge');
assert.throws(() => traceWalls([wall], { x: 0, y: 0 }, { x: 1, y: 1 }, -1), RangeError);
const bandWall: Wall = { id: 'band', material: 'steel', polygons: [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]] };
const band = fractureWallBand(bandWall, { x: 20, y: 20 }, { x: 80, y: 80 }, 4, 2);
const bandArea = band.wall.polygons.reduce((s, p) => s + polygonArea(p), 0);
const bandFragmentsArea = band.fragments.reduce((s, f) => s + polygonArea(f.polygon), 0);
assert.ok(Math.abs(bandArea + bandFragmentsArea - 10000) < 1e-6, 'angled jet conserves wall area');
assert.ok(Math.abs(bandFragmentsArea - Math.hypot(60, 60) * 4) < 1e-6, 'jet removes a narrow band along its direction');
assert.equal(traceWalls([band.wall], { x: 25, y: 25 }, { x: 75, y: 75 }), null, 'the jet leaves a continuous channel');
assert.ok(traceWalls([band.wall], { x: 20, y: 30 }, { x: 80, y: 90 }), 'material alongside the jet remains intact');
assert.throws(() => fractureWallBand(bandWall, { x: 0, y: 0 }, { x: 0, y: 0 }, 4, 2), RangeError);
const layer = (id: string, x: number, material: Wall['material']): Wall => ({ id, material, polygons: [[{ x, y: 0 }, { x: x + 10, y: 0 }, { x: x + 10, y: 20 }, { x, y: 20 }]] });
const layers = [layer('steel', 0, 'steel'), layer('brick', 20, 'brick'), layer('wood', 40, 'wood')];
const layersBefore = JSON.stringify(layers);
const penetration = penetrateWalls(layers, { x: -5, y: 10 }, { x: 55, y: 10 }, 4, 2, 35, { steel: 2, brick: 1, wood: 1 });
assert.equal(penetration.remainingEnergy, 0);
assert.ok(Math.abs(penetration.end.x - 45) < 1e-8, 'energy stops the jet halfway through the third layer');
assert.equal(penetration.fragments.some((f) => f.wallId === 'steel'), true);
assert.equal(penetration.fragments.some((f) => f.wallId === 'brick'), true);
assert.equal(penetration.fragments.some((f) => f.wallId === 'wood'), true);
assert.equal(traceWalls(penetration.walls, { x: -5, y: 10 }, { x: 44, y: 10 }), null, 'the penetrated path is clear');
assert.ok(traceWalls(penetration.walls, { x: 46, y: 10 }, { x: 55, y: 10 }), 'the unpenetrated wall remains');
assert.equal(JSON.stringify(layers), layersBefore, 'penetration does not mutate the starting walls');
const stopped = penetrateWalls(layers, { x: -5, y: 10 }, { x: 55, y: 10 }, 4, 2, 8, { steel: 2, brick: 1, wood: 1 });
assert.ok(Math.abs(stopped.end.x - 4) < 1e-8);
assert.deepEqual(stopped.walls[1], layers[1], 'unreached layers remain unchanged');
assert.deepEqual(stopped.walls[2], layers[2]);
const miss = penetrateWalls(layers, { x: -5, y: 30 }, { x: 55, y: 30 }, 4, 2, 35, { steel: 2, brick: 1, wood: 1 });
assert.deepEqual(miss.walls, layers);
assert.equal(miss.remainingEnergy, 35);
assert.equal(miss.fragments.length, 0);
assert.throws(() => penetrateWalls(layers, { x: 0, y: 0 }, { x: 1, y: 0 }, 4, 2, 1, { steel: 0 }), RangeError);
const grazed = layer('grazed', 0, 'brick');
const translatedGrazed: Wall = { ...grazed, polygons: grazed.polygons.map((poly) => poly.map((p) => ({ x: p.x, y: p.y + 11 }))) };
const graze = penetrateWalls([translatedGrazed], { x: -5, y: 10 }, { x: 15, y: 10 }, 4, 2, 5, { brick: 1 });
assert.deepEqual(graze.walls, [translatedGrazed], 'a wall outside the resistance path must not be cut for free');
assert.equal(graze.fragments.length, 0);
const stage = buildStage(ALL_STAGES[0]!);
const heat = simulateShotWalls(
  stage.def,
  { grid: stage.grid, wallState: stage.wallState, core: stage.core, relays: stage.relays },
  { angleDeg: 21, power: 391, mode: 'arc', ammoId: 'heat-round' },
).result;
assert.ok(heat.firstContact && heat.effects.some((event) => event.kind === 'jet'), 'the HEAT shot hits and produces a jet');
const simultaneousImpacts = heat.effects.filter((event) => event.kind === 'impact' && event.t === heat.effects.find((e) => e.kind === 'impact')?.t);
assert.equal(simultaneousImpacts.length, 1, 'HEAT contact is shown once at initial impact');
console.log('Impact-local fracture, swept contact, layered penetration and HEAT event checks passed');

import { heatColor, spawnFragmentBodies, stepFragmentBodies, type FragmentBody } from '../src/game/sim/fracture';
const bodiesA = spawnFragmentBodies(hit.fragments, { x: 50, y: 20 }, { x: 200, y: -50 }, 123);
const bodiesB = spawnFragmentBodies(hit.fragments, { x: 50, y: 20 }, { x: 200, y: -50 }, 123);
assert.deepEqual(bodiesA, bodiesB, 'fragment debris is deterministic for a fixed seed');
assert.ok(bodiesA.length > 1 && bodiesA.every((body) => body.heat >= 0 && body.heat <= 1));
assert.equal(heatColor(1), 0xffffff);
assert.notEqual(heatColor(0), heatColor(0.5));
for (let i = 0; i < 600; i += 1) stepFragmentBodies(bodiesA, 1 / 60, 200);
assert.ok(bodiesA.every((body) => body.sleeping), 'fragment bodies settle and sleep');
console.log('Deterministic fragment bodies and heat ramp checks passed');

// Debris collides with the surviving structure and with other debris.
const chip = (x: number, y: number, vx: number, vy: number): FragmentBody => ({
  fragment: {
    wallId: 'chip',
    material: 'brick',
    polygon: [{ x: -3, y: -3 }, { x: 3, y: -3 }, { x: 3, y: 3 }, { x: -3, y: 3 }],
  },
  x, y, vx, vy, angle: 0, angularVelocity: 0, heat: 0, sleeping: false,
});
const beam = { id: 'beam', material: 'steel' as const, polygons: [[{ x: 60, y: 100 }, { x: 90, y: 100 }, { x: 90, y: 300 }, { x: 60, y: 300 }]] };
const mover = chip(20, 200, 600, 0);
const faller = chip(75, 70, 0, 0);
const lower = chip(500, 330, 0, 0);
const upper = chip(501, 310, 0, 0);
for (let i = 0; i < 480; i += 1) stepFragmentBodies([mover, faller, lower, upper], 1 / 60, 340, 900, [beam]);
assert.ok(mover.x < 60, `debris tunneled through a beam (x=${mover.x.toFixed(1)})`);
assert.ok(faller.y <= 97.5, `debris did not rest on the beam (y=${faller.y.toFixed(1)})`);
assert.ok(faller.sleeping, 'debris resting on a beam should sleep');
assert.ok(Math.abs(upper.y - lower.y) >= 5.4, 'stacked debris must not overlap');
assert.ok(upper.sleeping && lower.sleeping, 'a settled pile should sleep');
console.log('Debris-vs-wall and stacking checks passed');

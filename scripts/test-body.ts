import assert from 'node:assert/strict';
import { ProjectileBodySim, BODY_DT, type BodyWorld } from '../src/game/sim/body-sim';
import { WallPixels } from '../src/game/sim/wall-pixels';
import type { Wall } from '../src/game/sim/fracture';

/**
 * The round is one physics model.
 *
 * These checks run the body against a real wall raster (the same `WallPixels`
 * the shot uses) and pin the properties the shot depends on: a cell that cannot
 * pay for a pixel is stopped by it, a cell that can destroys it, the body has to
 * spend its own energy to bore, the same input always gives the same result, and
 * a spent round comes to rest inside the notch it made instead of bouncing off.
 */

const PLATE: Wall = {
  id: 'w0',
  material: 'steel',
  polygons: [[{ x: 20, y: -60 }, { x: 40, y: -60 }, { x: 40, y: 60 }, { x: 20, y: 60 }]],
};

function plateWorld(): WallPixels {
  return new WallPixels([PLATE], 400);
}

function round(speed: number, mass = 1.15, cell = 0.9) {
  return new ProjectileBodySim({
    mass,
    cell,
    x: -20,
    y: 0,
    angle: 0,
    vx: speed,
    vy: 0,
    seed: 4242,
    gravity: 0,
  });
}

function runToRest(sim: ProjectileBodySim, world: BodyWorld, seconds = 1.5): void {
  const steps = Math.ceil(seconds / BODY_DT);
  for (let i = 0; i < steps && !sim.isResting; i += 1) sim.stepOnce(world);
}

// --- A pixel is solid -------------------------------------------------------
{
  const world = plateWorld();
  assert.equal(world.materialAt(30, 0), 'steel', 'the plate rasterises to solid steel');
  assert.equal(world.materialAt(0, 0), null, 'air is not solid');
  assert(world.solidCount > 0, 'the raster has solid pixels');
}

// --- Penetration is paid for out of the body's energy ----------------------
{
  const world = plateWorld();
  const fast = round(520);
  runToRest(fast, world);
  assert(fast.hasContact, 'a round that reaches the plate makes contact');
  assert(fast.carved.length > 0, `a fast round must destroy pixels, got ${fast.carved.length}`);
  assert(fast.squash > 0.2, 'boring a plate spends a real share of the drive');
  const com = fast.centre();
  assert(com.x > 0, `the round must move forward through the plate, not bounce off (${com.x.toFixed(1)})`);
  assert(!fast.penetrating(world), 'no cell may be left inside solid geometry');

  const slowWorld = plateWorld();
  const slow = round(150);
  runToRest(slow, slowWorld);
  assert(slow.carved.length < fast.carved.length, `a slow round must not bore as deep (${slow.carved.length} vs ${fast.carved.length})`);
  const slowCom = slow.centre();
  assert(slowCom.x < 40, 'a slow round is stopped inside or before the plate');
  assert(!slow.penetrating(slowWorld), 'the stopped round still ends outside the solid');
}

// --- Determinism ------------------------------------------------------------
{
  const a = round(420);
  runToRest(a, plateWorld());
  const b = round(420);
  runToRest(b, plateWorld());
  assert.equal(a.carved.length, b.carved.length, 'the same shot destroys the same pixels');
  assert.deepEqual(a.centre(), b.centre(), 'the same shot ends in the same place');
  assert.deepEqual(a.stats(), b.stats(), 'the same shot leaves the same shape');
}

// --- Mass and material matter ----------------------------------------------
{
  const heavy = round(420, 4);
  runToRest(heavy, plateWorld());
  const light = round(420, 1);
  runToRest(light, plateWorld());
  assert(
    heavy.depth > light.depth,
    `a heavier round carries more energy into the plate (${heavy.depth.toFixed(1)} vs ${light.depth.toFixed(1)})`,
  );
}

// --- Copper gives way, steel carries on ------------------------------------
{
  const world = plateWorld();
  const sim = round(700);
  runToRest(sim, world);
  if (sim.shed) {
    assert(sim.jacketShare < 0.4, 'a shed jacket is no longer part of the body');
    assert(sim.nodes.some((node) => node.component === 'penetrator' && !node.free), 'the steel penetrator is still a body');
  }
  assert(sim.integrity >= 0 && sim.integrity <= 1, 'integrity stays a fraction');
}

// --- The wall is a pixel soft body ------------------------------------------
{
  // The pixels around a contact are rigged as a mass-spring patch. A push moves
  // the touched pixel and the pixels connected to it, and the dent stays.
  const contact = (world: WallPixels, speed: number, mass: number, steps = 24): void => {
    world.armSoftBody(30, 0);
    for (let i = 0; i < steps; i += 1) {
      world.push(30, 0, speed, 0, mass);
      world.stepSoftBody(BODY_DT);
    }
  };
  const world = plateWorld();
  contact(world, 400, 1.15);
  const dent = world.deformationAt(30, 0);
  assert(dent && Math.hypot(dent.x, dent.y) > 0.3, `a contact must deform the touched pixel (${dent ? Math.hypot(dent.x, dent.y).toFixed(2) : 'none'})`);
  const ripple = world.deformationAt(30, 4);
  assert(ripple && Math.hypot(ripple.x, ripple.y) > 0, 'the push travels to the connected pixels above it');

  // A faster, heavier pixel deforms the wall further than a slow one.
  const fast = plateWorld();
  contact(fast, 520, 4);
  const slow = plateWorld();
  contact(slow, 120, 1);
  const fd = fast.deformationAt(30, 0)!;
  const sd = slow.deformationAt(30, 0)!;
  assert(Math.hypot(fd.x, fd.y) > Math.hypot(sd.x, sd.y), `speed and mass increase the dent (${Math.hypot(fd.x, fd.y).toFixed(2)} vs ${Math.hypot(sd.x, sd.y).toFixed(2)})`);

  // A softer material gives more than steel for the same push.
  const wood: Wall = { id: 'w0', material: 'wood', polygons: PLATE.polygons };
  const steelWorld = new WallPixels([PLATE], 400);
  const woodWorld = new WallPixels([wood], 400);
  contact(steelWorld, 300, 1.15);
  contact(woodWorld, 300, 1.15);
  const steelDent = steelWorld.deformationAt(30, 0)!;
  const woodDent = woodWorld.deformationAt(30, 0)!;
  assert(Math.hypot(woodDent.x, woodDent.y) > Math.hypot(steelDent.x, steelDent.y), 'wood deforms further than steel under the same contact');

  // The rig is the whole connected wall, not a 22-unit disc: every solid pixel
  // of the plate is a node, and only its bolted ends are pinned. A push is then
  // carried into metal far outside any local patch, and the surviving rim of a
  // hole is dragged into the breach as lip geometry.
  const whole = plateWorld();
  whole.armSoftBody(30, 0);
  const rig = whole.softBodyStats();
  assert.equal(rig.nodes, 600, `every connected pixel is rigged (${rig.nodes})`);
  assert(rig.pinned > 0 && rig.pinned < rig.nodes / 2, `only the plate's ends are pinned (${rig.pinned})`);
  for (let i = 0; i < 20; i += 1) {
    whole.push(30, 0, 600, 0, 2);
    whole.stepSoftBody(BODY_DT);
  }
  const carried = whole.softBodyStats();
  assert(carried.moved > 8, `the push travels through the connected plate (${carried.moved} pixels moved)`);
  whole.carve(33, 1);
  const lips = whole.lipPolygons(1, 0, 32);
  assert(lips.length > 0, `a hole in torn metal grows a lip (${lips.length} quads)`);
  assert(lips.every((quad) => quad.length === 4), 'each lip quad is a closed four-point strip');

  // Removing a pixel is what makes the hole: the lattice loses exactly it and
  // the detached pixel no longer contributes a rim offset.
  const solid = world.solidCount;
  assert.equal(world.carve(30, 0), 'steel', 'the carved pixel reports its material');
  assert.equal(world.solidCount, solid - 1, 'carving removes exactly one pixel');
  assert.equal(world.materialAt(30, 0), null, 'the hole is air');
}

// --- The seabed is solid ----------------------------------------------------
{
  const world = new WallPixels([], 40);
  const sim = new ProjectileBodySim({ mass: 2, cell: 0.9, x: 0, y: 0, angle: 0, vx: 60, vy: 90, seed: 7, gravity: 410 });
  runToRest(sim, world, 3);
  const cells = sim.frames()[sim.frames().length - 1]!;
  const lowest = Math.max(...Array.from(cells.y));
  assert(lowest <= 40.5, `the round rests on the seabed, lowest cell ${lowest.toFixed(1)}`);
  assert(sim.isResting, 'a grounded round settles');
}

console.log('one body model: pixel collision, energy-paid penetration, determinism, seabed rest');

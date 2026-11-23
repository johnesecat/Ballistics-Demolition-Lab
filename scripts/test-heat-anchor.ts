import assert from 'node:assert/strict';
import { polygonCentroid, survivorHeatPoint } from '../src/game/sim/heat-anchor';
import { pointInPolygon } from '../src/game/sim/walls';
import type { Point, Polygon, Wall } from '../src/game/sim/fracture';

const rect = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
];

function near(a: Point, b: Point, eps = 1e-9): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= eps;
}

function nearestVertexDistance(wall: Wall, origin: Point): number {
  let nearest = Infinity;
  for (const poly of wall.polygons) {
    for (const p of poly) nearest = Math.min(nearest, Math.hypot(p.x - origin.x, p.y - origin.y));
  }
  return nearest;
}

/** Anchor is on the material if it is inside a survivor or exactly on one of
 * its vertices (a concave chunk can legitimately fall back to the vertex). */
function onGeometry(wall: Wall, p: Point): boolean {
  return wall.polygons.some((poly) =>
    pointInPolygon(p, poly) || poly.some((v) => near(v, p, 1e-6)));
}

// --- Centroid -------------------------------------------------------------
assert.deepEqual(polygonCentroid(rect(0, 0, 100, 40)), { x: 50, y: 20 }, 'rectangle centroid');
const triangle = polygonCentroid([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 0, y: 30 }]);
assert.ok(near(triangle, { x: 10, y: 10 }, 1e-9), `triangle centroid was ${JSON.stringify(triangle)}`);
// Collinear input has no area; the average of its points is the only stable
// fallback, and it must not divide by zero.
const degenerate = polygonCentroid([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]);
assert.ok(near(degenerate, { x: 10, y: 0 }), `collinear centroid was ${JSON.stringify(degenerate)}`);

// --- Intact plate ---------------------------------------------------------
const plate: Wall = { id: 'plate', material: 'steel', polygons: [rect(0, 0, 100, 40)] };
const cornerHit = { x: 97, y: 3 };
const cornerAnchor = survivorHeatPoint(plate, cornerHit);
assert.ok(cornerAnchor, 'an intact plate always offers a surviving vertex');
assert.equal(pointInPolygon(cornerAnchor!, plate.polygons[0]!), true, 'anchor must be nudged inside the plate');
assert.ok(cornerAnchor!.x < 100 && cornerAnchor!.y > 0, 'anchor must leave the exact corner');
assert.ok(near(survivorHeatPoint(plate, cornerHit)!, cornerAnchor!), 'anchor is deterministic');

// --- Punched plate: the bbox centre is a hole -----------------------------
// Four survivors around a 30x20 breach, like a plate after fractureWall.
const rim: Wall = {
  id: 'rim',
  material: 'steel',
  polygons: [
    rect(0, 0, 100, 10),    // top
    rect(0, 30, 100, 10),   // bottom
    rect(0, 10, 35, 20),    // left
    rect(65, 10, 35, 20),   // right
  ],
};
const hole = { x: 50, y: 20 };
assert.ok(!rim.polygons.some((poly) => pointInPolygon(hole, poly)), 'test setup: bbox centre must be a hole');
const rimAnchor = survivorHeatPoint(rim, hole);
assert.ok(rimAnchor, 'surviving rim near the breach must produce an anchor');
assert.ok(onGeometry(rim, rimAnchor!), 'anchor must land on the surviving rim, not in the breach');
assert.ok(
  Math.hypot(rimAnchor!.x - hole.x, rimAnchor!.y - hole.y) <= nearestVertexDistance(rim, hole) + 4 + 1e-9,
  'anchor must stay next to the nearest surviving vertex',
);
assert.ok(!near(rimAnchor!, hole), 'an anchor at the old bbox centre would paint the hole');

// Several origins around the breach always resolve onto real geometry.
for (const origin of [
  { x: 50, y: 20 }, { x: 34, y: 20 }, { x: 66, y: 20 },
  { x: 50, y: 9 }, { x: 50, y: 31 }, { x: 35, y: 10 },
]) {
  const anchor = survivorHeatPoint(rim, origin);
  assert.ok(anchor && onGeometry(rim, anchor), `anchor for ${JSON.stringify(origin)} left the wall`);
}

// --- Distance cap and empty walls ----------------------------------------
const far: Wall = { id: 'far', material: 'steel', polygons: [rect(47, 0, 20, 20)] };
assert.equal(survivorHeatPoint(far, { x: 0, y: 0 }), null, 'a survivor beyond maxDist must not anchor heat');
const atCap: Wall = { id: 'cap', material: 'steel', polygons: [rect(46, 0, 20, 20)] };
assert.ok(survivorHeatPoint(atCap, { x: 0, y: 0 }), 'a survivor exactly at maxDist still anchors');
assert.equal(survivorHeatPoint({ ...far, polygons: [] }, { x: 0, y: 0 }), null, 'empty wall has no anchor');

// --- Concave survivor whose centroid is outside ---------------------------
// The U block's centroid sits in its notch. The nudge toward it would leave
// the material, so the anchor must fall back to the surviving vertex.
const uBlock: Wall = {
  id: 'u',
  material: 'steel',
  polygons: [[
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 70, y: 100 },
    { x: 70, y: 30 }, { x: 30, y: 30 }, { x: 30, y: 100 }, { x: 0, y: 100 },
  ]],
};
const uCentroid = polygonCentroid(uBlock.polygons[0]!);
assert.equal(pointInPolygon(uCentroid, uBlock.polygons[0]!), false, 'test setup: U centroid lies in the notch');
const uAnchor = survivorHeatPoint(uBlock, { x: 50, y: 10 });
assert.ok(uAnchor && onGeometry(uBlock, uAnchor), 'concave anchor must not be pushed into the notch');

console.log('Survivor heat anchors place heat on surviving geometry, not in breaches');

import { addHeat, type WallState } from '../src/game/sim/walls';
import { materialHeatColor } from '../src/game/sim/fracture';
const stains: WallState = {walls: [], heat: [], groundY: 100, version: 1};
addHeat(stains, 0, 0, 1, 20, 'wood');
addHeat(stains, 0, 0, 1, 20, 'steel');
assert.equal(stains.heat.length, 2, 'heat stains for different materials must not merge');
assert.notEqual(materialHeatColor('wood', 1), materialHeatColor('steel', 1), 'wood chars instead of turning white hot like steel');
assert.notEqual(materialHeatColor('brick', 1), materialHeatColor('steel', 1), 'masonry does not use the metal heat ramp');

import { writeFileSync } from 'node:fs';
import { buildStage } from '../src/game/stages/generator';
import { ALL_STAGES } from '../src/game/stages/campaign';
import { cloneSnapshot } from '../src/game/stages/types';
import { simulateShotWalls } from '../src/game/sim/wall-simulator';
import { MATERIALS, type MaterialId } from '../src/game/materials';
import { materialHeatColor } from '../src/game/sim/fracture';
import { PIXEL } from '../src/game/sim/body-sim';
import type { Wall } from '../src/game/sim/fracture';
import { WORLD } from '../src/game/config';

/**
 * Thin steel plate, near-normal incidence -- the imp_a acceptance shot.
 *
 * A 12u plate, 210u long, fired at 4 degrees: one round diameter from normal,
 * which is as close to normal as the cannon allows. AP Solid Shot at full drive
 * so the round can pay for the bore. The plate is the same raster, the same
 * one-body solver and the same soft body as a campaign wall; only the stage is
 * synthetic, so the comparison is not muddied by the rest of the battery.
 *
 * Reports the four things the 60 fps frame shows -- hole, curled lip, heat ring
 * and debris -- and writes the entry frame to SVG and PNG (via PPM) at 9x.
 *
 * Run: npx tsx scripts/plate-shot.ts
 */

const built = buildStage(ALL_STAGES[0]!);
const PLATE: Wall = {
  id: 'plate',
  material: 'steel',
  anchored: true,
  polygons: [[
    { x: 800, y: 110 },
    { x: 812, y: 110 },
    { x: 812, y: 320 },
    { x: 800, y: 320 },
  ]],
};
const snapshot = cloneSnapshot({
  grid: built.grid,
  wallState: { walls: [PLATE], heat: [], groundY: WORLD.groundY, version: built.wallState.version },
  core: { ...built.core, destroyed: true },
  relays: [],
});

const input = { angleDeg: 4, power: 441, mode: 'straight' as const, ammoId: 'ap-solid-shot' };
const shot = simulateShotWalls(built.def, snapshot, input);
const hit = shot.result.firstContact;
if (!hit) throw new Error('the acceptance shot never reached the plate');

const wall = shot.wallState.walls.find((w) => w.id === PLATE.id)!;
const normal = Math.atan2(hit.ny, hit.nx);
const incidence = Math.abs(Math.abs(normal) - Math.PI) * 180 / Math.PI;
const holePixels = countCells(PLATE, (x, y) => !wall.polygons.some((poly) => inPoly(x, y, poly)));
const heat = shot.wallState.heat.filter((h) => Math.hypot(h.x - hit.x, h.y - hit.y) < 60);
const chips = shot.result.bodies.filter((b) => Math.hypot(b.x - hit.x, b.y - hit.y) < 80);

console.log(`thin steel plate ${PLATE.polygons[0]![2]!.y - PLATE.polygons[0]![0]!.y}u long, 12u thick, ${input.angleDeg} deg, power ${input.power}, straight AP Solid`);
console.log(`  entry            ${hit.x.toFixed(1)},${hit.y.toFixed(1)}  ${incidence.toFixed(1)} deg off normal, ${shot.body?.entrySpeed().toFixed(0)} u/s`);
console.log(`  hole             ${holePixels} pixels @ ${PIXEL}u = ${(holePixels * PIXEL * PIXEL).toFixed(0)} u2 across a 12u plate`);
console.log(`  lip / rim        ${wall.polygons.length} outline(s), ${wall.polygons.reduce((n, p) => n + p.length, 0)} vertices`);
console.log(`  heat             ${heat.length} blooms within 60u, hottest ${Math.max(0, ...heat.map((h) => h.heat)).toFixed(2)}`);
console.log(`  debris           ${chips.length} chips near the entry, ${shot.result.bodies.length} total`);
console.log(`  walls left       ${shot.wallState.walls.map((w) => `${w.id}:${w.material}:${w.polygons.length}p`).join(' ')}`);
console.log(`  messages         ${shot.result.messages.join(', ') || '-'}`);

writeFrame(shot.wallState.walls, shot.wallState.heat, shot.result.bodies, hit, 'artifacts/verify/plate-entry');

function countCells(start: Wall, isGone: (x: number, y: number) => boolean): number {
  const b = bounds(start);
  let n = 0;
  for (let y = b.y0 + PIXEL / 2; y < b.y1; y += PIXEL) {
    for (let x = b.x0 + PIXEL / 2; x < b.x1; x += PIXEL) {
      if (isGone(x, y)) n += 1;
    }
  }
  return n;
}

function bounds(target: Wall): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const poly of target.polygons) {
    for (const p of poly) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
  }
  return { x0, y0, x1, y1 };
}

function inPoly(x: number, y: number, poly: readonly { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The entry frame as SVG + PPM: wall raster, heat field, lip geometry, chips. */
function writeFrame(
  walls: readonly Wall[],
  heatRegions: ReadonlyArray<{ x: number; y: number; heat: number; radius: number; material?: MaterialId }>,
  bodies: ReadonlyArray<{ x: number; y: number; heat: number; fragment: { material: MaterialId } }>,
  at: { x: number; y: number },
  path: string,
): void {
  const SCALE = 9;
  const HALF = 24;
  const x0 = Math.floor((at.x - HALF) / PIXEL) * PIXEL;
  const y0 = Math.floor((at.y - HALF) / PIXEL) * PIXEL;
  const x1 = Math.floor((at.x + HALF) / PIXEL) * PIXEL;
  const y1 = Math.floor((at.y + HALF) / PIXEL) * PIXEL;
  const w = (x1 - x0) * SCALE;
  const h = (y1 - y0) * SCALE;
  const px = (v: number): number => (v - x0) * SCALE;
  const py = (v: number): number => (v - y0) * SCALE;
  const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
  const parts: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`];
  const buf = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i += 1) {
    buf[i * 3] = 11; buf[i * 3 + 1] = 13; buf[i * 3 + 2] = 22;
  }
  const rect = (rx: number, ry: number, rw: number, rh: number, color: number, opacity = 1): void => {
    parts.push(`<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${hex(color)}" opacity="${opacity}"/>`);
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    for (let y = Math.max(0, Math.round(ry)); y < Math.min(h, Math.round(ry + rh)); y += 1) {
      for (let x = Math.max(0, Math.round(rx)); x < Math.min(w, Math.round(rx + rw)); x += 1) {
        const i = (y * w + x) * 3;
        buf[i] = Math.round(buf[i]! * (1 - opacity) + r * opacity);
        buf[i + 1] = Math.round(buf[i + 1]! * (1 - opacity) + g * opacity);
        buf[i + 2] = Math.round(buf[i + 2]! * (1 - opacity) + b * opacity);
      }
    }
  };
  rect(0, 0, w, h, 0x0b0d16);
  const solid = (cx: number, cy: number): boolean => walls.some((wall) => wall.polygons.some((poly) => inPoly(cx, cy, poly)));

  // Wall raster, one square per 2u cell, the same grid the solver uses.
  for (let y = y0; y < y1; y += PIXEL) {
    for (let x = x0; x < x1; x += PIXEL) {
      if (!solid(x + PIXEL / 2, y + PIXEL / 2)) continue;
      const wall = walls.find((candidate) => candidate.polygons.some((poly) => inPoly(x + PIXEL / 2, y + PIXEL / 2, poly)))!;
      const col = MATERIALS[wall.material].colors;
      const edge = !solid(x + PIXEL / 2, y - PIXEL / 2);
      rect(px(x), py(y), SCALE * PIXEL, SCALE * PIXEL, edge ? col.light : col.base);
    }
  }

  // Heat field, composited the way StructureView composites it: strongest bloom
  // per cell, the same ramp, the same falloff.
  for (let y = y0; y < y1; y += PIXEL) {
    for (let x = x0; x < x1; x += PIXEL) {
      const cx = x + PIXEL / 2;
      const cy = y + PIXEL / 2;
      if (!solid(cx, cy)) continue;
      let best = 0;
      let material: MaterialId | null = null;
      for (const region of heatRegions) {
        const frac = Math.hypot(cx - region.x, cy - region.y) / (region.radius > 0 ? region.radius : 20);
        if (frac > 1) continue;
        const value = region.heat * Math.pow(1 - frac, 2.6);
        if (value > best) { best = value; material = region.material ?? null; }
      }
      if (!material || best < 0.1) continue;
      rect(px(x), py(y), SCALE * PIXEL, SCALE * PIXEL, materialHeatColor(material, best), 0.94);
    }
  }

  // Chips the shot threw, at their spawn positions.
  for (const body of bodies) {
    if (Math.hypot(body.x - at.x, body.y - at.y) > 80) continue;
    const size = 1.6 * SCALE;
    rect(px(body.x) - size / 2, py(body.y) - size / 2, size, size, materialHeatColor(body.fragment.material, body.heat));
  }
  parts.push('</svg>');
  writeFileSync(`${path}.svg`, parts.join('\n'));
  writeFileSync(`${path}.ppm`, Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), Buffer.from(buf)]));
  console.log(`  wrote            ${path}.svg / .ppm`);
}

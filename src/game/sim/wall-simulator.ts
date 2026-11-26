import { PHYSICS, WORLD } from '../config';
import { getAmmo, getPhases } from '../ammo/catalogue';
import type { AmmoPhase } from '../ammo/types';
import { MATERIALS, type MaterialId } from '../materials';
import { Rng, hash32 } from '../rng';
import type { StageDefinition, StageSnapshot } from '../stages/types';
import { cloneSnapshot } from '../stages/types';
import { mergeWallRects } from '../stages/wall-builder';
import { launchVelocity, muzzlePosition } from './collision';
import { fractureWall, fractureWallBand, penetrateWalls, spawnFragmentBodies, subtractPixelCells, traceWalls, type FractureFragment, type FragmentBody, type Point, type Wall } from './fracture';
import type { DamageEvent, EffectEvent, ImpactInfo, ProjectileFrame, ShotInput, ShotResult } from './types';
import { addHeat, cloneWallState, detachUnsupported, pointInPolygon, wallsFromSnapshot, type WallState } from './walls';
import { survivorHeatPoint } from './heat-anchor';
import { settleHotMetal } from './wall-deform';
import { BODY_CELL, BODY_DT, PIXEL, ProjectileBodySim, packTrack, type BodyTrack } from './body-sim';
import { WallPixels } from './wall-pixels';

/**
 * Wall-object shot simulation.
 *
 * Flight to the first solid is an analytic trajectory (cheap, exact, and the
 * same one the aim preview draws). From the first pixel the round touches, the
 * body solver takes over: the round is a lattice of copper and steel cells that
 * collides with the wall raster one pixel at a time, pays for every pixel it
 * destroys out of its own kinetic energy, and either bores through or stops
 * inside the notch it made. Damage to the wall is what the body actually
 * removed, converted back to polygons; there is no separate penetration model.
 */

const RESISTANCE: Record<string, number> = { steel: 1.0, armor: 1.25, brick: 0.55, concrete: 0.7, wood: 0.45, slopes: 0.6 };


const FRAGMENT_SIZE = 7; // world units, fixed — never zoom dependent (P0-13)
function norm(x: number, y: number): Point { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; }

export interface WallShotOutcome {
  result: ShotResult;
  wallState: WallState;
  bodies: FragmentBody[];
  /** The simulated round itself, for tests and the profile harness. */
  body: ProjectileBodySim | null;
  /** Pixels the round destroyed this shot. */
  carved: number;
}

export function getWallState(snapshot: StageSnapshot): WallState {
  if (snapshot.wallState) return cloneWallState(snapshot.wallState);
  return wallsFromSnapshot(snapshot);
}

export function attachWallState(snapshot: StageSnapshot, state: WallState): StageSnapshot {
  snapshot.wallState = cloneWallState(state);
  return snapshot;
}

/** Serializable wall snapshot (P0-10): plain JSON-safe walls + heat. */
export function serializeWallState(state: WallState): string {
  return JSON.stringify(state);
}

export function deserializeWallState(json: string, migrateGeometry = true): WallState {
  const parsed = JSON.parse(json) as WallState;
  if (!parsed || !Array.isArray(parsed.walls) || !Number.isFinite(parsed.groundY)) {
    throw new Error('Invalid wall-state save payload');
  }
  for (const w of parsed.walls) {
    if (!w || typeof w.id !== 'string' || !w.id || !Object.prototype.hasOwnProperty.call(MATERIALS, w.material) || !Array.isArray(w.polygons) || !w.polygons.every(poly => Array.isArray(poly) && poly.length >= 3 && poly.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)))) throw new Error('Invalid wall entry in save payload');
  }
  // Saves written before heat moved to a flat surface list stored it per wall id.
  // Flatten those so an interrupted campaign keeps its scorch marks.
  const legacyHeat = parsed.heat as unknown;
  if (legacyHeat && !Array.isArray(legacyHeat) && typeof legacyHeat === 'object') {
    parsed.heat = Object.values(legacyHeat as Record<string, Array<{ x: number; y: number; heat: number; radius?: number }>>)
      .flat()
      .filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.heat))
      .map((r) => ({ x: r.x, y: r.y, heat: Math.min(1, r.heat), radius: r.radius ?? 20 + r.heat * 34 }));
  }
  if (!Array.isArray(parsed.heat)) parsed.heat = [];
  parsed.heat = parsed.heat.filter(r => r && Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.heat) && Number.isFinite(r.radius) && r.radius > 0 && (!r.material || Object.prototype.hasOwnProperty.call(MATERIALS, r.material)));
  if (migrateGeometry) parsed.walls = mergeWallRects(parsed.walls);
  return cloneWallState(parsed);
}

export interface ShotOptions {
  /**
   * Generate wall damage and follow-on phases. The aim preview runs the same
   * flight and the same one-body contact solver with this off, so what it draws
   * and claims is the shot's own physics, not a second model.
   */
  damage?: boolean;
}

export function simulateShotWalls(def: StageDefinition, snapshot: StageSnapshot, input: ShotInput, options: ShotOptions = {}): WallShotOutcome {
  const damage = options.damage !== false;
  const ammo = getAmmo(input.ammoId);
  const phases = getPhases(ammo, input.choiceId);
  let state = getWallState(snapshot);
  const startSnapshot = attachWallState(cloneSnapshot(snapshot), state);
  const seed = hash32(def.seed, Math.round(input.angleDeg * 10), Math.round(input.power), input.mode === 'arc' ? 1 : 2, input.ammoId.length);
  const rng = new Rng(seed);

  const start = muzzlePosition(input.angleDeg);
  const velocity = launchVelocity(input, ammo.flight.speedScale);
  let x = start.x; let y = start.y; let vx = velocity.x; let vy = velocity.y;
  const dt = PHYSICS.step;
  const frames: ProjectileFrame[] = [];
  const trajectory: Array<{ x: number; y: number; angle: number }> = [];
  const effects: EffectEvent[] = [];
  const damageEvents: DamageEvent[] = [];
  const messages: string[] = [];
  const bodies: FragmentBody[] = [];
  const flightBodies: Array<FragmentBody & { spawnT: number }> = [];
  let impact: ImpactInfo | null = null;
  let firstContact: ImpactInfo | null = null;
  let firstContactT = 0;
  let impactTime = 0;
  let simTime = 0;
  let coreDamage = 0;
  let cellDamageArea = 0;
  let coreHit = false;
  let contactAt = -1;
  let body: ProjectileBodySim | null = null;
  let pixels: WallPixels | null = null;
  let track: BodyTrack | null = null;
  let carvedTotal = 0;

  const maxSteps = Math.min(PHYSICS.maxSimulationSteps, Math.ceil(PHYSICS.maxFlightSeconds / dt));
  for (let step = 0; step < maxSteps; step += 1) {
    simTime += dt;
    const dragFactor = Math.max(0, 1 - ammo.flight.drag * dt);
    vx *= dragFactor;
    vy = vy * dragFactor + velocity.gravity * dt;
    const nx = x + vx * dt;
    const ny = y + vy * dt;
    const contact = traceWalls(state.walls, { x, y }, { x: nx, y: ny }, ammo.flight.radius);
    const core = snapshot.core;
    const invSpeed = 1 / (Math.hypot(vx, vy) || 1);
    // Swept core entry: comparing entry parameters makes the nearest solid win,
    // exactly like the wall sweep.
    const coreT = core.destroyed ? null : sweepEntry({ x, y }, { x: nx, y: ny }, core, ammo.flight.radius);
    const wallT = contact ? contact.t : 1;
    if (coreT !== null && coreT <= wallT) {
      const hx = x + (nx - x) * coreT;
      const hy = y + (ny - y) * coreT;
      impactTime = simTime - dt * (1 - coreT);
      impact = { x: hx, y: hy, nx: -vx * invSpeed, ny: -vy * invSpeed, kind: 'core', contactX: hx, contactY: hy };
      firstContact = impact;
      firstContactT = impactTime;
      coreDamage += 40 * (ammo.ratings?.impact ?? 1);
      effects.push({ t: impactTime * 1000, kind: 'core-hit', x: core.x, y: core.y, radius: core.radius });
      break;
    }
    if (contact) {
      contactAt = contactAt < 0 ? simTime : contactAt;
      const cx = contact.x;
      const cy = contact.y;
      impact = {
        x: cx, y: cy, nx: contact.nx, ny: contact.ny,
        kind: 'cell', material: contact.material,
        contactX: cx, contactY: cy, wallId: contact.wallId,
      };
      if (!firstContact) {
        firstContact = { ...impact };
        firstContactT = simTime;
      }
      impactTime = simTime;
      effects.push({ t: simTime * 1000, kind: 'impact', x: cx, y: cy, family: ammo.vfx.family, angle: Math.atan2(contact.ny, contact.nx), material: contact.material });

      // Hand the round to the one solver. It starts where the nose touched and
      // with the momentum the flight actually carried.
      const cell = BODY_CELL * (ammo.flight.spriteScale ?? 1);
      pixels = new WallPixels(state.walls, WORLD.groundY);
      body = new ProjectileBodySim({
        mass: ammo.flight.mass ?? 1,
        cell,
        x, y,
        angle: Math.atan2(vy, vx),
        vx, vy,
        seed,
        gravity: velocity.gravity,
        heat: 0,
        restitution: ammo.flight.ricochet ? 0.63 : 0.08,
      });

      const startMs = simTime * 1000;
      const contactDir = norm(vx, vy);
      const limit = Math.min(maxSteps - step, Math.ceil(1.6 / dt));
      let lastImpact: ImpactInfo = impact;
      let reportedEntry = 0;
      let reportedBounce = 0;
      for (let i = 0; i < limit; i += 1) {
        body.stepOnce(pixels);
        simTime += BODY_DT;
        // New wall faces the body has reached (a second plate, the far side of
        // a sandwich) become their own impact so the replay can punctuate them.
        const contacts = body.contacts;
        if (contacts.length > reportedEntry) {
          const hit = contacts[contacts.length - 1]!;
          reportedEntry = contacts.length;
          lastImpact = {
            x: hit.x, y: hit.y, nx: hit.nx, ny: hit.ny,
            kind: 'cell', material: hit.material,
            contactX: hit.x, contactY: hit.y,
            wallId: state.walls[hit.wall]?.id,
          };
          if (reportedEntry > 1) {
            effects.push({ t: simTime * 1000, kind: 'impact', x: hit.x, y: hit.y, family: ammo.vfx.family, angle: Math.atan2(hit.ny, hit.nx), material: hit.material });
          }
        }
        // The core is a target, not a wall: a cell that reaches it spends the
        // round's remaining drive on it.
        if (!coreHit && !core.destroyed && body.anyInCircle(core.x, core.y, core.radius, 60)) {
          coreHit = true;
          // A core takes what the round still has, not what it was fired with. A
          // shot that spent its drive boring three plates arrives with a
          // fraction of its energy, so the same round through a clean line hits
          // far harder. This is what makes a careful opening worth more than a
          // heavy round fired into the thickest wall.
          const arrive = Math.hypot(body.centre().vx, body.centre().vy);
          const share = Math.max(0.3, Math.min(1, arrive / 420));
          coreDamage += 40 * (ammo.ratings?.impact ?? 1) * share;
          effects.push({ t: simTime * 1000, kind: 'core-hit', x: core.x, y: core.y, radius: core.radius });
          messages.push('CORE HIT');
        }
        // A round that skidded off a face and left it again is a ricochet the
        // replay has to punctuate; the deflection itself happened in `collide`.
        if (body.bounces > reportedBounce) {
          reportedBounce = body.bounces;
          const c = body.centre();
          effects.push({ t: simTime * 1000, kind: 'bounce', x: c.x, y: c.y, angle: Math.atan2(c.vy, c.vx), family: ammo.vfx.family, material: lastImpact.material });
        }
        if (body.isResting) break;
        const c = body.centre();
        if (c.x < -120 || c.x > WORLD.width + 140 || c.y > WORLD.height + 160 || c.y < -260) break;
      }
      // Report where the round ended up: the deepest contact it made.
      const com = body.centre();
      trajectory.push({ x: com.x, y: com.y, angle: Math.atan2(com.vy, com.vx) });
      frames.push({ t: simTime * 1000, x: com.x, y: com.y, angle: Math.atan2(com.vy, com.vx), scale: body.jacketShare > 0.5 ? 1 : 0.58, visible: false, squash: body.squash, layers: body.layers });

      const stopped = body.isResting;
      const hitInfo = lastImpact;
      if (stopped) {
        impact = {
          x: hitInfo.x, y: hitInfo.y, nx: hitInfo.nx, ny: hitInfo.ny,
          kind: 'cell', material: hitInfo.material,
          contactX: hitInfo.x, contactY: hitInfo.y,
          wallId: hitInfo.wallId,
        };
        effects.push({ t: simTime * 1000, kind: 'squash', x: hitInfo.x, y: hitInfo.y, angle: Math.atan2(hitInfo.ny, hitInfo.nx), family: ammo.vfx.family, material: hitInfo.material });
      } else {
        // Still moving when the contact budget ran out: the shot is a richochet
        // or a deflected round. It ends where it is, with the body intact.
        impact = {
          x: com.x, y: com.y, nx: hitInfo.nx, ny: hitInfo.ny,
          kind: 'cell', material: hitInfo.material,
          contactX: com.x, contactY: com.y,
          wallId: hitInfo.wallId,
        };
      }

      // Jacket separation: the copper casing has failed and what flies on is the
      // steel penetrator. The solver owns the failure; this only reports it.
      if (body.shed) {
        effects.push({ t: simTime * 1000, kind: 'separation', x: com.x, y: com.y, angle: Math.atan2(contactDir.y, contactDir.x), family: ammo.vfx.family, material: contact.material });
        messages.push('JACKET SHED');
      }

      // Wall damage is what the body removed, turned back into geometry.
      if (pixels) {
        if (damage) {
          const carve = applyCarves(state, pixels, state.walls, contactDir, rng, effects, bodies, damageEvents, simTime, ammo, body.entrySpeed());
          cellDamageArea += carve.fragments;
          carvedTotal = pixels.carved.length;
          flightBodies.push(...carve.newBodies.map((b) => ({ ...b, spawnT: simTime * 1000 })));
          if (carve.fragments > 0) {
            damageEvents.push({ t: simTime * 1000, cells: [], wallState: cloneWallState(state), spawnedBodies: carve.newBodies.map((b) => ({ ...b })), x: hitInfo.x, y: hitInfo.y, label: 'PENETRATION' });
          }
        }
      }
      track = damage ? packTrack(body, startMs) : null;
      if (track) track.t0 = startMs;
      break;
    }
    // Ground contact: a round that misses the battery still ends on the seabed.
    const floor = WORLD.groundY - ammo.flight.radius;
    if (ny >= floor && y < floor) {
      const t = Math.min(1, Math.max(0, (floor - y) / (ny - y || 1)));
      const gx = x + (nx - x) * t;
      impactTime = simTime - dt * (1 - t);
      impact = { x: gx, y: floor, nx: 0, ny: -1, kind: 'ground', contactX: gx, contactY: floor };
      if (contactAt < 0) contactAt = simTime;
      if (!firstContact) {
        firstContact = impact;
        firstContactT = impactTime;
      }
      effects.push({ t: impactTime * 1000, kind: 'impact', x: gx, y: floor, family: ammo.vfx.family, angle: Math.PI / 2 });

      // The seabed is solid too: the same solver drops the round onto it.
      const cell = BODY_CELL * (ammo.flight.spriteScale ?? 1);
      pixels = new WallPixels(state.walls, WORLD.groundY);
      body = new ProjectileBodySim({
        mass: ammo.flight.mass ?? 1,
        cell,
        x: gx, y: floor - cell * 2,
        angle: Math.atan2(vy, vx),
        vx, vy: Math.max(0, vy),
        seed,
        gravity: velocity.gravity,
        heat: 0.1,
      });
      const startMs = simTime * 1000;
      const limit = Math.min(maxSteps - step, Math.ceil(1.4 / dt));
      for (let i = 0; i < limit && !body.isResting; i += 1) {
        body.stepOnce(pixels);
        simTime += BODY_DT;
      }
      const com = body.centre();
      trajectory.push({ x: com.x, y: com.y, angle: Math.atan2(com.vy, com.vx) });
      frames.push({ t: simTime * 1000, x: com.x, y: com.y, angle: Math.atan2(com.vy, com.vx), scale: 1, visible: false, squash: body.squash, layers: 0 });
      track = damage ? packTrack(body, startMs) : null;
      if (track) track.t0 = startMs;
      break;
    }
    x = nx; y = ny;
    if (step % 3 === 0) {
      frames.push({ t: simTime * 1000, x, y, angle: Math.atan2(vy, vx), scale: 1, visible: true, squash: 0, layers: 0 });
      trajectory.push({ x, y, angle: Math.atan2(vy, vx) });
    }
    if (x < -90 || x > WORLD.width + 110 || y > WORLD.height + 100 || y < -220) break;
  }

  const phaseWallStates: import('./types').WallPhaseRecord[] = [];
  const timedBodies: Array<FragmentBody & { spawnT: number }> = [...flightBodies];
  if (damage && impact && (impact.kind === 'cell' || impact.kind === 'ground')) {
    const incoming = norm(vx, vy);
    const origin: Point = { x: impact.x - impact.nx * 2, y: impact.y - impact.ny * 2 };
    const phaseQueue = phases.map(p => ({ phase: p, t: impactTime + ((p.at ?? 0) / 1000) })).sort((a, b) => a.t - b.t);
    for (const { phase, t } of phaseQueue) {
      const tMs = t * 1000;
      const bodyMark = bodies.length;
      applyPhase(state, bodies, phase, origin, impact, incoming, tMs, def, rng, effects, damageEvents, (a) => { cellDamageArea += a; });
      // Heat and impact physically bend the metal before support is solved, so
      // the bend changes what is still connected and what the next shot hits.
      settleHotMetal(state);
      const { walls, detached } = detachUnsupported(state.walls, state.groundY);
      let spawned = bodies.slice(bodyMark);
      if (detached.length) {
        state.walls = walls;
        const fall = spawnFragmentBodies(detached, origin, { x: 0, y: 20 }, (seed ^ Math.round(tMs)) >>> 0, 0);
        bodies.push(...fall);
        spawned = [...spawned, ...fall];
        effects.push({ t: tMs, kind: 'collapse', x: origin.x, y: origin.y, count: detached.length });
        messages.push('COLLAPSE');
        damageEvents.push({ t: tMs, cells: [], wallState: cloneWallState(state), spawnedBodies: spawned.map(b=>({ ...b })), collapsed: true, x: origin.x, y: origin.y, label: 'COLLAPSE' });
      } else {
        damageEvents.push({ t: tMs, cells: [], wallState: cloneWallState(state), spawnedBodies: spawned.map(b=>({ ...b })), x: origin.x, y: origin.y, label: phase.label });
      }
      phaseWallStates.push({ t: tMs, wallState: cloneWallState(state), bodies: spawned.map(b=>({ ...b })) });
      timedBodies.push(...spawned.map(b=>({ ...b, spawnT: tMs })));
    }
  } else if (damage && impact) {
    damageEvents.push({ t: impactTime * 1000, cells: [], wallState: cloneWallState(state), spawnedBodies: [], x: impact.x, y: impact.y });
    phaseWallStates.push({ t: impactTime * 1000, wallState: cloneWallState(state), bodies: [] });
  }
  damageEvents.sort((a, b) => a.t - b.t);
  effects.sort((a, b) => a.t - b.t);
  phaseWallStates.sort((a, b) => a.t - b.t);

  const core = { ...snapshot.core };
  core.hp = Math.max(0, core.hp - coreDamage);
  if (core.hp <= 0) { core.destroyed = true; messages.push('CORE BREACHED'); }
  // Relay destruction from wall geometry (P0-9): alive iff any relay cell
  // centre is still covered by a wall polygon. No raster read.
  const grid = snapshot.grid;
  const relaysDestroyed: string[] = [];
  const finalRelays = snapshot.relays.map(r => {
    const covered = r.cells.some(c => {
      const cx = grid.originX + (c.col + 0.5) * grid.tile;
      const cy = grid.originY + (c.row + 0.5) * grid.tile;
      return wallsContain(state.walls, cx, cy);
    });
    const finalAlive = r.alive ? covered : false;
    if (!finalAlive && r.alive) { relaysDestroyed.push(r.id); messages.push('RELAY DESTROYED'); }
    return { ...r, alive: finalAlive };
  });
  const flightEndMs = frames[frames.length - 1]?.t ?? 0;
  const trackStart = track?.t0 ?? flightEndMs;
  const trackMs = track ? track.count / 60 * 1000 : 0;
  const durationMs = Math.min(12000, Math.max(1400, trackStart + trackMs + 700, impactTime * 1000 + 1200));
  const final = attachWallState(cloneSnapshot(snapshot), state);
  final.core = core;
  final.relays = finalRelays;
  const pBody = {
    mass: ammo.flight.mass ?? 1,
    speed: body ? Math.hypot(body.centre().vx, body.centre().vy) : Math.hypot(vx, vy),
    integrity: body ? body.integrity : 1,
    squash: body?.squash ?? 0,
    layers: body?.layers ?? 0,
    coreMass: 0,
    jacketMass: 0,
    quality: 1,
    shed: body?.shed ?? false,
  };
  const result: ShotResult = {
    def, ammo, input, phases,
    start: startSnapshot,
    final,
    phaseWallStates,
    bodies: timedBodies,
    frames, track, effects, damageEvents,
    firstContact, firstContactT, impact,
    coreDamage, coreDestroyed: core.destroyed,
    relaysDestroyed, cellDamage: cellDamageArea,
    durationMs,
    messages: [...new Set(messages)],
    tracePath: frames.map(f => ({ x: f.x, y: f.y, t: f.t })),
    trajectory,
    body: pBody,
  };
  return { result, wallState: state, bodies, body, carved: carvedTotal };
}

/** True when the point is inside any surviving wall polygon. */
function wallsContain(walls: readonly Wall[], x: number, y: number): boolean {
  for (const wall of walls) {
    for (const poly of wall.polygons) {
      if (pointInPolygon({ x, y }, poly)) return true;
    }
  }
  return false;
}

/** Swept circle entry parameter (0..1), or null when the segment misses. */
function sweepEntry(from: Point, to: Point, circle: { x: number; y: number; radius: number }, radius: number): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const ex = from.x - circle.x;
  const ey = from.y - circle.y;
  const r = circle.radius + radius;
  const a = dx * dx + dy * dy;
  if (a < 1e-9) return null;
  const b = 2 * (ex * dx + ey * dy);
  const c = ex * ex + ey * ey - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

/**
 * Turn the pixels the round destroyed back into wall damage: one banded cut per
 * wall it bored, sized by what was actually removed, plus the chips that cut
 * throws and a heat stamp on the surviving face.
 */
function applyCarves(
  state: WallState,
  pixels: WallPixels,
  walls: readonly Wall[],
  dir: Point,
  rng: Rng,
  effects: EffectEvent[],
  bodies: FragmentBody[],
  _damageEvents: DamageEvent[],
  simTime: number,
  ammo: import('../ammo/types').AmmoDef,
  impactSpeed: number,
): { fragments: number; newBodies: FragmentBody[] } {
  // Kinetic share of a full-power muzzle: work and heat scale with v squared.
  const heatScale = Math.max(0.2, Math.min(1, Math.pow(impactSpeed / 441, 2)));
  const byWall = new Map<number, Array<{ x: number; y: number; material: MaterialId }>>();
  for (const pixel of pixels.carved) {
    const list = byWall.get(pixel.wall);
    if (list) list.push(pixel);
    else byWall.set(pixel.wall, [pixel]);
  }
  const newBodies: FragmentBody[] = [];
  let fragments = 0;
  for (const [wallIndex, list] of byWall) {
    const wall = walls[wallIndex];
    if (!wall || wallIndex < 0) continue;
    // Along the travel direction: the entry pixel is the rearmost, the exit the
    // furthest the round got in this wall.
    let entry = list[0]!;
    let exit = list[0]!;
    let minAlong = Infinity;
    let maxAlong = -Infinity;
    for (const pixel of list) {
      const along = pixel.x * dir.x + pixel.y * dir.y;
      if (along < minAlong) { minAlong = along; entry = pixel; }
      if (along > maxAlong) { maxAlong = along; exit = pixel; }
    }
    // Remove exactly the cells the body destroyed. There is no oriented band and
    // no bbox stamp any more: entry lip, taper, bore and exit are the pixel
    // boundary of what mass x speed actually took.
    const cells = list.map((pixel) => ({ x: pixel.x, y: pixel.y }));
    const cut = subtractPixelCells(wall, cells, PIXEL, FRAGMENT_SIZE);
    if (cut.fragments.length > 0) {
      // The surviving rim keeps the shape the pixel soft body pushed it into:
      // each vertex samples the permanent displacement field of the patch.
      const bent = cut.wall.polygons.map((poly) => poly.map((point) => {
        const d = pixels.deformationAt(point.x, point.y);
        if (!d) return { ...point };
        return { x: point.x + d.x, y: point.y + d.y };
      }));
      state.walls = state.walls.map((w) => (w.id === wall.id ? { ...cut.wall, polygons: bent } : w));
      // Chips carry the round's momentum, not a fixed kick.
      const kick = Math.min(220, impactSpeed * 0.22);
      const chips = spawnFragmentBodies(
        cut.fragments,
        { x: entry.x, y: entry.y },
        { x: dir.x * kick, y: dir.y * kick - 26 },
        seedFrom(simTime * 1000, rng),
        heatScale,
      );
      newBodies.push(...chips);
      fragments += cut.fragments.length;
      effects.push({ t: simTime * 1000, kind: 'penetrate', x: exit.x, y: exit.y, angle: Math.atan2(dir.y, dir.x), family: ammo.vfx.family, material: wall.material });
    }
    const metal = MATERIALS[wall.material].isMetal;
    addHeat(state, entry.x, entry.y, metal ? 0.55 + heatScale * 0.45 : 0.4 + heatScale * 0.4, metal ? 14 + heatScale * 10 : 10 + heatScale * 8, wall.material);
    // Heat along the channel the round actually carved.
    for (let i = 0; i < list.length; i += 6) {
      const pixel = list[i]!;
      addHeat(state, pixel.x, pixel.y, 0.45 + heatScale * 0.4, 10 + heatScale * 6, pixel.material);
    }
  }
  bodies.push(...newBodies);
  void walls;
  return { fragments, newBodies };
}

/** Punch the round's own diameter through a wall it crosses. */
function boreWall(state: WallState, wallId: string | undefined, from: Point, to: Point, width: number): FractureFragment[] {
  if (!wallId) return [];
  let chips: FractureFragment[] = [];
  state.walls = state.walls.map((wall) => {
    if (wall.id !== wallId) return wall;
    const cut = fractureWallBand(wall, from, to, width, FRAGMENT_SIZE);
    chips = cut.fragments;
    return cut.fragments.length > 0 ? { ...cut.wall, anchored: false } : cut.wall;
  });
  return chips;
}
void boreWall;

function applyPhase(
  state: WallState, bodies: FragmentBody[], phase: AmmoPhase, origin: Point,
  impact: ImpactInfo, incoming: Point, tMs: number,
  _def: StageDefinition, rng: Rng, effects: EffectEvent[], _damageEvents: DamageEvent[],
  addArea: (a: number) => void,
): void {
  const channel = phase.channel;
  const resistance = Object.fromEntries(Object.entries(MATERIALS).map(([k, m]) => [k, m.resistance[channel] * (RESISTANCE[k] ?? 1)])) as Record<string, number>;
  const isJet = phase.kind === 'jet' || phase.kind === 'pierce' || phase.kind === 'drill';
  const isBlast = phase.kind === 'blast' || phase.kind === 'shock' || phase.kind === 'fragment' || phase.kind === 'spall' || phase.kind === 'crush' || phase.kind === 'tear' || phase.kind === 'rain' || phase.kind === 'plug' || phase.kind === 'burn';
  if (isJet) {
    // Entry scorch on steel: sampling the channel every 18 units can skip a
    // thin plate entirely, leaving a clean hole with no burn. Stamp the face
    // that took the hit so every metal penetration leaves heat (and a warp).
    const entryWall = state.walls.find(w => w.polygons.some(p => pointInPolygon(origin, p)));
    if (entryWall) {
      const metal = MATERIALS[entryWall.material].isMetal;
      addHeat(state, origin.x, origin.y, metal ? 1 : 0.8, metal ? 24 : 18, entryWall.material);
    }
    const dist = phase.distance ?? phase.radius ?? 180;
    const width = phase.width ?? Math.max(6, (phase.radius ?? 12) * 0.5);
    const dir = phase.dir === 'forward' ? incoming : norm(-impact.nx, -impact.ny);
    const to = { x: origin.x + dir.x * dist, y: origin.y + dir.y * dist };
    const energy = Math.max(20, phase.damage * 28);
    const pen = penetrateWalls(state.walls, origin, to, width, FRAGMENT_SIZE, energy, resistance);
    // track area removed
    state.walls = pen.walls;
    // The entry plate itself may be punched out. Any metal that survived near
    // the channel still carries a burn, so a clean hole never reads as cold.
    for (const w of state.walls) {
      const p = survivorHeatPoint(w, origin);
      if (p) addHeat(state, p.x, p.y, MATERIALS[w.material].isMetal ? 0.95 : 0.7, MATERIALS[w.material].isMetal ? 18 : 13, w.material);
    }
    const newBodies = spawnFragmentBodies(pen.fragments, origin, { x: dir.x * 120 + rng.range(-30, 30), y: dir.y * 120 - 30 }, seedFrom(tMs, rng), channel === 'jet' ? 1 : 0.4);
    bodies.push(...newBodies);
    addArea(pen.fragments.length);
    // heat along channel: a narrow scorched lane that follows the jet, each
    // stamp centred on the surviving surface next to the channel.
    for (let d = 0; d < dist; d += 18) {
      const hx = origin.x + dir.x * d; const hy = origin.y + dir.y * d;
      // Only the metal the jet actually travels through is scorched. The old
      // vertex-distance test stained any wall within 60 units, which painted
      // untouched blocks with a full violet face.
      const hitWall = state.walls.find(w => MATERIALS[w.material].isMetal && w.polygons.some(p => pointInPolygon({ x: hx, y: hy }, p)));
      if (hitWall) addHeat(state, hx, hy, Math.max(0.25, 1 - d / dist), Math.min(22, Math.max(8, width * 2.2)), hitWall.material);
    }
    effects.push({ t: tMs, kind: phase.kind === 'jet' ? 'jet' : 'impact', x: origin.x, y: origin.y, angle: Math.atan2(dir.y, dir.x), length: dist, width, family: undefined });
  } else if (isBlast) {
    const baseRadius = phase.radius ?? 36;
    // Per-family hole calibration vs footage: HE craters widest, SOFT shears
    // as a chunk (smaller crater, bodies still fall via support), HESH wide
    // but shallow. HEAT stays in the jet branch (narrow channel).
    const radiusScale = phase.kind === 'blast' ? 1.35 : phase.kind === 'shock' ? 0.85 : phase.kind === 'crush' ? 0.9 : 1.05;
    const radius = baseRadius * radiusScale;
    const dmg = phase.damage;
    // fracture each wall near origin
    const newBodies: FragmentBody[] = [];
    state.walls = state.walls.map((w) => {
      // A large wall can intersect the blast with every vertex far away.
      const near = w.polygons.some((polygon) => {
        const xs = polygon.map((point) => point.x);
        const ys = polygon.map((point) => point.y);
        return Math.min(...xs) <= origin.x + radius && Math.max(...xs) >= origin.x - radius &&
          Math.min(...ys) <= origin.y + radius && Math.max(...ys) >= origin.y - radius;
      });
      if (!near) return w;
      // `dmg` is a damage score (often 20-40), not a 0..1 fraction. The old
      // `0.7 + dmg * 0.05` turned a 43-radius APHE burst into a 107-radius
      // crater that erased the column and truss two objects away. Clamp the
      // damage contribution and carve relative to the authored blast radius.
      const dmgFactor = Math.max(0, Math.min(0.3, dmg / 120));
      const fracRadius = Math.min(radius * 0.95, baseRadius * (0.68 + dmgFactor));
      // Brittle brick produces a finer spray than ductile metal. Geometry is
      // still carved in world units, regardless of the presentation zoom.
      let fragmentSize = FRAGMENT_SIZE;
      if (w.material === 'brick') fragmentSize = 6;
      else if (MATERIALS[w.material].isMetal) fragmentSize = 8;
      const r = fractureWall(w, origin, fracRadius, fragmentSize);
      const fragBodies = spawnFragmentBodies(r.fragments, origin, { x: -impact.nx * 90, y: -60 }, seedFrom(tMs, rng), 0.7);
      newBodies.push(...fragBodies);
      // Heat only where metal survived the break, and white-hot at the face
      // that survived it. Stamping the crater centre burns a hole that is then
      // thrown away as fragments (leaving only a cold violet fringe), and
      // staining every metal in blast range painted whole untouched blocks.
      if (r.fragments.length > 0) {
        const metal = MATERIALS[w.material].isMetal;
        // Stamp the bloom on surviving geometry, not on the bbox centre: after
        // a plate is punched out the bbox centre is a hole, so the old stamp
        // only painted its cold violet fringe onto the remaining rim.
        const p = survivorHeatPoint(r.wall, origin);
        if (p) {
          const hotR = Math.min(28, Math.max(12, fracRadius * 0.6)) * (metal ? 1 : 0.75);
          addHeat(state, p.x, p.y, metal ? 1 : 0.75, hotR, w.material);
        }
      }
      return r.wall;
    });
    bodies.push(...newBodies);
    addArea(newBodies.length);
    effects.push({ t: tMs, kind: 'blast', x: origin.x, y: origin.y, radius });
  } else {
    effects.push({ t: tMs, kind: 'impact', x: origin.x, y: origin.y });
  }
}

void seedFrom;
function seedFrom(tMs: number, rng: Rng): number { return ((tMs * 1000) ^ rng.int(0, 100000)) >>> 0; }

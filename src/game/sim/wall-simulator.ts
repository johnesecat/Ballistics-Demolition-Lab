import { PHYSICS, WORLD } from '../config';
import { getAmmo, getPhases } from '../ammo/catalogue';
import type { AmmoPhase } from '../ammo/types';
import { MATERIALS, type MaterialId } from '../materials';
import { Rng, hash32 } from '../rng';
import type { StageDefinition, StageSnapshot } from '../stages/types';
import { cloneSnapshot } from '../stages/types';
import { mergeWallRects } from '../stages/wall-builder';
import { launchVelocity, muzzlePosition, sweepCircleEntry } from './collision';
import { fractureWall, fractureWallBand, penetrateWalls, raySpanInWall, spawnFragmentBodies, traceWalls, type FractureFragment, type FragmentBody, type Point, type WallContact } from './fracture';
import type { DamageEvent, EffectEvent, ImpactInfo, ProjectileFrame, ShellFrameState, ShotInput, ShotResult } from './types';
import { addHeat, cloneWallState, detachUnsupported, pointInPolygon, pointInWalls, wallsFromSnapshot, type WallState } from './walls';
import { survivorHeatPoint } from './heat-anchor';
import { deformHeatedWalls, tearRim } from './wall-deform';
import { crossLayer, makeProjectileBody } from './projectile-body';

/**
 * Wall-object shot simulation (P0-3..P0-10). Damage authority is Wall polygons
 * via traceWalls / penetrateWalls / fractureWall. Replay is wall-first:
 * phaseWallStates carries the authoritative post-phase walls + bodies.
 */

const RESISTANCE: Record<string, number> = { steel: 1.0, armor: 1.25, brick: 0.55, concrete: 0.7, wood: 0.45, slopes: 0.6 };

/**
 * How hard a face is to a crushing shell, 0..1. Steel and armour hold their
 * shape and pancake the casing; timber gives way and barely marks the nose.
 */
const FACE_HARDNESS: Record<string, number> = { steel: 0.9, armor: 1, concrete: 0.62, brick: 0.45, slopes: 0.55, wood: 0.22 };

function faceHardness(material: string | undefined): number {
  return material ? (FACE_HARDNESS[material] ?? 0.5) : 0.15;
}
const FRAGMENT_SIZE = 7; // world units, fixed — never zoom dependent (P0-13)
function norm(x: number, y: number): Point { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; }

/**
 * Fallback layer thickness when the wall record cannot be found: project the
 * projectile radius through the surface normal. In practice raySpanInWall is
 * used, which measures the real polygon cross-section.
 */
function thicknessAlongRay(contact: { nx: number; ny: number }, dir: Point, radius: number): number {
  const incidence = Math.abs(contact.nx * dir.x + contact.ny * dir.y) || 0.25;
  return (radius * 2) / Math.max(0.25, incidence);
}

export interface WallShotOutcome {
  result: ShotResult;
  wallState: WallState;
  bodies: FragmentBody[];
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

export function simulateShotWalls(def: StageDefinition, snapshot: StageSnapshot, input: ShotInput): WallShotOutcome {
  const ammo = getAmmo(input.ammoId);
  const phases = getPhases(ammo, input.choiceId);
  let state = getWallState(snapshot);
  const startSnapshot = attachWallState(cloneSnapshot(snapshot), state);
  const seed = hash32(def.seed, Math.round(input.angleDeg * 10), Math.round(input.power), input.mode === 'arc' ? 1 : 2, input.ammoId.length);
  const rng = new Rng(seed);

  const start = muzzlePosition(input.angleDeg);
  const velocity = launchVelocity(input, ammo.flight.speedScale);
  let x = start.x; let y = start.y; let vx = velocity.x; let vy = velocity.y;
  const pBody = makeProjectileBody(ammo.flight.mass ?? 1, Math.hypot(velocity.x, velocity.y));
  const dt = PHYSICS.step;
  const frames: ProjectileFrame[] = [];
  const trajectory: Array<{ x: number; y: number; angle: number }> = [];
  const effects: EffectEvent[] = [];
  const damageEvents: DamageEvent[] = [];
  const messages: string[] = [];
  const bodies: FragmentBody[] = [];
  let impact: ImpactInfo | null = null;
  // The impact the shot actually ended on. A round that crosses a thin layer
  // and flies on leaves a bore at the entry but no wreck there: the wreck is
  // only the terminal pancake.
  let terminalImpact: ImpactInfo | null = null;
  let firstContact: ImpactInfo | null = null;
  let impactTime = 0;
  const flightBodies: Array<FragmentBody & { spawnT: number }> = [];
  let simTime = 0;
  let coreDamage = 0;
  let cellDamageArea = 0;
  let ricochets = 0;
  let impactVx = 0;
  let impactVy = 0;
  // First touch of a solid. The shell's pixel lattice is driven from this
  // instant, not from the end of the flight, so the round visibly crushes on
  // the face while it bores -- the sprite collides with what it hits instead of
  // flying through intact geometry and snapping to a wreck afterwards.
  let contactAt = -1;

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
    // Swept core entry. The old endpoint-only circle test could pass a fast
    // round through the core, and a round stopped by a wall still damaged a
    // core sitting behind that wall. Comparing entry parameters makes the
    // nearest solid win, exactly like the wall sweep.
    const coreT = core.destroyed
      ? null
      : sweepCircleEntry({ x, y }, { x: nx, y: ny }, core, ammo.flight.radius);
    const wallT = contact ? contact.t : 1;
    if (coreT !== null && coreT <= wallT) {
      const hx = x + (nx - x) * coreT;
      const hy = y + (ny - y) * coreT;
      impactTime = simTime - dt * (1 - coreT);
      impact = {
        x: hx, y: hy, nx: -vx * invSpeed, ny: -vy * invSpeed,
        kind: 'core', contactX: hx, contactY: hy,
      };
      firstContact = impact;
      terminalImpact = impact;
      impactVx = vx;
      impactVy = vy;
      coreDamage += 40 * (ammo.ratings?.impact ?? 1);
      effects.push({ t: impactTime * 1000, kind: 'core-hit', x: core.x, y: core.y, radius: core.radius });
      break;
    }
    if (contact) {
      const cx = contact.x;
      const cy = contact.y;
      const cnx = contact.nx;
      const cny = contact.ny;
      if (contactAt < 0) contactAt = simTime;
      if (!firstContact) {
        firstContact = { x: cx, y: cy, nx: cnx, ny: cny, kind: 'cell', material: contact.material, contactX: cx, contactY: cy, wallId: contact.wallId };
      }
      // Ricochet was preview-only: Bankshot showed a bounce and then stopped
      // dead on the same input. Use the preview's incidence gate, damping and
      // standoff so the dotted path and the live shot agree.
      const speed = Math.hypot(vx, vy) || 1;
      const incidence = Math.acos(Math.max(-1, Math.min(1, -(vx * cnx + vy * cny) / speed)));
      if ((ammo.flight.ricochet ?? 0) > ricochets && ricochets < 2 && incidence > Math.PI * 0.31) {
        ricochets += 1;
        const dot = vx * cnx + vy * cny;
        vx = (vx - 2 * dot * cnx) * 0.63;
        vy = (vy - 2 * dot * cny) * 0.63;
        x = cx + cnx * (ammo.flight.radius + 1.4);
        y = cy + cny * (ammo.flight.radius + 1.4);
        effects.push({ t: simTime * 1000, kind: 'bounce', x: cx, y: cy, angle: Math.atan2(cny, cnx), family: ammo.vfx.family, material: contact.material });
        frames.push({ t: simTime * 1000, x, y, angle: Math.atan2(vy, vx), scale: 1, visible: true, squash: pBody.squash, layers: pBody.layers, shell: shellState(pBody, contact.material, pBody.speed, simTime * 1000, simTime - contactAt) });
        trajectory.push({ x, y, angle: Math.atan2(vy, vx) });
        continue;
      }
      impactTime = simTime;
      impact = {
        x: cx, y: cy, nx: cnx, ny: cny,
        kind: 'cell', material: contact.material,
        contactX: cx, contactY: cy, wallId: contact.wallId,
      };
      impactVx = vx;
      impactVy = vy;
      x = cx; y = cy;
      // --- Kinetic penetration (multi-layer) -------------------------------
      // A round is a physical body (mass + speed). It crosses real layers one
      // at a time: the layer thickness is measured with a ray through the wall
      // polygon, compared with the material's cap, then paid for in speed. A
      // round that still has speed continues to the next layer in the same
      // flight, so stacked plates, a timber frame and a thin steel face are
      // distinct outcomes rather than "stop on first touch".
      let stopContact: WallContact | null = contact;
      let stoppedByLayer = false;
      if (contact) {
        pBody.speed = Math.hypot(vx, vy);
        let entry = { x: cx, y: cy };
        let layer: WallContact | null = contact;
        let crossed = 0;
        while (layer && crossed < 4) {
          const wall = state.walls.find((w) => w.id === layer!.wallId);
          const mat = wall?.material ?? layer.material;
          const dir = norm(vx, vy);
          const span = wall ? raySpanInWall(wall, entry, dir) : thicknessAlongRay(layer, dir, ammo.flight.radius);
          const costed = crossLayer(pBody, mat, span, MATERIALS[mat].resistance.kinetic);
          if (costed === null) {
            // Out of speed inside the layer: the round flattens against the
            // face. Thickness itself never vetoes a crossing -- what the round
            // cannot pay for in speed is what stops it.
            pBody.squash = 1;
            pBody.integrity = Math.max(0, pBody.integrity - 0.25);
            stopContact = layer;
            stoppedByLayer = true;
            effects.push({ t: simTime * 1000, kind: 'squash', x: entry.x, y: entry.y, angle: Math.atan2(dir.y, dir.x), family: ammo.vfx.family, material: mat });
            break;
          }
          crossed += 1;
          const exit = { x: entry.x + dir.x * (span + ammo.flight.radius + 1.2), y: entry.y + dir.y * (span + ammo.flight.radius + 1.2) };
          // A round that crosses a layer bores its own diameter through it.
          // Without this a fast shell passed through a plate and left it
          // untouched, which is not physical: the hole is the visible result
          // of penetration, not just the speed cost.
          const boreWidth = Math.max(2.6, ammo.flight.radius * 2);
          const chips = boreWall(state, wall?.id ?? layer.wallId, entry, exit, boreWidth);
          // The surviving metal around the channel peels outward: a real bore
          // leaves a torn, opened lip, not a clean drilled hole.
          state.walls = tearRim(state.walls, entry, boreWidth, mat, pBody.speed);
          if (chips.length > 0) {
            const boreBodies = spawnFragmentBodies(chips, entry, { x: dir.x * 70, y: dir.y * 70 - 26 }, seedFrom(simTime * 1000, rng), 0.18);
            bodies.push(...boreBodies);
            flightBodies.push(...boreBodies.map((b) => ({ ...b, spawnT: simTime * 1000 })));
            cellDamageArea += chips.length;
            damageEvents.push({ t: simTime * 1000, cells: [], wallState: cloneWallState(state), spawnedBodies: boreBodies.map((b) => ({ ...b })), x: entry.x, y: entry.y, label: 'PENETRATION' });
          }
          effects.push({ t: simTime * 1000, kind: 'penetrate', x: exit.x, y: exit.y, angle: Math.atan2(dir.y, dir.x), family: ammo.vfx.family, material: mat });
          trajectory.push({ x: exit.x, y: exit.y, angle: Math.atan2(vy, vx) });
          frames.push({ t: simTime * 1000, x: exit.x, y: exit.y, angle: Math.atan2(vy, vx), scale: 1, visible: true, squash: pBody.squash, layers: pBody.layers, shell: shellState(pBody, mat, pBody.speed, simTime * 1000, simTime - contactAt) });
          if (pBody.speed <= 0) { stopContact = layer; stoppedByLayer = true; break; }
          entry = exit;
          // Probe forward for the next layer (thin stacked plates can sit
          // inside one simulation step); the distance is speed-scaled but
          // bounded so a fast round does not skip a plate.
          const probe = Math.max(ammo.flight.radius * 2, Math.min(48, pBody.speed * dt * 1.5));
          layer = traceWalls(state.walls, entry, { x: entry.x + dir.x * probe, y: entry.y + dir.y * probe }, ammo.flight.radius);
        }
        if (!stoppedByLayer) {
          // Passed through everything ahead: continue the same step from the
          // last exit, conserving direction and remaining speed.
          x = entry.x;
          y = entry.y;
          const speedNow = pBody.speed;
          const speed0 = Math.hypot(vx, vy) || 1;
          vx = (vx / speed0) * speedNow;
          vy = (vy / speed0) * speedNow;
          stopContact = null;
        }
      }
      frames.push({ t: simTime * 1000, x, y, angle: Math.atan2(vy, vx), scale: 1, visible: true, squash: pBody.squash, layers: pBody.layers, shell: shellState(pBody, stopContact?.material ?? contact?.material, pBody.speed, simTime * 1000, simTime - contactAt) });
      trajectory.push({ x, y, angle: Math.atan2(vy, vx) });
      if (stoppedByLayer && stopContact) {
        impact = {
          x: stopContact.x, y: stopContact.y, nx: stopContact.nx, ny: stopContact.ny,
          kind: 'cell', material: stopContact.material,
          contactX: stopContact.x, contactY: stopContact.y,
          wallId: stopContact.wallId,
        };
        terminalImpact = impact;
        effects.push({ t: simTime * 1000, kind: 'impact', x: stopContact.x, y: stopContact.y, family: ammo.vfx.family, angle: Math.atan2(cny, cnx), material: stopContact.material });
      }
      if (stoppedByLayer) break;
      // No terminal impact occurred: retain the bore, but don't detonate at
      // this entry if the round later leaves the range without stopping.
      impact = null;
      continue;
    }
    // Ground contact. The live solver used to have none: a round that missed
    // the battery flew through the seabed and resolved as a no-contact shot.
    const floor = WORLD.groundY - ammo.flight.radius;
    if (ny >= floor && y < floor) {
      const t = Math.min(1, Math.max(0, (floor - y) / (ny - y || 1)));
      const gx = x + (nx - x) * t;
      impactTime = simTime - dt * (1 - t);
      impact = { x: gx, y: floor, nx: 0, ny: -1, kind: 'ground', contactX: gx, contactY: floor };
      if (contactAt < 0) contactAt = simTime;
      terminalImpact = impact;
      impactVx = vx;
      impactVy = vy;
      if (!firstContact) firstContact = impact;
      effects.push({ t: impactTime * 1000, kind: 'impact', x: gx, y: floor, family: ammo.vfx.family, angle: Math.PI / 2 });
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
  const bodiesBefore = bodies.length;
  void bodiesBefore;
  if (impact && (impact.kind === 'cell' || impact.kind === 'ground')) {
    const incoming = norm(vx, vy);
    const origin: Point = { x: impact.x - impact.nx * 2, y: impact.y - impact.ny * 2 };
    const phaseQueue = phases.map(p => ({ phase: p, t: impactTime + ((p.at ?? 0) / 1000) })).sort((a, b) => a.t - b.t);
    for (const { phase, t } of phaseQueue) {
      const tMs = t * 1000;
      const bodyMark = bodies.length;
      applyPhase(state, bodies, phase, origin, impact, incoming, tMs, def, rng, effects, damageEvents, (a) => { cellDamageArea += a; });
      // Heat and impact physically bend the metal before support is solved, so
      // the bend changes what is still connected and what the next shot hits.
      deformHeatedWalls(state);
      const { walls, detached } = detachUnsupported(state.walls, state.groundY);
      let spawned = bodies.slice(bodyMark);
      if (detached.length) {
        state.walls = walls;
        const fall = spawnFragmentBodies(detached, origin, { x: 0, y: 20 }, (seed ^ Math.round(tMs)) >>> 0, 0);
        bodies.push(...fall);
        spawned = [...spawned, ...fall];
        effects.push({ t: tMs, kind: 'collapse', x: origin.x, y: origin.y, count: detached.length });
        messages.push('COLLAPSE');
        damageEvents.push({ t: tMs, cells: [], wallState: cloneWallState(state), spawnedBodies: spawned.map(b=>({...b})), collapsed: true, x: origin.x, y: origin.y, label: 'COLLAPSE' });
      } else {
        damageEvents.push({ t: tMs, cells: [], wallState: cloneWallState(state), spawnedBodies: spawned.map(b=>({...b})), x: origin.x, y: origin.y, label: phase.label });
      }
      phaseWallStates.push({ t: tMs, wallState: cloneWallState(state), bodies: spawned.map(b=>({...b})) });
      timedBodies.push(...spawned.map(b=>({ ...b, spawnT: tMs })));
    }
  } else if (impact) {
    damageEvents.push({ t: impactTime * 1000, cells: [], wallState: cloneWallState(state), spawnedBodies: [], x: impact.x, y: impact.y });
    phaseWallStates.push({ t: impactTime * 1000, wallState: cloneWallState(state), bodies: [] });
  }
  damageEvents.sort((a, b) => a.t - b.t);
  effects.sort((a, b) => a.t - b.t);
  phaseWallStates.sort((a, b) => a.t - b.t);
  // The casing keeps its physics after contact. Flight frames stop at the
  // impact, so a deterministic wreck timeline carries the peeled, tumbling
  // shell through the rest of the replay instead of freezing it on the wall.
  const wreck = terminalImpact && (terminalImpact.kind === 'cell' || terminalImpact.kind === 'ground')
    ? buildWreckFrames(terminalImpact, impactVx, impactVy, ammo, impactTime * 1000, pBody, contactAt >= 0 ? Math.max(0, impactTime - contactAt) : 0)
    : [];

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
      return pointInWalls(state.walls, { x: cx, y: cy });
    });
    const alive = covered && r.alive ? true : covered ? true : false;
    // If relay was already destroyed, stays destroyed; if covered, alive.
    const finalAlive = r.alive ? covered : false;
    void alive;
    if (!finalAlive && r.alive) { relaysDestroyed.push(r.id); messages.push('RELAY DESTROYED'); }
    return { ...r, alive: finalAlive };
  });
  const flightEndMs = frames[frames.length - 1]?.t ?? 0;
  const durationMs = Math.min(12000, Math.max(1400, flightEndMs + 1200, impactTime * 1000 + 1200));
  // Grid field is synced ONLY for the legacy raster renderer; authority is
  // wallState. New code must use snapshot.wallState, never snapshot.grid cells.
  const final = attachWallState(cloneSnapshot(snapshot), state);
  final.core = core;
  final.relays = finalRelays;
  // No raster sync: stage cells are empty by design. Wall geometry is the only
  // damage surface the renderer, preview, HUD and saves read.
  const result: ShotResult = {
    def, ammo, input, phases,
    start: startSnapshot,
    final,
    phaseWallStates,
    bodies: timedBodies,
    frames, wreck, effects, damageEvents,
    firstContact, impact,
    coreDamage, coreDestroyed: core.destroyed,
    relaysDestroyed, cellDamage: cellDamageArea,
    durationMs,
    messages: [...new Set(messages)],
    tracePath: frames.map(f => ({ x: f.x, y: f.y, t: f.t })),
    trajectory,
  };
  return { result, wallState: state, bodies };
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

function buildWreckFrames(
  impact: ImpactInfo,
  vx: number,
  vy: number,
  ammo: import('../ammo/types').AmmoDef,
  startMs: number,
  body: { squash: number; integrity: number; layers: number; mass: number },
  /** Lattice age already accumulated during the flight (seconds since contact). */
  ageAtStart = 0,
): ProjectileFrame[] {
  const nx = impact.nx;
  const ny = impact.ny;
  const speed = Math.hypot(vx, vy);
  const into = vx * nx + vy * ny;
  const metal = impact.material ? MATERIALS[impact.material].isMetal : false;
  const restitution = impact.kind === 'ground' ? 0.16 : metal ? 0.22 : 0.12;
  // Most of the round's energy was spent on the hit, so the casing peels off
  // slowly and drops instead of rebounding like a ball.
  let wx = (vx - (1 + restitution) * into * nx) * 0.22;
  let wy = (vy - (1 + restitution) * into * ny) * 0.22;
  const lift = Math.min(40, 8 + speed * 0.05);
  wx += nx * lift;
  wy += ny * lift;
  let x = impact.x + nx * (ammo.flight.radius + 0.4);
  let y = impact.y + ny * (ammo.flight.radius + 0.4);
  // Start with the nose into the surface, so the squashed body spreads parallel
  // to the wall and reads as a pancake instead of a diagonal splat.
  let angle = Math.atan2(-ny, -nx);
  const spin = (vx >= 0 ? 1 : -1) * (0.8 + Math.min(1.4, speed / 420));
  const dt = 1 / 60;
  const duration = 0.95;
  const floor = WORLD.groundY - ammo.flight.radius;
  const frames: ProjectileFrame[] = [];
  for (let elapsed = 0; elapsed < duration; elapsed += dt) {
    // Crumple in view: the casing opens over the first ~110 ms instead of
    // snapping straight to a pancake.
    const crumple = Math.min(1, 0.3 + (elapsed / 0.11) * 0.7);
    frames.push({
      t: startMs + elapsed * 1000,
      x,
      y,
      angle,
      scale: 0.92,
      visible: true,
      squash: crumple,
      shell: {
        squash: Math.max(body.squash, crumple),
        crumple: Math.min(1, Math.max(crumple, body.squash * 0.8 + (elapsed / 0.3) * 0.5)),
        hardness: faceHardness(impact.material),
        speed: Math.max(0, Math.hypot(vx, vy)),
        mass: body.mass,
        integrity: body.integrity,
        // Wreck age continues from the moment of contact, so the lattice picks
        // up the crush it already had instead of restarting at zero.
        age: ageAtStart + elapsed,
        material: impact.material ?? null,
        seed: (Math.round(startMs) ^ (body.layers * 40503)) >>> 0,
      },
    });
    wy += PHYSICS.arcGravity * dt;
    x += wx * dt;
    y += wy * dt;
    angle += spin * dt;
    if (y >= floor) {
      y = floor;
      if (wy > 0) wy = -wy * 0.22;
      wx *= 0.55;
    }
  }
  return frames;
}

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

function seedFrom(tMs: number, rng: Rng): number { return ((tMs * 1000) ^ rng.int(0, 100000)) >>> 0; }

/**
 * Deform state for one frame: the body's squash plus the face it is working
 * against. Crushing progresses with the damage the casing has taken, so a round
 * that crosses three thin plates is visibly mangled by the third.
 */
function shellState(
  body: { squash: number; integrity: number; layers: number; mass: number },
  material: string | undefined,
  speed: number,
  tMs: number,
  /** Seconds since first contact; the pixel lattice is stepped from here. */
  age: number,
): ShellFrameState {
  const hardness = faceHardness(material);
  const crumple = Math.min(1, body.squash * (0.55 + hardness * 0.7) + body.layers * 0.08);
  return {
    squash: Math.min(1, body.squash),
    crumple,
    hardness,
    speed,
    mass: body.mass,
    integrity: body.integrity,
    age: Math.max(0, age),
    material: (material as MaterialId | undefined) ?? null,
    seed: (Math.round(tMs) ^ (body.layers * 2654435761)) >>> 0,
  };
}

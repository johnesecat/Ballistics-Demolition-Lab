import { PHYSICS, WORLD } from '../config';
import { getAmmo, getPhases } from '../ammo/catalogue';
import type { AmmoDef } from '../ammo/types';
import type { StageDefinition, StageSnapshot } from '../stages/types';
import { launchVelocity, muzzlePosition, sweepCircleEntry } from './collision';
import { traceWalls, type Wall } from './fracture';
import { simulateShotWalls, getWallState } from './wall-simulator';
import { coreCoverFraction, pointInWalls } from './walls';
import type { ImpactInfo, PreviewResult, ShotInput } from './types';

/**
 * Aim preview.
 *
 * There is exactly one round model, so the preview does not re-implement the
 * flight, the contact, or the penetration. It runs `simulateShotWalls` with
 * damage generation switched off and reads every claim from that result:
 *
 *  - the dotted path is the solver's own flight path;
 *  - `willHitCore` is true exactly when the body put cells inside the core;
 *  - `ricochets` is the body's own contact count;
 *  - where the line stops is where the body stopped.
 *
 * The old preview had its own layer arithmetic and a scripted `* 0.63` bounce,
 * so it could show a deflection the shot would never make. That code is gone.
 */

function relayCenters(snapshot: StageSnapshot): Array<{ x: number; y: number; id: string }> {
  const grid = snapshot.grid;
  const out: Array<{ x: number; y: number; id: string }> = [];
  // One clone for the whole probe: this runs on every preview refresh.
  const walls = getWallState(snapshot).walls;
  for (const relay of snapshot.relays) {
    if (!relay.alive) continue;
    // Relay is alive only if at least one cell centre is wall-covered.
    const covered = relay.cells.some((c) => {
      const cx = grid.originX + (c.col + 0.5) * grid.tile;
      const cy = grid.originY + (c.row + 0.5) * grid.tile;
      return pointInWalls(walls, { x: cx, y: cy });
    });
    if (!covered) continue;
    let sx = 0;
    let sy = 0;
    for (const c of relay.cells) {
      sx += grid.originX + (c.col + 0.5) * grid.tile;
      sy += grid.originY + (c.row + 0.5) * grid.tile;
    }
    out.push({ x: sx / Math.max(1, relay.cells.length), y: sy / Math.max(1, relay.cells.length), id: relay.id });
  }
  return out;
}

function objectivePoint(def: StageDefinition, snapshot: StageSnapshot): { x: number; y: number } | null {
  if (def.objective.kind === 'destroy-relay') {
    const centers = relayCenters(snapshot);
    return centers[0] ?? null;
  }
  return { x: snapshot.core.x, y: snapshot.core.y };
}

function estimateReach(ammo: AmmoDef, choiceId: string | undefined): number {
  let reach = 18;
  for (const phase of getPhases(ammo, choiceId)) {
    if (phase.radius) reach = Math.max(reach, phase.radius + 10);
    if (phase.distance) reach = Math.max(reach, (phase.distance ?? 0) + 14);
  }
  return reach;
}

export function previewShot(def: StageDefinition, snapshot: StageSnapshot, input: ShotInput): PreviewResult {
  const ammo = getAmmo(input.ammoId);
  const outcome = simulateShotWalls(def, snapshot, input, { damage: false });
  const result = outcome.result;
  const samples = result.tracePath.map((point) => ({ ...point }));
  if (samples.length === 0) {
    const muzzle = muzzlePosition(input.angleDeg);
    samples.push({ x: muzzle.x, y: muzzle.y, t: 0 });
  }
  if (result.impact) {
    const last = samples[samples.length - 1]!;
    if (Math.hypot(last.x - result.impact.x, last.y - result.impact.y) > 1) {
      samples.push({ x: result.impact.x, y: result.impact.y, t: last.t });
    }
  }

  const relayPts = relayCenters(snapshot);
  let willHitRelay = false;
  for (const relay of relayPts) {
    if (result.impact && Math.hypot(result.impact.x - relay.x, result.impact.y - relay.y) < 22) {
      willHitRelay = true;
      break;
    }
    if (samples.some((sample) => Math.hypot(sample.x - relay.x, sample.y - relay.y) < 22)) {
      willHitRelay = true;
      break;
    }
  }

  const last = samples[samples.length - 1]!;
  const outOfBounds = last.x < -80 || last.x > WORLD.width + 100 || last.y > WORLD.height + 100 || last.y < -200;

  // A round gets one core hit per shot in the solver; reading the damage it
  // recorded is the same test the HUD needs, with no separate ray test.
  const willHitCore = result.coreDamage > 0;

  let coverWarning = false;
  const target = objectivePoint(def, snapshot);
  if (def.objective.kind === 'expose-core') {
    const state = result.start.wallState ?? getWallState(snapshot);
    coverWarning = coreCoverFraction(state, snapshot.core) > (def.objective.threshold ?? 0.3);
  } else if (target && !willHitCore && result.impact && result.impact.kind === 'cell') {
    const dx = target.x - result.impact.x;
    const dy = target.y - result.impact.y;
    if (dx > 6 && Math.hypot(dx, dy) < 180) coverWarning = true;
  }

  return {
    samples,
    frames: result.frames,
    firstContact: result.firstContact,
    impact: result.impact,
    ricochets: outcome.body?.bounces ?? 0,
    willHitCore,
    willHitRelay,
    coverWarning,
    estimatedReach: estimateReach(ammo, input.choiceId),
    predictedMaterial: result.firstContact?.material ?? null,
    outOfBounds,
  };
}

/**
 * Coarse opening-line probe. This is *not* the aim preview and is never shown:
 * it is the mission-start search for a sensible first angle, where running 40
 * full body solves would stall the phone. It only traces the pre-contact flight
 * (the same analytic flight the solver uses) and reports whether the core is on
 * that line before any wall. The actual preview is still the full shot.
 */
export function probeAim(
  def: StageDefinition,
  snapshot: StageSnapshot,
  input: ShotInput,
  options: { walls?: readonly Wall[]; relays?: boolean } = {},
): Pick<PreviewResult, 'samples' | 'firstContact' | 'willHitCore' | 'willHitRelay' | 'outOfBounds'> {
  const ammo = getAmmo(input.ammoId);
  const start = muzzlePosition(input.angleDeg);
  const velocity = launchVelocity(input, ammo.flight.speedScale);
  const walls = options.walls ?? getWallState(snapshot).walls;
  const dt = PHYSICS.step;
  const maxSteps = Math.min(PHYSICS.maxSimulationSteps, Math.ceil(PHYSICS.maxFlightSeconds / dt));
  const samples: Array<{ x: number; y: number; t: number }> = [{ x: start.x, y: start.y, t: 0 }];
  const relays = options.relays === false ? [] : relayCenters(snapshot);
  let x = start.x;
  let y = start.y;
  let vx = velocity.x;
  let vy = velocity.y;
  let firstContact: ImpactInfo | null = null;
  let willHitCore = false;
  let willHitRelay = false;
  let outOfBounds = false;
  for (let step = 0; step < maxSteps; step += 1) {
    const t = (step + 1) * dt;
    const dragFactor = Math.max(0, 1 - ammo.flight.drag * dt);
    vx *= dragFactor;
    vy = vy * dragFactor + velocity.gravity * dt;
    const nx = x + vx * dt;
    const ny = y + vy * dt;
    const contact = traceWalls(walls as Wall[], { x, y }, { x: nx, y: ny }, ammo.flight.radius);
    const coreT = snapshot.core.destroyed
      ? null
      : sweepCircleEntry({ x, y }, { x: nx, y: ny }, snapshot.core, ammo.flight.radius);
    if (coreT !== null && (!contact || coreT <= contact.t)) {
      willHitCore = true;
      firstContact = {
        x: x + (nx - x) * coreT,
        y: y + (ny - y) * coreT,
        nx: 0,
        ny: 0,
        kind: 'core',
        contactX: x + (nx - x) * coreT,
        contactY: y + (ny - y) * coreT,
      };
      samples.push({ x: firstContact.x, y: firstContact.y, t });
      break;
    }
    if (contact) {
      firstContact = {
        x: contact.x, y: contact.y, nx: contact.nx, ny: contact.ny,
        kind: 'cell', material: contact.material,
        contactX: contact.x, contactY: contact.y, wallId: contact.wallId,
      };
      samples.push({ x: contact.x, y: contact.y, t });
      break;
    }
    x = nx;
    y = ny;
    if (step % 4 === 0) samples.push({ x, y, t });
    for (const relay of relays) {
      if (Math.hypot(x - relay.x, y - relay.y) < 22) willHitRelay = true;
    }
    if (x < -80 || x > WORLD.width + 100 || y > WORLD.height + 100 || y < -200) {
      outOfBounds = true;
      break;
    }
  }
  // `def` is part of the signature so the probe can grow objective-specific
  // scoring later; the heuristic only needs the line today.
  void def;
  return { samples, firstContact, willHitCore, willHitRelay, outOfBounds };
}

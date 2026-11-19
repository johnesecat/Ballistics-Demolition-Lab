import { PHYSICS, WORLD } from '../config';
import { getAmmo, getPhases } from '../ammo/catalogue';
import type { AmmoDef } from '../ammo/types';
import type { StageDefinition, StageSnapshot } from '../stages/types';
import { launchVelocity, muzzlePosition } from './collision';
import { raySpanInWall, traceWalls } from './fracture';
import { MATERIALS } from '../materials';
import { crossLayer, makeProjectileBody } from './projectile-body';
import { coreCoverFraction, pointInWalls } from './walls';
import { getWallState } from './wall-simulator';
import type { ImpactInfo, PreviewResult, ProjectileFrame, ShotInput } from './types';

/**
 * Wall-object preview (P0-3). Flight is traced against wall polygons via
 * traceWalls() — the same swept test the live shot uses. No grid read.
 */
interface FlightPoint {
  x: number;
  y: number;
  t: number;
}

function relayCenters(snapshot: StageSnapshot): Array<{ x: number; y: number; id: string }> {
  const grid = snapshot.grid;
  const out: Array<{ x: number; y: number; id: string }> = [];
  for (const relay of snapshot.relays) {
    if (!relay.alive) continue;
    // Relay is alive only if at least one cell centre is wall-covered.
    const covered = relay.cells.some((c) => {
      const cx = grid.originX + (c.col + 0.5) * grid.tile;
      const cy = grid.originY + (c.row + 0.5) * grid.tile;
      return pointInWalls(getWallState(snapshot).walls, { x: cx, y: cy });
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

function trimToStandoff(path: FlightPoint[], contact: ImpactInfo, dirX: number, dirY: number, standoff: number): FlightPoint[] {
  if (standoff <= 0) return path;
  const x = contact.x - dirX * standoff;
  const y = contact.y - dirY * standoff;
  const trimmed = path.filter((point) => Math.hypot(point.x - contact.x, point.y - contact.y) > standoff);
  const last = path[path.length - 1];
  trimmed.push({ x, y, t: last ? last.t : 0 });
  return trimmed;
}

export function previewShot(def: StageDefinition, snapshot: StageSnapshot, input: ShotInput): PreviewResult {
  const ammo = getAmmo(input.ammoId);
  const start = muzzlePosition(input.angleDeg);
  const velocity = launchVelocity(input, ammo.flight.speedScale);
  const state = getWallState(snapshot);
  let x = start.x;
  let y = start.y;
  let vx = velocity.x;
  let vy = velocity.y;
  let bounces = 0;
  let penetrations = 0;
  // The preview carries a real projectile body so a thin plate can be crossed
  // and a thick one stops. This is what prevents the HUD from promising a core
  // hit that the round cannot physically reach.
  const pBody = makeProjectileBody(ammo.flight.mass ?? 1, Math.hypot(velocity.x, velocity.y));
  const ignored = new Set<string>();
  let firstContact: ImpactInfo | null = null;
  let finalImpact: ImpactInfo | null = null;
  let willHitCore = false;
  let willHitRelay = false;
  let predictedMaterial: ImpactInfo['material'] | null = null;
  let outOfBounds = false;
  const path: FlightPoint[] = [{ x, y, t: 0 }];
  const frames: ProjectileFrame[] = [];
  const dt = PHYSICS.step;
  const maxSteps = Math.min(PHYSICS.maxSimulationSteps, Math.ceil(PHYSICS.maxFlightSeconds / dt));
  let stopped = false;
  let simTime = 0;
  const relayPts = relayCenters(snapshot);

  for (let step = 0; step < maxSteps; step += 1) {
    simTime += dt;
    const dragFactor = Math.max(0, 1 - ammo.flight.drag * dt);
    vx *= dragFactor;
    vy = vy * dragFactor + velocity.gravity * dt;
    const nx = x + vx * dt;
    const ny = y + vy * dt;
    const traceSet = ignored.size === 0 ? state.walls : state.walls.filter((w) => !ignored.has(w.id));
    const contact = traceWalls(traceSet, { x, y }, { x: nx, y: ny }, ammo.flight.radius);
    const core = snapshot.core;
    const coreHit = !core.destroyed && Math.hypot(nx - core.x, ny - core.y) <= core.radius + ammo.flight.radius;
    // Ground contact.
    let hit: ImpactInfo | null = null;
    if (contact) {
      hit = {
        x: contact.x,
        y: contact.y,
        nx: contact.nx,
        ny: contact.ny,
        kind: 'cell',
        material: contact.material,
        contactX: contact.x,
        contactY: contact.y,
        wallId: contact.wallId,
      };
    } else if (coreHit) {
      hit = { x: nx, y: ny, nx: -vx / (Math.hypot(vx, vy) || 1), ny: -vy / (Math.hypot(vx, vy) || 1), kind: 'core', contactX: nx, contactY: ny };
    } else {
      const floor = WORLD.groundY - ammo.flight.radius;
      if (ny >= floor && y < floor) {
        const t = Math.min(1, Math.max(0, (floor - y) / (ny - y || 1)));
        hit = { x: x + (nx - x) * t, y: floor, nx: 0, ny: -1, kind: 'ground', contactX: x + (nx - x) * t, contactY: floor };
      }
    }
    if (hit) {
      if (!firstContact) {
        firstContact = hit;
        predictedMaterial = hit.material ?? null;
      }
      finalImpact = hit;
      if (hit.kind === 'core') willHitCore = true;
      // Relay proximity: within 14 world units of a relay centre counts as a hit prediction.
      for (const rp of relayPts) {
        if (Math.hypot(hit.x - rp.x, hit.y - rp.y) < 22) willHitRelay = true;
      }
      const speed = Math.hypot(vx, vy) || 1;
      const incidence = Math.acos(Math.min(1, Math.max(-1, -(vx * hit.nx + vy * hit.ny) / speed)));
      const canBounce =
        (ammo.flight.ricochet ?? 0) > bounces &&
        bounces < 2 &&
        incidence > Math.PI * 0.31 &&
        hit.kind === 'cell';
      if (canBounce) {
        bounces += 1;
        const dot = vx * hit.nx + vy * hit.ny;
        vx = (vx - 2 * dot * hit.nx) * 0.63;
        vy = (vy - 2 * dot * hit.ny) * 0.63;
        x = hit.x + hit.nx * (ammo.flight.radius + 1.4);
        y = hit.y + hit.ny * (ammo.flight.radius + 1.4);
        path.push({ x, y, t: simTime });
        continue;
      }
      // Penetration: cross a thin layer and keep tracing from behind it, with
      // the same mass/speed cost the shot simulator will charge. A layer above
      // the material cap, or one the body cannot pay for, stops the round here.
      if (contact && hit.kind === 'cell') {
        const wall = state.walls.find((w) => w.id === contact.wallId);
        if (wall) {
          const dir = { x: vx / speed, y: vy / speed };
          const span = raySpanInWall(wall, { x: contact.x, y: contact.y }, dir);
          pBody.speed = speed;
          const nextSpeed = crossLayer(pBody, wall.material, span, MATERIALS[wall.material].resistance.kinetic);
          if (nextSpeed !== null && penetrations < 4) {
            penetrations += 1;
            ignored.add(wall.id);
            x = contact.x + dir.x * (span + ammo.flight.radius + 0.8);
            y = contact.y + dir.y * (span + ammo.flight.radius + 0.8);
            vx = dir.x * nextSpeed;
            vy = dir.y * nextSpeed;
            path.push({ x, y, t: simTime });
            continue;
          }
        }
      }
      const dirX = vx / speed;
      const dirY = vy / speed;
      const trimmed = ammo.flight.standoff
        ? trimToStandoff(path, hit, dirX, dirY, ammo.flight.standoff)
        : [...path, { x: hit.x, y: hit.y, t: simTime }];
      path.length = 0;
      path.push(...trimmed);
      stopped = true;
      break;
    }
    x = nx;
    y = ny;
    if (step % 3 === 0) {
      path.push({ x, y, t: simTime });
      frames.push({
        t: simTime * 1000,
        x,
        y,
        angle: Math.atan2(vy, vx),
        scale: 1,
        visible: true,
      });
    }
    if (x < -80 || x > WORLD.width + 100 || y > WORLD.height + 100 || y < -200) {
      outOfBounds = true;
      break;
    }
  }
  if (!stopped && path[path.length - 1]) {
    const last = path[path.length - 1] as FlightPoint;
    if (last.x !== x || last.y !== y) path.push({ x, y, t: simTime });
  }

  let coverWarning = false;
  const target = objectivePoint(def, snapshot);
  if (def.objective.kind === 'expose-core') {
    const cover = coreCoverFraction(state, snapshot.core);
    coverWarning = cover > (def.objective.threshold ?? 0.3);
  } else if (target && !willHitCore && finalImpact && finalImpact.kind === 'cell') {
    // Cover means the round was physically stopped on the near side of the
    // target, not that a ballistic line would have curved into it after
    // magically passing through the wall. The old continuation ignored
    // collision and claimed core hits through the brick column.
    const dx = target.x - finalImpact.x;
    const dy = target.y - finalImpact.y;
    if (dx > 6 && Math.hypot(dx, dy) < 180) coverWarning = true;
  }

  return {
    samples: path,
    frames,
    firstContact,
    impact: finalImpact,
    ricochets: bounces,
    willHitCore,
    willHitRelay,
    coverWarning,
    estimatedReach: estimateReach(ammo, input.choiceId),
    predictedMaterial,
    outOfBounds,
  };
}

export function previewBounceAngle(a: number, b: number): number {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff;
}

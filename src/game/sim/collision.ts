import { CANNON, PHYSICS, POWER, WORLD } from '../config';
import type { FireMode, ShotInput } from './types';

/**
 * Ballistics helpers only (P0-12). Grid swept collision (traceSegment) is
 * deleted; projectile-vs-wall contact lives in fracture.traceWalls().
 */
interface Vec {
  x: number;
  y: number;
}

export function muzzlePosition(angleDeg: number): Vec {
  const angle = (angleDeg * Math.PI) / 180;
  return {
    x: CANNON.x + Math.cos(angle) * CANNON.barrelLength,
    y: CANNON.y - Math.sin(angle) * CANNON.barrelLength,
  };
}

export function launchVelocity(input: ShotInput, speedScale: number): { x: number; y: number; speed: number; gravity: number } {
  const normalized = Math.min(1, Math.max(0, (input.power - POWER.min) / (POWER.max - POWER.min)));
  const speed =
    input.mode === 'arc'
      ? POWER.arcSpeedMin + normalized * (POWER.arcSpeedMax - POWER.arcSpeedMin)
      : POWER.straightSpeedMin + normalized * (POWER.straightSpeedMax - POWER.straightSpeedMin);
  const scaled = speed * speedScale;
  const angle = (input.angleDeg * Math.PI) / 180;
  return {
    x: Math.cos(angle) * scaled,
    y: -Math.sin(angle) * scaled,
    speed: scaled,
    gravity: input.mode === 'arc' ? PHYSICS.arcGravity : PHYSICS.straightGravity,
  };
}

export function trajectorySample(start: Vec, velocity: Vec, gravity: number, drag: number, seconds: number, count: number): Vec[] {
  const samples: Vec[] = [];
  const dt = seconds / Math.max(1, count);
  let x = start.x;
  let y = start.y;
  let vx = velocity.x;
  let vy = velocity.y;
  for (let i = 0; i <= count; i += 1) {
    samples.push({ x, y });
    const dragFactor = Math.max(0, 1 - drag * dt);
    vx *= dragFactor;
    vy = vy * dragFactor + gravity * dt;
    x += vx * dt;
    y += vy * dt;
  }
  return samples;
}

export function ballisticArc(input: ShotInput, speedScale: number, drag: number): Array<{ x: number; y: number; t: number }> {
  const start = muzzlePosition(input.angleDeg);
  const velocity = launchVelocity(input, speedScale);
  const samples: Array<{ x: number; y: number; t: number }> = [];
  let x = start.x;
  let y = start.y;
  let vx = velocity.x;
  let vy = velocity.y;
  const dt = PHYSICS.step;
  for (let step = 0; step < PHYSICS.previewSteps; step += 1) {
    samples.push({ x, y, t: step * dt });
    vx *= Math.max(0, 1 - drag * dt);
    vy = vy * Math.max(0, 1 - drag * dt) + velocity.gravity * dt;
    x += vx * dt;
    y += vy * dt;
    if (x > WORLD.width + 100 || y > WORLD.height + 100) break;
  }
  return samples;
}

/**
 * Earliest parameter t in [0,1] at which a projectile centre travelling from
 * `from` to `to` first touches a circle. Sweeping the whole segment means a
 * fast round cannot tunnel between two simulated endpoints, and callers can
 * compare this t with a wall contact to decide which solid was hit first.
 */
export function sweepCircleEntry(
  from: Vec,
  to: Vec,
  circle: { x: number; y: number; radius: number },
  projectileRadius = 0,
): number | null {
  const combined = Math.max(0, circle.radius + projectileRadius);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const fx = from.x - circle.x;
  const fy = from.y - circle.y;
  const c = fx * fx + fy * fy - combined * combined;
  // Starting already touching/inside: contact at the start of the sweep.
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return null;
  const b = 2 * (fx * dx + fy * dy);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

export function modeLabel(mode: FireMode): string {
  return mode === 'arc' ? 'ARC' : 'STRAIGHT';
}

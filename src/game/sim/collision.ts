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

export function modeLabel(mode: FireMode): string {
  return mode === 'arc' ? 'ARC' : 'STRAIGHT';
}

import type { MaterialId } from '../materials';
import { MATERIALS } from '../materials';
import type { FractureFragment, FragmentBody, Polygon } from './fracture';

/**
 * Debris persistence for mission checkpoints.
 *
 * Rubble is part of the battlefield: a pile that settled behind a breach is
 * still there when the page reloads, so it must survive the save. Only the
 * authoritative rigid-body state is stored (material, outline, transform,
 * velocity, heat, sleep) -- no rendering, no timers.
 */

/** Compact, JSON-safe fragment body. */
export interface DebrisRecord {
  /** Material id. */
  m: MaterialId;
  /** Flat polygon: x0, y0, x1, y1, ... in world units. */
  p: number[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Rotation and spin (radians, radians/second). */
  a: number;
  av: number;
  h: number;
  s: 0 | 1;
}

const MAX_BODIES = 420;
const MAX_POINTS = 64;

export function serializeDebris(bodies: FragmentBody[]): DebrisRecord[] {
  const out: DebrisRecord[] = [];
  for (const body of bodies) {
    const poly = body.fragment.polygon;
    if (poly.length < 3 || poly.length > MAX_POINTS) continue;
    out.push({
      m: body.fragment.material,
      p: poly.flatMap((point) => [round(point.x), round(point.y)]),
      x: round(body.x),
      y: round(body.y),
      vx: round(body.vx),
      vy: round(body.vy),
      a: round(body.angle),
      av: round(body.angularVelocity),
      h: round(body.heat),
      s: body.sleeping ? 1 : 0,
    });
    if (out.length >= MAX_BODIES) break;
  }
  return out;
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

/**
 * Rebuild debris from a save. Malformed entries are dropped instead of failing
 * the whole checkpoint: a mission resuming without one chip is better than one
 * that will not resume at all.
 */
export function deserializeDebris(records: unknown): FragmentBody[] {
  if (!Array.isArray(records)) return [];
  const out: FragmentBody[] = [];
  for (const raw of records) {
    if (out.length >= MAX_BODIES) break;
    if (typeof raw !== 'object' || raw === null) continue;
    const record = raw as Partial<DebrisRecord>;
    if (typeof record.m !== 'string' || !Object.prototype.hasOwnProperty.call(MATERIALS, record.m)) continue;
    if (!Array.isArray(record.p) || record.p.length < 6 || record.p.length % 2 !== 0 || record.p.length > MAX_POINTS * 2) continue;
    const numbers = record.p;
    if (!numbers.every((value) => typeof value === 'number' && Number.isFinite(value))) continue;
    if (![record.x, record.y, record.vx, record.vy, record.a, record.av, record.h].every((value) => typeof value === 'number' && Number.isFinite(value))) continue;
    const polygon: Polygon = [];
    for (let i = 0; i < numbers.length; i += 2) polygon.push({ x: numbers[i]!, y: numbers[i + 1]! });
    const fragment: FractureFragment = {
      wallId: 'saved',
      material: record.m as MaterialId,
      polygon,
    };
    out.push({
      fragment,
      x: record.x!,
      y: record.y!,
      vx: record.vx!,
      vy: record.vy!,
      angle: record.a!,
      angularVelocity: record.av!,
      heat: Math.max(0, Math.min(1, record.h!)),
      sleeping: record.s === 1,
    });
  }
  return out;
}

import { MATERIALS, type MaterialId } from '../materials';

/**
 * Destructible projectile (Phase 4). A kinetic round is a layered pixel body:
 * steel casing, orange rear band, amber filler core, white nose, fins.
 * Penetration is mass + speed vs per-material thickness caps (world units):
 * wood 4, steel 5, armor 7, metal 4 — each layer crossed costs speed.
 * On contact the body squashes (width grows, length shrinks) and sheds
 * casing fragments; the filler is exposed (x-ray reveal from the footage).
 * Explosive rounds are unaffected — their phases detonate after penetration.
 */

export const THICKNESS_CAP: Record<MaterialId, number> = {
  wood: 4,
  steel: 5,
  armor: 7,
  concrete: 5,
  slopes: 5,
  brick: 5,
};

/** 'metal' cap applies to steel-family plate (see design doc). */
export function thicknessCap(material: MaterialId): number {
  return THICKNESS_CAP[material];
}

export interface ProjectileBody {
  mass: number;
  speed: number;
  /** 1 = pristine, 0 = spent. Zero stops penetration. */
  integrity: number;
  /** Squash 0..1: >0 widens the body and exposes the filler. */
  squash: number;
  /** Layers crossed so far (for diagnostics / speed loss audit). */
  layers: number;
}

/** Speed cost of crossing one wall layer of the given material/thickness. */
export function penetrationCost(
  material: MaterialId,
  thickness: number,
  resistance: number,
  mass: number,
): number {
  const cap = thicknessCap(material);
  if (thickness > cap) return Infinity; // too thick: cannot pass
  const costPerUnit = (MATERIALS[material].density * 18 * resistance) / Math.max(0.2, mass);
  return thickness * costPerUnit;
}

/**
 * Cross one layer: returns the new speed, or null when the round stops.
 * Thickness above the material cap always stops (energy-independent).
 */
export function crossLayer(
  body: ProjectileBody,
  material: MaterialId,
  thickness: number,
  resistance: number,
): number | null {
  const cost = penetrationCost(material, thickness, resistance, body.mass);
  if (!Number.isFinite(cost)) {
    // The plate is thicker than the material cap: no amount of speed crosses
    // it. The round pancakes against the face and loses its casing.
    body.squash = 1;
    body.integrity = Math.max(0, body.integrity - 0.25);
    return null;
  }
  const next = body.speed - cost;
  body.layers += 1;
  // Squash grows as the round works hard against the layer.
  body.squash = Math.min(1, body.squash + cost / Math.max(80, body.speed));
  body.integrity = Math.max(0, body.integrity - cost / Math.max(200, body.speed));
  if (next <= 0 || body.integrity <= 0) return null;
  body.speed = next;
  return next;
}

/** Initial body from ammo flight data. Mass includes everything inside. */
export function makeProjectileBody(mass: number, speed: number): ProjectileBody {
  return { mass: Math.max(0.2, mass), speed: Math.max(0, speed), integrity: 1, squash: 0, layers: 0 };
}

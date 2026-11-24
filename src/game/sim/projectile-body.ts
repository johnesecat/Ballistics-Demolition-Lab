import { MATERIALS, type MaterialId } from '../materials';

/**
 * Destructible projectile (Phase 4). A kinetic round is a layered pixel body:
 * steel casing, amber rear band, steel core, pale nose.
 *
 * Penetration is mass + speed against real layer thickness: each material has a
 * density and a kinetic resistance, so crossing a metre of plate costs a fixed
 * amount of speed for a given round. There is no thickness ceiling: a fast heavy
 * round bores a plate a light one only dents, and the thickness the round can
 * still pay for is exactly what it goes through. A round that runs out of speed
 * inside a layer pancakes against it.
 *
 * On contact the body squashes (width grows, length shrinks) and sheds casing
 * fragments; the steel core is exposed. Explosive rounds are unaffected — their
 * phases detonate after penetration.
 */

export interface ProjectileBody {
  mass: number;
  speed: number;
  /** 1 = pristine, 0 = spent. Zero stops penetration. */
  integrity: number;
  /** Squash 0..1: >0 widens the body and exposes the steel core. */
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
  const costPerUnit = (MATERIALS[material].density * 18 * resistance) / Math.max(0.2, mass);
  return thickness * costPerUnit;
}

/**
 * Cross one layer: returns the new speed, or null when the round stops. A layer
 * stops the round when its speed cost is more than the round has left.
 */
export function crossLayer(
  body: ProjectileBody,
  material: MaterialId,
  thickness: number,
  resistance: number,
): number | null {
  const cost = penetrationCost(material, thickness, resistance, body.mass);
  const next = body.speed - cost;
  body.layers += 1;
  // Squash grows as the round works hard against the layer.
  body.squash = Math.min(1, body.squash + cost / Math.max(80, body.speed));
  body.integrity = Math.max(0, body.integrity - cost / Math.max(200, body.speed));
  if (next <= 0 || body.integrity <= 0) {
    // Ran out of energy inside the layer: the round pancakes against the face.
    body.squash = 1;
    body.integrity = Math.max(0, body.integrity - 0.25);
    return null;
  }
  body.speed = next;
  return next;
}

/** Initial body from ammo flight data. Mass includes everything inside. */
export function makeProjectileBody(mass: number, speed: number): ProjectileBody {
  return { mass: Math.max(0.2, mass), speed: Math.max(0, speed), integrity: 1, squash: 0, layers: 0 };
}

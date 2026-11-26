import { MATERIALS, type MaterialId } from '../materials';
import { JACKET_QUALITY, PENETRATOR_QUALITY } from './projectile-material';
import { SHELL_CORE_FRACTION } from './projectile-shell';

/**
 * The round as a penetrator body.
 *
 * A kinetic round is two materials in one jacket: a copper jacket that mushrooms
 * and absorbs energy, and a steel penetrator that does not. Penetration is
 * momentum against real layer thickness: each material has a density and a
 * kinetic resistance, so crossing a metre of plate costs a fixed amount of speed
 * for a given round. There is no thickness ceiling -- what the round cannot pay
 * for in speed is what stops it.
 *
 * Once the jacket has been battered past `RELEASE_INTEGRITY` (or the round runs
 * out of speed on a face) the penetrator breaks free. A bare steel ogive needs
 * far less energy per unit of plate than a jacketed ball round, so the released
 * core can bore the layer the whole round just failed on. That is AP
 * ammunition's entire trick, and it is why the strongest part of the projectile
 * is the part that carries on.
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
  /** Mass of the steel penetrator, derived from the round's own lattice. */
  coreMass: number;
  /** Mass of everything that is not the penetrator (jacket, band, cap). */
  jacketMass: number;
  /** Effective resistance multiplier: jacket 1, bare hard core ~0.56. */
  quality: number;
  /** The jacket has been shed; the penetrator is flying alone. */
  shed: boolean;
}

/**
 * Drive the bare core starts with. The round's momentum is what it is; the core
 * is fresh but the shot is nearly spent, so releasing the jacket buys a couple
 * of plate thicknesses, not a free ride through the whole battery.
 */
export const CORE_RELEASE_INTEGRITY = 0.35;

/** Speed cost of crossing one wall layer of the given material/thickness. */
export function penetrationCost(
  material: MaterialId,
  thickness: number,
  resistance: number,
  mass: number,
  quality = JACKET_QUALITY,
): number {
  const costPerUnit = (MATERIALS[material].density * 18 * resistance * quality) / Math.max(0.2, mass);
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
  const cost = penetrationCost(material, thickness, resistance, body.mass, body.quality);
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
  const total = Math.max(0.2, mass);
  const coreMass = total * SHELL_CORE_FRACTION;
  return {
    mass: total,
    speed: Math.max(0, speed),
    integrity: 1,
    squash: 0,
    layers: 0,
    coreMass,
    jacketMass: total - coreMass,
    quality: JACKET_QUALITY,
    shed: false,
  };
}

/**
 * Tear the jacket off. The core keeps the round's momentum (nothing teleports);
 * what changes is that a hard ogive no longer has to drag a deforming copper
 * jacket through the plate, so its effective resistance drops. Returns false when
 * the jacket is already gone, so a shot can never shed twice.
 */
export function releaseJacket(body: ProjectileBody): boolean {
  if (body.shed) return false;
  body.shed = true;
  body.quality = PENETRATOR_QUALITY;
  // The battered part was the jacket, and it is no longer attached, so the core
  // itself is sound -- but the shot's drive is almost spent, and that is what
  // bounds how much further it can bore.
  body.integrity = CORE_RELEASE_INTEGRITY;
  body.squash = Math.min(0.55, body.squash);
  return true;
}

/** Remaining speed after a layer if the jacket were shed first (for auditing). */
export function coreCrossSpeed(body: ProjectileBody, material: MaterialId, thickness: number, resistance: number): number {
  return body.speed - penetrationCost(material, thickness, resistance, body.mass, PENETRATOR_QUALITY);
}

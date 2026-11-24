import { ShellImpact, type ShellImpactInput } from '../sim/shell-pixels';
import { SHELL_BASE, shellBounds, type ShellCell, type ShellPart } from '../sim/projectile-shell';

/**
 * Reference projectile sprite: the AP Solid Shot, rebuilt from the three newest
 * frames. In flight it is a 24 x 6 sampled ogive -- pale blue-grey with a
 * brighter band just above the axis, a boat-tail and amber driving band at the
 * base, a flank rivet and a single pale tip cell -- and the x-ray frame shows a
 * solid steel core hidden inside the jacket, which is why the interior lattice
 * cells are `steel` under a casing skin.
 *
 * There is exactly one physics model for the round: the spring lattice in
 * `sim/shell-pixels.ts`. This module only wraps it for callers that need the
 * rendered cells (HUD card, tests), so the card art, the flight sprite and the
 * impact wreck are all the same solver at different ages.
 */

export type ProjectilePart = ShellPart;
export type ProjectileCell = ShellCell;

/** Simulated shell at a given age after contact. */
export function projectileImpact(input: ShellImpactInput): ShellImpact {
  return new ShellImpact(input);
}

/**
 * Cells for the HUD/test silhouette: `squash` 0 is the pristine round, 1 is a
 * fully wrecked casing. It runs the same lattice the shot runs, so the card art
 * cannot drift from the flight sprite.
 */
export function projectileCells(squash: number, integrity = 1): ProjectileCell[] {
  const sim = new ShellImpact({
    speed: 420,
    mass: 9,
    material: 'steel',
    integrity,
    seed: 1,
    hardness: 0.8,
    crumple: squash > 0 ? Math.min(1, squash * 0.9) : 0,
  });
  // A fully wrecked round is the lattice settled against the face.
  sim.stepTo(Math.max(0, Math.min(1, squash)) * 0.6);
  return sim.cells();
}

export function projectileBounds(cells: ProjectileCell[]): { width: number; height: number } {
  return shellBounds(cells);
}

export { SHELL_BASE };

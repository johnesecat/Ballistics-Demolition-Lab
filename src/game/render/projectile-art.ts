import {
  SHELL_BASE,
  deformShell,
  shellBounds,
  type ShellCell,
  type ShellDeformParams,
  type ShellPart,
} from '../sim/projectile-shell';

/**
 * Reference projectile sprite: the AP Solid Shot, rebuilt from the three newest
 * frames. In flight it is a long ogival shell about 3.8 : 1 -- pale blue-grey
 * with a light upper facet, a dark belly, a rivet on the flank, a fine bright
 * tip and an amber driving band at the base -- and the x-ray frame shows a
 * solid steel core filling the jacket, which is why the interior lattice cells
 * are `steel` and only appear once the casing tears.
 *
 * Deformation is solved by the mass lattice in `sim/projectile-shell.ts`, so a
 * cell that tears off carries its own mass and leaves a gap. Everything is
 * snapped to whole cells, so the squash reads as pixel destruction.
 */

export type ProjectilePart = ShellPart;
export type ProjectileCell = ShellCell;

/** Pristine silhouette, used by tests and by the HUD card art. */
export function projectileCells(squash: number, integrity = 1): ProjectileCell[] {
  return deformShell({
    squash,
    crumple: squash > 0 ? Math.min(1, squash * 0.9) : 0,
    hardness: 0.8,
    speed: 420,
    mass: 9,
    integrity,
    seed: 1,
  }).cells;
}

/** Full deform call: real crumple, mass-aware shedding and chips. */
export function projectileCrumple(params: ShellDeformParams) {
  return deformShell(params);
}

export function projectileBounds(cells: ProjectileCell[]): { width: number; height: number } {
  return shellBounds(cells);
}

export { SHELL_BASE };

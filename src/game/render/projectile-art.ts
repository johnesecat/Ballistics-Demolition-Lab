import {
  SHELL_BASE,
  deformShell,
  shellBounds,
  type ShellCell,
  type ShellDeformParams,
  type ShellPart,
} from '../sim/projectile-shell';

/**
 * Reference projectile sprite, rebuilt from the 11-18 footage: a blunt pale
 * blue-grey shell with a narrow boat-tail, an amber drive band in the rear
 * third, red flecks sprayed around that band, and a stepped forward shoulder
 * ending in a blunt nose. There are no fins sticking out and no cyan exhaust;
 * the trail is pale dashes.
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

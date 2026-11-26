import { SHELL_BASE, pristineShell, shellBounds, type ShellCell } from '../sim/projectile-shell';
import { ProjectileBodySim, BODY_CELL, BODY_DT, type BodyWorld, type BodyDeps } from '../sim/body-sim';
import type { MaterialId } from '../materials';

/**
 * Reference projectile sprite: the AP Solid Shot, rebuilt from the three newest
 * frames. In flight it is a 24 x 6 sampled ogive -- pale blue-grey with a
 * brighter band just above the axis, a boat-tail and amber driving band at the
 * base, a flank rivet and a single pale tip cell -- and the x-ray frame shows a
 * solid steel core hidden inside the jacket, which is why the interior lattice
 * cells are `steel` under a casing skin.
 *
 * There is exactly one physics model for the round: the body solver in
 * `sim/body-sim.ts`. This module only runs it for callers that need rendered
 * cells (HUD card, tests), so the card art and the shot are the same solver.
 */

export type ProjectilePart = ReturnType<typeof pristineShell>[number]['part'];
export type ProjectileCell = ShellCell;

/** A steel block in front of the round, for card art. */
class CardWorld implements BodyWorld {
  groundY = 10000;
  groundMaterial: MaterialId = 'concrete';
  constructor(private readonly material: MaterialId, private readonly near: number, private readonly far: number) {}
  private carvedPixels = new Set<string>();
  materialAt(x: number, y: number): MaterialId | null {
    // A steel face 10 units ahead of the round's centre, thick enough that a
    // slow round stops in it and a fast one bores right through.
    if (x < this.near || x > this.far || Math.abs(y) > 40) return null;
    const key = `${Math.floor(x / 2)}|${Math.floor(y / 2)}`;
    return this.carvedPixels.has(key) ? null : this.material;
  }
  wallAt(): number { return 0; }
  carve(x: number, y: number): MaterialId | null {
    this.carvedPixels.add(`${Math.floor(x / 2)}|${Math.floor(y / 2)}`);
    return 'steel';
  }
}

/** Simulated round at a given age after contact. */
export function projectileImpact(deps: BodyDeps): ProjectileBodySim {
  return new ProjectileBodySim(deps);
}

/**
 * Cells for the HUD/test silhouette: `squash` 0 is the pristine round, 1 is a
 * fully wrecked casing against a steel face. It runs the same solver the shot
 * runs, so the card art cannot drift from the flight sprite.
 */
export function projectileCells(squash: number, integrity = 1): ProjectileCell[] {
  if (squash <= 0) return pristineShell();
  const world = new CardWorld('armor', 6, 70);
  const sim = new ProjectileBodySim({
    mass: 9,
    cell: BODY_CELL,
    x: 0,
    y: 0,
    angle: 0,
    vx: 120,
    vy: 0,
    seed: 1,
    gravity: 0,
    crumple: squash > 0 ? Math.min(1, squash * 0.9) : 0,
    heat: integrity < 1 ? 0.4 : 0,
  });
  const seconds = 0.9 * Math.max(0.15, Math.min(1, squash));
  for (let t = 0; t < seconds; t += BODY_DT) sim.advance(BODY_DT, world);
  const frame = sim.frames()[sim.frames().length - 1];
  if (!frame) return pristineShell();
  const meta = sim.meta();
  // Card art is the body, not its shrapnel: the chips that left the round are
  // not part of the silhouette, and including them would make the crushed round
  // read wider than the intact one.
  let cx = 0;
  let cy = 0;
  let held = 0;
  for (let i = 0; i < frame.x.length; i += 1) {
    if (frame.free[i]) continue;
    cx += frame.x[i]!;
    cy += frame.y[i]!;
    held += 1;
  }
  if (held === 0) return pristineShell();
  cx /= held;
  cy /= held;
  const cells: ProjectileCell[] = [];
  for (let i = 0; i < frame.x.length; i += 1) {
    if (frame.free[i]) continue;
    cells.push({
      x: Math.round((frame.x[i]! - cx) / BODY_CELL),
      y: Math.round((frame.y[i]! - cy) / BODY_CELL),
      part: partOf(meta.parts[i]!),
      component: meta.components[i]!,
      reveal: 0,
    });
  }
  return cells;
}

export function projectileBounds(cells: ProjectileCell[]): { width: number; height: number } {
  return shellBounds(cells);
}

const PARTS: ShellCell['part'][] = [
  'rim', 'light', 'highlight', 'body', 'dark', 'belly', 'band', 'bandLight',
  'bandDark', 'cap', 'tip', 'rivet', 'steel',
];

function partOf(index: number): ShellCell['part'] {
  return PARTS[index] ?? 'body';
}

export { SHELL_BASE };

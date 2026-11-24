import Phaser from 'phaser';
import type { ProjectileBody } from '../sim/projectile-body';
import { ShellImpact } from '../sim/shell-pixels';
import { heatColor } from '../sim/fracture';
import { pristineShell, type ShellCell, type ShellPart } from '../sim/projectile-shell';
import type { MaterialId } from '../materials';

/**
 * Pixel projectile renderer driven by the real-time lattice in
 * `sim/shell-pixels.ts`.
 *
 * The shell is never scaled: its cells are solved by springs, volume
 * constraints and ductile fracture, then snapped to whole pixels. Shrapnel is
 * just the cells that broke free, still in the same draw pass, still carrying
 * their own mass and heat, so a heavy chip flies shorter than a light one and a
 * hot chip glows on the way out.
 */

/**
 * Casing tones sampled from the in-flight reference frame (IMG_4966): the
 * shell is a low-contrast blue-grey with a slightly brighter band just above
 * the axis, not a bright silver sprite.
 */
export const SHELL_COLORS: Record<ShellPart, number> = {
  rim: 0x6d7e8b,
  light: 0x94a5b2,
  highlight: 0xa6b7c4,
  body: 0x8b9ca9,
  dark: 0x7d8e9b,
  belly: 0x687986,
  band: 0xcd9854,
  bandLight: 0xd9a45f,
  bandDark: 0xc18d4b,
  cap: 0x515f6d,
  tip: 0xc6d4de,
  rivet: 0x3b4a57,
  steel: 0xaec6d6,
};

/** World units per art cell. Smaller than the wall raster's 2-unit cells. */
const CELL = 0.9;

export interface ShellRenderState {
  squash: number;
  crumple: number;
  hardness: number;
  speed: number;
  mass: number;
  integrity: number;
  seed: number;
  /** Face material, so the jam matches the wall it hit. */
  material?: MaterialId | null;
  /** Seconds since contact. */
  age: number;
}

export class ProjectileView {
  private g: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Graphics;
  private sim: ShellImpact | null = null;
  private simKey = '';
  private simAge = 0;

  constructor(scene: Phaser.Scene, depth = 20) {
    this.glow = scene.add.graphics().setDepth(depth - 1).setVisible(false);
    this.g = scene.add.graphics().setDepth(depth).setVisible(false);
  }

  draw(x: number, y: number, angle: number, body: ProjectileBody, length: number, shell?: ShellRenderState): void {
    const g = this.g;
    const glow = this.glow;
    g.clear();
    glow.clear();
    g.setPosition(Math.round(x), Math.round(y));
    g.setRotation(angle);
    glow.setPosition(Math.round(x), Math.round(y));
    glow.setRotation(angle);
    g.setVisible(true);
    glow.setVisible(true);

    const cell = CELL * Math.max(0.72, Math.min(1.35, length / 34));

    if (!shell || shell.age <= 0) {
      // In flight: pristine reference silhouette, built from the same lattice so
      // there is no visual jump the moment it touches a wall.
      this.sim = null;
      this.simKey = '';
      this.drawCells(g, this.pristineCells(body), cell);
      return;
    }

    // Only the contact state builds a lattice. Squash and crumple keep changing
    // during the crush, and rebuilding on those values restarted the solver
    // every frame -- the round tore and re-formed instead of deforming.
    const key = `${shell.seed}|${shell.mass}|${shell.material ?? 'none'}|${Math.round(shell.speed)}|${Math.round(shell.hardness * 100)}`;
    if (!this.sim || key !== this.simKey) {
      this.sim = new ShellImpact({
        speed: shell.speed,
        mass: shell.mass,
        material: shell.material ?? null,
        integrity: shell.integrity,
        seed: shell.seed,
        hardness: shell.hardness,
        crumple: shell.crumple,
      });
      this.simKey = key;
      this.simAge = 0;
    }
    // Forward-only stepping keeps the replay deterministic (fixed substeps) and
    // cheap: a normal frame advances a handful of 1/240 s steps.
    const age = Math.max(this.simAge, shell.age);
    this.sim.stepTo(age);
    this.simAge = age;

    const cells = this.sim.cells();
    this.drawCells(g, cells, cell);

    // Thermal pass: hot casing cells are painted from the blackbody ramp and
    // get an additive bloom, so a steel round that has just hit reads white-hot
    // at the nose instead of merely changing colour.
    const heatCells = this.sim.heatCells();
    for (const hot of heatCells) {
      const tone = heatColor(Math.min(1, hot.heat * 1.05), 0x66798d);
      g.fillStyle(tone, 1);
      g.fillRect(hot.x * cell, hot.y * cell, cell, cell);
      if (hot.heat > 0.55) {
        glow.fillStyle(heatColor(hot.heat), 0.1 + hot.heat * 0.12);
        glow.fillRect(hot.x * cell - cell, hot.y * cell - cell, cell * 3, cell * 3);
      }
    }
  }

  private pristineCells(body: ProjectileBody): ShellCell[] {
    // An untouched round is drawn from the base lattice unchanged: no squash,
    // no shrapnel, exactly the footage's blue-grey shell.
    void body;
    return PRISTINE;
  }

  private drawCells(g: Phaser.GameObjects.Graphics, cells: ShellCell[], cell: number): void {
    const rows = new Map<number, ShellCell[]>();
    for (const entry of cells) {
      const row = rows.get(entry.y);
      if (row) row.push(entry);
      else rows.set(entry.y, [entry]);
    }
    for (const rowY of [...rows.keys()].sort((a, b) => a - b)) {
      const row = rows.get(rowY)!;
      row.sort((a, b) => a.x - b.x);
      let start = 0;
      while (start < row.length) {
        const part = row[start]!.part;
        let end = start + 1;
        while (end < row.length && row[end]!.part === part && row[end]!.x === row[end - 1]!.x + 1) end += 1;
        g.fillStyle(SHELL_COLORS[part], 1);
        g.fillRect(row[start]!.x * cell, rowY * cell, (end - start) * cell, cell);
        start = end;
      }
    }
  }

  hide(): void {
    this.g.setVisible(false);
    this.glow.setVisible(false);
    this.sim = null;
    this.simKey = '';
  }

  setDepth(depth: number): void {
    this.g.setDepth(depth);
    this.glow.setDepth(depth - 1);
  }
}

/** Pristine silhouette, in flight (the steel core is under the casing). */
const PRISTINE: ShellCell[] = pristineShell();

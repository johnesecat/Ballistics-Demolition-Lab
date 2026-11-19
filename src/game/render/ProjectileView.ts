import Phaser from 'phaser';
import type { ProjectileBody } from '../sim/projectile-body';
import { projectileCells, type ProjectileCell, type ProjectilePart } from './projectile-art';

/**
 * Pixel projectile renderer built from whole square cells, matching the newest
 * 11-18 recording: a bulky grey-blue dart with a swept upper fin, small belly
 * fin, stepped white nose, orange drive band, cyan exhaust and a yellow filler
 * that shows through the crumpled casing.
 *
 * Squash is not a sprite scale. `projectileCells()` snaps every deformed cell
 * to an integer, so the body crumples in pixels exactly like the walls do. The
 * caller drives it from the simulated body, and after impact the same view is
 * reused for the deterministic wreck frames so the shell keeps moving.
 */

const COLORS: Record<ProjectilePart, number> = {
  outline: 0x2e3b45,
  body: 0x75899a,
  light: 0xaabdc9,
  dark: 0x47545f,
  steel: 0x3a4650,
  nose: 0xd8e4eb,
  noseTip: 0xffffff,
  cyan: 0x64d8e8,
  orange: 0xd88a33,
  orangeLight: 0xf0b45e,
  red: 0xb6402f,
  filler: 0xd8b544,
  fillerLight: 0xf0d36b,
};

/** World units per art cell. Smaller than the wall raster's 2-unit cells. */
const CELL = 0.78;

export class ProjectileView {
  private g: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, depth = 20) {
    this.glow = scene.add.graphics().setDepth(depth - 1).setVisible(false);
    this.g = scene.add.graphics().setDepth(depth).setVisible(false);
  }

  draw(x: number, y: number, angle: number, body: ProjectileBody, length: number): void {
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

    const squash = Math.max(0, Math.min(1, body.squash));
    const cell = CELL * Math.max(0.72, Math.min(1.35, length / 34));
    const cells = projectileCells(squash, body.integrity);

    // Exhaust bloom: cyan in flight, orange as the casing works against plate.
    const hot = squash > 0.2;
    glow.fillStyle(hot ? 0xe59b3c : 0x7fd4e4, hot ? 0.24 : 0.18);
    glow.fillRect(-16 * cell, -3.5 * cell, 5 * cell, 7 * cell);
    glow.fillStyle(0xffffff, 0.12);
    glow.fillRect(-15 * cell, -1.5 * cell, 3 * cell, 3 * cell);

    // Group cells by row, merge horizontal neighbours of the same colour into
    // runs, then emit one square per run. Deformation is already pixel-snapped,
    // so a run is still a whole number of cells wide.
    const rows = new Map<number, ProjectileCell[]>();
    for (const cellData of cells) {
      const row = rows.get(cellData.y);
      if (row) row.push(cellData);
      else rows.set(cellData.y, [cellData]);
    }
    const orderedRows = [...rows.keys()].sort((a, b) => a - b);
    for (const rowY of orderedRows) {
      const row = rows.get(rowY)!;
      row.sort((a, b) => a.x - b.x);
      let runStart = 0;
      while (runStart < row.length) {
        const part = row[runStart]!.part;
        let runEnd = runStart + 1;
        while (
          runEnd < row.length &&
          row[runEnd]!.part === part &&
          row[runEnd]!.x === row[runEnd - 1]!.x + 1
        ) {
          runEnd += 1;
        }
        g.fillStyle(COLORS[part], 1);
        g.fillRect(row[runStart]!.x * cell, rowY * cell, (runEnd - runStart) * cell, cell);
        runStart = runEnd;
      }
    }

    // The exposed filler gets a faint self-lit rim so the x-ray reads at phone
    // size without turning into a glowing ball.
    if (squash > 0.28) {
      const lit = cells.filter((c) => c.part === 'filler' || c.part === 'fillerLight');
      if (lit.length > 0) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const c of lit) {
          minX = Math.min(minX, c.x);
          maxX = Math.max(maxX, c.x);
          minY = Math.min(minY, c.y);
          maxY = Math.max(maxY, c.y);
        }
        glow.fillStyle(0xffd76a, 0.12);
        glow.fillRect(minX * cell, minY * cell, (maxX - minX + 1) * cell, (maxY - minY + 1) * cell);
      }
    }
  }

  hide(): void {
    this.g.setVisible(false);
    this.glow.setVisible(false);
  }

  setDepth(depth: number): void {
    this.g.setDepth(depth);
    this.glow.setDepth(depth - 1);
  }
}

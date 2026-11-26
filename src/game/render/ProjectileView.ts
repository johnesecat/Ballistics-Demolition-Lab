import Phaser from 'phaser';
import type { ProjectileBody } from '../sim/projectile-body';
import { heatColor } from '../sim/fracture';
import type { MaterialId } from '../materials';
import { BODY_PARTS, BODY_CELL, type BodyTrack } from '../sim/body-sim';
import { pristineShell, type ShellCell, type ShellPart } from '../sim/projectile-shell';
import type { Point } from '../sim/fracture';

/**
 * Pixel projectile renderer.
 *
 * There is one physics model: the body solver in `sim/body-sim.ts` carries the
 * round from its first pixel of contact to rest and samples itself at 60 Hz.
 * This view draws those samples. Nothing here re-simulates, scales or mends the
 * round: every visible pixel is a cell the solver moved, so the bore, the crush,
 * the peeled jacket and the chips falling on the seabed are the physics, and a
 * phone pays for drawing only.
 *
 * Components are not outlined or labelled. The copper jacket and the steel
 * penetrator are told apart by the metal they are made of and by what the
 * solver does to them; there is no diagram painted over the round.
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

/** World units per art cell. */
const CELL = BODY_CELL;

export interface ShellRenderState {
  squash: number;
  speed: number;
  mass: number;
  seed: number;
  material?: MaterialId | null;
}

export class ProjectileView {
  private g: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Graphics;
  private trackCell = CELL;

  constructor(scene: Phaser.Scene, depth = 20) {
    this.glow = scene.add.graphics().setDepth(depth - 1).setVisible(false);
    this.g = scene.add.graphics().setDepth(depth).setVisible(false);
  }

  /** In-flight, untouched round. */
  draw(x: number, y: number, angle: number, body: ProjectileBody, length: number, zoom = 1): void {
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
    this.drawCells(g, PRISTINE, cell);
    void body;
    void zoom;
  }

  /**
   * The simulated round, at `tMs` since its first contact. Positions are
   * interpolated between the 60 Hz samples, so a slowed replay still moves
   * smoothly; nothing else is invented.
   */
  drawTrack(track: BodyTrack, tMs: number, zoom: number): void {
    this.trackCell = track.cell;
    const { nodes, count, times, xs, ys, heat, free, parts, components } = track;
    const frames = count;
    const span = times[frames - 1] ?? 1;
    const t = Math.max(0, Math.min(span, tMs));
    let i = 0;
    while (i + 2 < frames && times[i + 1]! <= t) i += 1;
    const a = i * nodes;
    const b = Math.min(frames - 1, i + 1) * nodes;
    const t0 = times[i]!;
    const t1 = times[Math.min(frames - 1, i + 1)]!;
    const mix = t1 > t0 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : 0;
    const q = 4;
    const cell = this.trackCell;

    const g = this.g;
    const glow = this.glow;
    g.clear();
    glow.clear();
    g.setPosition(0, 0);
    g.setRotation(0);
    g.setVisible(true);
    glow.setPosition(0, 0);
    glow.setRotation(0);

    const positions: Point[] = new Array(nodes);
    for (let n = 0; n < nodes; n += 1) {
      const px = (xs[a + n]! + (xs[b + n]! - xs[a + n]!) * mix) / q;
      const py = (ys[a + n]! + (ys[b + n]! - ys[a + n]!) * mix) / q;
      positions[n] = { x: px, y: py };
      const part = BODY_PARTS[parts[n]!] ?? 'body';
      // A cell that has left its component keeps a metal tone: torn jacket and
      // free penetrator cells must not turn into generic body-coloured chips.
      const base = SHELL_COLORS[part];
      const h = heat[a + n]! / 255;
      const tone = h > 0.1 ? heatColor(Math.min(1, h), base) : base;
      g.fillStyle(tone, free[a + n] ? 0.94 : 1);
      g.fillRect(px - cell / 2, py - cell / 2, cell, cell);
      if (h > 0.55) {
        glow.fillStyle(heatColor(h), 0.14);
        glow.fillRect(px - cell, py - cell, cell * 2, cell * 2);
      }
    }
    void components;
    void zoom;
    void positions;
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
        while (
          end < row.length &&
          row[end]!.part === part &&
          row[end]!.x === row[end - 1]!.x + 1
        ) {
          end += 1;
        }
        g.fillStyle(SHELL_COLORS[part], 1);
        g.fillRect(row[start]!.x * cell, rowY * cell, (end - start) * cell, cell);
        start = end;
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

/** Pristine silhouette, in flight (the steel core is under the casing). */
const PRISTINE: ShellCell[] = pristineShell();

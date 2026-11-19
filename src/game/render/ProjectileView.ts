import Phaser from 'phaser';
import type { ProjectileBody } from '../sim/projectile-body';

/**
 * Pixel projectile renderer (11-18 recordings).
 *
 * The reference round is a small solid-colour sprite, not a smooth vector
 * shape: a grey square-section body with a light nose, a warm orange band near
 * the front, a cyan tail ring and two fins, drawn from whole pixels so it reads
 * exactly like the building cubes. The same silhouette was used before the
 * collision rewrite; this restores it in the pixel language of the range.
 *
 * The body is rebuilt every frame from position/angle/squash only, so replays
 * stay deterministic. Squash compresses the length and widens the body against
 * hard plate; the tail and fins fold back.
 */
const GREY = 0x8b9aa7;
const GREY_LIGHT = 0xa9b8c4;
const GREY_DARK = 0x5c6873;
const STEEL = 0x46525c;
const ORANGE = 0xe59b3c;
const ORANGE_LIGHT = 0xf2b45b;
const CYAN = 0x7fd4e4;

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
    // World units per art pixel. Every local coordinate is an integer so the
    // sprite is built from whole squares, never fractional slivers.
    const px = 1;
    const L = Math.round(Math.max(7, length * (1 - squash * 0.52)));
    const W = Math.round(Math.max(4, 7 + squash * 9));
    const nose = Math.max(2, Math.round(L * 0.16));
    const tail = Math.max(2, Math.round(L * 0.2));
    const band = Math.max(2, Math.round(L * 0.14));
    const bodyStart = -Math.floor(L / 2) + tail;
    const bodyEnd = Math.floor(L / 2) - nose;
    const bodyLen = Math.max(1, bodyEnd - bodyStart);

    // Exhaust bloom at the tail: cyan-white in flight, orange when the round
    // is working against a plate.
    const hot = squash > 0.15;
    glow.fillStyle(hot ? ORANGE : CYAN, hot ? 0.22 : 0.18);
    glow.fillRect(-L / 2 - 3 * px, -W * 0.42, 4 * px, W * 0.84);
    glow.fillStyle(0xffffff, hot ? 0.1 : 0.16);
    glow.fillRect(-L / 2 - 1 * px, -W * 0.22, 2 * px, W * 0.44);

    const halfW = Math.floor(W / 2);
    // Fins: two flat blades at the rear, folded by squash.
    const finLen = Math.max(1, Math.round(4 * px * (1 - squash * 0.6)));
    const finSpread = halfW + Math.max(1, Math.round(2 * px * (1 - squash * 0.4)));
    const finX = -Math.floor(L / 2) + 1;
    g.fillStyle(GREY_DARK, 1);
    const finH = Math.max(2, finSpread - halfW + 3);
    g.fillRect(finX, -finSpread - 2, finLen, finH);
    g.fillRect(finX, halfW - 1, finLen, finH);
    g.fillStyle(STEEL, 1);
    g.fillRect(finX, -finSpread - 2, finLen, 1);
    g.fillRect(finX, finSpread - 1, finLen, 1);

    // Main casing, shaded in three flat bands (top light, mid grey, bottom dark).
    const bandH = Math.max(1, Math.round(W * 0.28));
    const midH = Math.max(1, W - bandH * 2);
    g.fillStyle(GREY_LIGHT, 1);
    g.fillRect(bodyStart, -halfW, bodyLen, bandH);
    g.fillStyle(GREY, 1);
    g.fillRect(bodyStart, -halfW + bandH, bodyLen, midH);
    g.fillStyle(GREY_DARK, 1);
    g.fillRect(bodyStart, halfW - bandH, bodyLen, bandH);

    // Rivets / ports: two rows of dark pixels, the detail that reads in the
    // close-up footage.
    g.fillStyle(STEEL, 1);
    const rivetTop = -Math.round(W * 0.22);
    const rivetLow = Math.round(W * 0.16);
    for (let d = bodyStart + 2; d < bodyEnd - 1; d += 4) {
      g.fillRect(d, rivetTop, 1, 1);
      if (d % 8 === 0) g.fillRect(d, rivetLow, 1, 1);
    }

    // Orange drive band near the front (the reference has this warm ring even
    // in flight; it is what makes the round readable against the sky).
    const bandX = bodyEnd - band - 1;
    g.fillStyle(ORANGE, 1);
    g.fillRect(bandX, -halfW, band, W);
    g.fillStyle(ORANGE_LIGHT, 1);
    g.fillRect(bandX, -halfW, band, Math.max(1, Math.round(W * 0.3)));
    g.fillStyle(STEEL, 1);
    g.fillRect(bandX, halfW - 1, band, 1);

    // Cyan tail ring.
    g.fillStyle(CYAN, 1);
    g.fillRect(bodyStart - 1, -halfW, 2, W);
    g.fillStyle(0xbdebf4, 1);
    g.fillRect(bodyStart - 1, -halfW, 2, Math.max(1, Math.round(W * 0.22)));

    // Nose: stepped taper, light grey rather than a white block. Three narrow
    // steps read as a pointed cap at close zoom and a clean pixel silhouette in
    // flight, like the original sprite. Heavy squash folds the cap back and
    // opens a dark seam, so the deformation is visible against plate.
    const crumple = squash > 0.4 ? Math.round(nose * (squash - 0.4) * 0.8) : 0;
    const noseLen = Math.max(1, nose - crumple);
    const noseStep = Math.max(1, Math.round(noseLen / 3));
    const noseY = -Math.round(W * 0.36);
    const noseH = Math.max(2, Math.round(W * 0.72));
    g.fillStyle(0xdfe9ee, 1);
    g.fillRect(bodyEnd, noseY, noseStep, noseH);
    g.fillStyle(0xf2f7fa, 1);
    g.fillRect(bodyEnd + noseStep, -Math.round(W * 0.28), noseStep, Math.max(2, Math.round(W * 0.56)));
    g.fillStyle(0xffffff, 1);
    g.fillRect(bodyEnd + noseStep * 2, -Math.round(W * 0.18), Math.max(1, noseLen - noseStep * 2), Math.max(2, Math.round(W * 0.36)));
    g.fillStyle(0xb9c7d0, 1);
    g.fillRect(bodyEnd, Math.round(W * 0.26), noseLen, Math.max(1, Math.round(W * 0.1)));
    if (crumple > 0) {
      g.fillStyle(0x2a333b, 1);
      g.fillRect(bodyEnd - 1, -Math.round(W * 0.2), 2, Math.max(2, Math.round(W * 0.4)));
      g.fillStyle(0x9fb0bb, 1);
      g.fillRect(bodyEnd + 1, -Math.round(W * 0.4), 1, 1);
      g.fillRect(bodyEnd + 1, Math.round(W * 0.3), 1, 1);
    }

    // Damage: integrity dents expose dark metal.
    if (body.integrity < 0.6) {
      g.fillStyle(STEEL, 1);
      const dents = body.integrity < 0.3 ? 4 : 2;
      for (let i = 0; i < dents; i += 1) {
        const dx = bodyStart + Math.round(bodyLen * (0.2 + i * 0.17));
        g.fillRect(dx, -Math.round(W * 0.34), 2, 1);
        g.fillRect(dx + 1, Math.round(W * 0.24), 1, 1);
      }
    }

    // Outline built from four 1px bars, not a stroked rectangle: every edge of
    // the round is a row or column of squares like the rest of the range.
    g.fillStyle(0x2b343c, 0.85);
    g.fillRect(bodyStart, -halfW, bodyLen, 1);
    g.fillRect(bodyStart, halfW - 1, bodyLen, 1);
    g.fillRect(bodyStart, -halfW, 1, W);
    g.fillRect(bodyEnd - 1, -halfW, 1, W);
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

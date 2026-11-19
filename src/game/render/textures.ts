import Phaser from 'phaser';
import type { MaterialId } from '../materials';
import { MATERIALS } from '../materials';

type Draw = (ctx: CanvasRenderingContext2D) => void;

function canvasTexture(scene: Phaser.Scene, key: string, width: number, height: number, draw: Draw): void {
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  scene.textures.addCanvas(key, canvas);
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function pixelCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, color: string): void {
  ctx.fillStyle = color;
  const r = Math.round(radius);
  for (let y = -r; y <= r; y += 1) {
    const span = Math.round(Math.sqrt(r * r - y * y));
    ctx.fillRect(Math.round(cx) - span, Math.round(cy) + y, span * 2 + 1, 1);
  }
}

export function buildGameTextures(scene: Phaser.Scene): void {
  // ── particles ──────────────────────────────────────────────────────────
  canvasTexture(scene, 'px-1', 2, 2, (ctx) => rect(ctx, 0, 0, 2, 2, '#ffffff'));
  canvasTexture(scene, 'px-2', 4, 4, (ctx) => rect(ctx, 0, 0, 4, 4, '#ffffff'));
  canvasTexture(scene, 'px-3', 6, 6, (ctx) => rect(ctx, 0, 0, 6, 6, '#ffffff'));
  canvasTexture(scene, 'spark', 8, 3, (ctx) => {
    rect(ctx, 0, 1, 8, 1, '#ffffff');
    rect(ctx, 5, 0, 3, 3, '#ffffff');
  });
  canvasTexture(scene, 'dust', 7, 7, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2, 0, 3, 1);
    ctx.fillRect(1, 1, 5, 2);
    ctx.fillRect(0, 3, 7, 2);
    ctx.fillRect(1, 5, 5, 2);
    ctx.fillRect(2, 7, 3, 1);
  });
  canvasTexture(scene, 'smoke', 10, 10, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(3, 0, 4, 2);
    ctx.fillRect(1, 2, 8, 3);
    ctx.fillRect(0, 5, 10, 3);
    ctx.fillRect(2, 8, 6, 2);
  });

  // ── demolition cubes ───────────────────────────────────────────────────
  // One flat block face with a baked bevel. Tinted per material at runtime, so
  // a wall breaking apart produces identical-looking blocks at any zoom.
  canvasTexture(scene, 'cube', 16, 16, (ctx) => {
    // Nearly flat: reference debris blocks are solid-colour chunks with only
    // the faintest top-light edge, not beveled dice.
    rect(ctx, 0, 0, 16, 16, '#ffffff');
    rect(ctx, 0, 0, 16, 1, '#f0f0f0');
    rect(ctx, 0, 15, 16, 1, '#c4c4c4');
  });

  // ── material debris ────────────────────────────────────────────────────
  for (const material of Object.keys(MATERIALS) as MaterialId[]) {
    const palette = MATERIALS[material].colors;
    const base = `#${palette.base.toString(16).padStart(6, '0')}`;
    const light = `#${palette.light.toString(16).padStart(6, '0')}`;
    const dark = `#${palette.dark.toString(16).padStart(6, '0')}`;
    for (let variant = 0; variant < 3; variant += 1) {
      const w = material === 'wood' ? 4 + variant * 2 : 5 + variant;
      const h = material === 'wood' ? 3 : 4 + ((variant * 2) % 4);
      canvasTexture(scene, `debris-${material}-${variant}`, w + 2, h + 2, (ctx) => {
        rect(ctx, 0, 1, w, h, dark);
        rect(ctx, 1, 0, w - 1, h, base);
        if (variant % 2 === 0) rect(ctx, 1, 1, 2, 1, light);
        if (material === 'wood') {
          rect(ctx, 1, 2, w - 1, 1, dark);
        }
        if (material === 'steel' || material === 'armor') {
          rect(ctx, 2, 0, 2, 1, '#d3dfe4');
        }
      });
    }
  }

  // ── cannon base ────────────────────────────────────────────────────────
  canvasTexture(scene, 'cannon-base', 158, 108, (ctx) => {
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(12, 98, 140, 8);
    // rear trail / stabilizer
    rect(ctx, 7, 84, 136, 8, '#1b252f');
    rect(ctx, 14, 80, 112, 5, '#334554');
    rect(ctx, 32, 76, 74, 7, '#2a3947');
    // Armour shield: a stepped pixel plate. No diagonal path -- the slanted
    // silhouette is built from whole rows, like the structure.
    rect(ctx, 33, 30, 62, 4, '#263541');
    rect(ctx, 34, 34, 64, 6, '#263541');
    rect(ctx, 35, 40, 66, 8, '#263541');
    rect(ctx, 36, 48, 68, 10, '#263541');
    rect(ctx, 36, 58, 69, 10, '#263541');
    rect(ctx, 34, 68, 71, 8, '#263541');
    rect(ctx, 32, 76, 74, 4, '#263541');
    rect(ctx, 40, 34, 47, 39, '#3f5361');
    rect(ctx, 44, 38, 37, 30, '#2c3c49');
    rect(ctx, 46, 40, 34, 2, '#5c7382');
    rect(ctx, 39, 67, 52, 3, '#1b2731');
    // rivets
    for (const [x, y] of [
      [45, 45],
      [73, 45],
      [45, 60],
      [73, 60],
    ] as Array<[number, number]>) {
      rect(ctx, x, y, 3, 3, '#84939e');
      rect(ctx, x + 1, y + 1, 1, 1, '#161f28');
    }
    // hydraulic mount and breech
    rect(ctx, 89, 53, 28, 17, '#1d2a34');
    rect(ctx, 93, 49, 18, 22, '#445665');
    rect(ctx, 96, 52, 12, 15, '#2d3b46');
    rect(ctx, 99, 46, 5, 4, '#90a0aa');
    // wheels
    for (const cx of [46, 105]) {
      pixelCircle(ctx, cx, 85, 23, '#18212a');
      pixelCircle(ctx, cx, 85, 18, '#374a58');
      pixelCircle(ctx, cx, 85, 10, '#22303b');
      pixelCircle(ctx, cx, 85, 4, '#7d8e98');
      rect(ctx, cx - 1, 64, 2, 42, '#1c2831');
      // treads
      for (let a = -22; a <= 22; a += 6) {
        const xx = cx + Math.round(Math.sqrt(23 * 23 - a * a));
        rect(ctx, cx - xx, 85 + a, 4, 2, '#0f161d');
        rect(ctx, cx + xx - 3, 85 + a, 4, 2, '#0f161d');
      }
    }
    // hazard stripes on the trail
    for (let i = 0; i < 5; i += 1) {
      rect(ctx, 16 + i * 13, 81, 6, 3, i % 2 === 0 ? '#a96a31' : '#202c36');
    }
  });

  canvasTexture(scene, 'cannon-barrel', 111, 24, (ctx) => {
    // muzzle on the right; pivot at x=0
    rect(ctx, 0, 4, 16, 17, '#1a242c');
    rect(ctx, 2, 5, 13, 14, '#596b78');
    rect(ctx, 4, 6, 4, 5, '#93a2ac');
    rect(ctx, 13, 3, 5, 19, '#2a3945');
    rect(ctx, 18, 4, 62, 17, '#40525f');
    rect(ctx, 20, 4, 50, 4, '#718693');
    rect(ctx, 20, 15, 59, 5, '#26343f');
    rect(ctx, 18, 6, 3, 12, '#a96a30');
    rect(ctx, 36, 5, 2, 16, '#a96a30');
    rect(ctx, 37, 5, 1, 16, '#d79957');
    rect(ctx, 64, 4, 6, 17, '#2b3a46');
    rect(ctx, 84, 3, 8, 19, '#1e2a33');
    rect(ctx, 91, 5, 17, 15, '#435663');
    rect(ctx, 95, 6, 2, 4, '#8da0ab');
    rect(ctx, 100, 9, 7, 7, '#1a252e');
    rect(ctx, 102, 10, 3, 5, '#9babb3');
    // small sight
    rect(ctx, 59, 0, 3, 4, '#95a3aa');
    rect(ctx, 57, 2, 8, 2, '#26343d');
  });

  canvasTexture(scene, 'cannon-pin', 22, 22, (ctx) => {
    pixelCircle(ctx, 11, 11, 10, '#18232c');
    pixelCircle(ctx, 11, 11, 6, '#667b87');
    pixelCircle(ctx, 11, 11, 3, '#1f2d37');
    rect(ctx, 8, 4, 2, 3, '#b5c0c3');
  });

  // ── core ───────────────────────────────────────────────────────────────
  canvasTexture(scene, 'sabot-core', 30, 9, (ctx) => {
    rect(ctx, 1, 3, 22, 4, '#334551');
    rect(ctx, 3, 2, 16, 2, '#b9cbd3');
    rect(ctx, 19, 1, 8, 7, '#8fa2ad');
    rect(ctx, 24, 3, 3, 3, '#f1f5f6');
    rect(ctx, 27, 4, 2, 1, '#ffffff');
    rect(ctx, 3, 7, 12, 1, '#1d2831');
    rect(ctx, 1, 3, 2, 4, '#9c6c3f');
  });

  canvasTexture(scene, 'core-body', 48, 48, (ctx) => {
    // The reference core is a solid red square, not an orb: dark red rim, flat
    // red face, one lighter pixel band. No halo, no concentric rings.
    rect(ctx, 6, 6, 36, 36, '#5c0d0d');
    rect(ctx, 8, 8, 32, 32, '#b81a18');
    rect(ctx, 11, 11, 26, 26, '#e0211f');
    rect(ctx, 14, 14, 20, 20, '#f02a26');
    rect(ctx, 14, 14, 20, 4, '#ff5a45');
    rect(ctx, 14, 30, 20, 4, '#a51412');
    rect(ctx, 20, 20, 8, 8, '#ff6a52');
    rect(ctx, 6, 6, 4, 4, '#2f0606');
    rect(ctx, 38, 38, 4, 4, '#2f0606');
  });
  canvasTexture(scene, 'core-glow', 96, 96, (ctx) => {
    // Nested chunky circles create a stepped pixel halo without a CSS blur.
    for (let r = 46; r > 2; r -= 4) {
      const alpha = 0.038 + (46 - r) * 0.0016;
      ctx.fillStyle = `rgba(255,40,30,${alpha})`;
      for (let y = -r; y <= r; y += 1) {
        const span = Math.round(Math.sqrt(r * r - y * y));
        ctx.fillRect(48 - span, 48 + y, span * 2 + 1, 1);
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let y = -18; y <= 18; y += 1) {
      const span = Math.round(Math.sqrt(18 * 18 - y * y));
      ctx.fillStyle = 'rgba(255,120,90,0.02)';
      ctx.fillRect(48 - span, 48 + y, span * 2 + 1, 1);
    }
    ctx.globalCompositeOperation = 'source-over';
  });
  canvasTexture(scene, 'core-dead', 48, 48, (ctx) => {
    rect(ctx, 6, 6, 36, 36, '#15171d');
    rect(ctx, 8, 8, 32, 32, '#2b2d34');
    rect(ctx, 11, 11, 26, 26, '#1b1d23');
    rect(ctx, 16, 16, 2, 17, '#8f8274');
    rect(ctx, 22, 19, 1, 13, '#6f645a');
    rect(ctx, 30, 12, 2, 16, '#594f49');
    rect(ctx, 34, 27, 8, 2, '#4c4540');
  });

  canvasTexture(scene, 'relay-marker', 34, 38, (ctx) => {
    pixelCircle(ctx, 17, 19, 13, '#2a1c17');
    pixelCircle(ctx, 17, 19, 9, '#a95a2e');
    rect(ctx, 12, 14, 10, 10, '#f2a24b');
    rect(ctx, 15, 10, 4, 20, '#ffd27a');
    rect(ctx, 5, 5, 24, 3, '#342722');
    rect(ctx, 16, 0, 2, 8, '#d3874d');
    rect(ctx, 6, 32, 22, 3, '#342722');
  });

}

export function addPixelParticles(
  scene: Phaser.Scene,
  x: number,
  y: number,
  texture: string,
  options: {
    count: number;
    color: number;
    speedMin: number;
    speedMax: number;
    lifespanMin: number;
    lifespanMax: number;
    gravityY?: number;
    scaleMin?: number;
    scaleMax?: number;
    angleMin?: number;
    angleMax?: number;
    blend?: Phaser.BlendModes;
    alpha?: number;
  },
): Phaser.GameObjects.Particles.ParticleEmitter {
  const emitter = scene.add.particles(x, y, texture, {
    speed: { min: options.speedMin, max: options.speedMax },
    angle: { min: options.angleMin ?? 0, max: options.angleMax ?? 360 },
    lifespan: { min: options.lifespanMin, max: options.lifespanMax },
    gravityY: options.gravityY ?? 260,
    scale: { start: options.scaleMin ?? 1, end: options.scaleMax ?? 0.2 },
    quantity: options.count,
    tint: options.color,
    alpha: options.alpha ?? 1,
    emitting: false,
    blendMode: options.blend ?? Phaser.BlendModes.NORMAL,
  });
  emitter.setDepth(30);
  emitter.explode(options.count);
  scene.time.delayedCall(options.lifespanMax + 120, () => emitter.destroy());
  return emitter;
}

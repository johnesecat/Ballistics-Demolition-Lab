import Phaser from 'phaser';
import type { StageTheme } from '../stages/types';

const WIDTH = 2400;
const HEIGHT = 500;
const OFFSET_X = -600;
const OFFSET_Y = -40;

interface Palette {
  skyTop: string;
  skyLow: string;
  horizon: string;
  far: string;
  farLit: string;
  mid: string;
  midEdge: string;
  ground: string;
  groundEdge: string;
  accent: string;
}

const PALETTES: Record<StageTheme, Palette> = {
  harbor: {
    skyTop: '#071019',
    skyLow: '#1e3342',
    horizon: '#6d4936',
    // The range footage keeps the dock almost black; only the cranes and the
    // structure itself read against the sky.
    far: '#08131c',
    farLit: '#8a5a34',
    mid: '#060f16',
    midEdge: '#16242e',
    ground: '#0e1922',
    groundEdge: '#1d2a33',
    accent: '#e08a43',
  },
  foundry: {
    skyTop: '#0d0c13',
    skyLow: '#3a2725',
    horizon: '#8d442d',
    far: '#241e25',
    farLit: '#d47738',
    mid: '#15151c',
    midEdge: '#3c3130',
    ground: '#181719',
    groundEdge: '#36302d',
    accent: '#f0a047',
  },
  citadel: {
    skyTop: '#080d1a',
    skyLow: '#23344b',
    horizon: '#5c5367',
    far: '#141d2f',
    farLit: '#987c9c',
    mid: '#0c1421',
    midEdge: '#2a3a52',
    ground: '#111823',
    groundEdge: '#2a3544',
    accent: '#d6a36b',
  },
};

function canvas(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): void {
  if (scene.textures.exists(key)) return;
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const ctx = element.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  scene.textures.addCanvas(key, element);
}

function ensureTextures(scene: Phaser.Scene, theme: StageTheme): void {
  const p = PALETTES[theme];
  canvas(scene, `bg-sky-${theme}`, 900, 240, (ctx) => {
    // Banded vertical gradient keeps the low-resolution pixel character.
    const bands = 32;
    for (let i = 0; i < bands; i += 1) {
      const ratio = i / (bands - 1);
      const top = hexToRgb(p.skyTop);
      const low = hexToRgb(p.skyLow);
      const mix = {
        r: top.r + (low.r - top.r) * ratio,
        g: top.g + (low.g - top.g) * ratio,
        b: top.b + (low.b - top.b) * ratio,
      };
      ctx.fillStyle = `rgb(${Math.round(mix.r)},${Math.round(mix.g)},${Math.round(mix.b)})`;
      ctx.fillRect(0, Math.floor((i * 240) / bands), 900, Math.ceil(240 / bands) + 1);
    }
    // soft cloud fractures
    ctx.globalAlpha = 0.14;
    for (let i = 0; i < 38; i += 1) {
      const x = (i * 137) % 900;
      const y = 24 + ((i * 53) % 150);
      const w = 30 + ((i * 31) % 120);
      const h = 4 + (i % 5) * 3;
      ctx.fillStyle = i % 3 === 0 ? '#d0b79d' : '#5c7284';
      ctx.fillRect(x, y, w, h);
    }
    ctx.globalAlpha = 1;
    // Distant furnace glow, stepped into square rows instead of a smooth
    // radial gradient so the sky keeps the pixel language.
    for (let y = 28; y < 212; y += 4) {
      const dy = Math.abs(y + 2 - 120);
      if (dy >= 92) continue;
      const span = Math.round(Math.sqrt(Math.max(0, 92 * 92 - dy * dy)));
      ctx.fillStyle = hexToRgba(p.horizon, 0.05 * (1 - dy / 92));
      ctx.fillRect(700 - span, y, span * 2, 4);
    }
    // stars / ash
    for (let i = 0; i < 46; i += 1) {
      const x = (i * 197 + 31) % 900;
      const y = (i * 61 + 17) % 128;
      ctx.fillStyle = i % 7 === 0 ? '#f1d8b1' : '#7890a1';
      ctx.globalAlpha = 0.25 + ((i * 17) % 50) / 100;
      ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, 1);
    }
    ctx.globalAlpha = 1;
  });

  canvas(scene, `bg-far-${theme}`, 900, 190, (ctx) => {
    ctx.fillStyle = p.far;
    ctx.globalAlpha = 0.9;
    const baseline = 190;
    // shared distant factory blocks, adjusted by theme
    for (let x = -10; x < 920; x += 48) {
      const h = 22 + ((x * 13 + 7) % 72);
      ctx.fillRect(x, baseline - h, 38, h);
      if (theme === 'citadel' && x % 96 === 0) {
        // Stepped roof: no three-point triangle in the skyline.
        ctx.fillRect(x + 16, baseline - h - 24, 6, 6);
        ctx.fillRect(x + 13, baseline - h - 18, 12, 6);
        ctx.fillRect(x + 10, baseline - h - 12, 18, 6);
        ctx.fillRect(x + 7, baseline - h - 6, 24, 12);
      }
    }
    if (theme === 'harbor') {
      // gantry cranes
      for (const x of [80, 300, 570, 780]) {
        ctx.fillRect(x, 44, 7, 146);
        ctx.fillRect(x + 60, 52, 6, 138);
        ctx.fillRect(x, 44, 150, 5);
        ctx.fillRect(x - 18, 38, 58, 4);
        for (let i = 0; i < 5; i += 1) {
          ctx.fillRect(x + 12 + i * 25, 49, 2, 14);
        }
        for (let s = 0; s < 64; s += 4) {
          ctx.fillRect(x + 7 + Math.round((s * 67) / 64), 50 + Math.round((s * 78) / 64), 3, 3);
        }
      }
      for (let x = 30; x < 900; x += 27) {
        ctx.fillRect(x, 152 + (x % 9), 19, 14);
      }
    } else if (theme === 'foundry') {
      for (const [x, h, w] of [
        [92, 126, 17],
        [160, 92, 12],
        [390, 150, 22],
        [650, 112, 14],
        [728, 78, 10],
      ] as Array<[number, number, number]>) {
        ctx.fillRect(x, baseline - h, w, h);
        ctx.fillRect(x - 4, baseline - h - 5, w + 8, 6);
      }
      ctx.fillRect(180, 120, 220, 6);
      ctx.fillRect(474, 100, 160, 5);
      for (const [x, y] of [
        [100, 68],
        [168, 102],
        [398, 44],
        [656, 78],
      ] as Array<[number, number]>) {
        ctx.fillStyle = p.farLit;
        ctx.globalAlpha = 0.6;
        ctx.fillRect(x, y, 3, 3);
        ctx.globalAlpha = 0.9;
      }
      ctx.fillStyle = p.far;
    } else {
      // citadel arches and antennae
      for (const x of [60, 210, 380, 560, 740]) {
        const h = 82 + ((x * 7) % 64);
        ctx.fillRect(x, baseline - h, 54, h);
        ctx.fillRect(x + 22, baseline - h - 38, 10, 8);
        ctx.fillRect(x + 17, baseline - h - 30, 20, 8);
        ctx.fillRect(x + 12, baseline - h - 22, 30, 8);
        ctx.fillRect(x + 7, baseline - h - 14, 40, 8);
        ctx.fillRect(x + 2, baseline - h - 6, 50, 6);
        ctx.fillRect(x + 24, baseline - h - 20, 5, 32);
      }
      ctx.fillStyle = p.farLit;
      ctx.globalAlpha = 0.15;
      for (let i = 0; i < 60; i += 1) ctx.fillRect(i * 15, 60 + Math.round(i * 0.6), 4, 2);
    }
    ctx.globalAlpha = 1;
  });

  canvas(scene, `bg-mid-${theme}`, 900, 170, (ctx) => {
    const baseline = 170;
    ctx.fillStyle = p.mid;
    // near silhouettes, with a slim lit edge
    if (theme === 'harbor') {
      for (const x of [30, 300, 630]) {
        ctx.fillRect(x, 78, 120, 92);
        ctx.fillRect(x + 94, 28, 18, 142);
        ctx.fillRect(x + 86, 26, 34, 5);
        ctx.fillStyle = p.midEdge;
        ctx.fillRect(x + 8, 86, 6, 62);
        ctx.fillRect(x + 104, 34, 3, 88);
        ctx.fillStyle = p.mid;
        for (let i = 0; i < 4; i += 1) {
          ctx.fillStyle = i % 2 === 0 ? p.accent : p.midEdge;
          ctx.globalAlpha = 0.22;
          ctx.fillRect(x + 20 + i * 23, 104, 6, 3);
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = p.mid;
      }
      ctx.fillRect(0, 142, 900, 28);
    } else if (theme === 'foundry') {
      for (const [x, w, h] of [
        [70, 95, 70],
        [240, 130, 96],
        [488, 82, 58],
        [700, 116, 82],
      ] as Array<[number, number, number]>) {
        ctx.fillRect(x, baseline - h, w, h);
        ctx.fillStyle = p.midEdge;
        ctx.fillRect(x + 8, baseline - h + 10, w - 16, 5);
        ctx.fillStyle = p.mid;
      }
      // large pipe
      ctx.fillStyle = p.midEdge;
      ctx.fillRect(0, 126, 900, 7);
      ctx.fillRect(0, 136, 900, 3);
      ctx.fillStyle = p.mid;
      for (let x = 0; x < 900; x += 86) {
        ctx.fillRect(x, 132, 8, 8);
      }
    } else {
      // high citadel wall with buttresses
      ctx.fillRect(0, 72, 900, 98);
      for (let x = 0; x < 900; x += 74) {
        ctx.fillRect(x + 6, 52, 18, 118);
        ctx.fillStyle = p.midEdge;
        ctx.fillRect(x + 6, 52, 3, 118);
        ctx.fillStyle = p.mid;
        // narrow embrasures
        ctx.fillStyle = '#070d14';
        ctx.fillRect(x + 35, 92, 10, 24);
        ctx.fillStyle = p.mid;
      }
      ctx.fillRect(0, 152, 900, 18);
      ctx.fillStyle = p.accent;
      ctx.globalAlpha = 0.35;
      for (const x of [165, 470, 780]) ctx.fillRect(x, 116, 3, 14);
      ctx.globalAlpha = 1;
    }
    // lit windows / distant warning lamps
    ctx.fillStyle = p.accent;
    for (let i = 0; i < 20; i += 1) {
      const x = (i * 149 + 43) % 900;
      const y = 104 + ((i * 37) % 52);
      ctx.globalAlpha = 0.2 + (i % 4) * 0.12;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
  });

  canvas(scene, `bg-ground-${theme}`, 900, 120, (ctx) => {
    ctx.fillStyle = p.ground;
    ctx.fillRect(0, 0, 900, 120);
    ctx.fillStyle = p.groundEdge;
    ctx.fillRect(0, 0, 900, 5);
    for (let i = 0; i < 62; i += 1) {
      const x = (i * 71 + 13) % 900;
      const y = 12 + ((i * 29) % 94);
      ctx.fillStyle = i % 5 === 0 ? p.groundEdge : '#0a1218';
      ctx.globalAlpha = 0.3 + (i % 4) * 0.12;
      ctx.fillRect(x, y, 4 + (i % 17), 2);
    }
    ctx.globalAlpha = 1;
    // plate seams
    ctx.fillStyle = '#080e13';
    for (let x = 30; x < 900; x += 94) {
      ctx.fillRect(x, 8, 2, 22);
    }
    // broken lip
    ctx.fillStyle = p.groundEdge;
    for (let x = 0; x < 900; x += 33) {
      const h = 3 + ((x * 7) % 7);
      ctx.fillRect(x, 0, 22, h);
    }
  });

  canvas(scene, `bg-glow-${theme}`, 64, 64, (ctx) => {
    // Pixel disc: each row is a solid rectangle, fading with distance.
    for (let y = 0; y < 64; y += 2) {
      const dy = Math.abs(y + 1 - 32);
      if (dy >= 32) continue;
      const span = Math.round(Math.sqrt(32 * 32 - dy * dy));
      ctx.fillStyle = hexToRgba(p.accent, 0.3 * Math.pow(1 - dy / 32, 1.6));
      ctx.fillRect(32 - span, y, span * 2, 2);
    }
  });
}

export class Backdrop {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private dust: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private theme: StageTheme | null = null;
  private scene: Phaser.Scene;
  private reduced = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  setTheme(theme: StageTheme, reduced: boolean): void {
    if (this.theme === theme && this.reduced === reduced) return;
    this.clear();
    this.theme = theme;
    this.reduced = reduced;
    ensureTextures(this.scene, theme);
    const p = PALETTES[theme];
    const add = (x: number, y: number, key: string, depth: number): Phaser.GameObjects.Image => {
      const image = this.scene.add.image(x, y, key).setOrigin(0, 0);
      image.setDepth(depth);
      this.objects.push(image);
      return image;
    };
    add(OFFSET_X, OFFSET_Y, `bg-sky-${theme}`, -40).setDisplaySize(WIDTH, HEIGHT + 80);
    add(OFFSET_X, 42, `bg-far-${theme}`, -35).setDisplaySize(WIDTH, 420);
    add(OFFSET_X, 158, `bg-mid-${theme}`, -30).setDisplaySize(WIDTH, 370);
    const glow = add(430, 232, `bg-glow-${theme}`, -28).setDisplaySize(440, 260);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    glow.setAlpha(0.65);
    add(OFFSET_X, 346, `bg-ground-${theme}`, -22).setDisplaySize(2600, 140);
    // Dock-edge hazard band from the footage: alternating yellow/black blocks
    // along the apron under the range. Drawn in world space so it stays put
    // when the camera pans.
    const hazard = this.scene.add.graphics().setDepth(-20);
    for (let i = 0, x = -208; x < 1500; i += 1, x += 16) {
      hazard.fillStyle(i % 2 === 0 ? 0xd9a53a : 0x1a1b1c, 0.55);
      hazard.fillRect(x, 348, 16, 5);
    }
    this.objects.push(hazard);
    // cockpit-like foreground lip that anchors the cannon.
    const ground = this.scene.add.rectangle(600, 382, 2600, 140, Phaser.Display.Color.HexStringToColor(p.ground).color);
    ground.setDepth(-21);
    this.objects.push(ground);

    if (!reduced) {
      this.dust = this.scene.add.particles(0, 0, 'px-1', {
        x: { min: 0, max: 1300 },
        y: { min: 80, max: 340 },
        lifespan: { min: 5000, max: 11000 },
        speedX: { min: -7, max: -18 },
        speedY: { min: -2, max: 4 },
        scale: { min: 0.4, max: 1.1 },
        alpha: { start: 0.22, end: 0 },
        frequency: 380,
        quantity: 1,
        tint: 0xbc9b7a,
      });
      this.dust.setDepth(-26);
      this.objects.push(this.dust);

      const smokeX = theme === 'foundry' ? 398 : theme === 'harbor' ? 400 : 270;
      this.smoke = this.scene.add.particles(smokeX, 105, 'smoke', {
        lifespan: { min: 4500, max: 8500 },
        speedX: { min: 2, max: 10 },
        speedY: { min: -16, max: -5 },
        scale: { start: 0.3, end: 0.9 },
        alpha: { start: 0.05, end: 0 },
        frequency: 1200,
        quantity: 1,
        tint: 0x8a8d92,
      });
      this.smoke.setDepth(-27);
      this.objects.push(this.smoke);
    }
    // A restrained horizontal light mist keeps the silhouette readable.
    const mist = this.scene.add.rectangle(600, 325, 2600, 38, 0x6c7d86, 0.035);
    mist.setDepth(-24);
    this.objects.push(mist);
  }

  getAccent(): number {
    return Phaser.Display.Color.HexStringToColor(PALETTES[this.theme ?? 'harbor'].accent).color;
  }

  private clear(): void {
    for (const object of this.objects) object.destroy();
    this.objects = [];
    this.dust = null;
    this.smoke = null;
  }

  destroy(): void {
    this.clear();
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function hexToRgba(hex: string, alpha: number): string {
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

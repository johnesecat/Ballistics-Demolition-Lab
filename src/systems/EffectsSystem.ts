import { GAME_CONFIG } from '../config/gameConfig';
import { saveSystem } from './SaveSystem';

export interface ParticleConfig {
  x: number;
  y: number;
  color: number;
  alpha?: number;
  scale?: number;
  lifespan?: number;
  speed?: number;
  angle?: number;
  gravity?: number;
  count?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  alpha: number;
  scale: number;
  life: number;
  maxLife: number;
  gravity: number;
}

export class EffectsSystem {
  private scene: Phaser.Scene;
  private particles: Particle[] = [];
  private debrisPool: Phaser.GameObjects.Graphics[] = [];
  private activeDebris: Phaser.GameObjects.Graphics[] = [];
  private reducedEffects: boolean;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.reducedEffects = saveSystem.getSettings().reducedEffects;

    saveSystem.subscribe(settings => {
      this.reducedEffects = settings.reducedEffects;
    });
  }

  emitImpact(x: number, y: number, material: string, intensity: number = 1): void {
    if (this.reducedEffects) return;

    const count = Math.floor(intensity * 8);
    const color = this.getMaterialColor(material);
    
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 150;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        alpha: 1,
        scale: 0.3 + Math.random() * 0.5,
        life: 500 + Math.random() * 1000,
        maxLife: 1500,
        gravity: 300,
      });
    }

    // Flash
    this.particles.push({
      x, y,
      vx: 0, vy: 0,
      color: GAME_CONFIG.COLORS.TRAJECTORY,
      alpha: 1,
      scale: 1.5,
      life: 100,
      maxLife: 300,
      gravity: 0,
    });
  }

  emitJet(x: number, y: number, angleDeg: number, length: number, color: number = 0xff6600): void {
    if (this.reducedEffects) return;

    const angle = Phaser.Math.DegToRad(angleDeg);
    const steps = Math.ceil(length / 10);
    for (let i = 0; i <= steps; i++) {
      const px = x + Math.cos(angle) * (i / steps) * length;
      const py = y + Math.sin(angle) * (i / steps) * length;
      this.particles.push({
        x: px, y: py,
        vx: 0, vy: 0,
        color,
        alpha: 0.8,
        scale: 0.5,
        life: 200,
        maxLife: 400,
        gravity: 0,
      });
    }
  }

  emitSpall(x: number, y: number, angleDeg: number, count: number = 8): void {
    if (this.reducedEffects) return;

    const angle = Phaser.Math.DegToRad(angleDeg);
    for (let i = 0; i < count; i++) {
      const spread = angle + (Math.random() - 0.5) * Math.PI / 2;
      const speed = 100 + Math.random() * 200;
      this.particles.push({
        x, y,
        vx: Math.cos(spread) * speed,
        vy: Math.sin(spread) * speed,
        color: 0xaa8844,
        alpha: 1,
        scale: 0.4,
        life: 500 + Math.random() * 1000,
        maxLife: 1500,
        gravity: 300,
      });
    }
  }

  emitThermalGlow(x: number, y: number, radius: number): void {
    if (this.reducedEffects) return;

    this.particles.push({
      x, y,
      vx: 0, vy: 0,
      color: 0xff4400,
      alpha: 0.6,
      scale: radius / 32,
      life: 2000,
      maxLife: 4000,
      gravity: 0,
    });
  }

  emitShockRing(x: number, y: number, radius: number): void {
    if (this.reducedEffects) return;

    this.particles.push({
      x, y,
      vx: 0, vy: 0,
      color: 0xaa88ff,
      alpha: 0.8,
      scale: 0.5,
      life: 500,
      maxLife: 1000,
      gravity: 0,
    });
  }

  emitDrillPush(x: number, y: number): void {
    if (this.reducedEffects) return;

    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 100;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: 0xffff00,
        alpha: 1,
        scale: 0.3,
        life: 100,
        maxLife: 300,
        gravity: 100,
      });
    }
  }

  emitPetalStrip(x: number, y: number, angleDeg: number): void {
    if (this.reducedEffects) return;

    const angle = Phaser.Math.DegToRad(angleDeg);
    for (let i = 0; i < 4; i++) {
      const spread = angle + (Math.random() - 0.5) * Math.PI / 9;
      const speed = 30 + Math.random() * 70;
      this.particles.push({
        x, y,
        vx: Math.cos(spread) * speed,
        vy: Math.sin(spread) * speed,
        color: 0xcd7f32,
        alpha: 1,
        scale: 0.8,
        life: 400,
        maxLife: 1000,
        gravity: 200,
      });
    }
  }

  emitSoftCrush(x: number, y: number, width: number): void {
    if (this.reducedEffects) return;

    this.particles.push({
      x, y,
      vx: 0, vy: 0,
      color: 0xff8800,
      alpha: 0.8,
      scale: width / 32,
      life: 200,
      maxLife: 500,
      gravity: 0,
    });
  }

  createDebrisPiece(x: number, y: number, material: string, size: number, angle: number, speed: number): Phaser.GameObjects.Graphics | null {
    if (this.reducedEffects) return null;

    let debris: Phaser.GameObjects.Graphics;
    if (this.debrisPool.length > 0) {
      debris = this.debrisPool.pop()!;
      debris.clear();
    } else {
      debris = this.scene.add.graphics();
    }

    const color = this.getMaterialColor(material);
    debris.fillStyle(color);
    
    const points = [];
    const vertexCount = Phaser.Math.Between(3, 6);
    for (let i = 0; i < vertexCount; i++) {
      const a = (i / vertexCount) * Math.PI * 2;
      const r = size * Phaser.Math.FloatBetween(0.5, 1);
      points.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    
    debris.fillPoints(points, true);
    debris.setPosition(x, y);
    debris.setRotation(angle);
    debris.setDepth(GAME_CONFIG.Z.DEBRIS);
    debris.setData('vx', Math.cos(angle) * speed);
    debris.setData('vy', Math.sin(angle) * speed);
    debris.setData('life', GAME_CONFIG.DEBRIS_LIFETIME);
    debris.setData('material', material);

    this.activeDebris.push(debris);
    return debris;
  }

  updateDebris(delta: number): void {
    if (this.reducedEffects) return;

    const dt = delta / 1000;
    
    for (let i = this.activeDebris.length - 1; i >= 0; i--) {
      const debris = this.activeDebris[i];
      const vx = debris.getData('vx');
      const vy = debris.getData('vy');
      let life = debris.getData('life');

      debris.x += vx * dt;
      debris.y += vy * dt;
      debris.setData('vy', vy + GAME_CONFIG.GRAVITY * dt);
      debris.rotation += 0.001 * dt;
      life -= delta;

      if (life <= 0 || debris.y > this.scene.scale.height + 100) {
        debris.destroy();
        this.activeDebris.splice(i, 1);
      } else {
        debris.setData('life', life);
        const alpha = life / GAME_CONFIG.DEBRIS_LIFETIME;
        debris.setAlpha(alpha);
      }
    }

    if (this.activeDebris.length > GAME_CONFIG.MAX_DEBRIS_PIECES) {
      const excess = this.activeDebris.length - GAME_CONFIG.MAX_DEBRIS_PIECES;
      for (let i = 0; i < excess; i++) {
        const debris = this.activeDebris.shift();
        if (debris) debris.destroy();
      }
    }
  }

  private getMaterialColor(material: string): number {
    switch (material) {
      case 'wood': return GAME_CONFIG.COLORS.WOOD;
      case 'brick': return GAME_CONFIG.COLORS.BRICK;
      case 'concrete': return GAME_CONFIG.COLORS.CONCRETE;
      case 'steel': return GAME_CONFIG.COLORS.STEEL;
      case 'armor': return GAME_CONFIG.COLORS.ARMOR;
      default: return 0x888888;
    }
  }

  screenShake(intensity: number = 1, duration: number = 200): void {
    if (this.reducedEffects) return;
    const settings = saveSystem.getSettings();
    if (!settings.cameraShake) return;

    this.scene.cameras.main.shake(
      duration,
      GAME_CONFIG.CAMERA_SHAKE_INTENSITY * intensity
    );
  }

  flashScreen(color: number = 0xffffff, duration: number = 100): void {
    if (this.reducedEffects) return;
    this.scene.cameras.main.flash(duration, color >> 16, (color >> 8) & 0xff, color & 0xff);
  }

  update(delta: number): void {
    if (this.reducedEffects) return;

    const dt = delta / 1000;
    
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.life -= delta;
      
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  render(): void {
    if (this.reducedEffects || this.particles.length === 0) return;

    const gfx = this.scene.add.graphics();
    gfx.setDepth(GAME_CONFIG.Z.EFFECTS);
    
    for (const p of this.particles) {
      const alpha = (p.life / p.maxLife) * p.alpha;
      gfx.fillStyle(p.color, alpha);
      const size = Math.max(1, p.scale * 4);
      gfx.fillCircle(p.x, p.y, size);
    }
  }

  destroy(): void {
    this.particles = [];
    for (const debris of this.activeDebris) {
      debris.destroy();
    }
    for (const debris of this.debrisPool) {
      debris.destroy();
    }
    this.activeDebris = [];
    this.debrisPool = [];
  }
}
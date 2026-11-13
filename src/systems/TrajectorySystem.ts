import { GAME_CONFIG } from '../config/gameConfig';
import { AmmoDefinition } from '../ammo/ammoCatalogue';

export interface TrajectoryPoint {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  time: number;
}

export interface TrajectoryResult {
  points: TrajectoryPoint[];
  impactPoint: { x: number; y: number; body?: any } | null;
  hitsCoverFirst: boolean;
  coverBody?: any;
  maxRange: boolean;
}

export type FireMode = 'arc' | 'straight';

export class TrajectorySystem {
  private scene: Phaser.Scene;
  private matter: any;
  private graphics: Phaser.GameObjects.Graphics;
  private warningGraphics: Phaser.GameObjects.Graphics;
  private visible: boolean = true;
  private reducedEffects: boolean;

  constructor(scene: Phaser.Scene, matter: any) {
    this.scene = scene;
    this.matter = matter;
    this.graphics = scene.add.graphics().setDepth(GAME_CONFIG.Z.TRAJECTORY);
    this.warningGraphics = scene.add.graphics().setDepth(GAME_CONFIG.Z.TRAJECTORY + 1);
    this.reducedEffects = false;

    const settings = (scene.game.registry.get('saveSystem') as any)?.getSettings?.();
    if (settings) {
      this.visible = settings.trajectoryVisible;
      this.reducedEffects = settings.reducedEffects;
    }
  }

  calculateTrajectory(
    startX: number,
    startY: number,
    angle: number,
    power: number,
    mode: FireMode,
    ammo: AmmoDefinition,
    ignoreBodies: MatterJS.BodyType[] = []
  ): TrajectoryResult {
    const points: TrajectoryPoint[] = [];
    let impactPoint: TrajectoryResult['impactPoint'] = null;
    let hitsCoverFirst = false;
    let coverBody: MatterJS.BodyType | undefined;
    let maxRange = false;

    const speed = Phaser.Math.Clamp(power * 2, GAME_CONFIG.MIN_PROJECTILE_SPEED, GAME_CONFIG.MAX_PROJECTILE_SPEED);
    const rad = Phaser.Math.DegToRad(angle);
    
    let vx = Math.cos(rad) * speed;
    let vy = Math.sin(rad) * speed;
    
    if (mode === 'straight') {
      vy *= 0.3;
    }

    let x = startX;
    let y = startY;
    let time = 0;
    const dt = GAME_CONFIG.TRAJECTORY_TIMESTEP;
    const drag = GAME_CONFIG.DRAG_COEFFICIENT;
    const gravity = mode === 'arc' ? GAME_CONFIG.GRAVITY : GAME_CONFIG.GRAVITY * 0.1;

    const maxSteps = GAME_CONFIG.TRAJECTORY_POINTS;
    const maxDistance = ammo.stats.maxRange;

    let firstImpact = true;

    for (let i = 0; i < maxSteps; i++) {
      const distance = Phaser.Math.Distance.Between(startX, startY, x, y);
      if (distance > maxDistance) {
        maxRange = true;
        break;
      }

      points.push({ x, y, velocityX: vx, velocityY: vy, time });

      // Apply drag
      const vel = Math.sqrt(vx * vx + vy * vy);
      if (vel > 0) {
        const dragForce = drag * vel * vel;
        vx -= (vx / vel) * dragForce * dt;
        vy -= (vy / vel) * dragForce * dt;
      }

      // Apply gravity
      vy += gravity * dt;

      // Update position
      const nextX = x + vx * dt;
      const nextY = y + vy * dt;

      // Check collision with world bounds
      if (nextX < 0 || nextX > this.scene.scale.width || nextY > this.scene.scale.height + 100) {
        impactPoint = { x: nextX, y: nextY };
        break;
      }

      // Raycast for collision
      const hit = this.raycast(x, y, nextX, nextY, ignoreBodies);
      if (hit) {
        impactPoint = { x: hit.x, y: hit.y, body: hit.body };
        if (firstImpact) {
          hitsCoverFirst = true;
          coverBody = hit.body;
          firstImpact = false;
        }
        break;
      }

      x = nextX;
      y = nextY;
      time += dt;
    }

    return { points, impactPoint, hitsCoverFirst, coverBody, maxRange };
  }

  private raycast(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    ignoreBodies: any[]
  ): { x: number; y: number; body: any } | null {
    const matter = this.matter;
    if (!matter || !matter.world) return null;

    // Use Matter.js raycast
    const ray = (matter as any).Query?.ray?.(matter.world.bodies, { x: x1, y: y1 }, { x: x2, y: y2 }, 1) || [];
    
    for (const hit of ray) {
      if (ignoreBodies.includes(hit.body)) continue;
      
      // Check if body is a valid collision target
      const body = hit.body;
      if (body.isStatic || body.isSensor) continue;
      if (body.gameObject && (body.gameObject as any).isProjectile) continue;
      
      return { x: hit.point?.x ?? hit.body?.position?.x ?? x2, y: hit.point?.y ?? hit.body?.position?.y ?? y2, body };
    }

    return null;
  }

  drawTrajectory(result: TrajectoryResult, showWarning: boolean = true): void {
    if (!this.visible || this.reducedEffects) {
      this.graphics.clear();
      this.warningGraphics.clear();
      return;
    }

    this.graphics.clear();
    this.warningGraphics.clear();

    const { points, impactPoint, hitsCoverFirst, maxRange } = result;

    if (points.length < 2) return;

    // Draw trajectory line
    this.graphics.lineStyle(2, GAME_CONFIG.COLORS.TRAJECTORY, 0.8);
    this.graphics.beginPath();
    this.graphics.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      const alpha = 1 - (i / points.length) * 0.5;
      this.graphics.lineStyle(2, GAME_CONFIG.COLORS.TRAJECTORY, alpha);
      this.graphics.lineTo(points[i].x, points[i].y);
    }
    this.graphics.strokePath();

    // Draw dots at intervals
    this.graphics.fillStyle(GAME_CONFIG.COLORS.TRAJECTORY, 0.6);
    for (let i = 0; i < points.length; i += 5) {
      const p = points[i];
      const radius = 3 * (1 - i / points.length * 0.5);
      this.graphics.fillCircle(p.x, p.y, radius);
    }

    // Draw impact point
    if (impactPoint) {
      this.graphics.fillStyle(GAME_CONFIG.COLORS.TRAJECTORY, 1);
      this.graphics.fillCircle(impactPoint.x, impactPoint.y, 6);
      this.graphics.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 1);
      this.graphics.strokeCircle(impactPoint.x, impactPoint.y, 6);

      // Draw impact normal indicator if we have a body
      if (impactPoint.body) {
        // Could add normal visualization here
      }
    }

    // Draw max range indicator
    if (maxRange && points.length > 0) {
      const last = points[points.length - 1];
      this.graphics.lineStyle(2, GAME_CONFIG.COLORS.WARNING, 0.8);
      this.graphics.beginPath();
      this.graphics.moveTo(last.x, last.y);
      this.graphics.lineTo(last.x + 20, last.y);
      this.graphics.strokePath();
    }

    // Draw cover warning
    if (showWarning && hitsCoverFirst && impactPoint) {
      this.warningGraphics.fillStyle(GAME_CONFIG.COLORS.TRAJECTORY_WARNING, 0.9);
      this.warningGraphics.fillCircle(impactPoint.x, impactPoint.y, 10);
      this.warningGraphics.lineStyle(3, GAME_CONFIG.COLORS.TEXT, 1);
      this.warningGraphics.strokeCircle(impactPoint.x, impactPoint.y, 10);

      // Warning text
      const textX = impactPoint.x + 15;
      const textY = impactPoint.y - 15;
      this.warningGraphics.fillStyle(GAME_CONFIG.COLORS.TRAJECTORY_WARNING, 1);
      this.warningGraphics.fillRoundedRect(textX - 5, textY - 12, 120, 24, 4);
      // Text would be rendered separately by UI system
    }
  }

  drawCoverWarning(impactPoint: { x: number; y: number }): void {
    if (!this.visible || this.reducedEffects) return;
    
    this.warningGraphics.fillStyle(GAME_CONFIG.COLORS.TRAJECTORY_WARNING, 0.9);
    this.warningGraphics.fillCircle(impactPoint.x, impactPoint.y, 12);
    this.warningGraphics.lineStyle(3, GAME_CONFIG.COLORS.TEXT, 1);
    this.warningGraphics.strokeCircle(impactPoint.x, impactPoint.y, 12);
    
    // Pulsing animation
    this.scene.tweens.add({
      targets: this.warningGraphics,
      alpha: { from: 1, to: 0.3 },
      duration: 500,
      yoyo: true,
      repeat: -1,
    });
  }

  clear(): void {
    this.graphics.clear();
    this.warningGraphics.clear();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) this.clear();
  }

  isVisible(): boolean {
    return this.visible;
  }

  setReducedEffects(reduced: boolean): void {
    this.reducedEffects = reduced;
    if (reduced) this.clear();
  }

  destroy(): void {
    this.graphics.destroy();
    this.warningGraphics.destroy();
  }
}
import { GAME_CONFIG } from '../config/gameConfig';
import Matter from 'matter-js';

export type MaterialType = 'wood' | 'brick' | 'concrete' | 'steel' | 'armor' | 'slope';

export interface StructureBlockConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  material: MaterialType;
  angle?: number;
  isSupport?: boolean;
  healthMultiplier?: number;
  massMultiplier?: number;
}

export interface DestructibleBlock {
  body: Matter.Body;
  graphics: Phaser.GameObjects.Graphics;
  material: MaterialType;
  maxHealth: number;
  currentHealth: number;
  isSupport: boolean;
  damageState: number; // 0 = intact, 1 = damaged, 2 = heavily damaged
  originalVertices: Matter.Vector[];
  debrisSpawned: boolean;
}

export class StructureSystem {
  private scene: Phaser.Scene;
  private matter: any;
  private blocks: Map<Matter.Body, DestructibleBlock> = new Map();
  private supportConstraints: Matter.Constraint[] = [];
  private effectsSystem: any;
  private audioSystem: any;

  constructor(scene: Phaser.Scene, matter: any, effectsSystem: any, audioSystem: any) {
    this.scene = scene;
    this.matter = matter;
    this.effectsSystem = effectsSystem;
    this.audioSystem = audioSystem;
  }

  createBlock(config: StructureBlockConfig): DestructibleBlock {
    const materialKey = config.material.toUpperCase() as keyof typeof GAME_CONFIG.MATERIALS;
    const material = GAME_CONFIG.MATERIALS[materialKey];
    const health = Math.floor(material.health * (config.healthMultiplier || 1));
    const density = material.density * (config.massMultiplier || 1);

    let body: Matter.Body;

    if (config.angle && config.angle !== 0) {
      // Create sloped block using trapezoid
      body = this.matter.add.body(
        config.x,
        config.y,
        `rectangle`,
        { width: config.width, height: config.height },
        { 
          density,
          friction: material.friction,
          restitution: material.restitution,
          label: `structure_${config.material}`,
          collisionFilter: { group: -1 },
          sleepThreshold: 60,
        }
      );
      Matter.Body.setAngle(body, config.angle);
    } else {
      body = this.matter.add.rectangle(
        config.x,
        config.y,
        config.width,
        config.height,
        {
          density,
          friction: material.friction,
          restitution: material.restitution,
          label: `structure_${config.material}`,
          collisionFilter: { group: -1 },
          sleepThreshold: 60,
        }
      );
    }

    body.isStatic = true;

    const graphics = this.scene.add.graphics();
    graphics.setDepth(GAME_CONFIG.Z.STRUCTURE);
    this.drawBlock(graphics, body, config.material, 0);

    const block: DestructibleBlock = {
      body,
      graphics,
      material: config.material,
      maxHealth: health,
      currentHealth: health,
      isSupport: config.isSupport || false,
      damageState: 0,
      originalVertices: body.vertices.map(v => ({ x: v.x, y: v.y })),
      debrisSpawned: false,
    };

    this.blocks.set(body, block);
    return block;
  }

  private drawBlock(
    graphics: Phaser.GameObjects.Graphics,
    body: Matter.Body,
    material: MaterialType,
    damageState: number
  ): void {
    graphics.clear();
    const materialKey = material.toUpperCase() as keyof typeof GAME_CONFIG.MATERIALS;
    const color = GAME_CONFIG.MATERIALS[materialKey].color;
    const vertices = body.vertices;

    // Base color with damage darkening
    const damageDarken = damageState * 0.15;
    const r = ((color >> 16) & 0xff) * (1 - damageDarken);
    const g = ((color >> 8) & 0xff) * (1 - damageDarken);
    const b = (color & 0xff) * (1 - damageDarken);
    const damagedColor = (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);

    graphics.fillStyle(damagedColor, 1);
    graphics.fillPoints(vertices.map(v => ({ x: v.x, y: v.y })), true);

    // Add material-specific details
    this.drawMaterialDetails(graphics, vertices, material, damageState);

    // Damage cracks
    if (damageState > 0) {
      this.drawCracks(graphics, vertices, damageState);
    }

    // Support indicator
    const block = this.blocks.get(body);
    if (block?.isSupport) {
      graphics.lineStyle(2, GAME_CONFIG.COLORS.WARNING, 0.8);
      const center = this.getCenter(vertices);
      graphics.strokeCircle(center.x, center.y, 8);
    }
  }

  private drawMaterialDetails(
    graphics: Phaser.GameObjects.Graphics,
    vertices: Matter.Vector[],
    material: MaterialType,
    damageState: number
  ): void {
    const bounds = this.getBounds(vertices);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;

    switch (material) {
      case 'wood':
        graphics.lineStyle(1, 0x6b4226, 0.5);
        // Wood grain lines
        for (let i = 0; i < 3; i++) {
          const y = bounds.minY + (i + 1) * height / 4;
          graphics.beginPath();
          graphics.moveTo(bounds.minX, y);
          graphics.lineTo(bounds.maxX, y + Phaser.Math.Between(-3, 3));
          graphics.strokePath();
        }
        // Knots
        graphics.fillStyle(0x5a3521, 0.5);
        graphics.fillCircle(centerX - 5, centerY - 3, 2);
        graphics.fillCircle(centerX + 8, centerY + 5, 1.5);
        break;

      case 'brick':
        graphics.lineStyle(1, 0x6b2e22, 0.6);
        // Brick courses
        const courseHeight = 12;
        for (let y = bounds.minY; y < bounds.maxY; y += courseHeight) {
          graphics.beginPath();
          graphics.moveTo(bounds.minX, y);
          graphics.lineTo(bounds.maxX, y);
          graphics.strokePath();
          // Vertical joints offset every other course
          const offset = Math.floor((y - bounds.minY) / courseHeight) % 2 === 0 ? 0 : 15;
          for (let x = bounds.minX + offset; x < bounds.maxX; x += 30) {
            graphics.beginPath();
            graphics.moveTo(x, y);
            graphics.lineTo(x, y + courseHeight);
            graphics.strokePath();
          }
        }
        break;

      case 'concrete':
        graphics.lineStyle(1, 0x4a4a4a, 0.4);
        // Form lines
        for (let i = 0; i < 2; i++) {
          const y = bounds.minY + (i + 1) * height / 3;
          graphics.beginPath();
          graphics.moveTo(bounds.minX, y);
          graphics.lineTo(bounds.maxX, y);
          graphics.strokePath();
        }
        // Aggregate speckles
        graphics.fillStyle(0x555555, 0.3);
        for (let i = 0; i < 8; i++) {
          graphics.fillCircle(
            bounds.minX + Phaser.Math.Between(2, width - 2),
            bounds.minY + Phaser.Math.Between(2, height - 2),
            1
          );
        }
        break;

      case 'steel':
        graphics.lineStyle(1, 0x667788, 0.5);
        // Plate edges
        graphics.strokeRect(bounds.minX + 2, bounds.minY + 2, width - 4, height - 4);
        // Rivets
        graphics.fillStyle(0x778899, 0.8);
        const rivetSpacing = 16;
        for (let x = bounds.minX + 8; x < bounds.maxX - 8; x += rivetSpacing) {
          for (let y = bounds.minY + 8; y < bounds.maxY - 8; y += rivetSpacing) {
            graphics.fillCircle(x, y, 1.5);
          }
        }
        break;

      case 'armor':
        graphics.lineStyle(2, 0x3a4a5a, 0.7);
        // Angled armor plates
        graphics.strokeRect(bounds.minX + 3, bounds.minY + 3, width - 6, height - 6);
        graphics.lineStyle(1, 0x4a5a6a, 0.5);
        for (let i = 0; i < 3; i++) {
          const y = bounds.minY + (i + 1) * height / 4;
          graphics.beginPath();
          graphics.moveTo(bounds.minX + 5, y);
          graphics.lineTo(bounds.maxX - 5, y);
          graphics.strokePath();
        }
        break;

      case 'slope':
        graphics.lineStyle(1, 0x5a3a2a, 0.5);
        // Slope planks
        for (let i = 0; i < 4; i++) {
          const t = (i + 1) / 5;
          const y = bounds.minY + t * height;
          graphics.beginPath();
          graphics.moveTo(bounds.minX, y);
          graphics.lineTo(bounds.maxX, y);
          graphics.strokePath();
        }
        break;
    }
  }

  private drawCracks(graphics: Phaser.GameObjects.Graphics, vertices: Matter.Vector[], damageState: number): void {
    const bounds = this.getBounds(vertices);
    const crackCount = damageState * 3;
    
    graphics.lineStyle(1, 0x000000, 0.5);
    for (let i = 0; i < crackCount; i++) {
      const startX = bounds.minX + Phaser.Math.Between(2, (bounds.maxX - bounds.minX) - 2);
      const startY = bounds.minY + Phaser.Math.Between(2, (bounds.maxY - bounds.minY) - 2);
      const length = Phaser.Math.Between(10, 30);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const segments = Phaser.Math.Between(2, 4);
      
      graphics.beginPath();
      graphics.moveTo(startX, startY);
      let cx = startX;
      let cy = startY;
      for (let s = 0; s < segments; s++) {
        cx += Math.cos(angle + Phaser.Math.FloatBetween(-0.5, 0.5)) * (length / segments);
        cy += Math.sin(angle + Phaser.Math.FloatBetween(-0.5, 0.5)) * (length / segments);
        graphics.lineTo(cx, cy);
      }
      graphics.strokePath();
    }
  }

  private getBounds(vertices: Matter.Vector[]): { minX: number; maxX: number; minY: number; maxY: number } {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const v of vertices) {
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
    return { minX, maxX, minY, maxY };
  }

  private getCenter(vertices: Matter.Vector[]): { x: number; y: number } {
    const bounds = this.getBounds(vertices);
    return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  }

  applyDamage(
    body: Matter.Body,
    damage: number,
    impactX: number,
    impactY: number,
    ammoType: string,
    materialModifiers: Record<string, number>
  ): { destroyed: boolean; healthRemaining: number } {
    const block = this.blocks.get(body);
    if (!block || block.currentHealth <= 0) {
      return { destroyed: false, healthRemaining: 0 };
    }

    const material = block.material;
    const modifier = materialModifiers[material] || 1;
    const actualDamage = damage * modifier;

    block.currentHealth = Math.max(0, block.currentHealth - actualDamage);

    // Update damage state
    const healthRatio = block.currentHealth / block.maxHealth;
    let newDamageState = 0;
    const materialKey = material.toUpperCase() as keyof typeof GAME_CONFIG.MATERIALS;
    if (healthRatio < GAME_CONFIG.MATERIALS[materialKey].breakThreshold) {
      newDamageState = 2;
    } else if (healthRatio < 0.7) {
      newDamageState = 1;
    }

    if (newDamageState !== block.damageState) {
      block.damageState = newDamageState;
      this.drawBlock(block.graphics, body, material, newDamageState);
    }

    // Play impact sound
    this.audioSystem?.playImpact(material, actualDamage / block.maxHealth);

    // Emit impact particles
    this.effectsSystem?.emitImpact(impactX, impactY, material, actualDamage / block.maxHealth);

    // Check for destruction
    if (block.currentHealth <= 0 && !block.debrisSpawned) {
      this.destroyBlock(block, impactX, impactY, ammoType);
      return { destroyed: true, healthRemaining: 0 };
    }

    return { destroyed: false, healthRemaining: block.currentHealth };
  }

  private destroyBlock(block: DestructibleBlock, impactX: number, impactY: number, ammoType: string): void {
    block.debrisSpawned = true;
    block.body.isStatic = false;
    Matter.Sleeping.set(block.body, false);

    // Apply impulse away from impact
    const center = Matter.Body.getCentre(block.body);
    const angle = Math.atan2(center.y - impactY, center.x - impactX);
    const force = 0.02 * block.body.mass;
    Matter.Body.applyForce(block.body, center, { x: Math.cos(angle) * force, y: Math.sin(angle) * force });

    // Create debris pieces
    this.createDebris(block, impactX, impactY);

    // Hide graphics after delay
    this.scene.time.delayedCall(5000, () => {
      if (block.graphics.active) {
        block.graphics.destroy();
      }
    });

    // Remove from blocks map after physics settles
    this.scene.time.delayedCall(10000, () => {
      this.blocks.delete(block.body);
    });

    // Check support failure
    if (block.isSupport) {
      this.checkSupportFailure(block);
    }
  }

  private createDebris(block: DestructibleBlock, impactX: number, impactY: number): void {
    const bounds = this.getBounds(block.body.vertices);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const pieceCount = Phaser.Math.Between(3, 6);

    for (let i = 0; i < pieceCount; i++) {
      const px = Phaser.Math.Between(bounds.minX + 2, bounds.maxX - 2);
      const py = Phaser.Math.Between(bounds.minY + 2, bounds.maxY - 2);
      const size = Phaser.Math.Between(8, Math.max(width, height) / 2);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const speed = Phaser.Math.Between(50, 150);

      this.effectsSystem?.createDebrisPiece(px, py, block.material, size, angle, speed);
    }
  }

  private checkSupportFailure(destroyedSupport: DestructibleBlock): void {
    // Find blocks that were supported by this one
    for (const [body, block] of this.blocks) {
      if (block.currentHealth <= 0 || block === destroyedSupport) continue;
      
      const supportCenter = Matter.Body.getCentre(destroyedSupport.body);
      const blockCenter = Matter.Body.getCentre(block.body);
      
      // Check if block is above the destroyed support
      if (blockCenter.y < supportCenter.y && 
          Math.abs(blockCenter.x - supportCenter.x) < 80) {
        // This block may fall
        this.scene.time.delayedCall(Phaser.Math.Between(500, 1500), () => {
          if (block.currentHealth > 0 && block.body.isStatic) {
            this.makeBlockFall(block);
          }
        });
      }
    }
  }

  makeBlockFall(block: DestructibleBlock): void {
    block.body.isStatic = false;
    Matter.Sleeping.set(block.body, false);
    
    // Apply slight random horizontal force
    const force = 0.005 * block.body.mass * Phaser.Math.FloatBetween(-1, 1);
    Matter.Body.applyForce(block.body, Matter.Body.getCentre(block.body), { x: force, y: 0 });
    
    this.effectsSystem?.screenShake(0.5);
  }

  createSupportConstraint(bodyA: Matter.Body, bodyB: Matter.Body, stiffness: number = 0.8): void {
    const constraint = this.matter.add.constraint(bodyA, bodyB, 0, stiffness, {
      label: 'support',
      render: { visible: false },
    });
    this.supportConstraints.push(constraint);
  }

  update(delta: number): void {
    // Check for overstressed constraints
    for (let i = this.supportConstraints.length - 1; i >= 0; i--) {
      const constraint = this.supportConstraints[i];
      if (constraint.bodyA && constraint.bodyB) {
        const force = Math.abs(constraint.bodyA.position.x - constraint.bodyB.position.x) * constraint.stiffness;
        if (force > 50) {
          // Constraint breaks
          this.matter.world.removeConstraint(constraint);
          this.supportConstraints.splice(i, 1);
          
          // Make bodies fall
          if (constraint.bodyA.isStatic) {
            this.makeBodyFall(constraint.bodyA);
          }
          if (constraint.bodyB.isStatic) {
            this.makeBodyFall(constraint.bodyB);
          }
        }
      }
    }
  }

  private makeBodyFall(body: Matter.Body): void {
    const block = this.blocks.get(body);
    if (block && block.currentHealth > 0) {
      body.isStatic = false;
      Matter.Sleeping.set(body, false);
      const force = 0.005 * body.mass * Phaser.Math.FloatBetween(-1, 1);
      Matter.Body.applyForce(body, Matter.Body.getCentre(body), { x: force, y: 0 });
    }
  }

  getBlockAt(x: number, y: number): DestructibleBlock | null {
    const bodies = Matter.Query.point(Array.from(this.blocks.keys()), { x, y });
    if (bodies.length > 0) {
      return this.blocks.get(bodies[0]) || null;
    }
    return null;
  }

  getAllBlocks(): DestructibleBlock[] {
    return Array.from(this.blocks.values());
  }

  getRemainingHealth(): number {
    let total = 0;
    let current = 0;
    for (const block of this.blocks.values()) {
      total += block.maxHealth;
      current += block.currentHealth;
    }
    return total > 0 ? current / total : 0;
  }

  clear(): void {
    for (const block of this.blocks.values()) {
      block.graphics.destroy();
      this.matter.world.removeBody(block.body);
    }
    this.blocks.clear();

    for (const constraint of this.supportConstraints) {
      this.matter.world.removeConstraint(constraint);
    }
    this.supportConstraints = [];
  }

  destroy(): void {
    this.clear();
  }
}
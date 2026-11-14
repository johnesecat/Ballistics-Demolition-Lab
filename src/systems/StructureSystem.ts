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
  // Advanced destruction properties
  bendAmount: number;           // How much the metal has bent (0-1)
  meltAmount: number;           // How much has melted (0-1)
  deformation: Matter.Vector[]; // Current deformed vertex positions
  thermalEnergy: number;        // Accumulated heat for melting
  structuralIntegrity: number;  // Overall structural strength (0-1)
  bendDirection: number;        // Angle of bending
  plasticDeformation: number;   // Permanent deformation amount
  fracturePoints: Matter.Vector[]; // Points where fractures occurred
  isMelting: boolean;           // Currently melting
  meltStartTime: number;        // When melting started
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
      // Advanced destruction properties
      bendAmount: 0,
      meltAmount: 0,
      deformation: body.vertices.map(v => ({ x: v.x, y: v.y })),
      thermalEnergy: 0,
      structuralIntegrity: 1,
      bendDirection: 0,
      plasticDeformation: 0,
      fracturePoints: [],
      isMelting: false,
      meltStartTime: 0,
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
    const block = this.blocks.get(body);
    if (!block) return;
    
    graphics.clear();
    const materialKey = material.toUpperCase() as keyof typeof GAME_CONFIG.MATERIALS;
    const baseColor = GAME_CONFIG.MATERIALS[materialKey].color;
    
    // Use deformed vertices if available, otherwise use current body vertices
    const vertices = block.deformation.length > 0 ? block.deformation : body.vertices;
    
    // Calculate color based on damage, heat, and melting
    let r = (baseColor >> 16) & 0xff;
    let g = (baseColor >> 8) & 0xff;
    let b = baseColor & 0xff;
    
    // Damage darkening
    const damageDarken = damageState * 0.15;
    r *= (1 - damageDarken);
    g *= (1 - damageDarken);
    b *= (1 - damageDarken);
    
    // Thermal glow effect
    if (block.thermalEnergy > 0) {
      const heatIntensity = Math.min(1, block.thermalEnergy / 1000);
      r = Math.min(255, r + 150 * heatIntensity);
      g = Math.max(0, g - 50 * heatIntensity);
      b = Math.max(0, b - 80 * heatIntensity);
    }
    
    // Melting effect - whitening
    if (block.meltAmount > 0) {
      const meltIntensity = block.meltAmount;
      r = Math.min(255, r + 100 * meltIntensity);
      g = Math.min(255, g + 100 * meltIntensity);
      b = Math.min(255, b + 100 * meltIntensity);
    }
    
    const damagedColor = (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
    
    // Draw deformed shape
    graphics.fillStyle(damagedColor, 1);
    graphics.fillPoints(vertices.map(v => ({ x: v.x, y: v.y })), true);
    
    // Draw bending visualization for metal
    if ((material === 'steel' || material === 'armor') && block.bendAmount > 0.1) {
      this.drawBendingEffect(graphics, vertices, block);
    }
    
    // Draw melting effect
    if (block.meltAmount > 0.1) {
      this.drawMeltingEffect(graphics, vertices, block);
    }
    
    // Draw fracture lines
    if (block.fracturePoints.length > 0) {
      this.drawFractures(graphics, block.fracturePoints);
    }
    
    // Add material-specific details
    this.drawMaterialDetails(graphics, vertices, material, damageState);
    
    // Damage cracks
    if (damageState > 0) {
      this.drawCracks(graphics, vertices, damageState);
    }
    
    // Support indicator
    if (block.isSupport) {
      graphics.lineStyle(2, GAME_CONFIG.COLORS.WARNING, 0.8);
      const center = this.getCenter(vertices);
      graphics.strokeCircle(center.x, center.y, 8);
    }
    
    // Structural integrity indicator
    if (block.structuralIntegrity < 0.5) {
      this.drawIntegrityWarning(graphics, vertices, block);
    }
  }
  
  private drawBendingEffect(
    graphics: Phaser.GameObjects.Graphics,
    vertices: Matter.Vector[],
    block: DestructibleBlock
  ): void {
    const centerX = vertices.reduce((sum, v) => sum + v.x, 0) / vertices.length;
    const centerY = vertices.reduce((sum, v) => sum + v.y, 0) / vertices.length;
    
    // Draw stress lines showing bending direction
    graphics.lineStyle(2, 0xffaa00, 0.6 * block.bendAmount);
    const perpX = -Math.sin(block.bendDirection);
    const perpY = Math.cos(block.bendDirection);
    
    for (let i = 0; i < 5; i++) {
      const t = (i + 1) / 6;
      const x = centerX + perpX * 30 * (t - 0.5);
      const y = centerY + perpY * 30 * (t - 0.5);
      graphics.beginPath();
      graphics.moveTo(x - Math.cos(block.bendDirection) * 15, y - Math.sin(block.bendDirection) * 15);
      graphics.lineTo(x + Math.cos(block.bendDirection) * 15, y + Math.sin(block.bendDirection) * 15);
      graphics.strokePath();
    }
    
    // Draw deformation outline
    graphics.lineStyle(1, 0xff8800, 0.4);
    graphics.strokePoints(vertices.map(v => ({ x: v.x, y: v.y })), true);
  }
  
  private drawMeltingEffect(
    graphics: Phaser.GameObjects.Graphics,
    vertices: Matter.Vector[],
    block: DestructibleBlock
  ): void {
    // Dripping melt effect
    const centerX = vertices.reduce((sum, v) => sum + v.x, 0) / vertices.length;
    const centerY = vertices.reduce((sum, v) => sum + v.y, 0) / vertices.length;
    const bounds = this.getBounds(vertices);
    
    graphics.fillStyle(0xffffff, 0.7 * block.meltAmount);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dripLength = 10 + Math.random() * 20 * block.meltAmount;
      const x = centerX + Math.cos(angle) * (bounds.maxX - bounds.minX) / 2;
      const y = bounds.maxY + Math.random() * dripLength;
      
      graphics.beginPath();
      graphics.moveTo(x, bounds.maxY);
      graphics.quadraticCurveTo(x + (Math.random() - 0.5) * 5, y - dripLength * 0.5, x, y);
      graphics.strokePath();
    }
    
    // Molten glow
    graphics.fillStyle(0xff8800, 0.5 * block.meltAmount);
    graphics.fillCircle(centerX, centerY, Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2);
  }
  
  private drawFractures(
    graphics: Phaser.GameObjects.Graphics,
    fracturePoints: Matter.Vector[]
  ): void {
    graphics.lineStyle(2, 0x444444, 0.8);
    for (let i = 0; i < fracturePoints.length - 1; i++) {
      graphics.beginPath();
      graphics.moveTo(fracturePoints[i].x, fracturePoints[i].y);
      graphics.lineTo(fracturePoints[i + 1].x, fracturePoints[i + 1].y);
      graphics.strokePath();
    }
  }
  
  private drawIntegrityWarning(
    graphics: Phaser.GameObjects.Graphics,
    vertices: Matter.Vector[],
    block: DestructibleBlock
  ): void {
    const centerX = vertices.reduce((sum, v) => sum + v.x, 0) / vertices.length;
    const centerY = vertices.reduce((sum, v) => sum + v.y, 0) / vertices.length;
    
    // Pulsing warning ring
    const pulse = Math.sin(this.scene.time.now * 0.01) * 0.3 + 0.7;
    graphics.lineStyle(3, 0xff3344, 0.8 * pulse * (1 - block.structuralIntegrity));
    graphics.strokeCircle(centerX, centerY, 15 + 10 * (1 - block.structuralIntegrity));
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
    
    // === ADVANCED DESTRUCTION PHYSICS ===
    
    // Calculate impact vector and angle
    const center = Matter.Body.getCentre(body);
    const impactAngle = Math.atan2(impactY - center.y, impactX - center.x);
    const impactForce = actualDamage / block.maxHealth;
    
    // 1. THERMAL ENERGY ACCUMULATION
    // Certain ammo types add thermal energy (HE, Thermal, Meltdown, etc.)
    const thermalAmmoTypes = ['he_blast', 'he_demolition', 'thermal', 'meltdown', 'emberpiercer', 'rainmaker', 'crownburst', 'popcorn_burst'];
    if (thermalAmmoTypes.includes(ammoType)) {
      block.thermalEnergy += actualDamage * 0.5;
      
      // Heat dissipates slowly
      if (!block.isMelting && block.thermalEnergy > 500) {
        block.isMelting = true;
        block.meltStartTime = this.scene.time.now;
      }
    }
    
    // 2. METAL BENDING (for steel and armor)
    if ((material === 'steel' || material === 'armor') && impactForce > 0.1) {
      // Soft rounds and heavy impacts cause bending
      const bendingAmmoTypes = ['soft_nose', 'pancake', 'petal', 'bonded_mushroom', 'heavy_soft_shot', 'anvil', 'pressure_hammer', 'wedge'];
      const isBendingAmmo = bendingAmmoTypes.includes(ammoType);
      const bendMultiplier = isBendingAmmo ? 2.0 : (material === 'steel' ? 0.5 : 0.3);
      
      // Apply bending
      block.bendAmount = Math.min(1, block.bendAmount + impactForce * bendMultiplier * 0.3);
      block.bendDirection = impactAngle;
      block.plasticDeformation = Math.min(1, block.plasticDeformation + impactForce * 0.2);
      block.structuralIntegrity = Math.max(0, block.structuralIntegrity - impactForce * 0.15);
      
      // Deform vertices based on bending
      this.applyBendingDeformation(block, impactAngle, impactForce * bendMultiplier);
      
      // Add fracture points at high stress areas
      if (block.bendAmount > 0.5 && Math.random() < 0.3) {
        this.addFracturePoint(block, impactX, impactY);
      }
    }
    
    // 3. MELTING PHYSICS
    if (block.isMelting) {
      const meltTime = this.scene.time.now - block.meltStartTime;
      const meltRate = 0.0001; // per ms
      block.meltAmount = Math.min(1, meltTime * meltRate * (block.thermalEnergy / 500));
      
      // Melting reduces structural integrity
      block.structuralIntegrity *= (1 - block.meltAmount * 0.5);
      
      // Apply melting deformation (vertices sag downward)
      this.applyMeltingDeformation(block);
      
      // Emit thermal glow particles
      this.effectsSystem?.emitThermalGlow(center.x, center.y, 30);
    }
    
    // 4. MELTDOWN SPECIFIC - 2 second white-hot melting
    if (ammoType === 'meltdown') {
      block.thermalEnergy += 2000; // Instant high heat
      block.isMelting = true;
      block.meltStartTime = this.scene.time.now;
      
      // Create intense melting zone
      this.createMeltdownZone(impactX, impactY, block);
    }
    
    // 5. IMPULSE-BASED DEFORMATION (kinetic impacts)
    const kineticAmmoTypes = ['ap_solid_shot', 'apc_capped', 'apbc_ballistic_cap', 'apcbc_combined_caps', 'apcr_round', 'apds_sabot', 'finned_dart', 'ap_breaker', 'drillhead'];
    if (kineticAmmoTypes.includes(ammoType)) {
      // High velocity impacts cause localized deformation
      this.applyKineticDeformation(block, impactX, impactY, impactAngle, impactForce);
    }
    
    // 6. EXPLOSIVE DEFORMATION (HE, HESH, etc.)
    const explosiveAmmoTypes = ['he_blast', 'he_demolition', 'fragmentation', 'hesh_round', 'broadhead', 'scab_lifter', 'shock', 'quake', 'rainmaker', 'crownburst', 'popcorn_burst', 'pressure_hammer', 'foundation_breaker', 'obstacle_reducer'];
    if (explosiveAmmoTypes.includes(ammoType)) {
      this.applyExplosiveDeformation(block, impactX, impactY, impactForce);
    }
    
    // 7. HESH SPALLING - rear face fragmentation
    if (['hesh_round', 'broadhead', 'scab_lifter', 'ribbon_hesh', 'echo_hesh'].includes(ammoType)) {
      this.applyHESHSpalling(block, impactX, impactY, impactAngle);
    }
    
    // Update damage state based on health AND structural integrity
    const healthRatio = block.currentHealth / block.maxHealth;
    const integrityRatio = block.structuralIntegrity;
    const combinedRatio = (healthRatio + integrityRatio) / 2;
    
    let newDamageState = 0;
    const materialKey = material.toUpperCase() as keyof typeof GAME_CONFIG.MATERIALS;
    const breakThreshold = GAME_CONFIG.MATERIALS[materialKey].breakThreshold;
    
    if (combinedRatio < breakThreshold || block.meltAmount > 0.8) {
      newDamageState = 2;
    } else if (combinedRatio < 0.7) {
      newDamageState = 1;
    }
    
    if (newDamageState !== block.damageState) {
      block.damageState = newDamageState;
    }
    
    // Always redraw with new deformation
    this.drawBlock(block.graphics, body, material, block.damageState);
    
    // Play impact sound
    this.audioSystem?.playImpact(material, actualDamage / block.maxHealth);
    
    // Emit impact particles with deformation info
    this.effectsSystem?.emitImpact(impactX, impactY, material, actualDamage / block.maxHealth);
    
    // Check for destruction (health OR structural failure OR complete melting)
    if (block.currentHealth <= 0 || block.structuralIntegrity <= 0.05 || block.meltAmount >= 1) {
      this.destroyBlock(block, impactX, impactY, ammoType);
      return { destroyed: true, healthRemaining: 0 };
    }
    
    return { destroyed: false, healthRemaining: block.currentHealth };
  }
  
  private applyBendingDeformation(block: DestructibleBlock, impactAngle: number, force: number): void {
    const vertices = block.deformation;
    const center = this.getCenter(vertices);
    const perpX = -Math.sin(impactAngle);
    const perpY = Math.cos(impactAngle);
    
    // Bend vertices along the perpendicular axis
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      const localX = v.x - center.x;
      const localY = v.y - center.y;
      const projection = localX * perpX + localY * perpY;
      
      // Bend amount based on distance from neutral axis
      const bendOffset = projection * force * 0.1 * block.bendAmount;
      v.x += perpX * bendOffset;
      v.y += perpY * bendOffset;
    }
    
    // Update Matter.js body vertices to match (approximate)
    if (block.bendAmount > 0.3) {
      // For severe bending, recreate body with deformed shape
      this.updateBodyFromDeformation(block);
    }
  }
  
  private applyMeltingDeformation(block: DestructibleBlock): void {
    const vertices = block.deformation;
    const bounds = this.getBounds(vertices);
    const centerY = (bounds.minY + bounds.maxY) / 2;
    
    // Vertices sag downward based on melt amount
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      const normalizedY = (v.y - bounds.minY) / (bounds.maxY - bounds.minY);
      
      // Lower parts melt more
      const sagAmount = block.meltAmount * 5 * normalizedY;
      v.y += sagAmount;
      
      // Add some randomization for organic melting look
      v.x += (Math.random() - 0.5) * block.meltAmount * 2;
    }
    
    this.updateBodyFromDeformation(block);
  }
  
  private applyKineticDeformation(block: DestructibleBlock, impactX: number, impactY: number, impactAngle: number, force: number): void {
    const vertices = block.deformation;
    
    // Create localized crater/deformation at impact point
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      const dist = Math.sqrt((v.x - impactX) ** 2 + (v.y - impactY) ** 2);
      const maxRadius = 30;
      
      if (dist < maxRadius) {
        const falloff = 1 - dist / maxRadius;
        const pushBack = force * falloff * 2;
        
        v.x -= Math.cos(impactAngle) * pushBack;
        v.y -= Math.sin(impactAngle) * pushBack;
      }
    }
    
    this.updateBodyFromDeformation(block);
  }
  
  private applyExplosiveDeformation(block: DestructibleBlock, impactX: number, impactY: number, force: number): void {
    const vertices = block.deformation;
    
    // Explosive forces push vertices outward radially
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      const dist = Math.sqrt((v.x - impactX) ** 2 + (v.y - impactY) ** 2);
      const maxRadius = 60;
      
      if (dist < maxRadius && dist > 1) {
        const falloff = 1 - dist / maxRadius;
        const pushOut = force * falloff * 3;
        
        const angle = Math.atan2(v.y - impactY, v.x - impactX);
        v.x += Math.cos(angle) * pushOut;
        v.y += Math.sin(angle) * pushOut;
      }
    }
    
    // Add fracture points around explosion
    for (let i = 0; i < 4; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 20 + Math.random() * 30;
      this.addFracturePoint(block, 
        impactX + Math.cos(angle) * radius,
        impactY + Math.sin(angle) * radius
      );
    }
    
    this.updateBodyFromDeformation(block);
  }
  
  private applyHESHSpalling(block: DestructibleBlock, impactX: number, impactY: number, impactAngle: number): void {
    // HESH causes rear-face spalling - fragments shoot out from back side
    const vertices = block.deformation;
    const bounds = this.getBounds(vertices);
    const center = this.getCenter(vertices);
    
    // Calculate rear face (opposite impact direction)
    const rearX = center.x + Math.cos(impactAngle) * (bounds.maxX - bounds.minX) / 2;
    const rearY = center.y + Math.sin(impactAngle) * (bounds.maxY - bounds.minY) / 2;
    
    // Create spall fragments at rear
    for (let i = 0; i < 6; i++) {
      const angle = impactAngle + Math.PI + (Math.random() - 0.5) * Math.PI / 2;
      const speed = 100 + Math.random() * 200;
      
      this.effectsSystem?.emitSpall(rearX, rearY, Phaser.Math.RadToDeg(angle), 1);
    }
    
    // Damage rear vertices
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      const dist = Math.sqrt((v.x - rearX) ** 2 + (v.y - rearY) ** 2);
      
      if (dist < 40) {
        v.x += (Math.random() - 0.5) * 5;
        v.y += (Math.random() - 0.5) * 5;
      }
    }
    
    this.addFracturePoint(block, rearX, rearY);
    this.updateBodyFromDeformation(block);
  }
  
  private updateBodyFromDeformation(block: DestructibleBlock): void {
    // Note: Matter.js doesn't easily support dynamic vertex updates for static bodies
    // For now, we track deformation visually. For dynamic bodies, we could recreate.
    // This is a visual deformation system that feeds into destruction logic.
  }
  
  private addFracturePoint(block: DestructibleBlock, x: number, y: number): void {
    block.fracturePoints.push({ x, y });
    // Limit fracture points
    if (block.fracturePoints.length > 20) {
      block.fracturePoints.shift();
    }
  }
  
  private createMeltdownZone(x: number, y: number, sourceBlock: DestructibleBlock): void {
    // Find nearby steel/armor blocks and start melting them
    for (const [body, block] of this.blocks) {
      if (block === sourceBlock) continue;
      if (block.material !== 'steel' && block.material !== 'armor') continue;
      
      const center = Matter.Body.getCentre(body);
      const dist = Math.sqrt((center.x - x) ** 2 + (center.y - y) ** 2);
      
      if (dist < 80) {
        block.thermalEnergy += 1500 / (dist * 0.1);
        if (!block.isMelting && block.thermalEnergy > 500) {
          block.isMelting = true;
          block.meltStartTime = this.scene.time.now;
        }
      }
    }
    
    // Visual effect
    this.effectsSystem?.emitThermalGlow(x, y, 50);
    this.effectsSystem?.screenShake(1);
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
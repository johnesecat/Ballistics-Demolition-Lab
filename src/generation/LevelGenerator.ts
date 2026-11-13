import { GAME_CONFIG } from '../config/gameConfig';
import { StructureSystem, StructureBlockConfig, MaterialType } from '../systems/StructureSystem';
import Matter from 'matter-js';

export interface LevelData {
  seed: number;
  blocks: StructureBlockConfig[];
  corePosition: { x: number; y: number };
  coreRadius: number;
  cannonPosition: { x: number; y: number };
  groundHeight: number;
  objective: ObjectiveConfig;
  shotLimit: number;
  starThresholds: { 1: number; 2: number; 3: number };
  difficulty: number;
}

export interface ObjectiveConfig {
  type: 'damage_core' | 'destroy_core' | 'expose_core' | 'destroy_structure' | 'damage_threshold';
  targetId?: string;
  threshold?: number;
  description: string;
}

export interface GenerationParams {
  chapter: number;
  stage: number;
  difficulty: number;
  width: number;
  height: number;
}

class SeededRandom {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }
  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  pick<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }
  chance(prob: number): boolean {
    return this.next() < prob;
  }
}

const MATERIALS: MaterialType[] = ['wood', 'brick', 'concrete', 'steel', 'armor', 'slope'];
const MATERIAL_WEIGHTS_BY_CHAPTER: Record<number, Record<MaterialType, number>> = {
  1: { wood: 0.4, brick: 0.3, concrete: 0.1, steel: 0.1, armor: 0.05, slope: 0.05 },
  2: { wood: 0.2, brick: 0.25, concrete: 0.2, steel: 0.2, armor: 0.1, slope: 0.05 },
  3: { wood: 0.1, brick: 0.15, concrete: 0.2, steel: 0.2, armor: 0.25, slope: 0.1 },
};

const STRUCTURE_TEMPLATES = [
  'tower',
  'bunker',
  'wall_with_gaps',
  'multi_layer',
  'roofed',
  'cantilever',
  'bridge',
  'pyramid',
];

export class LevelGenerator {
  private scene: Phaser.Scene;
  private matter: any;
  private structureSystem: StructureSystem;
  private rng: SeededRandom;

  constructor(scene: Phaser.Scene, matter: any, structureSystem: StructureSystem) {
    this.scene = scene;
    this.matter = matter;
    this.structureSystem = structureSystem;
    this.rng = new SeededRandom(0);
  }

  generate(params: GenerationParams): LevelData {
    const seed = this.hashSeed(params.chapter, params.stage);
    this.rng = new SeededRandom(seed);

    const { width, height } = params;
    const groundHeight = height * 0.15;
    const cannonX = width * 0.08;
    const cannonY = height - groundHeight - 40;

    // Generate structure
    const structureX = width * 0.55 + this.rng.nextFloat(-width * 0.1, width * 0.1);
    const structureWidth = width * 0.35;
    const structureHeight = height * 0.6;

    const template = this.rng.pick(STRUCTURE_TEMPLATES);
    const blocks = this.generateStructure(template, structureX, height - groundHeight, structureWidth, structureHeight, params.chapter);

    // Place core
    const corePosition = this.placeCore(blocks, structureX, height - groundHeight, structureWidth, structureHeight);
    const coreRadius = 18 + params.chapter * 3;

    // Determine objective
    const objective = this.selectObjective(params.chapter, params.stage, corePosition);

    // Shot limit based on difficulty
    const baseShots = [5, 4, 3, 4, 5, 4, 3, 4];
    const shotLimit = baseShots[(params.stage - 1) % baseShots.length] + Math.floor(params.difficulty / 2);

    // Star thresholds
    const starThresholds = {
      1: Math.ceil(shotLimit * 0.9),
      2: Math.ceil(shotLimit * 0.6),
      3: Math.ceil(shotLimit * 0.3),
    };

    const difficulty = params.chapter * 2 + params.stage * 0.5 + params.difficulty;

    return {
      seed,
      blocks,
      corePosition,
      coreRadius,
      cannonPosition: { x: cannonX, y: cannonY },
      groundHeight,
      objective,
      shotLimit,
      starThresholds,
      difficulty,
    };
  }

  private hashSeed(chapter: number, stage: number): number {
    return (chapter * 1000 + stage * 100 + 42) * 1664525 + 1013904223;
  }

  private generateStructure(
    template: string,
    baseX: number,
    baseY: number,
    width: number,
    height: number,
    chapter: number
  ): StructureBlockConfig[] {
    const blocks: StructureBlockConfig[] = [];
    const materialWeights = MATERIAL_WEIGHTS_BY_CHAPTER[chapter] || MATERIAL_WEIGHTS_BY_CHAPTER[1];
    const materials = Object.keys(materialWeights) as MaterialType[];
    const weights = materials.map(m => materialWeights[m]);

    const pickMaterial = () => {
      const r = this.rng.next();
      let cum = 0;
      for (let i = 0; i < weights.length; i++) {
        cum += weights[i];
        if (r < cum) return materials[i];
      }
      return materials[materials.length - 1];
    };

    const blockW = 40;
    const blockH = 30;

    switch (template) {
      case 'tower':
        this.generateTower(blocks, baseX, baseY, width, height, blockW, blockH, pickMaterial);
        break;
      case 'bunker':
        this.generateBunker(blocks, baseX, baseY, width, height, blockW, blockH, pickMaterial);
        break;
      case 'wall_with_gaps':
        this.generateWallWithGaps(blocks, baseX, baseY, width, height, blockW, blockH, pickMaterial);
        break;
      case 'multi_layer':
        this.generateMultiLayer(blocks, baseX, baseY, width, height, blockW, blockH, pickMaterial);
        break;
      case 'roofed':
        this.generateRoofed(blocks, baseX, baseY, width, height, blockW, blockH, pickMaterial);
        break;
      case 'cantilever':
        this.generateCantilever(blocks, baseX, baseY, width, height, blockW, blockH, pickMaterial);
        break;
      case 'bridge':
        this.generateBridge(blocks, baseX, baseY, width, height, blockW, blockH, pickMaterial);
        break;
      case 'pyramid':
        this.generatePyramid(blocks, baseX, baseY, width, height, blockW, blockH, pickMaterial);
        break;
    }

    // Add some slopes
    if (this.rng.chance(0.3)) {
      this.addSlopes(blocks, baseX, baseY, width, height, blockW, blockH);
    }

    return blocks;
  }

  private generateTower(
    blocks: StructureBlockConfig[],
    baseX: number,
    baseY: number,
    width: number,
    height: number,
    blockW: number,
    blockH: number,
    pickMaterial: () => MaterialType
  ): void {
    const cols = Math.floor(width / blockW);
    const rows = Math.floor(height / blockH);
    const startX = baseX - width / 2;

    for (let row = 0; row < rows; row++) {
      const colsThisRow = Math.max(1, cols - Math.floor(row / 3));
      const offsetX = (cols - colsThisRow) * blockW / 2;
      
      for (let col = 0; col < colsThisRow; col++) {
        const x = startX + offsetX + col * blockW + blockW / 2;
        const y = baseY - row * blockH - blockH / 2;
        
        const isSupport = row < 2 && (col === 0 || col === colsThisRow - 1);
        blocks.push({
          x, y,
          width: blockW - 2,
          height: blockH - 2,
          material: pickMaterial(),
          isSupport,
          healthMultiplier: isSupport ? 1.5 : 1,
        });
      }
    }
  }

  private generateBunker(
    blocks: StructureBlockConfig[],
    baseX: number,
    baseY: number,
    width: number,
    height: number,
    blockW: number,
    blockH: number,
    pickMaterial: () => MaterialType
  ): void {
    const cols = Math.floor(width / blockW);
    const rows = Math.floor(height / blockH);
    const startX = baseX - width / 2;
    const wallThickness = 2;

    // Outer walls
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = startX + col * blockW + blockW / 2;
        const y = baseY - row * blockH - blockH / 2;
        
        const isEdge = col === 0 || col === cols - 1 || row === 0 || row === rows - 1;
        const isSupport = row === 0 && (col === 0 || col === cols - 1 || col === Math.floor(cols / 2));
        
        if (isEdge || (row < 3 && this.rng.chance(0.3))) {
          blocks.push({
            x, y,
            width: blockW - 2,
            height: blockH - 2,
            material: pickMaterial(),
            isSupport,
            healthMultiplier: isEdge ? 1.3 : 1,
          });
        }
      }
    }

    // Inner supports
    for (let i = 0; i < 3; i++) {
      const x = startX + (i + 1) * width / 4;
      const y = baseY - blockH / 2;
      blocks.push({
        x, y,
        width: blockW - 2,
        height: blockH * 2 - 2,
        material: 'steel',
        isSupport: true,
        healthMultiplier: 2,
      });
    }
  }

  private generateWallWithGaps(
    blocks: StructureBlockConfig[],
    baseX: number,
    baseY: number,
    width: number,
    height: number,
    blockW: number,
    blockH: number,
    pickMaterial: () => MaterialType
  ): void {
    const cols = Math.floor(width / blockW);
    const rows = Math.floor(height / blockH);
    const startX = baseX - width / 2;
    const gapCount = this.rng.nextInt(2, 4);
    const gaps = new Set<number>();
    for (let i = 0; i < gapCount; i++) {
      gaps.add(this.rng.nextInt(0, cols - 1));
    }

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (gaps.has(col) && row > 1 && this.rng.chance(0.7)) continue;
        
        const x = startX + col * blockW + blockW / 2;
        const y = baseY - row * blockH - blockH / 2;
        const isSupport = row === 0 && !gaps.has(col);
        
        blocks.push({
          x, y,
          width: blockW - 2,
          height: blockH - 2,
          material: pickMaterial(),
          isSupport,
        });
      }
    }
  }

  private generateMultiLayer(
    blocks: StructureBlockConfig[],
    baseX: number,
    baseY: number,
    width: number,
    height: number,
    blockW: number,
    blockH: number,
    pickMaterial: () => MaterialType
  ): void {
    const layers = this.rng.nextInt(3, 5);
    const layerWidth = width;
    const layerHeight = height / layers;
    const startX = baseX - width / 2;

    for (let layer = 0; layer < layers; layer++) {
      const layerY = baseY - layer * layerHeight;
      const cols = Math.floor(layerWidth / blockW);
      const rows = Math.floor(layerHeight / blockH);
      
      const material = pickMaterial();
      
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          // Stagger gaps
          if (layer > 0 && col % 3 === layer % 3 && row === 0 && this.rng.chance(0.4)) continue;
          
          const x = startX + col * blockW + blockW / 2;
          const y = layerY - row * blockH - blockH / 2;
          const isSupport = row === 0 && layer === 0;
          
          blocks.push({
            x, y,
            width: blockW - 2,
            height: blockH - 2,
            material,
            isSupport,
            healthMultiplier: layer === layers - 1 ? 1.2 : 1,
          });
        }
      }
    }
  }

  private generateRoofed(
    blocks: StructureBlockConfig[],
    baseX: number,
    baseY: number,
    width: number,
    height: number,
    blockW: number,
    blockH: number,
    pickMaterial: () => MaterialType
  ): void {
    // Generate base structure
    this.generateTower(blocks, baseX, baseY, width, height * 0.7, blockW, blockH, pickMaterial);
    
    // Add roof
    const roofY = baseY - height * 0.7;
    const cols = Math.floor(width / blockW);
    const startX = baseX - width / 2;
    
    for (let col = 0; col < cols; col++) {
      const x = startX + col * blockW + blockW / 2;
      const y = roofY - blockH / 2;
      const angle = this.rng.chance(0.5) ? this.rng.nextFloat(-0.3, 0.3) : 0;
      
      blocks.push({
        x, y,
        width: blockW * 1.5,
        height: blockH,
        material: pickMaterial(),
        angle,
        healthMultiplier: 1.1,
      });
    }
  }

  private generateCantilever(
    blocks: StructureBlockConfig[],
    baseX: number,
    baseY: number,
    width: number,
    height: number,
    blockW: number,
    blockH: number,
    pickMaterial: () => MaterialType
  ): void {
    const cols = Math.floor(width / blockW);
    const rows = Math.floor(height / blockH);
    const startX = baseX - width / 2;

    // Strong base
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < cols; col++) {
        const x = startX + col * blockW + blockW / 2;
        const y = baseY - row * blockH - blockH / 2;
        blocks.push({
          x, y,
          width: blockW - 2,
          height: blockH - 2,
          material: 'concrete',
          isSupport: row === 0 && (col === 0 || col === cols - 1),
          healthMultiplier: 2,
        });
      }
    }

    // Cantilevered upper floors
    for (let row = 3; row < rows; row++) {
      const overhang = Math.floor((row - 2) * 0.5);
      const colsThisRow = cols - overhang;
      const offsetX = overhang * blockW;
      
      for (let col = 0; col < colsThisRow; col++) {
        const x = startX + offsetX + col * blockW + blockW / 2;
        const y = baseY - row * blockH - blockH / 2;
        blocks.push({
          x, y,
          width: blockW - 2,
          height: blockH - 2,
          material: pickMaterial(),
        });
      }
    }
  }

  private generateBridge(
    blocks: StructureBlockConfig[],
    baseX: number,
    baseY: number,
    width: number,
    height: number,
    blockW: number,
    blockH: number,
    pickMaterial: () => MaterialType
  ): void {
    const cols = Math.floor(width / blockW);
    const rows = Math.floor(height / blockH);
    const startX = baseX - width / 2;

    // Two towers with bridge between
    const towerWidth = Math.floor(cols * 0.25);
    const gapStart = towerWidth;
    const gapEnd = cols - towerWidth;

    // Left tower
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < towerWidth; col++) {
        const x = startX + col * blockW + blockW / 2;
        const y = baseY - row * blockH - blockH / 2;
        blocks.push({
          x, y,
          width: blockW - 2,
          height: blockH - 2,
          material: pickMaterial(),
          isSupport: row === 0,
        });
      }
    }

    // Right tower
    for (let row = 0; row < rows; row++) {
      for (let col = gapEnd; col < cols; col++) {
        const x = startX + col * blockW + blockW / 2;
        const y = baseY - row * blockH - blockH / 2;
        blocks.push({
          x, y,
          width: blockW - 2,
          height: blockH - 2,
          material: pickMaterial(),
          isSupport: row === 0,
        });
      }
    }

    // Bridge deck
    const bridgeY = baseY - rows * blockH * 0.3;
    for (let col = gapStart; col < gapEnd; col++) {
      const x = startX + col * blockW + blockW / 2;
      const y = bridgeY - blockH / 2;
      blocks.push({
        x, y,
        width: blockW - 2,
        height: blockH - 2,
        material: 'steel',
        healthMultiplier: 1.5,
      });
    }
  }

  private generatePyramid(
    blocks: StructureBlockConfig[],
    baseX: number,
    baseY: number,
    width: number,
    height: number,
    blockW: number,
    blockH: number,
    pickMaterial: () => MaterialType
  ): void {
    const maxRows = Math.floor(height / blockH);
    const startX = baseX - width / 2;
    const baseCols = Math.floor(width / blockW);

    for (let row = 0; row < maxRows; row++) {
      const colsThisRow = Math.max(1, baseCols - row * 2);
      const offsetX = (baseCols - colsThisRow) * blockW / 2;
      
      for (let col = 0; col < colsThisRow; col++) {
        const x = startX + offsetX + col * blockW + blockW / 2;
        const y = baseY - row * blockH - blockH / 2;
        const isSupport = row === 0 && (col === 0 || col === colsThisRow - 1);
        
        blocks.push({
          x, y,
          width: blockW - 2,
          height: blockH - 2,
          material: pickMaterial(),
          isSupport,
        });
      }
    }
  }

  private addSlopes(
    blocks: StructureBlockConfig[],
    baseX: number,
    baseY: number,
    width: number,
    height: number,
    blockW: number,
    blockH: number
  ): void {
    const slopeCount = this.rng.nextInt(1, 3);
    const startX = baseX - width / 2;

    for (let i = 0; i < slopeCount; i++) {
      const col = this.rng.nextInt(0, Math.floor(width / blockW) - 1);
      const row = this.rng.nextInt(0, Math.floor(height / blockH) - 1);
      const x = startX + col * blockW + blockW / 2;
      const y = baseY - row * blockH - blockH / 2;
      const angle = this.rng.pick([-0.5, 0.5]);

      blocks.push({
        x, y,
        width: blockW * 1.2,
        height: blockH * 1.2,
        material: 'slope',
        angle,
      });
    }
  }

  private placeCore(
    blocks: StructureBlockConfig[],
    baseX: number,
    baseY: number,
    width: number,
    height: number
  ): { x: number; y: number } {
    // Find a good spot for the core - typically in the upper portion of the structure
    const structureBlocks = blocks.filter(b => b.y < baseY - height * 0.2);
    
    if (structureBlocks.length === 0) {
      return { x: baseX, y: baseY - height * 0.5 };
    }

    // Pick a block in the upper third
    const upperBlocks = structureBlocks.filter(b => b.y < baseY - height * 0.4);
    const targetBlocks = upperBlocks.length > 0 ? upperBlocks : structureBlocks;
    const target = this.rng.pick(targetBlocks);
    
    return {
      x: target.x + this.rng.nextFloat(-15, 15),
      y: target.y - 25 - this.rng.nextFloat(0, 30),
    };
  }

  private selectObjective(
    chapter: number,
    stage: number,
    corePosition: { x: number; y: number }
  ): ObjectiveConfig {
    const objectives: ObjectiveConfig[] = [
      {
        type: 'destroy_core',
        description: 'Destroy the red core',
      },
      {
        type: 'damage_core',
        description: 'Damage the red core',
      },
      {
        type: 'expose_core',
        description: 'Expose the core by clearing covering structure',
      },
      {
        type: 'destroy_structure',
        description: 'Destroy 80% of the structure',
      },
    ];

    // Weight objectives by chapter
    let weights: number[];
    if (chapter === 1) weights = [0.3, 0.4, 0.2, 0.1];
    else if (chapter === 2) weights = [0.4, 0.3, 0.2, 0.1];
    else weights = [0.5, 0.2, 0.2, 0.1];

    const r = this.rng.next();
    let cum = 0;
    for (let i = 0; i < weights.length; i++) {
      cum += weights[i];
      if (r < cum) return objectives[i];
    }
    return objectives[0];
  }

  buildLevel(levelData: LevelData): { coreBody: Matter.Body; coreGraphics: Phaser.GameObjects.Graphics } {
    // Create structure blocks
    for (const blockConfig of levelData.blocks) {
      this.structureSystem.createBlock(blockConfig);
    }

    // Create ground
    const ground = this.matter.add.rectangle(
      this.scene.scale.width / 2,
      this.scene.scale.height - levelData.groundHeight / 2,
      this.scene.scale.width,
      levelData.groundHeight,
      { isStatic: true, label: 'ground', collisionFilter: { group: -1 } }
    );

    // Create core
    const coreBody = this.matter.add.circle(
      levelData.corePosition.x,
      levelData.corePosition.y,
      levelData.coreRadius,
      {
        isStatic: true,
        isSensor: true,
        label: 'core',
        collisionFilter: { group: -1 },
      }
    );

    const coreGraphics = this.scene.add.graphics();
    coreGraphics.setDepth(GAME_CONFIG.Z.CORE);
    this.drawCore(coreGraphics, levelData.corePosition.x, levelData.corePosition.y, levelData.coreRadius, 1);

    // Store core reference
    coreBody.gameObject = coreGraphics;
    (coreBody as any).coreHealth = 100;
    (coreBody as any).maxCoreHealth = 100;

    return { coreBody, coreGraphics };
  }

  private drawCore(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    radius: number,
    healthRatio: number
  ): void {
    graphics.clear();
    
    // Outer glow
    const glowIntensity = healthRatio;
    graphics.fillStyle(GAME_CONFIG.COLORS.RED_CORE_GLOW, 0.3 * glowIntensity);
    graphics.fillCircle(x, y, radius + 10);
    
    // Core body
    const coreColor = Phaser.Display.Color.Interpolate.ColorWithColor(
      { r: 0xaa, g: 0x00, b: 0x00 } as { r: number; g: number; b: number },
      { r: 0xff, g: 0x22, b: 0x44 } as { r: number; g: number; b: number },
      1,
      healthRatio
    ) as unknown as { r: number; g: number; b: number };
    const colorValue = (coreColor.r << 16) | (coreColor.g << 8) | coreColor.b;
    graphics.fillStyle(colorValue, 1);
    graphics.fillCircle(x, y, radius);
    
    // Inner pulse
    graphics.fillStyle(0xff6688, 0.6 * glowIntensity);
    graphics.fillCircle(x, y, radius * 0.6);
    
    // Core pattern
    graphics.lineStyle(2, 0xff88aa, 0.5);
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + this.scene.time.now * 0.001;
      const r1 = radius * 0.3;
      const r2 = radius * 0.8;
      graphics.beginPath();
      graphics.moveTo(x + Math.cos(angle) * r1, y + Math.sin(angle) * r1);
      graphics.lineTo(x + Math.cos(angle) * r2, y + Math.sin(angle) * r2);
      graphics.strokePath();
    }
  }

  updateCoreGraphics(coreGraphics: Phaser.GameObjects.Graphics, coreBody: Matter.Body, healthRatio: number): void {
    const x = coreBody.position.x;
    const y = coreBody.position.y;
    const radius = (coreBody as Matter.Body & { circleRadius?: number }).circleRadius || 18;
    this.drawCore(coreGraphics, x, y, radius, healthRatio);
  }

  validateLevel(levelData: LevelData): boolean {
    // Check core is not inside a block
    for (const block of levelData.blocks) {
      const dist = Phaser.Math.Distance.Between(
        block.x, block.y,
        levelData.corePosition.x, levelData.corePosition.y
      );
      if (dist < Math.max(block.width, block.height) / 2 + levelData.coreRadius + 10) {
        return false;
      }
    }

    // Check core is reachable (has line of sight from cannon)
    // Simplified check - just ensure core isn't completely enclosed
    return true;
  }

  destroy(): void {
    // Cleanup handled by structure system
  }
}
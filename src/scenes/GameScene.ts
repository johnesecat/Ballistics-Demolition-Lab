import { Scene } from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { saveSystem } from '../systems/SaveSystem';
import { AudioSystem } from '../systems/AudioSystem';
import { EffectsSystem } from '../systems/EffectsSystem';
import { TrajectorySystem, FireMode } from '../systems/TrajectorySystem';
import { StructureSystem, DestructibleBlock } from '../systems/StructureSystem';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { LevelGenerator, LevelData } from '../generation/LevelGenerator';
import { getAmmoById, getAllAmmo } from '../ammo/ammoCatalogue';
import { AmmoDefinition } from '../ammo/ammoCatalogue';

export class GameScene extends Scene {
  private audioSystem!: AudioSystem;
  private effectsSystem!: EffectsSystem;
  private trajectorySystem!: TrajectorySystem;
  private structureSystem!: StructureSystem;
  private projectileSystem!: ProjectileSystem;
  private levelData!: LevelData;
  private chapter!: number;
  private stage!: number;

  // Game state
  private shotsRemaining: number = 0;
  private shotsUsed: number = 0;
  private currentAmmoIndex: number = 0;
  private loadout: string[] = [];
  private currentAmmo!: AmmoDefinition;
  private fireMode: FireMode = 'arc';
  private power: number = 200;
  private aimAngle: number = 0;
  private isAiming: boolean = false;
  private isFiring: boolean = false;
  private missionComplete: boolean = false;
  private missionFailed: boolean = false;
  private coreHealth: number = 100;
  private maxCoreHealth: number = 100;
  private coreBody!: Matter.Body;
  private coreGraphics!: Phaser.GameObjects.Graphics;
  private cannonGraphics!: Phaser.GameObjects.Graphics;
  private cannonPivot!: { x: number; y: number };
  private groundGraphics!: Phaser.GameObjects.Graphics;

  // UI Elements
  private hudContainer!: Phaser.GameObjects.Container;
  private shotsText!: Phaser.GameObjects.Text;
  private starsText!: Phaser.GameObjects.Text;
  private coreHealthBar!: Phaser.GameObjects.Graphics;
  private ammoSelector!: Phaser.GameObjects.Container;
  private modeSelector!: Phaser.GameObjects.Container;
  private powerSlider!: Phaser.GameObjects.Container;
  private fireButton!: Phaser.GameObjects.Container;
  private resetButton!: Phaser.GameObjects.Container;
  private menuButton!: Phaser.GameObjects.Container;
  private aimHandle!: Phaser.GameObjects.Container;
  private trajectoryWarningText!: Phaser.GameObjects.Text;
  private replayControls!: Phaser.GameObjects.Container;
  private replaySpeed: number = 1;
  private isReplaying: boolean = false;
  private replayTimer: number = 0;
  private replayDuration: number = 3000;

  // Input
  private aimStartPos!: { x: number; y: number };
  private powerStartValue: number = 0;
  private dragThreshold: number = 10;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: { chapter: number; stage: number; levelData: LevelData }): void {
    this.chapter = data.chapter;
    this.stage = data.stage;
    this.levelData = data.levelData;
  }

  create(): void {
    this.audioSystem = this.game.registry.get('audioSystem');
    
    // Initialize systems
    this.effectsSystem = new EffectsSystem(this);
    this.structureSystem = new StructureSystem(this, this.matter, this.effectsSystem, this.audioSystem);
    this.trajectorySystem = new TrajectorySystem(this, this.matter);
    this.projectileSystem = new ProjectileSystem(this, this.matter, this.effectsSystem, this.audioSystem, this.structureSystem);

    // Setup Matter collision events
    this.setupCollisions();

    // Build level
    this.buildLevel();

    // Setup game state
    this.shotsRemaining = this.levelData.shotLimit;
    this.shotsUsed = 0;
    this.loadout = saveSystem.getAmmoLoadout();
    this.currentAmmoIndex = 0;
    this.currentAmmo = getAmmoById(this.loadout[0]) || getAllAmmo()[0];
    this.power = Math.min(200, this.levelData.shotLimit * 50);
    this.aimAngle = -15;

    // Create UI
    this.createHUD();
    this.createCannon();
    this.createGround();
    this.setupInput();

    // Update trajectory
    this.updateTrajectory();

    // Record mission start
    saveSystem.setCurrentMission(this.chapter, this.stage);
    saveSystem.updateLastPlayed();
  }

  private setupCollisions(): void {
    this.matter.world.on('collisionstart', (event: Matter.IEventCollision<Matter.Engine>) => {
      const pairs = event.pairs;
      for (const pair of pairs) {
        const { bodyA, bodyB } = pair;
        
        // Projectile vs Structure
        if ((bodyA as any).isProjectile && bodyB.isStatic && bodyB.label?.startsWith('structure_')) {
          this.handleProjectileImpact(bodyA, bodyB, pair);
        } else if ((bodyB as any).isProjectile && bodyA.isStatic && bodyA.label?.startsWith('structure_')) {
          this.handleProjectileImpact(bodyB, bodyA, pair);
        }
        
        // Projectile vs Core
        if ((bodyA as any).isProjectile && (bodyB as any).label === 'core') {
          this.handleCoreHit(bodyA, bodyB, pair);
        } else if ((bodyB as any).isProjectile && (bodyA as any).label === 'core') {
          this.handleCoreHit(bodyB, bodyA, pair);
        }
        
        // Fragment/Pod vs Structure
        if ((bodyA as any).isFragment && bodyB.isStatic && bodyB.label?.startsWith('structure_')) {
          this.handleFragmentImpact(bodyA, bodyB, pair);
        } else if ((bodyB as any).isFragment && bodyA.isStatic && bodyA.label?.startsWith('structure_')) {
          this.handleFragmentImpact(bodyB, bodyA, pair);
        }
      }
    });
  }

  private handleProjectileImpact(projectileBody: Matter.Body, structureBody: Matter.Body, pair: Matter.Pair): void {
    const projectile = this.projectileSystem.getActiveProjectiles().find(p => p.body === projectileBody);
    if (!projectile) return;

    const impactPoint = {
      x: pair.supports[0]?.x || projectileBody.position.x,
      y: pair.supports[0]?.y || projectileBody.position.y,
    };
    const impactNormal = {
      x: pair.normal.x,
      y: pair.normal.y,
    };

    projectile.hitBodies.add(structureBody);
    this.projectileSystem.handleImpact(projectile, structureBody, impactPoint, impactNormal);
  }

  private handleCoreHit(projectileBody: Matter.Body, coreBody: Matter.Body, pair: Matter.Pair): void {
    const projectile = this.projectileSystem.getActiveProjectiles().find(p => p.body === projectileBody);
    if (!projectile) return;

    // Damage core
    const damage = projectile.ammo.stats.directDamage * 0.5 + projectile.ammo.stats.blastDamage * 0.3;
    this.coreHealth = Math.max(0, this.coreHealth - damage);
    this.updateCoreHealth();
    
    this.audioSystem.playCoreHit();
    this.effectsSystem.emitImpact(coreBody.position.x, coreBody.position.y, 'armor', 1);
    this.effectsSystem.screenShake(1.5);
    
    if (this.coreHealth <= 0) {
      this.audioSystem.playCoreDestroy();
      this.onCoreDestroyed();
    }

    projectile.state = 'finished';
  }

  private handleFragmentImpact(fragmentBody: Matter.Body, structureBody: Matter.Body, pair: Matter.Pair): void {
    const impactPoint = {
      x: pair.supports[0]?.x || fragmentBody.position.x,
      y: pair.supports[0]?.y || fragmentBody.position.y,
    };
    
    this.structureSystem.applyDamage(
      structureBody,
      15,
      impactPoint.x, impactPoint.y,
      'fragment',
      { steel: 0.5, armor: 0.3, brick: 1, wood: 1.2, concrete: 0.8, slopes: 1 }
    );
  }

  private onCoreDestroyed(): void {
    this.missionComplete = true;
    this.showResults(true);
  }

  private buildLevel(): void {
    const result = new LevelGenerator(this, this.matter, this.structureSystem).buildLevel(this.levelData);
    this.coreBody = result.coreBody;
    this.coreGraphics = result.coreGraphics;
    this.maxCoreHealth = (this.coreBody as any).maxCoreHealth || 100;
    this.coreHealth = this.maxCoreHealth;
    
    // Cannon position
    this.cannonPivot = {
      x: this.levelData.cannonPosition.x,
      y: this.levelData.cannonPosition.y,
    };
  }

  private createCannon(): void {
    this.cannonGraphics = this.add.graphics();
    this.cannonGraphics.setDepth(GAME_CONFIG.Z.STRUCTURE + 5);
    this.drawCannon();
  }

  private drawCannon(): void {
    const gfx = this.cannonGraphics;
    gfx.clear();
    
    const { x, y } = this.cannonPivot;
    const angle = Phaser.Math.DegToRad(this.aimAngle);
    const barrelLength = 80;
    const barrelWidth = 16;
    
    // Base
    gfx.fillStyle(0x2a3a4a, 1);
    gfx.fillEllipse(x, y + 10, 60, 30);
    gfx.fillStyle(0x1a2a3a, 1);
    gfx.fillEllipse(x, y + 5, 50, 25);
    
    // Barrel - draw rotated rectangle manually
    const bx = x + Math.cos(angle) * barrelLength/2;
    const by = y + Math.sin(angle) * barrelLength/2;
    
    const hw = barrelWidth / 2;
    const hl = barrelLength / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    const points = [
      { x: bx - cos * hl - sin * hw, y: by - sin * hl + cos * hw },
      { x: bx + cos * hl - sin * hw, y: by + sin * hl + cos * hw },
      { x: bx + cos * hl + sin * hw, y: by + sin * hl - cos * hw },
      { x: bx - cos * hl + sin * hw, y: by - sin * hl - cos * hw },
    ];
    
    gfx.fillStyle(0x3a4a5a, 1);
    gfx.fillPoints(points, true);
    
    // Muzzle brake
    const mx = x + Math.cos(angle) * (barrelLength/2 + 5);
    const my = y + Math.sin(angle) * (barrelLength/2 + 5);
    
    const mhw = (barrelWidth + 4) / 2;
    const mhl = 5;
    const mpoints = [
      { x: mx - cos * mhl - sin * mhw, y: my - sin * mhl + cos * mhw },
      { x: mx + cos * mhl - sin * mhw, y: my + sin * mhl + cos * mhw },
      { x: mx + cos * mhl + sin * mhw, y: my + sin * mhl - cos * mhw },
      { x: mx - cos * mhl + sin * mhw, y: my - sin * mhl - cos * mhw },
    ];
    
    gfx.fillStyle(0x4a5a6a, 1);
    gfx.fillPoints(mpoints, true);
  }

  private createGround(): void {
    this.groundGraphics = this.add.graphics();
    this.groundGraphics.setDepth(GAME_CONFIG.Z.TERRAIN);
    this.drawGround();
  }

  private drawGround(): void {
    const { width, height } = this.scale;
    const gfx = this.groundGraphics;
    gfx.clear();
    
    const groundY = height - this.levelData.groundHeight;
    
    // Ground fill
    const grad = gfx.fillStyle(0x0d1a2a, 1);
    gfx.fillRect(0, groundY, width, this.levelData.groundHeight);
    
    // Top line
    gfx.lineStyle(3, 0x1a3a4a, 1);
    gfx.beginPath();
    gfx.moveTo(0, groundY);
    gfx.lineTo(width, groundY);
    gfx.strokePath();
    
    // Grid texture
    gfx.lineStyle(1, 0x1a2a3a, 0.3);
    for (let x = 0; x < width; x += 40) {
      gfx.beginPath();
      gfx.moveTo(x, groundY);
      gfx.lineTo(x, height);
      gfx.strokePath();
    }
    for (let y = groundY; y < height; y += 40) {
      gfx.beginPath();
      gfx.moveTo(0, y);
      gfx.lineTo(width, y);
      gfx.strokePath();
    }
  }

  private createHUD(): void {
    const { width, height } = this.scale;
    const safePadding = GAME_CONFIG.SAFE_AREA_PADDING;

    this.hudContainer = this.add.container(0, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT);

    // Top-left: Shots & Stars
    const topLeftPanel = this.add.container(safePadding + 100, safePadding + 50).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    
    const shotsBg = this.add.graphics();
    shotsBg.fillStyle(GAME_CONFIG.COLORS.PANEL, 0.9);
    shotsBg.fillRoundedRect(-90, -25, 180, 50, 8);
    shotsBg.lineStyle(2, GAME_CONFIG.COLORS.PRIMARY, 0.3);
    shotsBg.strokeRoundedRect(-90, -25, 180, 50, 8);
    topLeftPanel.add(shotsBg);

    this.shotsText = this.add.text(0, -5, `SHOTS: ${this.shotsRemaining}/${this.levelData.shotLimit}`, {
      fontSize: '16px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
    topLeftPanel.add(this.shotsText);

    this.starsText = this.add.text(0, 15, `STARS: ${this.getStarTarget(1)}/${this.getStarTarget(2)}/${this.getStarTarget(3)}`, {
      fontSize: '12px',
      color: `#${GAME_CONFIG.COLORS.APHE_YELLOW.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
    topLeftPanel.add(this.starsText);

    this.hudContainer.add(topLeftPanel);

    // Top-right: Core Health
    const topRightPanel = this.add.container(width - safePadding - 100, safePadding + 50).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    
    const coreBg = this.add.graphics();
    coreBg.fillStyle(GAME_CONFIG.COLORS.PANEL, 0.9);
    coreBg.fillRoundedRect(-100, -25, 200, 50, 8);
    coreBg.lineStyle(2, GAME_CONFIG.COLORS.RED_CORE, 0.3);
    coreBg.strokeRoundedRect(-100, -25, 200, 50, 8);
    topRightPanel.add(coreBg);

    this.add.text(-80, -20, 'CORE', {
      fontSize: '12px',
      color: `#${GAME_CONFIG.COLORS.RED_CORE.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);

    this.coreHealthBar = this.add.graphics();
    this.coreHealthBar.setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
    topRightPanel.add(this.coreHealthBar);
    this.updateCoreHealthBar();

    this.hudContainer.add(topRightPanel);

    // Bottom-left: Ammo Selector
    this.ammoSelector = this.add.container(safePadding + 80, height - safePadding - 80).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    this.createAmmoSelector();

    // Bottom-center: Mode Selector
    this.modeSelector = this.add.container(width/2, height - safePadding - 80).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    this.createModeSelector();

    // Bottom-center-right: Power Slider
    this.powerSlider = this.add.container(width - safePadding - 180, height - safePadding - 80).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    this.createPowerSlider();

    // Bottom-right: Fire Button
    this.fireButton = this.add.container(width - safePadding - 80, height - safePadding - 140).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    this.createFireButton();

    // Top-right controls: Reset & Menu
    this.resetButton = this.add.container(width - safePadding - 60, safePadding + 120).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    this.createControlButton(this.resetButton, 'RESET', () => this.resetMission());

    this.menuButton = this.add.container(width - safePadding - 60, safePadding + 180).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    this.createControlButton(this.menuButton, 'MENU', () => this.pauseAndShowMenu());

    // Trajectory warning text
    this.trajectoryWarningText = this.add.text(width/2, height/2 - 100, 'HITS COVER FIRST', {
      fontSize: '24px',
      color: `#${GAME_CONFIG.COLORS.TRAJECTORY_WARNING.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_OVERLAY).setVisible(false);

    // Replay controls (hidden during gameplay)
    this.replayControls = this.add.container(width/2, height - safePadding - 60).setDepth(GAME_CONFIG.Z.UI_OVERLAY).setVisible(false);
    this.createReplayControls();
  }

  private getStarTarget(stars: number): number {
    const thresholds = this.levelData.starThresholds;
    return thresholds[stars as keyof typeof thresholds] || 0;
  }

  private updateCoreHealthBar(): void {
    const ratio = this.coreHealth / this.maxCoreHealth;
    const barWidth = 160;
    const barHeight = 12;
    
    this.coreHealthBar.clear();
    // Background
    this.coreHealthBar.fillStyle(0x331111, 1);
    this.coreHealthBar.fillRoundedRect(-barWidth/2, -barHeight/2, barWidth, barHeight, barHeight/2);
    // Health
    const color = ratio > 0.5 ? GAME_CONFIG.COLORS.SUCCESS : ratio > 0.25 ? GAME_CONFIG.COLORS.WARNING : GAME_CONFIG.COLORS.DANGER;
    this.coreHealthBar.fillStyle(color, 1);
    this.coreHealthBar.fillRoundedRect(-barWidth/2, -barHeight/2, barWidth * ratio, barHeight, barHeight/2);
  }

  private updateCoreHealth(): void {
    this.updateCoreHealthBar();
  }

  private createAmmoSelector(): void {
    const container = this.ammoSelector;
    const btnWidth = 140;
    const btnHeight = 50;
    
    // Left arrow
    const leftBtn = this.add.container(-btnWidth - 10, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    const leftBg = this.add.graphics();
    leftBg.fillStyle(GAME_CONFIG.COLORS.PANEL, 1);
    leftBg.fillRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 6);
    leftBg.lineStyle(2, GAME_CONFIG.COLORS.TEXT_DIM, 0.3);
    leftBg.strokeRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 6);
    leftBtn.add(leftBg);
    this.add.text(0, 0, '◀ AMMO', {
      fontSize: '14px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);
    leftBtn.setSize(btnWidth, btnHeight);
    leftBtn.setInteractive(new Phaser.Geom.Rectangle(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight), Phaser.Geom.Rectangle.Contains);
    leftBtn.on('pointerdown', () => this.cycleAmmo(-1));
    container.add(leftBtn);

    // Current ammo display
    const displayBg = this.add.graphics();
    displayBg.fillStyle(GAME_CONFIG.COLORS.PANEL, 1);
    displayBg.fillRoundedRect(-100, -btnHeight/2, 200, btnHeight, 6);
    displayBg.lineStyle(2, GAME_CONFIG.COLORS.PRIMARY, 0.5);
    displayBg.strokeRoundedRect(-100, -btnHeight/2, 200, btnHeight, 6);
    container.add(displayBg);

    this.add.text(0, -10, this.currentAmmo.name, {
      fontSize: '14px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      wordWrap: { width: 180 },
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);

    this.add.text(0, 10, this.currentAmmo.category.toUpperCase(), {
      fontSize: '11px',
      color: `#${GAME_CONFIG.COLORS.TEXT_DIM.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);

    // Right arrow
    const rightBtn = this.add.container(btnWidth + 10, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    const rightBg = this.add.graphics();
    rightBg.fillStyle(GAME_CONFIG.COLORS.PANEL, 1);
    rightBg.fillRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 6);
    rightBg.lineStyle(2, GAME_CONFIG.COLORS.TEXT_DIM, 0.3);
    rightBg.strokeRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 6);
    rightBtn.add(rightBg);
    this.add.text(0, 0, 'AMMO ▶', {
      fontSize: '14px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);
    rightBtn.setSize(btnWidth, btnHeight);
    rightBtn.setInteractive(new Phaser.Geom.Rectangle(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight), Phaser.Geom.Rectangle.Contains);
    rightBtn.on('pointerdown', () => this.cycleAmmo(1));
    container.add(rightBtn);
  }

  private cycleAmmo(dir: number): void {
    this.currentAmmoIndex = (this.currentAmmoIndex + dir + this.loadout.length) % this.loadout.length;
    this.currentAmmo = getAmmoById(this.loadout[this.currentAmmoIndex]) || getAllAmmo()[0];
    this.audioSystem.playAmmoSwitch();
    this.refreshAmmoSelector();
    this.updateTrajectory();
  }

  private refreshAmmoSelector(): void {
    // Recreate ammo selector
    this.ammoSelector.removeAll(true);
    this.createAmmoSelector();
  }

  private createModeSelector(): void {
    const container = this.modeSelector;
    const btnWidth = 100;
    const btnHeight = 50;
    const modes: FireMode[] = ['arc', 'straight'];
    
    modes.forEach((mode, i) => {
      const x = (i - 0.5) * (btnWidth + 10);
      const btn = this.add.container(x, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT);
      
      const bg = this.add.graphics();
      const isActive = mode === this.fireMode;
      bg.fillStyle(isActive ? GAME_CONFIG.COLORS.PRIMARY : GAME_CONFIG.COLORS.PANEL, 1);
      bg.fillRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 6);
      bg.lineStyle(2, isActive ? GAME_CONFIG.COLORS.TEXT : GAME_CONFIG.COLORS.TEXT_DIM, 0.3);
      bg.strokeRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 6);
      btn.add(bg);

      this.add.text(0, 0, mode.toUpperCase(), {
        fontSize: '14px',
        color: `#${(isActive ? GAME_CONFIG.COLORS.TEXT : GAME_CONFIG.COLORS.TEXT_DIM).toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      btn.setSize(btnWidth, btnHeight);
      btn.setInteractive(new Phaser.Geom.Rectangle(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight), Phaser.Geom.Rectangle.Contains);
      btn.on('pointerdown', () => {
        if (mode !== this.fireMode) {
          this.fireMode = mode;
          this.audioSystem.playModeSwitch();
          this.refreshModeSelector();
          this.updateTrajectory();
        }
      });
      
      container.add(btn);
    });
  }

  private refreshModeSelector(): void {
    this.modeSelector.removeAll(true);
    this.createModeSelector();
  }

  private createPowerSlider(): void {
    const container = this.powerSlider;
    const width = 280;
    const height = 50;
    const maxPower = this.currentAmmo.stats.maxRange / 4; // Simplified
    
    // Background
    const bg = this.add.graphics();
    bg.fillStyle(GAME_CONFIG.COLORS.PANEL, 1);
    bg.fillRoundedRect(-width/2, -height/2, width, height, 8);
    bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT_DIM, 0.3);
    bg.strokeRoundedRect(-width/2, -height/2, width, height, 8);
    container.add(bg);

    // Label
    this.add.text(-width/2 + 10, -height/2 + 10, 'POWER', {
      fontSize: '12px',
      color: `#${GAME_CONFIG.COLORS.TEXT_DIM.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
    }).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);

    // Value
    this.add.text(width/2 - 10, -height/2 + 10, `${this.power}`, {
      fontSize: '18px',
      color: `#${GAME_CONFIG.COLORS.PRIMARY.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(1, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);

    // Slider track
    const sliderWidth = 240;
    const sliderHeight = 8;
    const track = this.add.graphics();
    track.fillStyle(0x334455, 1);
    track.fillRoundedRect(-sliderWidth/2, 10, sliderWidth, sliderHeight, sliderHeight/2);
    container.add(track);

    // Fill
    const fill = this.add.graphics();
    const fillWidth = (this.power / maxPower) * sliderWidth;
    fill.fillStyle(GAME_CONFIG.COLORS.PRIMARY, 1);
    fill.fillRoundedRect(-sliderWidth/2, 10, fillWidth, sliderHeight, sliderHeight/2);
    container.add(fill);

    // Handle
    const handle = this.add.graphics();
    handle.fillStyle(GAME_CONFIG.COLORS.TEXT, 1);
    handle.fillCircle(-sliderWidth/2 + fillWidth, 10 + sliderHeight/2, 14);
    container.add(handle);

    container.setData('fill', fill);
    container.setData('handle', handle);
    container.setData('maxPower', maxPower);
    
    container.setSize(width, height);
    container.setInteractive(new Phaser.Geom.Rectangle(-width/2, -height/2, width, height), Phaser.Geom.Rectangle.Contains);
    
    let dragging = false;
    container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      dragging = true;
      this.updatePowerFromPointer(container, pointer);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (dragging) {
        this.updatePowerFromPointer(container, pointer);
      }
    });

    this.input.on('pointerup', () => {
      dragging = false;
    });
  }

  private updatePowerFromPointer(container: Phaser.GameObjects.Container, pointer: Phaser.Input.Pointer): void {
    const localX = pointer.x - container.x;
    const sliderWidth = 240;
    const maxPower = container.getData('maxPower');
    const rawPower = (localX + sliderWidth/2) / sliderWidth * maxPower;
    this.power = Phaser.Math.Clamp(Math.round(rawPower), 10, maxPower);
    
    const fill = container.getData('fill') as Phaser.GameObjects.Graphics;
    const handle = container.getData('handle') as Phaser.GameObjects.Graphics;
    const fillWidth = (this.power / maxPower) * sliderWidth;
    
    fill.clear();
    fill.fillStyle(GAME_CONFIG.COLORS.PRIMARY, 1);
    fill.fillRoundedRect(-sliderWidth/2, 10, fillWidth, 8, 4);
    
    handle.clear();
    handle.fillStyle(GAME_CONFIG.COLORS.TEXT, 1);
    handle.fillCircle(-sliderWidth/2 + fillWidth, 14, 14);
    
    // Update value text
    const valueText = container.getAt(2) as Phaser.GameObjects.Text;
    if (valueText) valueText.setText(`${this.power}`);
    
    this.updateTrajectory();
  }

  private createFireButton(): void {
    const container = this.fireButton;
    const size = 80;
    
    const bg = this.add.graphics();
    bg.fillStyle(GAME_CONFIG.COLORS.PRIMARY, 1);
    bg.fillCircle(0, 0, size/2);
    bg.lineStyle(3, GAME_CONFIG.COLORS.TEXT, 0.3);
    bg.strokeCircle(0, 0, size/2);
    container.add(bg);

    // Inner pulse
    const pulse = this.add.graphics();
    pulse.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.5);
    pulse.strokeCircle(0, 0, size/2 - 8);
    container.add(pulse);
    container.setData('pulse', pulse);

    this.add.text(0, 0, 'FIRE', {
      fontSize: '18px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);

    // Pulse animation
    this.tweens.add({
      targets: pulse,
      alpha: { from: 0.5, to: 1 },
      scale: { from: 1, to: 1.1 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
    });

    container.setSize(size, size);
    container.setInteractive(new Phaser.Geom.Circle(0, 0, size/2), Phaser.Geom.Circle.Contains);
    
    container.on('pointerdown', () => {
      if (!this.isFiring && !this.missionComplete && !this.missionFailed && this.shotsRemaining > 0) {
        this.fire();
      }
    });
  }

  private createControlButton(container: Phaser.GameObjects.Container, text: string, callback: () => void): void {
    const width = 100;
    const height = 40;
    
    const bg = this.add.graphics();
    bg.fillStyle(GAME_CONFIG.COLORS.PANEL, 1);
    bg.fillRoundedRect(-width/2, -height/2, width, height, 6);
    bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT_DIM, 0.3);
    bg.strokeRoundedRect(-width/2, -height/2, width, height, 6);
    container.add(bg);

    this.add.text(0, 0, text, {
      fontSize: '14px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    container.setSize(width, height);
    container.setInteractive(new Phaser.Geom.Rectangle(-width/2, -height/2, width, height), Phaser.Geom.Rectangle.Contains);
    container.on('pointerdown', () => {
      this.audioSystem.playUISelect();
      callback();
    });
  }

  private createReplayControls(): void {
    const container = this.replayControls;
    const btnSize = 50;
    const spacing = 10;
    const buttons = [
      { text: '⏸', action: () => this.toggleReplayPause() },
      { text: '⏭', action: () => this.finishReplay() },
      { text: '⏩', action: () => this.skipReplay() },
      { text: '0.1x', action: () => this.setReplaySpeed(0.1) },
      { text: '0.5x', action: () => this.setReplaySpeed(0.5) },
      { text: '1x', action: () => this.setReplaySpeed(1) },
      { text: '2x', action: () => this.setReplaySpeed(2) },
    ];

    buttons.forEach((btn, i) => {
      const x = (i - 3) * (btnSize + spacing);
      const b = this.add.container(x, 0).setDepth(GAME_CONFIG.Z.UI_OVERLAY + 1);
      
      const bg = this.add.graphics();
      bg.fillStyle(GAME_CONFIG.COLORS.PANEL, 0.9);
      bg.fillRoundedRect(-btnSize/2, -btnSize/2, btnSize, btnSize, 6);
      bg.lineStyle(2, GAME_CONFIG.COLORS.PRIMARY, 0.3);
      bg.strokeRoundedRect(-btnSize/2, -btnSize/2, btnSize, btnSize, 6);
      b.add(bg);

      this.add.text(0, 0, btn.text, {
        fontSize: '12px',
        color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      b.setSize(btnSize, btnSize);
      b.setInteractive(new Phaser.Geom.Rectangle(-btnSize/2, -btnSize/2, btnSize, btnSize), Phaser.Geom.Rectangle.Contains);
      b.on('pointerdown', btn.action);
      
      container.add(b);
    });
  }

  private setupInput(): void {
    // Touch/mouse aiming
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Check if pointer is in aim area (left side of screen)
      if (pointer.x < this.scale.width * 0.4 && pointer.y > this.scale.height * 0.2) {
        this.isAiming = true;
        this.aimStartPos = { x: pointer.x, y: pointer.y };
        this.createAimHandle(pointer.x, pointer.y);
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isAiming) {
        this.updateAim(pointer.x, pointer.y);
      }
    });

    this.input.on('pointerup', () => {
      if (this.isAiming) {
        this.isAiming = false;
        this.removeAimHandle();
      }
    });

    // Keyboard controls for testing
    this.input.keyboard!.on('keydown-LEFT', () => { this.aimAngle = Math.max(-85, this.aimAngle - 2); this.updateTrajectory(); });
    this.input.keyboard!.on('keydown-RIGHT', () => { this.aimAngle = Math.min(85, this.aimAngle + 2); this.updateTrajectory(); });
    this.input.keyboard!.on('keydown-UP', () => { this.power = Math.min(this.currentAmmo.stats.maxRange / 4, this.power + 10); this.refreshPowerSlider(); this.updateTrajectory(); });
    this.input.keyboard!.on('keydown-DOWN', () => { this.power = Math.max(10, this.power - 10); this.refreshPowerSlider(); this.updateTrajectory(); });
    this.input.keyboard!.on('keydown-SPACE', () => { if (!this.isFiring) this.fire(); });
    this.input.keyboard!.on('keydown-M', () => { this.fireMode = this.fireMode === 'arc' ? 'straight' : 'arc'; this.refreshModeSelector(); this.updateTrajectory(); });
    this.input.keyboard!.on('keydown-A', () => this.cycleAmmo(-1));
    this.input.keyboard!.on('keydown-D', () => this.cycleAmmo(1));
    this.input.keyboard!.on('keydown-R', () => this.resetMission());
  }

  private createAimHandle(x: number, y: number): void {
    this.aimHandle = this.add.container(x, y).setDepth(GAME_CONFIG.Z.UI_OVERLAY);
    
    const gfx = this.add.graphics();
    gfx.lineStyle(3, GAME_CONFIG.COLORS.PRIMARY, 0.8);
    gfx.strokeCircle(0, 0, 30);
    gfx.lineStyle(1, GAME_CONFIG.COLORS.PRIMARY, 0.5);
    gfx.strokeCircle(0, 0, 40);
    this.aimHandle.add(gfx);

    this.add.text(0, 50, `${Math.round(this.aimAngle)}°`, {
      fontSize: '14px',
      color: `#${GAME_CONFIG.COLORS.PRIMARY.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_OVERLAY + 1);
  }

  private removeAimHandle(): void {
    if (this.aimHandle) {
      this.aimHandle.destroy();
      this.aimHandle = null as any;
    }
  }

  private updateAim(x: number, y: number): void {
    if (!this.aimHandle) return;
    
    const dx = x - this.cannonPivot.x;
    const dy = y - this.cannonPivot.y;
    const angle = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
    
    this.aimAngle = Phaser.Math.Clamp(angle, -85, 85);
    this.aimHandle.setPosition(x, y);
    
    const label = this.aimHandle.getAt(1) as Phaser.GameObjects.Text;
    if (label) label.setText(`${Math.round(this.aimAngle)}°`);
    
    this.drawCannon();
    this.updateTrajectory();
  }

  private updateTrajectory(): void {
    if (this.missionComplete || this.missionFailed) return;
    
    const result = this.trajectorySystem.calculateTrajectory(
      this.cannonPivot.x,
      this.cannonPivot.y,
      this.aimAngle,
      this.power,
      this.fireMode,
      this.currentAmmo,
      [this.coreBody] // Ignore core for trajectory
    );
    
    this.trajectorySystem.drawTrajectory(result);
    
    // Show/hide cover warning
    if (result.hitsCoverFirst) {
      this.trajectoryWarningText.setVisible(true);
      this.trajectorySystem.drawCoverWarning(result.impactPoint!);
    } else {
      this.trajectoryWarningText.setVisible(false);
      this.trajectorySystem.clear();
    }
  }

  private fire(): void {
    this.isFiring = true;
    this.shotsRemaining--;
    this.shotsUsed++;
    saveSystem.recordShot(this.currentAmmo.id);
    
    this.updateShotsDisplay();
    
    // Play fire sound
    this.audioSystem.playCannonFire(this.power);
    
    // Fire projectile
    this.projectileSystem.fire(
      this.cannonPivot.x,
      this.cannonPivot.y,
      this.aimAngle,
      this.power,
      this.fireMode,
      this.currentAmmo
    );
    
    // Screen shake
    this.effectsSystem.screenShake(0.8);
    
    // Disable fire button briefly
    this.time.delayedCall(500, () => {
      this.isFiring = false;
    });
    
    // Check for mission end
    this.checkMissionStatus();
  }

  private checkMissionStatus(): void {
    // Check core destroyed
    if (this.coreHealth <= 0) {
      this.missionComplete = true;
      this.showResults(true);
      return;
    }
    
    // Check objective
    const objective = this.levelData.objective;
    let objectiveMet = false;
    
    switch (objective.type) {
      case 'destroy_core':
        objectiveMet = this.coreHealth <= 0;
        break;
      case 'damage_core':
        objectiveMet = this.coreHealth < this.maxCoreHealth * 0.5;
        break;
      case 'expose_core':
        // Check if core has line of sight from cannon
        objectiveMet = this.isCoreExposed();
        break;
      case 'destroy_structure':
        objectiveMet = this.structureSystem.getRemainingHealth() < 0.2;
        break;
      case 'damage_threshold':
        objectiveMet = this.structureSystem.getRemainingHealth() < (1 - (objective.threshold || 0.5));
        break;
    }
    
    if (objectiveMet) {
      this.missionComplete = true;
      this.showResults(true);
      return;
    }
    
    // Check out of shots
    if (this.shotsRemaining <= 0) {
      this.missionFailed = true;
      this.showResults(false);
      return;
    }
  }

  private isCoreExposed(): boolean {
    // Simple raycast from cannon to core
    const hit = this.matter.query.ray(
      [this.coreBody],
      { x: this.cannonPivot.x, y: this.cannonPivot.y },
      { x: this.coreBody.position.x, y: this.coreBody.position.y },
      1
    );
    return hit.length === 0;
  }

  private showResults(success: boolean): void {
    this.missionComplete = success;
    this.missionFailed = !success;
    
    // Calculate stars
    let stars = 0;
    if (success) {
      if (this.shotsUsed <= this.levelData.starThresholds[3]) stars = 3;
      else if (this.shotsUsed <= this.levelData.starThresholds[2]) stars = 2;
      else if (this.shotsUsed <= this.levelData.starThresholds[1]) stars = 1;
    }
    
    // Save results
    const stageId = `ch${this.chapter}_st${this.stage}`;
    const existing = saveSystem.getStageResult(this.chapter, stageId);
    const isFirstClear = !existing?.completed;
    const bestShots = existing ? Math.min(existing.bestShots, this.shotsUsed) : this.shotsUsed;
    
    saveSystem.setStageResult(this.chapter, stageId, {
      completed: success,
      stars,
      shotsUsed: this.shotsUsed,
      bestShots,
      firstClearRewardClaimed: false,
    });
    
    if (success) {
      saveSystem.recordMissionComplete();
      // Unlock next stage
      if (this.stage < GAME_CONFIG.STAGES_PER_CHAPTER) {
        // Next stage will be unlocked via CampaignScene logic
      }
      // Unlock next chapter if last stage
      if (this.stage === GAME_CONFIG.STAGES_PER_CHAPTER && this.chapter < GAME_CONFIG.CHAPTERS) {
        saveSystem.unlockChapter(this.chapter + 1);
      }
      
      // Rewards
      const reward = 100 + stars * 50 + (isFirstClear ? 200 : 0);
      saveSystem.addCurrency(reward);
      
      this.audioSystem.playMissionComplete();
      if (stars > 0) this.audioSystem.playStarEarn();
    } else {
      saveSystem.recordMissionFailed();
      this.audioSystem.playMissionFailed();
    }
    
    // Transition to results after delay
    this.time.delayedCall(2000, () => {
      this.scene.start('ResultsScene', {
        chapter: this.chapter,
        stage: this.stage,
        success,
        stars,
        shotsUsed: this.shotsUsed,
        shotsLimit: this.levelData.shotLimit,
        isFirstClear,
        reward: success ? (100 + stars * 50 + (isFirstClear ? 200 : 0)) : 0,
      });
    });
  }

  private updateShotsDisplay(): void {
    this.shotsText.setText(`SHOTS: ${this.shotsRemaining}/${this.levelData.shotLimit}`);
  }

  private refreshPowerSlider(): void {
    this.powerSlider.removeAll(true);
    this.createPowerSlider();
  }

  private resetMission(): void {
    this.audioSystem.playUIConfirm();
    this.scene.restart({ chapter: this.chapter, stage: this.stage, levelData: this.levelData });
  }

  private pauseAndShowMenu(): void {
    this.audioSystem.playUISelect();
    this.scene.pause();
    this.scene.launch('PauseMenuScene', { gameScene: this });
  }

  // Replay controls
  private toggleReplayPause(): void {
    this.isReplaying = !this.isReplaying;
  }

  private finishReplay(): void {
    this.replaySpeed = 10;
  }

  private skipReplay(): void {
    this.replayControls.setVisible(false);
    this.isReplaying = false;
  }

  private setReplaySpeed(speed: number): void {
    this.replaySpeed = speed;
  }

  update(time: number, delta: number): void {
    if (this.missionComplete || this.missionFailed) return;
    
    // Update systems
    this.projectileSystem.update(delta);
    this.effectsSystem.updateDebris(delta);
    this.structureSystem.update(delta);
    
    // Update cannon graphics if not aiming
    if (!this.isAiming) {
      this.drawCannon();
    }
  }

  destroy(): void {
    this.effectsSystem?.destroy();
    this.trajectorySystem?.destroy();
    this.structureSystem?.destroy();
    this.projectileSystem?.destroy();
    this.cannonGraphics?.destroy();
    this.groundGraphics?.destroy();
    this.coreGraphics?.destroy();
    this.hudContainer?.destroy();
    this.ammoSelector?.destroy();
    this.modeSelector?.destroy();
    this.powerSlider?.destroy();
    this.fireButton?.destroy();
    this.replayControls?.destroy();
    if (this.coreBody) {
      const world = this.matter.world as any;
      const idx = world.bodies.indexOf(this.coreBody);
      if (idx !== -1) world.bodies.splice(idx, 1);
    }
  }
}
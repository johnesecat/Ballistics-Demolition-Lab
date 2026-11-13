import { Scene } from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { saveSystem } from '../systems/SaveSystem';
import { AudioSystem } from '../systems/AudioSystem';
import { LevelGenerator, LevelData } from '../generation/LevelGenerator';
import { StructureSystem } from '../systems/StructureSystem';
import { getAmmoById } from '../ammo/ammoCatalogue';

export class BriefingScene extends Scene {
  private audioSystem!: AudioSystem;
  private backgroundGraphics!: Phaser.GameObjects.Graphics;
  private levelData!: LevelData;
  private chapter!: number;
  private stage!: number;
  private startButton!: Phaser.GameObjects.Container;
  private loadoutDisplay: Phaser.GameObjects.Container[] = [];
  private backButton!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'BriefingScene' });
  }

  init(data: { chapter: number; stage: number }): void {
    this.chapter = data.chapter;
    this.stage = data.stage;
  }

  create(): void {
    this.audioSystem = this.game.registry.get('audioSystem');
    
    // Generate level data
    const generator = new LevelGenerator(this, this.matter, null as any);
    this.levelData = generator.generate({
      chapter: this.chapter,
      stage: this.stage,
      difficulty: 1,
      width: this.scale.width,
      height: this.scale.height,
    });

    this.createBackground();
    this.createBriefing();
    this.createLoadoutDisplay();
    this.createStartButton();
    this.createBackButton();
    
    this.scale.on('resize', this.handleResize, this);
  }

  private createBackground(): void {
    this.backgroundGraphics = this.add.graphics();
    this.backgroundGraphics.setDepth(GAME_CONFIG.Z.BACKGROUND);
    this.drawBackground();
  }

  private drawBackground(): void {
    const { width, height } = this.scale;
    const gfx = this.backgroundGraphics;
    gfx.clear();
    gfx.fillStyle(GAME_CONFIG.COLORS.BACKGROUND, 1);
    gfx.fillRect(0, 0, width, height);
  }

  private createBriefing(): void {
    const { width, height } = this.scale;
    const panelWidth = 500;
    const panelHeight = 400;
    const x = (width - panelWidth) / 2;
    const y = (height - panelHeight) / 2 - 30;

    // Panel background
    const bg = this.add.graphics();
    bg.fillStyle(GAME_CONFIG.COLORS.PANEL, 0.95);
    bg.fillRoundedRect(x, y, panelWidth, panelHeight, 12);
    bg.lineStyle(2, GAME_CONFIG.COLORS.PRIMARY, 0.5);
    bg.strokeRoundedRect(x, y, panelWidth, panelHeight, 12);
    bg.setDepth(GAME_CONFIG.Z.UI_PANEL);

    let currentY = y + 30;

    // Mission title
    this.add.text(width/2, currentY, `MISSION ${this.chapter}-${this.stage}`, {
      fontSize: '24px',
      color: `#${GAME_CONFIG.COLORS.PRIMARY.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    currentY += 40;

    // Objective
    this.add.text(width/2, currentY, 'OBJECTIVE', {
      fontSize: '16px',
      color: `#${GAME_CONFIG.COLORS.TEXT_DIM.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    currentY += 25;

    this.add.text(width/2, currentY, this.levelData.objective.description, {
      fontSize: '18px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      wordWrap: { width: panelWidth - 40 },
      align: 'center',
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    currentY += 60;

    // Mission parameters
    const params = [
      { label: 'SHOTS AVAILABLE', value: this.levelData.shotLimit.toString(), color: GAME_CONFIG.COLORS.WARNING },
      { label: 'STAR THRESHOLDS', value: `1★ ≤${this.levelData.starThresholds[1]}  2★ ≤${this.levelData.starThresholds[2]}  3★ ≤${this.levelData.starThresholds[3]}`, color: GAME_CONFIG.COLORS.APHE_YELLOW },
    ];

    params.forEach(param => {
      this.add.text(width/2 - 200, currentY, param.label, {
        fontSize: '13px',
        color: `#${GAME_CONFIG.COLORS.TEXT_DIM.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
      }).setDepth(GAME_CONFIG.Z.UI_CONTENT);
      
      this.add.text(width/2 + 200, currentY, param.value, {
        fontSize: '16px',
        color: `#${param.color.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }).setOrigin(1, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT);
      currentY += 35;
    });

    currentY += 20;

    // Loadout label
    this.add.text(width/2, currentY, 'EQUIPPED AMMUNITION', {
      fontSize: '16px',
      color: `#${GAME_CONFIG.COLORS.TEXT_DIM.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    currentY += 30;
  }

  private createLoadoutDisplay(): void {
    const { width, height } = this.scale;
    const loadout = saveSystem.getAmmoLoadout();
    const slotSize = 50;
    const spacing = 10;
    const startX = (width - (loadout.length * slotSize + (loadout.length - 1) * spacing)) / 2;
    const y = (height - 180) / 2 + 120;

    loadout.forEach((ammoId, i) => {
      const x = startX + i * (slotSize + spacing) + slotSize / 2;
      const slot = this.add.container(x, y).setDepth(GAME_CONFIG.Z.UI_CONTENT);
      
      const bg = this.add.graphics();
      bg.fillStyle(GAME_CONFIG.COLORS.PANEL, 1);
      bg.fillRoundedRect(-slotSize/2, -slotSize/2, slotSize, slotSize, 6);
      bg.lineStyle(2, GAME_CONFIG.COLORS.PRIMARY, 0.3);
      bg.strokeRoundedRect(-slotSize/2, -slotSize/2, slotSize, slotSize, 6);
      slot.add(bg);

      const ammo = getAmmoById(ammoId);
      if (ammo) {
        const icon = this.add.image(0, -5, `icon_${ammoId}`).setScale(0.6).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
        slot.add(icon);
        
        this.add.text(0, 22, ammo.name, {
          fontSize: '9px',
          color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
          fontFamily: 'Arial, sans-serif',
          wordWrap: { width: slotSize - 4 },
          align: 'center',
        }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
      }

      this.loadoutDisplay.push(slot);
    });
  }

  private createStartButton(): void {
    const { width, height } = this.scale;
    this.startButton = this.add.container(width/2, height - 100).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    
    const bg = this.add.graphics();
    bg.fillStyle(GAME_CONFIG.COLORS.SUCCESS, 1);
    bg.fillRoundedRect(-120, -35, 240, 70, 10);
    bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.3);
    bg.strokeRoundedRect(-120, -35, 240, 70, 10);
    this.startButton.add(bg);

    this.add.text(0, -10, 'DEPLOY', {
      fontSize: '24px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(0, 15, 'TAP TO BEGIN MISSION', {
      fontSize: '12px',
      color: `#${GAME_CONFIG.COLORS.TEXT_DIM.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    this.startButton.setSize(240, 70);
    this.startButton.setInteractive(new Phaser.Geom.Rectangle(-120, -35, 240, 70), Phaser.Geom.Rectangle.Contains);
    
    this.startButton.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(0x00aa55, 1);
      bg.fillRoundedRect(-120, -35, 240, 70, 10);
      bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.5);
      bg.strokeRoundedRect(-120, -35, 240, 70, 10);
    });
    
    this.startButton.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(GAME_CONFIG.COLORS.SUCCESS, 1);
      bg.fillRoundedRect(-120, -35, 240, 70, 10);
      bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.3);
      bg.strokeRoundedRect(-120, -35, 240, 70, 10);
    });
    
    this.startButton.on('pointerdown', () => {
      this.audioSystem?.playUIConfirm();
      this.scene.start('GameScene', { 
        chapter: this.chapter, 
        stage: this.stage,
        levelData: this.levelData,
      });
    });
  }

  private createBackButton(): void {
    const { height } = this.scale;
    this.backButton = this.add.container(80, height - 50).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    
    const bg = this.add.graphics();
    bg.fillStyle(GAME_CONFIG.COLORS.PANEL, 1);
    bg.fillRoundedRect(-60, -25, 120, 50, 6);
    bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT_DIM, 0.3);
    bg.strokeRoundedRect(-60, -25, 120, 50, 6);
    this.backButton.add(bg);

    this.add.text(0, 0, 'BACK', {
      fontSize: '18px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.backButton.setSize(120, 50);
    this.backButton.setInteractive(new Phaser.Geom.Rectangle(-60, -25, 120, 50), Phaser.Geom.Rectangle.Contains);
    
    this.backButton.on('pointerdown', () => {
      this.audioSystem?.playUICancel();
      this.scene.start('CampaignScene', { chapter: this.chapter, stage: this.stage });
    });
  }

  private handleResize(): void {
    this.drawBackground();
  }

  destroy(): void {
    this.backgroundGraphics?.destroy();
  }
}
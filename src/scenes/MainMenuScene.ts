import { Scene } from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { BaseUIComponent, createRoundedRect } from '../ui/BaseUI';
import { saveSystem } from '../systems/SaveSystem';
import { AudioSystem } from '../systems/AudioSystem';

export class BootScene extends Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Load any external assets here
    this.load.on('complete', () => {
      this.scene.start('MainMenuScene');
    });
  }

  create(): void {
    // Initialize game registry with save system
    this.game.registry.set('saveSystem', saveSystem);
    
    // Create audio system
    const audioSystem = new AudioSystem(this);
    this.game.registry.set('audioSystem', audioSystem);
    
    // Generate procedural textures for UI
    this.generateUITextures();
    
    // Start loading any additional assets
    this.load.start();
  }

  private generateUITextures(): void {
    const gfx = this.make.graphics({ x: 0, y: 0, add: false });

    // Ammo icons - generate simple procedural icons for each ammo type
    // These will be replaced with actual PNGs later
    const ammoIcons = [
      'ap_solid_shot', 'apc_capped', 'apbc_ballistic_cap', 'apcbc_combined_caps',
      'apcr_round', 'apds_sabot', 'finned_dart', 'ap_breaker',
      'wedge', 'pele_sidewinder', 'bankshot', 'drillhead',
      'soft_nose', 'pancake', 'petal', 'bonded_mushroom',
      'crusher', 'heavy_soft_shot', 'cuff', 'splitter', 'anvil',
      'heat_round', 'double_jet', 'wide_jet', 'crossfire',
      'sabot_heat', 'double_strike', 'cornerjet', 'forkjet',
      'roofbreaker', 'needle_jet',
      'hesh_round', 'broadhead', 'scab_lifter', 'shock',
      'hesh_demolition', 'ribbon_hesh', 'echo_hesh', 'quake',
      'he_blast', 'he_demolition', 'fragmentation', 'thermal',
      'rainmaker', 'crownburst', 'obstacle_reducer', 'foundation_breaker',
      'pressure_hammer', 'popcorn_burst', 'meltdown',
      'aphe_hybrid', 'capped_aphe', 'bunkerbreaker', 'emberpiercer',
      'switchfuse', 'sideburst', 'latchburst', 'adaptive_shell', 'chain_blast',
    ];

    for (const id of ammoIcons) {
      this.generateAmmoIcon(gfx, id);
    }

    // Category badges
    const categories = ['solid', 'heat', 'hesh', 'he', 'aphe', 'soft'];
    const categoryColors = {
      solid: 0x4488cc,
      heat: 0xff6600,
      hesh: 0xaa44ff,
      he: 0xff3344,
      aphe: 0xffdd00,
      soft: 0xcd7f32,
    };

    for (const cat of categories) {
      gfx.clear();
      gfx.fillStyle(categoryColors[cat as keyof typeof categoryColors], 1);
      gfx.fillRoundedRect(0, 0, 80, 28, 14);
      gfx.generateTexture(`badge_${cat}`, 80, 28);
    }

    gfx.destroy();
  }

  private generateAmmoIcon(gfx: Phaser.GameObjects.Graphics, id: string): void {
    const size = 64;
    gfx.clear();
    
    // Category colors
    const catColors: Record<string, { body: number; nose: number; accent: number }> = {
      solid: { body: 0x667788, nose: 0x99aabb, accent: 0x445566 },
      heat: { body: 0x445566, nose: 0xff6600, accent: 0xff8800 },
      hesh: { body: 0x4a5a3a, nose: 0xffd700, accent: 0x888844 },
      he: { body: 0x5a3a3a, nose: 0xff3344, accent: 0xff6666 },
      aphe: { body: 0x445566, nose: 0xffdd00, accent: 0xffee88 },
      soft: { body: 0x8b5a2b, nose: 0xcd7f32, accent: 0xb87333 },
    };

    // Determine category from id
    let category = 'solid';
    if (id.includes('heat') || id.includes('jet') || id.includes('roofbreaker') || id.includes('needle')) category = 'heat';
    else if (id.includes('hesh') || id.includes('broadhead') || id.includes('scab') || id.includes('echo') || id.includes('ribbon') || id.includes('quake')) category = 'hesh';
    else if (id.includes('he_') || id.includes('fragmentation') || id.includes('thermal') || id.includes('rainmaker') || id.includes('crownburst') || id.includes('obstacle') || id.includes('foundation') || id.includes('pressure') || id.includes('popcorn') || id.includes('meltdown')) category = 'he';
    else if (id.includes('aphe') || id.includes('bunkerbreaker') || id.includes('emberpiercer') || id.includes('switchfuse') || id.includes('sideburst') || id.includes('latchburst') || id.includes('adaptive') || id.includes('chain_blast')) category = 'aphe';
    else if (['soft_nose', 'pancake', 'petal', 'bonded_mushroom', 'crusher', 'heavy_soft_shot', 'cuff', 'splitter', 'anvil'].includes(id)) category = 'soft';

    const colors = catColors[category];

    const length = 40;
    const width = 14;
    
    // Body
    gfx.fillStyle(colors.body, 1);
    gfx.fillRoundedRect(-length/2, -width/2, length * 0.7, width, 3);
    
    // Nose
    gfx.fillStyle(colors.nose, 1);
    gfx.fillTriangle(
      length * 0.1, -width/2,
      length * 0.1, width/2,
      length/2, 0
    );
    
    // Accent
    gfx.fillStyle(colors.accent, 1);
    gfx.fillRect(-length/2 + 6, -width/2 + 2, 5, width - 4);

    // Special features
    if (id === 'apds_sabot' || id === 'sabot_heat') {
      gfx.lineStyle(2, 0xffffff, 0.5);
      gfx.beginPath();
      gfx.moveTo(-length/2 + 10, -width/2);
      gfx.lineTo(-length/2 + 10, width/2);
      gfx.strokePath();
    } else if (id === 'finned_dart' || id === 'needle_jet') {
      gfx.fillStyle(0x888888, 1);
      gfx.fillTriangle(-length/2, -width/2, -length/2 - 8, -width, -length/2 + 4, -width/2);
      gfx.fillTriangle(-length/2, width/2, -length/2 - 8, width, -length/2 + 4, width/2);
    } else if (id === 'petal') {
      gfx.fillStyle(0xcd7f32, 1);
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        gfx.fillTriangle(
          length * 0.1, 0,
          length * 0.1 + Math.cos(angle) * 10, Math.sin(angle) * 10,
          length * 0.1 + Math.cos(angle + Math.PI/4) * 6, Math.sin(angle + Math.PI/4) * 6
        );
      }
    } else if (id === 'wedge') {
      gfx.fillStyle(0x99aabb, 1);
      gfx.fillTriangle(length * 0.1, -width/2, length/2, -width/2, length * 0.1, width/2);
    } else if (id === 'drillhead') {
      gfx.lineStyle(2, 0xcccccc, 1);
      for (let i = 0; i < 4; i++) {
        const y = -width/2 + i * width/4;
        gfx.beginPath();
        gfx.moveTo(length * 0.15, y);
        gfx.lineTo(length * 0.35, y);
        gfx.strokePath();
      }
    } else if (id === 'anvil') {
      gfx.clear();
      gfx.fillStyle(0x444444, 1);
      gfx.fillRect(-length/2, -width/2, length, width);
      gfx.lineStyle(2, 0x666666, 1);
      gfx.strokeRect(-length/2, -width/2, length, width);
    } else if (id === 'broadhead' || id === 'ribbon_hesh') {
      gfx.fillStyle(0xffd700, 1);
      gfx.fillTriangle(length * 0.05, -width, length * 0.05, width, length/2, 0);
    } else if (id === 'splitter') {
      gfx.fillStyle(0xcd7f32, 1);
      gfx.fillRoundedRect(length * 0.05, -width/2, length * 0.35, width, 2);
    }

    gfx.generateTexture(`icon_${id}`, size, size);
  }
}

export class MainMenuScene extends Scene {
  private audioSystem!: AudioSystem;
  private backgroundGraphics!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private menuContainer!: Phaser.GameObjects.Container;
  private continueButton!: Phaser.GameObjects.Container;
  private campaignButton!: Phaser.GameObjects.Container;
  private armoryButton!: Phaser.GameObjects.Container;
  private settingsButton!: Phaser.GameObjects.Container;
  private currencyText!: Phaser.GameObjects.Text;
  private starText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create(): void {
    this.audioSystem = this.game.registry.get('audioSystem');
    
    // Create background
    this.createBackground();
    
    // Create title
    this.createTitle();
    
    // Create menu buttons
    this.createMenu();
    
    // Create HUD info
    this.createHUD();
    
    // Handle resize
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
    
    // Dark gradient background
    gfx.fillStyle(GAME_CONFIG.COLORS.BACKGROUND, 1);
    gfx.fillRect(0, 0, width, height);
    
    // Subtle grid pattern
    gfx.lineStyle(1, 0x1a2a3a, 0.3);
    const gridSize = 40;
    for (let x = 0; x < width; x += gridSize) {
      gfx.beginPath();
      gfx.moveTo(x, 0);
      gfx.lineTo(x, height);
      gfx.strokePath();
    }
    for (let y = 0; y < height; y += gridSize) {
      gfx.beginPath();
      gfx.moveTo(0, y);
      gfx.lineTo(width, y);
      gfx.strokePath();
    }
    
    // Parallax silhouette
    this.drawSilhouette(gfx, width, height);
  }

  private drawSilhouette(gfx: Phaser.GameObjects.Graphics, width: number, height: number): void {
    gfx.fillStyle(0x080c14, 1);
    
    // City skyline
    const buildingCount = 12;
    for (let i = 0; i < buildingCount; i++) {
      const x = (i / buildingCount) * width;
      const w = width / buildingCount * Phaser.Math.FloatBetween(0.8, 1.5);
      const h = height * Phaser.Math.FloatBetween(0.3, 0.6);
      const y = height - h;
      
      gfx.fillRect(x, y, w, h);
      
      // Windows
      gfx.fillStyle(0x1a2a3a, 0.5);
      for (let wx = x + 5; wx < x + w - 5; wx += 15) {
        for (let wy = y + 10; wy < y + h - 10; wy += 12) {
          if (Phaser.Math.FloatBetween(0, 1) > 0.7) {
            gfx.fillRect(wx, wy, 6, 6);
          }
        }
      }
      gfx.fillStyle(0x080c14, 1);
    }
  }

  private createTitle(): void {
    const { width, height } = this.scale;
    
    // Main title
    this.titleText = this.add.text(width / 2, height * 0.18, 'ARTILLERY COMMAND', {
      fontSize: '48px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      stroke: `#${GAME_CONFIG.COLORS.PRIMARY.toString(16).padStart(6, '0')}`,
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT);

    // Subtitle
    this.add.text(width / 2, height * 0.28, 'SIEGE WARFARE SIMULATOR', {
      fontSize: '16px',
      color: `#${GAME_CONFIG.COLORS.PRIMARY.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      letterSpacing: '4px',
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT);

    // Version
    this.add.text(width - 20, height - 20, 'v1.0.0', {
      fontSize: '12px',
      color: `#${GAME_CONFIG.COLORS.TEXT_DIM.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(1, 1).setDepth(GAME_CONFIG.Z.UI_CONTENT);
  }

  private createMenu(): void {
    const { width, height } = this.scale;
    const buttonWidth = 300;
    const buttonHeight = 60;
    const spacing = 20;
    const startY = height * 0.45;

    this.menuContainer = this.add.container(0, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT);

    const hasSave = saveSystem.getData().lastPlayed > 0;

    // Continue button
    if (hasSave) {
      this.continueButton = this.createMenuButton(
        width / 2,
        startY,
        buttonWidth,
        buttonHeight,
        'CONTINUE',
        () => this.continueGame(),
        GAME_CONFIG.COLORS.SUCCESS
      );
      this.menuContainer.add(this.continueButton);
    }

    // Campaign button
    const campaignY = hasSave ? startY + buttonHeight + spacing : startY;
    this.campaignButton = this.createMenuButton(
      width / 2,
      campaignY,
      buttonWidth,
      buttonHeight,
      'CAMPAIGN',
      () => this.startCampaign()
    );
    this.menuContainer.add(this.campaignButton);

    // Armory button
    this.armoryButton = this.createMenuButton(
      width / 2,
      campaignY + buttonHeight + spacing,
      buttonWidth,
      buttonHeight,
      'ARMORY',
      () => this.openArmory()
    );
    this.menuContainer.add(this.armoryButton);

    // Settings button
    this.settingsButton = this.createMenuButton(
      width / 2,
      campaignY + (buttonHeight + spacing) * 2,
      buttonWidth,
      buttonHeight,
      'SETTINGS',
      () => this.openSettings()
    );
    this.menuContainer.add(this.settingsButton);
  }

  private createMenuButton(
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    callback: () => void,
    color: number = GAME_CONFIG.COLORS.PRIMARY
  ): Phaser.GameObjects.Container {
    const btn = this.add.container(x, y);
    
    const bg = this.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-width/2, -height/2, width, height, 8);
    bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.3);
    bg.strokeRoundedRect(-width/2, -height/2, width, height, 8);
    btn.add(bg);

    const label = this.add.text(0, 0, text, {
      fontSize: '22px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    btn.add(label);

    btn.setSize(width, height);
    btn.setInteractive(new Phaser.Geom.Rectangle(-width/2, -height/2, width, height), Phaser.Geom.Rectangle.Contains);
    
    btn.on('pointerover', () => {
      this.audioSystem?.playUISelect();
      bg.clear();
      const hoverColor = Phaser.Display.Color.Interpolate.ColorWithColor(
        { r: (color >> 16) & 0xff, g: (color >> 8) & 0xff, b: color & 0xff },
        { r: 255, g: 255, b: 255 },
        1,
        0.2
      ) as unknown as { r: number; g: number; b: number };
      const hoverVal = (hoverColor.r << 16) | (hoverColor.g << 8) | hoverColor.b;
      bg.fillStyle(hoverVal, 1);
      bg.fillRoundedRect(-width/2, -height/2, width, height, 8);
      bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.5);
      bg.strokeRoundedRect(-width/2, -height/2, width, height, 8);
      label.setScale(1.02);
    });
    
    btn.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(-width/2, -height/2, width, height, 8);
      bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.3);
      bg.strokeRoundedRect(-width/2, -height/2, width, height, 8);
      label.setScale(1);
    });
    
    btn.on('pointerdown', () => {
      this.audioSystem?.playUIConfirm();
      bg.clear();
      bg.fillStyle(0xaa5500, 1);
      bg.fillRoundedRect(-width/2, -height/2, width, height, 8);
      bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.5);
      bg.strokeRoundedRect(-width/2, -height/2, width, height, 8);
      callback();
    });
    
    btn.on('pointerup', () => {
      bg.clear();
      const hoverColor = Phaser.Display.Color.Interpolate.ColorWithColor(
        { r: (color >> 16) & 0xff, g: (color >> 8) & 0xff, b: color & 0xff },
        { r: 255, g: 255, b: 255 },
        1,
        0.2
      ) as unknown as { r: number; g: number; b: number };
      const hoverVal = (hoverColor.r << 16) | (hoverColor.g << 8) | hoverColor.b;
      bg.fillStyle(hoverVal, 1);
      bg.fillRoundedRect(-width/2, -height/2, width, height, 8);
      bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.5);
      bg.strokeRoundedRect(-width/2, -height/2, width, height, 8);
    });

    return btn;
  }

  private createHUD(): void {
    const { width, height } = this.scale;
    const data = saveSystem.getData();

    // Currency
    this.currencyText = this.add.text(width - 20, 20, `COINS: ${data.currency}`, {
      fontSize: '18px',
      color: `#${GAME_CONFIG.COLORS.APHE_YELLOW.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(1, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT);

    // Stars
    this.starText = this.add.text(20, 20, `STARS: ${data.totalStars}`, {
      fontSize: '18px',
      color: `#${GAME_CONFIG.COLORS.APHE_YELLOW.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT);
  }

  private continueGame(): void {
    const data = saveSystem.getData();
    this.scene.start('CampaignScene', { chapter: data.currentChapter, stage: data.currentStage });
  }

  private startCampaign(): void {
    this.scene.start('CampaignScene', { chapter: 1, stage: 1 });
  }

  private openArmory(): void {
    this.scene.start('ArmoryScene');
  }

  private openSettings(): void {
    this.scene.start('SettingsScene');
  }

  private handleResize(): void {
    this.drawBackground();
    this.titleText.setPosition(this.scale.width / 2, this.scale.height * 0.18);
    // Reposition menu buttons
    const { width, height } = this.scale;
    const buttonWidth = 300;
    const buttonHeight = 60;
    const spacing = 20;
    const startY = height * 0.45;
    const hasSave = saveSystem.getData().lastPlayed > 0;

    if (this.continueButton) {
      this.continueButton.setPosition(width / 2, startY);
    }
    
    const campaignY = hasSave ? startY + buttonHeight + spacing : startY;
    this.campaignButton.setPosition(width / 2, campaignY);
    this.armoryButton.setPosition(width / 2, campaignY + buttonHeight + spacing);
    this.settingsButton.setPosition(width / 2, campaignY + (buttonHeight + spacing) * 2);

    this.currencyText.setPosition(width - 20, 20);
    this.starText.setPosition(20, 20);
  }

  destroy(): void {
    this.backgroundGraphics?.destroy();
    this.menuContainer?.destroy();
  }
}
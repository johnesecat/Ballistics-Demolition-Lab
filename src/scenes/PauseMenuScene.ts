import { Scene } from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { AudioSystem } from '../systems/AudioSystem';

export class PauseMenuScene extends Scene {
  private audioSystem!: AudioSystem;
  private gameScene!: Phaser.Scene;
  private backgroundGraphics!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'PauseMenuScene' });
  }

  init(data: { gameScene: Phaser.Scene }): void {
    this.gameScene = data.gameScene;
  }

  create(): void {
    this.audioSystem = this.game.registry.get('audioSystem');
    
    this.createBackground();
    this.createMenu();
    
    this.scale.on('resize', this.handleResize, this);
  }

  private createBackground(): void {
    this.backgroundGraphics = this.add.graphics();
    this.backgroundGraphics.setDepth(GAME_CONFIG.Z.MODAL);
    this.drawBackground();
  }

  private drawBackground(): void {
    const { width, height } = this.scale;
    const gfx = this.backgroundGraphics;
    gfx.clear();
    gfx.fillStyle(0x000000, 0.7);
    gfx.fillRect(0, 0, width, height);
  }

  private createMenu(): void {
    const { width, height } = this.scale;
    const panelWidth = 400;
    const panelHeight = 350;
    const x = (width - panelWidth) / 2;
    const y = (height - panelHeight) / 2;

    // Panel
    const bg = this.add.graphics();
    bg.fillStyle(GAME_CONFIG.COLORS.PANEL, 0.95);
    bg.fillRoundedRect(x, y, panelWidth, panelHeight, 12);
    bg.lineStyle(2, GAME_CONFIG.COLORS.PRIMARY, 0.5);
    bg.strokeRoundedRect(x, y, panelWidth, panelHeight, 12);
    bg.setDepth(GAME_CONFIG.Z.MODAL + 1);

    let currentY = y + 40;

    // Title
    this.add.text(width/2, currentY, 'PAUSED', {
      fontSize: '28px',
      color: `#${GAME_CONFIG.COLORS.PRIMARY.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.MODAL + 2);
    currentY += 50;

    // Buttons
    const buttons = [
      { text: 'RESUME', action: () => this.resume(), color: GAME_CONFIG.COLORS.SUCCESS },
      { text: 'RESTART', action: () => this.restart(), color: GAME_CONFIG.COLORS.PRIMARY },
      { text: 'SETTINGS', action: () => this.openSettings(), color: GAME_CONFIG.COLORS.PANEL_LIGHT },
      { text: 'CAMPAIGN', action: () => this.exitToCampaign(), color: GAME_CONFIG.COLORS.DANGER },
    ];

    const btnWidth = 280;
    const btnHeight = 50;
    const spacing = 15;

    buttons.forEach((btn, i) => {
      const btnX = width/2;
      const btnY = currentY + i * (btnHeight + spacing);
      
      const container = this.add.container(btnX, btnY).setDepth(GAME_CONFIG.Z.MODAL + 2);
      
      const bg = this.add.graphics();
      bg.fillStyle(btn.color, 1);
      bg.fillRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 8);
      bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.3);
      bg.strokeRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 8);
      container.add(bg);

      this.add.text(0, 0, btn.text, {
        fontSize: '18px',
        color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      container.setSize(btnWidth, btnHeight);
      container.setInteractive(new Phaser.Geom.Rectangle(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight), Phaser.Geom.Rectangle.Contains);
      
      container.on('pointerover', () => {
        bg.clear();
        const hoverColor = Phaser.Display.Color.Interpolate.ColorWithColor(
          { r: (btn.color >> 16) & 0xff, g: (btn.color >> 8) & 0xff, b: btn.color & 0xff },
          { r: 255, g: 255, b: 255 },
          1,
          0.2
        ) as unknown as { r: number; g: number; b: number };
        const hoverVal = (hoverColor.r << 16) | (hoverColor.g << 8) | hoverColor.b;
        bg.fillStyle(hoverVal, 1);
        bg.fillRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 8);
        bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.5);
        bg.strokeRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 8);
      });
      
      container.on('pointerout', () => {
        bg.clear();
        bg.fillStyle(btn.color, 1);
        bg.fillRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 8);
        bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.3);
        bg.strokeRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 8);
      });
      
      container.on('pointerdown', () => {
        this.audioSystem.playUIConfirm();
        btn.action();
      });
    });
  }

  private resume(): void {
    this.scene.resume(this.gameScene.scene.key);
    this.scene.stop();
  }

  private restart(): void {
    this.scene.resume(this.gameScene.scene.key);
    this.gameScene.scene.restart();
    this.scene.stop();
  }

  private openSettings(): void {
    this.scene.resume(this.gameScene.scene.key);
    this.scene.stop();
    this.scene.launch('SettingsScene');
  }

  private exitToCampaign(): void {
    this.scene.stop(this.gameScene.scene.key);
    this.scene.stop();
    this.scene.start('CampaignScene');
  }

  private handleResize(): void {
    this.drawBackground();
  }

  destroy(): void {
    this.backgroundGraphics?.destroy();
  }
}
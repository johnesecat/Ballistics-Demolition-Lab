import { Scene } from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { saveSystem } from '../systems/SaveSystem';
import { AudioSystem } from '../systems/AudioSystem';

export class ResultsScene extends Scene {
  private audioSystem!: AudioSystem;
  private backgroundGraphics!: Phaser.GameObjects.Graphics;
  private resultData!: {
    chapter: number;
    stage: number;
    success: boolean;
    stars: number;
    shotsUsed: number;
    shotsLimit: number;
    isFirstClear: boolean;
    reward: number;
  };

  constructor() {
    super({ key: 'ResultsScene' });
  }

  init(data: any): void {
    this.resultData = data;
  }

  create(): void {
    this.audioSystem = this.game.registry.get('audioSystem');
    
    this.createBackground();
    this.createResultsPanel();
    this.createButtons();
    
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
    
    // Subtle pattern
    gfx.lineStyle(1, 0x1a2a3a, 0.2);
    for (let x = 0; x < width; x += 40) {
      gfx.beginPath();
      gfx.moveTo(x, 0);
      gfx.lineTo(x, height);
      gfx.strokePath();
    }
    for (let y = 0; y < height; y += 40) {
      gfx.beginPath();
      gfx.moveTo(0, y);
      gfx.lineTo(width, y);
      gfx.strokePath();
    }
  }

  private createResultsPanel(): void {
    const { width, height } = this.scale;
    const panelWidth = 500;
    const panelHeight = 450;
    const x = (width - panelWidth) / 2;
    const y = (height - panelHeight) / 2;

    // Panel background
    const bg = this.add.graphics();
    bg.fillStyle(GAME_CONFIG.COLORS.PANEL, 0.95);
    bg.fillRoundedRect(x, y, panelWidth, panelHeight, 12);
    bg.lineStyle(2, this.resultData.success ? GAME_CONFIG.COLORS.SUCCESS : GAME_CONFIG.COLORS.DANGER, 0.5);
    bg.strokeRoundedRect(x, y, panelWidth, panelHeight, 12);
    bg.setDepth(GAME_CONFIG.Z.UI_PANEL);

    let currentY = y + 40;

    // Result title
    const titleColor = this.resultData.success ? GAME_CONFIG.COLORS.SUCCESS : GAME_CONFIG.COLORS.DANGER;
    const titleText = this.resultData.success ? 'MISSION COMPLETE' : 'MISSION FAILED';
    
    this.add.text(width/2, currentY, titleText, {
      fontSize: '32px',
      color: `#${titleColor.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    currentY += 50;

    // Stars
    if (this.resultData.success) {
      let starX = width/2 - 60;
      for (let i = 0; i < 3; i++) {
        const earned = i < this.resultData.stars;
        const star = this.add.text(starX, currentY, '★', {
          fontSize: '48px',
          color: `#${(earned ? GAME_CONFIG.COLORS.APHE_YELLOW : GAME_CONFIG.COLORS.TEXT_DIM).toString(16).padStart(6, '0')}`,
        }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT);
        
        if (earned) {
          this.tweens.add({
            targets: star,
            scale: { from: 0, to: 1 },
            duration: 300,
            delay: i * 150,
            ease: 'Back.out',
          });
        }
        
        starX += 60;
      }
      currentY += 70;
    }

    // Stats
    const stats = [
      { label: 'SHOTS USED', value: `${this.resultData.shotsUsed}/${this.resultData.shotsLimit}`, color: GAME_CONFIG.COLORS.TEXT },
      { label: 'EFFICIENCY', value: this.resultData.shotsLimit > 0 ? `${Math.round((1 - this.resultData.shotsUsed / this.resultData.shotsLimit) * 100)}%` : '0%', color: GAME_CONFIG.COLORS.PRIMARY },
    ];

    if (this.resultData.success) {
      const chapterData = saveSystem.getChapterProgress(this.resultData.chapter);
      const stageId = `ch${this.resultData.chapter}_st${this.resultData.stage}`;
      const bestShots = chapterData?.stages[stageId]?.bestShots || this.resultData.shotsUsed;
      stats.push({ label: 'BEST SHOTS', value: bestShots.toString(), color: GAME_CONFIG.COLORS.APHE_YELLOW });
    }

    stats.forEach(stat => {
      this.add.text(width/2 - 180, currentY, stat.label, {
        fontSize: '14px',
        color: `#${GAME_CONFIG.COLORS.TEXT_DIM.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
      }).setDepth(GAME_CONFIG.Z.UI_CONTENT);
      
      this.add.text(width/2 + 180, currentY, stat.value, {
        fontSize: '20px',
        color: `#${stat.color.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }).setOrigin(1, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT);
      currentY += 40;
    });

    currentY += 20;

    // Rewards
    if (this.resultData.success && this.resultData.reward > 0) {
      this.add.text(width/2, currentY, 'REWARDS', {
        fontSize: '16px',
        color: `#${GAME_CONFIG.COLORS.TEXT_DIM.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT);
      currentY += 30;

      const rewards = [
        { label: 'Completion', amount: 100 },
        { label: 'Star Bonus', amount: this.resultData.stars * 50 },
      ];
      
      if (this.resultData.isFirstClear) {
        rewards.push({ label: 'First Clear', amount: 200 });
      }

      rewards.forEach(reward => {
        this.add.text(width/2 - 180, currentY, reward.label, {
          fontSize: '14px',
          color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
          fontFamily: 'Arial, sans-serif',
        }).setDepth(GAME_CONFIG.Z.UI_CONTENT);
        
        this.add.text(width/2 + 180, currentY, `+${reward.amount}`, {
          fontSize: '16px',
          color: `#${GAME_CONFIG.COLORS.APHE_YELLOW.toString(16).padStart(6, '0')}`,
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
        }).setOrigin(1, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT);
        currentY += 30;
      });

      // Total
      this.add.text(width/2 - 180, currentY, 'TOTAL', {
        fontSize: '16px',
        color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }).setDepth(GAME_CONFIG.Z.UI_CONTENT);
      
      this.add.text(width/2 + 180, currentY, `+${this.resultData.reward}`, {
        fontSize: '20px',
        color: `#${GAME_CONFIG.COLORS.APHE_YELLOW.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }).setOrigin(1, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT);
      currentY += 40;
    }

    // Progress
    currentY += 10;
    const totalStars = saveSystem.getTotalStars();
    this.add.text(width/2, currentY, `TOTAL STARS: ${totalStars}`, {
      fontSize: '16px',
      color: `#${GAME_CONFIG.COLORS.APHE_YELLOW.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT);
  }

  private createButtons(): void {
    const { width, height } = this.scale;
    const btnWidth = 160;
    const btnHeight = 50;
    const spacing = 20;
    const startX = (width - (3 * btnWidth + 2 * spacing)) / 2;
    const y = height - 100;

    // Retry
    const retryBtn = this.add.container(startX + btnWidth/2, y).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    const retryBg = this.add.graphics();
    retryBg.fillStyle(GAME_CONFIG.COLORS.PRIMARY, 1);
    retryBg.fillRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 8);
    retryBg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.3);
    retryBg.strokeRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 8);
    retryBtn.add(retryBg);
    this.add.text(0, 0, 'RETRY', {
      fontSize: '18px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    retryBtn.setSize(btnWidth, btnHeight);
    retryBtn.setInteractive(new Phaser.Geom.Rectangle(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight), Phaser.Geom.Rectangle.Contains);
    retryBtn.on('pointerdown', () => {
      this.audioSystem.playUIConfirm();
      this.scene.start('GameScene', { 
        chapter: this.resultData.chapter, 
        stage: this.resultData.stage,
        levelData: null, // Will regenerate with same seed
      });
    });

    // Next
    if (this.resultData.success && this.resultData.stage < 8) {
      const nextBtn = this.add.container(startX + btnWidth + spacing + btnWidth/2, y).setDepth(GAME_CONFIG.Z.UI_CONTENT);
      const nextBg = this.add.graphics();
      nextBg.fillStyle(GAME_CONFIG.COLORS.SUCCESS, 1);
      nextBg.fillRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 8);
      nextBg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.3);
      nextBg.strokeRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 8);
      nextBtn.add(nextBg);
      this.add.text(0, 0, 'NEXT', {
        fontSize: '18px',
        color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      nextBtn.setSize(btnWidth, btnHeight);
      nextBtn.setInteractive(new Phaser.Geom.Rectangle(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight), Phaser.Geom.Rectangle.Contains);
      nextBtn.on('pointerdown', () => {
        this.audioSystem.playUIConfirm();
        this.scene.start('BriefingScene', { 
          chapter: this.resultData.chapter, 
          stage: this.resultData.stage + 1,
        });
      });
    }

    // Campaign
    const campaignBtn = this.add.container(startX + 2 * (btnWidth + spacing) + btnWidth/2, y).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    const campaignBg = this.add.graphics();
    campaignBg.fillStyle(GAME_CONFIG.COLORS.PANEL, 1);
    campaignBg.fillRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 8);
    campaignBg.lineStyle(2, GAME_CONFIG.COLORS.TEXT_DIM, 0.3);
    campaignBg.strokeRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 8);
    campaignBtn.add(campaignBg);
    this.add.text(0, 0, 'CAMPAIGN', {
      fontSize: '18px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    campaignBtn.setSize(btnWidth, btnHeight);
    campaignBtn.setInteractive(new Phaser.Geom.Rectangle(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight), Phaser.Geom.Rectangle.Contains);
    campaignBtn.on('pointerdown', () => {
      this.audioSystem.playUICancel();
      this.scene.start('CampaignScene', { chapter: this.resultData.chapter, stage: this.resultData.stage });
    });
  }

  private handleResize(): void {
    this.drawBackground();
  }

  destroy(): void {
    this.backgroundGraphics?.destroy();
  }
}
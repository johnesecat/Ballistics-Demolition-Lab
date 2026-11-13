import { Scene } from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { saveSystem } from '../systems/SaveSystem';
import { AudioSystem } from '../systems/AudioSystem';
import { LevelGenerator } from '../generation/LevelGenerator';

export class CampaignScene extends Scene {
  private audioSystem!: AudioSystem;
  private backgroundGraphics!: Phaser.GameObjects.Graphics;
  private chapterButtons: Phaser.GameObjects.Container[] = [];
  private stageGrids: Map<number, Phaser.GameObjects.Container> = new Map();
  private currentChapter: number = 1;
  private chapterTabs: Phaser.GameObjects.Container[] = [];
  private backButton!: Phaser.GameObjects.Container;
  private currencyText!: Phaser.GameObjects.Text;
  private starText!: Phaser.GameObjects.Text;
  private selectedStage: string | null = null;
  private stageInfoPanel!: Phaser.GameObjects.Container;
  private playButton!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'CampaignScene' });
  }

  init(data: { chapter?: number; stage?: number }): void {
    this.currentChapter = data.chapter || 1;
  }

  create(): void {
    this.audioSystem = this.game.registry.get('audioSystem');
    
    this.createBackground();
    this.createHeader();
    this.createChapterTabs();
    this.createStageGrid();
    this.createStageInfoPanel();
    this.createBackButton();
    
    this.scale.on('resize', this.handleResize, this);
    this.showChapter(this.currentChapter);
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
    
    gfx.lineStyle(1, 0x1a2a3a, 0.2);
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
  }

  private createHeader(): void {
    const { width } = this.scale;
    
    this.add.text(20, 15, 'CAMPAIGN', {
      fontSize: '28px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setDepth(GAME_CONFIG.Z.UI_CONTENT);

    // Currency
    const data = saveSystem.getData();
    this.currencyText = this.add.text(width - 120, 15, `COINS: ${data.currency}`, {
      fontSize: '18px',
      color: `#${GAME_CONFIG.COLORS.APHE_YELLOW.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(1, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT);

    this.starText = this.add.text(width - 120, 40, `STARS: ${data.totalStars}`, {
      fontSize: '16px',
      color: `#${GAME_CONFIG.COLORS.APHE_YELLOW.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(1, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT);
  }

  private createChapterTabs(): void {
    const { width } = this.scale;
    const tabWidth = 120;
    const tabHeight = 40;
    const spacing = 4;
    const startX = (width - (GAME_CONFIG.CHAPTERS * tabWidth + (GAME_CONFIG.CHAPTERS - 1) * spacing)) / 2;
    const y = 70;

    for (let i = 1; i <= GAME_CONFIG.CHAPTERS; i++) {
      const x = startX + (i - 1) * (tabWidth + spacing);
      const chapterData = saveSystem.getChapterProgress(i);
      const unlocked = chapterData?.unlocked ?? (i === 1);

      const tab = this.add.container(x + tabWidth/2, y).setDepth(GAME_CONFIG.Z.UI_CONTENT);
      
      const bg = this.add.graphics();
      const color = unlocked ? (i === this.currentChapter ? GAME_CONFIG.COLORS.PRIMARY : GAME_CONFIG.COLORS.PANEL) : 0x2a2a2a;
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(-tabWidth/2, -tabHeight/2, tabWidth, tabHeight, 6);
      bg.lineStyle(2, i === this.currentChapter ? GAME_CONFIG.COLORS.TEXT : GAME_CONFIG.COLORS.TEXT_DIM, 0.3);
      bg.strokeRoundedRect(-tabWidth/2, -tabHeight/2, tabWidth, tabHeight, 6);
      tab.add(bg);

      const label = this.add.text(0, 0, `CHAPTER ${i}`, {
        fontSize: '14px',
        color: `#${(unlocked ? GAME_CONFIG.COLORS.TEXT : GAME_CONFIG.COLORS.TEXT_DIM).toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      tab.add(label);

      if (unlocked) {
        tab.setSize(tabWidth, tabHeight);
        tab.setInteractive(new Phaser.Geom.Rectangle(-tabWidth/2, -tabHeight/2, tabWidth, tabHeight), Phaser.Geom.Rectangle.Contains);
        
        tab.on('pointerover', () => {
          if (i !== this.currentChapter) {
            bg.clear();
            bg.fillStyle(GAME_CONFIG.COLORS.PANEL_LIGHT, 1);
            bg.fillRoundedRect(-tabWidth/2, -tabHeight/2, tabWidth, tabHeight, 6);
            bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.4);
            bg.strokeRoundedRect(-tabWidth/2, -tabHeight/2, tabWidth, tabHeight, 6);
          }
        });
        
        tab.on('pointerout', () => {
          if (i !== this.currentChapter) {
            bg.clear();
            bg.fillStyle(GAME_CONFIG.COLORS.PANEL, 1);
            bg.fillRoundedRect(-tabWidth/2, -tabHeight/2, tabWidth, tabHeight, 6);
            bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT_DIM, 0.3);
            bg.strokeRoundedRect(-tabWidth/2, -tabHeight/2, tabWidth, tabHeight, 6);
          }
        });
        
        tab.on('pointerdown', () => {
          this.audioSystem?.playUIConfirm();
          this.showChapter(i);
        });
      } else {
        // Lock icon
        this.add.text(0, 10, '🔒', { fontSize: '16px' }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
      }

      this.chapterTabs.push(tab);
    }
  }

  private createStageGrid(): void {
    // Container for stage grids (one per chapter)
    for (let i = 1; i <= GAME_CONFIG.CHAPTERS; i++) {
      const grid = this.add.container(0, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT);
      grid.setVisible(false);
      this.stageGrids.set(i, grid);
    }
  }

  private createStageInfoPanel(): void {
    const { width, height } = this.scale;
    const panelWidth = 320;
    const panelHeight = height - 180;
    const x = width - panelWidth - 20;
    const y = 120;

    this.stageInfoPanel = this.add.container(x, y).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    
    const bg = this.add.graphics();
    bg.fillStyle(GAME_CONFIG.COLORS.PANEL, 0.95);
    bg.fillRoundedRect(0, 0, panelWidth, panelHeight, 8);
    bg.lineStyle(2, GAME_CONFIG.COLORS.PRIMARY, 0.3);
    bg.strokeRoundedRect(0, 0, panelWidth, panelHeight, 8);
    this.stageInfoPanel.add(bg);

    // Title
    this.add.text(panelWidth/2, 20, 'STAGE INFO', {
      fontSize: '18px',
      color: `#${GAME_CONFIG.COLORS.PRIMARY.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);

    // Content will be filled dynamically
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
      this.scene.start('MainMenuScene');
    });
  }

  private showChapter(chapter: number): void {
    this.currentChapter = chapter;
    
    // Update tab visuals
    this.chapterTabs.forEach((tab, i) => {
      const bg = tab.getAt(0) as Phaser.GameObjects.Graphics;
      const label = tab.getAt(1) as Phaser.GameObjects.Text;
      const isActive = i + 1 === chapter;
      const chapterData = saveSystem.getChapterProgress(i + 1);
      const unlocked = chapterData?.unlocked ?? (i + 1 === 1);
      
      if (unlocked) {
        bg.clear();
        bg.fillStyle(isActive ? GAME_CONFIG.COLORS.PRIMARY : GAME_CONFIG.COLORS.PANEL, 1);
        bg.fillRoundedRect(-60, -20, 120, 40, 6);
        bg.lineStyle(2, isActive ? GAME_CONFIG.COLORS.TEXT : GAME_CONFIG.COLORS.TEXT_DIM, isActive ? 0.5 : 0.3);
        bg.strokeRoundedRect(-60, -20, 120, 40, 6);
        label.setColor(`#${(isActive ? GAME_CONFIG.COLORS.TEXT : GAME_CONFIG.COLORS.TEXT_DIM).toString(16).padStart(6, '0')}`);
      }
    });

    // Hide all grids, show current
    this.stageGrids.forEach((grid, ch) => {
      grid.setVisible(ch === chapter);
    });

    // Build stage grid for this chapter
    this.buildStageGrid(chapter);
    
    // Clear selection
    this.selectedStage = null;
    this.updateStageInfoPanel(null);
  }

  private buildStageGrid(chapter: number): void {
    const grid = this.stageGrids.get(chapter)!;
    grid.removeAll(true);
    
    const { width, height } = this.scale;
    const gridX = 40;
    const gridY = 120;
    const stageSize = 100;
    const spacing = 15;
    const cols = 4;
    const rows = 2;
    
    const chapterData = saveSystem.getChapterProgress(chapter);
    const unlocked = chapterData?.unlocked ?? (chapter === 1);

    for (let stage = 1; stage <= GAME_CONFIG.STAGES_PER_CHAPTER; stage++) {
      const col = (stage - 1) % cols;
      const row = Math.floor((stage - 1) / cols);
      const x = gridX + col * (stageSize + spacing) + stageSize / 2;
      const y = gridY + row * (stageSize + spacing) + stageSize / 2;
      const stageId = `ch${chapter}_st${stage}`;
      
      const stageData = chapterData?.stages[stageId];
      const completed = stageData?.completed ?? false;
      const stars = stageData?.stars ?? 0;
      const isUnlocked = unlocked && (stage === 1 || this.isStageUnlocked(chapter, stage - 1));
      
      const btn = this.add.container(x, y).setDepth(GAME_CONFIG.Z.UI_CONTENT);
      
      // Background
      const bg = this.add.graphics();
      let color = GAME_CONFIG.COLORS.PANEL;
      if (!isUnlocked) color = 0x1a1a2a;
      else if (completed) color = GAME_CONFIG.COLORS.SUCCESS;
      else if (stage === this.getCurrentStageForChapter(chapter)) color = GAME_CONFIG.COLORS.PRIMARY;
      
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(-stageSize/2, -stageSize/2, stageSize, stageSize, 8);
      bg.lineStyle(2, 
        !isUnlocked ? GAME_CONFIG.COLORS.TEXT_DIM : 
        completed ? GAME_CONFIG.COLORS.SUCCESS : 
        GAME_CONFIG.COLORS.PRIMARY, 
        0.5
      );
      bg.strokeRoundedRect(-stageSize/2, -stageSize/2, stageSize, stageSize, 8);
      btn.add(bg);

      // Stage number
      const numText = this.add.text(0, -30, `${stage}`, {
        fontSize: '28px',
        color: `#${(!isUnlocked ? GAME_CONFIG.COLORS.TEXT_DIM : GAME_CONFIG.COLORS.TEXT).toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      btn.add(numText);

      // Stars
      if (completed) {
        for (let s = 0; s < 3; s++) {
          const starX = -25 + s * 18;
          const starColor = s < stars ? GAME_CONFIG.COLORS.APHE_YELLOW : GAME_CONFIG.COLORS.TEXT_DIM;
          this.add.text(starX, 10, '★', {
            fontSize: '16px',
            color: `#${starColor.toString(16).padStart(6, '0')}`,
          }).setOrigin(0.5);
        }
      } else if (!isUnlocked) {
        this.add.text(0, 0, '🔒', { fontSize: '24px' }).setOrigin(0.5);
      }

      if (isUnlocked) {
        btn.setSize(stageSize, stageSize);
        btn.setInteractive(new Phaser.Geom.Rectangle(-stageSize/2, -stageSize/2, stageSize, stageSize), Phaser.Geom.Rectangle.Contains);
        
        btn.on('pointerover', () => {
          if (!completed) {
            bg.clear();
            bg.fillStyle(GAME_CONFIG.COLORS.PANEL_LIGHT, 1);
            bg.fillRoundedRect(-stageSize/2, -stageSize/2, stageSize, stageSize, 8);
            bg.lineStyle(2, GAME_CONFIG.COLORS.PRIMARY, 0.7);
            bg.strokeRoundedRect(-stageSize/2, -stageSize/2, stageSize, stageSize, 8);
          }
        });
        
        btn.on('pointerout', () => {
          if (!completed && this.selectedStage !== stageId) {
            bg.clear();
            bg.fillStyle(color, 1);
            bg.fillRoundedRect(-stageSize/2, -stageSize/2, stageSize, stageSize, 8);
            bg.lineStyle(2, GAME_CONFIG.COLORS.PRIMARY, 0.5);
            bg.strokeRoundedRect(-stageSize/2, -stageSize/2, stageSize, stageSize, 8);
          }
        });
        
        btn.on('pointerdown', () => {
          this.audioSystem?.playUISelect();
          this.selectStage(chapter, stage, stageId);
        });
      }
    }
  }

  private isStageUnlocked(chapter: number, stage: number): boolean {
    const chapterData = saveSystem.getChapterProgress(chapter);
    const prevStageId = `ch${chapter}_st${stage}`;
    const prevStage = chapterData?.stages[prevStageId];
    return prevStage?.completed ?? false;
  }

  private getCurrentStageForChapter(chapter: number): number {
    const data = saveSystem.getData();
    if (data.currentChapter === chapter) {
      return data.currentStage;
    }
    // Find first incomplete stage
    const chapterData = saveSystem.getChapterProgress(chapter);
    for (let stage = 1; stage <= GAME_CONFIG.STAGES_PER_CHAPTER; stage++) {
      const stageId = `ch${chapter}_st${stage}`;
      const stageData = chapterData?.stages[stageId];
      if (!stageData?.completed) return stage;
    }
    return GAME_CONFIG.STAGES_PER_CHAPTER;
  }

  private selectStage(chapter: number, stage: number, stageId: string): void {
    this.selectedStage = stageId;
    
    // Update visual selection
    const grid = this.stageGrids.get(chapter)!;
    grid.each((child: Phaser.GameObjects.Container) => {
      const bg = child.getAt(0) as Phaser.GameObjects.Graphics;
      const isSelected = child.getData('stageId') === stageId;
      if (isSelected) {
        bg.clear();
        bg.fillStyle(GAME_CONFIG.COLORS.SELECTION, 0.3);
        bg.fillRoundedRect(-50, -50, 100, 100, 8);
        bg.lineStyle(3, GAME_CONFIG.COLORS.SELECTION, 1);
        bg.strokeRoundedRect(-50, -50, 100, 100, 8);
      }
    });

    // Generate level data for preview
    const levelGenerator = new LevelGenerator(this, this.matter, null as any);
    const levelData = levelGenerator.generate({
      chapter,
      stage,
      difficulty: 1,
      width: this.scale.width,
      height: this.scale.height,
    });

    this.updateStageInfoPanel({
      chapter,
      stage,
      stageId,
      levelData,
      completed: false,
    });

    // Show play button
    this.showPlayButton(true);
  }

  private updateStageInfoPanel(data: any): void {
    const panel = this.stageInfoPanel;
    panel.removeAll(true);
    
    const { width: panelWidth, height: panelHeight } = { width: 320, height: this.scale.height - 180 };
    
    const bg = this.add.graphics();
    bg.fillStyle(GAME_CONFIG.COLORS.PANEL, 0.95);
    bg.fillRoundedRect(0, 0, panelWidth, panelHeight, 8);
    bg.lineStyle(2, GAME_CONFIG.COLORS.PRIMARY, 0.3);
    bg.strokeRoundedRect(0, 0, panelWidth, panelHeight, 8);
    panel.add(bg);

    if (!data) {
      this.add.text(panelWidth/2, panelHeight/2, 'SELECT A STAGE', {
        fontSize: '16px',
        color: `#${GAME_CONFIG.COLORS.TEXT_DIM.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
      }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.UI_CONTENT + 1);
      return;
    }

    let y = 30;
    const addText = (text: string, fontSize: number = 14, color: number = GAME_CONFIG.COLORS.TEXT, bold: boolean = false, centered: boolean = true) => {
      const txt = this.add.text(centered ? panelWidth/2 : 15, y, text, {
        fontSize: `${fontSize}px`,
        color: `#${color.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: bold ? 'bold' : 'normal',
      }).setOrigin(centered ? 0.5 : 0, 0);
      panel.add(txt);
      y += fontSize + 8;
      return txt;
    };

    addText(`STAGE ${data.stage}`, 20, GAME_CONFIG.COLORS.PRIMARY, true);
    addText(`CHAPTER ${data.chapter}`, 14, GAME_CONFIG.COLORS.TEXT_DIM);
    
    y += 10;
    
    if (data.levelData) {
      const obj = data.levelData.objective;
      addText('OBJECTIVE:', 14, GAME_CONFIG.COLORS.PRIMARY, true, false);
      addText(obj.description, 13, GAME_CONFIG.COLORS.TEXT, false, false);
      
      y += 10;
      addText(`SHOTS: ${data.levelData.shotLimit}`, 14, GAME_CONFIG.COLORS.TEXT, false, false);
      addText(`STARS: ${data.levelData.starThresholds[1]}/${data.levelData.starThresholds[2]}/${data.levelData.starThresholds[3]} shots`, 13, GAME_CONFIG.COLORS.TEXT_DIM, false, false);
    }
  }

  private showPlayButton(show: boolean): void {
    if (this.playButton) {
      this.playButton.destroy();
    }
    
    if (!show) return;
    
    const { width, height } = this.scale;
    this.playButton = this.add.container(width - 180, height - 80).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    
    const bg = this.add.graphics();
    bg.fillStyle(GAME_CONFIG.COLORS.SUCCESS, 1);
    bg.fillRoundedRect(-100, -30, 200, 60, 8);
    bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.3);
    bg.strokeRoundedRect(-100, -30, 200, 60, 8);
    this.playButton.add(bg);

    this.add.text(0, 0, 'PLAY MISSION', {
      fontSize: '20px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.playButton.setSize(200, 60);
    this.playButton.setInteractive(new Phaser.Geom.Rectangle(-100, -30, 200, 60), Phaser.Geom.Rectangle.Contains);
    
    this.playButton.on('pointerdown', () => {
      this.audioSystem?.playUIConfirm();
      const data = saveSystem.getData();
      saveSystem.setCurrentMission(this.currentChapter, parseInt(this.selectedStage!.split('_st')[1]));
      this.scene.start('BriefingScene', { 
        chapter: this.currentChapter, 
        stage: parseInt(this.selectedStage!.split('_st')[1]) 
      });
    });
  }

  private handleResize(): void {
    this.drawBackground();
    // Rebuild UI - simplified for now
  }

  destroy(): void {
    this.backgroundGraphics?.destroy();
    this.stageInfoPanel?.destroy();
    this.playButton?.destroy();
    this.stageGrids.forEach(grid => grid.destroy());
  }
}
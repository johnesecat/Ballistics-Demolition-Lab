import { Scene } from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { saveSystem } from '../systems/SaveSystem';
import { AudioSystem } from '../systems/AudioSystem';

export class SettingsScene extends Scene {
  private audioSystem!: AudioSystem;
  private backgroundGraphics!: Phaser.GameObjects.Graphics;
  private backButton!: Phaser.GameObjects.Container;
  private resetButton!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'SettingsScene' });
  }

  create(): void {
    this.audioSystem = this.game.registry.get('audioSystem');
    
    this.createBackground();
    this.createHeader();
    this.createSettings();
    this.createBackButton();
    this.createResetButton();
    
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

  private createHeader(): void {
    this.add.text(20, 15, 'SETTINGS', {
      fontSize: '28px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setDepth(GAME_CONFIG.Z.UI_CONTENT);
  }

  private createSettings(): void {
    const { width, height } = this.scale;
    const settings = saveSystem.getSettings();
    let y = 80;
    const centerX = width / 2;

    const addSection = (title: string) => {
      this.add.text(centerX, y, title, {
        fontSize: '18px',
        color: `#${GAME_CONFIG.COLORS.PRIMARY.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0).setDepth(GAME_CONFIG.Z.UI_CONTENT);
      y += 35;
    };

    const addSlider = (label: string, key: keyof typeof settings, min: number, max: number, step: number, format: (v: number) => string) => {
      const container = this.add.container(centerX, y).setDepth(GAME_CONFIG.Z.UI_CONTENT);
      
      // Label with value
      const labelText = this.add.text(-180, 0, `${label}: ${format(settings[key])}`, {
        fontSize: '16px',
        color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
      }).setOrigin(0, 0.5);
      container.add(labelText);

      // Slider
      const sliderWidth = 300;
      const sliderHeight = 8;
      
      const track = this.add.graphics();
      track.fillStyle(0x334455, 1);
      track.fillRoundedRect(-sliderWidth/2, -sliderHeight/2, sliderWidth, sliderHeight, sliderHeight/2);
      container.add(track);

      const fill = this.add.graphics();
      const fillWidth = ((settings[key] - min) / (max - min)) * sliderWidth;
      fill.fillStyle(GAME_CONFIG.COLORS.PRIMARY, 1);
      fill.fillRoundedRect(-sliderWidth/2, -sliderHeight/2, fillWidth, sliderHeight, sliderHeight/2);
      container.add(fill);

      const handle = this.add.graphics();
      handle.fillStyle(GAME_CONFIG.COLORS.TEXT, 1);
      handle.fillCircle(-sliderWidth/2 + fillWidth, 0, 12);
      container.add(handle);

      container.setSize(sliderWidth, 40);
      container.setInteractive(new Phaser.Geom.Rectangle(-sliderWidth/2, -20, sliderWidth, 40), Phaser.Geom.Rectangle.Contains);
      
      let dragging = false;
      
      container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        dragging = true;
        updateValue(pointer);
      });

      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (dragging) updateValue(pointer);
      });

      this.input.on('pointerup', () => {
        dragging = false;
      });

      const updateValue = (pointer: Phaser.Input.Pointer) => {
        const localX = pointer.x - container.x;
        const rawValue = min + (localX + sliderWidth/2) / sliderWidth * (max - min);
        const newValue = Math.round(rawValue / step) * step;
        const clampedValue = Phaser.Math.Clamp(newValue, min, max);
        
        (settings as any)[key] = clampedValue;
        saveSystem.updateSettings({ [key]: clampedValue });
        
        const newFillWidth = ((clampedValue - min) / (max - min)) * sliderWidth;
        fill.clear();
        fill.fillStyle(GAME_CONFIG.COLORS.PRIMARY, 1);
        fill.fillRoundedRect(-sliderWidth/2, -sliderHeight/2, newFillWidth, sliderHeight, sliderHeight/2);
        
        handle.clear();
        handle.fillStyle(GAME_CONFIG.COLORS.TEXT, 1);
        handle.fillCircle(-sliderWidth/2 + newFillWidth, 0, 12);
        
        labelText.setText(`${label}: ${format(clampedValue)}`);
        
        // Apply immediately
        if (key === 'musicVolume' || key === 'sfxVolume') {
          this.audioSystem['set' + key.charAt(0).toUpperCase() + key.slice(1)](clampedValue);
        }
      };

      y += 50;
    };

    const addToggle = (label: string, key: keyof typeof settings) => {
      const container = this.add.container(centerX, y).setDepth(GAME_CONFIG.Z.UI_CONTENT);
      
      const labelText = this.add.text(-180, 0, label, {
        fontSize: '16px',
        color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
      }).setOrigin(0, 0.5);
      container.add(labelText);

      const toggleWidth = 60;
      const toggleHeight = 30;
      const toggleX = 100;
      
      const bg = this.add.graphics();
      bg.fillStyle(settings[key] ? GAME_CONFIG.COLORS.PRIMARY : 0x444444, 1);
      bg.fillRoundedRect(toggleX - toggleWidth/2, -toggleHeight/2, toggleWidth, toggleHeight, toggleHeight/2);
      container.add(bg);

      const knob = this.add.graphics();
      knob.fillStyle(GAME_CONFIG.COLORS.TEXT, 1);
      const knobX = settings[key] ? toggleX + toggleWidth/2 - 12 : toggleX - toggleWidth/2 + 12;
      knob.fillCircle(knobX, 0, 12);
      container.add(knob);

      container.setSize(200, 40);
      container.setInteractive(new Phaser.Geom.Rectangle(-180, -20, 380, 40), Phaser.Geom.Rectangle.Contains);
      
      container.on('pointerdown', () => {
        const newValue = !settings[key];
        (settings as any)[key] = newValue;
        saveSystem.updateSettings({ [key]: newValue });
        
        bg.clear();
        bg.fillStyle(newValue ? GAME_CONFIG.COLORS.PRIMARY : 0x444444, 1);
        bg.fillRoundedRect(toggleX - toggleWidth/2, -toggleHeight/2, toggleWidth, toggleHeight, toggleHeight/2);
        
        knob.clear();
        knob.fillStyle(GAME_CONFIG.COLORS.TEXT, 1);
        const newKnobX = newValue ? toggleX + toggleWidth/2 - 12 : toggleX - toggleWidth/2 + 12;
        knob.fillCircle(newKnobX, 0, 12);
        
        this.audioSystem?.playUISelect();
      });

      y += 50;
    };

    // Audio section
    addSection('AUDIO');
    addSlider('Master Volume', 'musicVolume', 0, 1, 0.05, v => Math.round(v * 100) + '%');
    addSlider('Music Volume', 'musicVolume', 0, 1, 0.05, v => Math.round(v * 100) + '%');
    addSlider('SFX Volume', 'sfxVolume', 0, 1, 0.05, v => Math.round(v * 100) + '%');

    // Visual section
    y += 20;
    addSection('VISUALS');
    addToggle('Camera Shake', 'cameraShake');
    addToggle('Reduced Effects', 'reducedEffects');
    addToggle('Show Trajectory', 'trajectoryVisible');

    // Controls section
    y += 20;
    addSection('CONTROLS');
    addSlider('Aim Sensitivity', 'aimSensitivity', 0.5, 2.0, 0.1, v => v.toFixed(1) + 'x');
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

  private createResetButton(): void {
    const { width, height } = this.scale;
    this.resetButton = this.add.container(width - 80, height - 50).setDepth(GAME_CONFIG.Z.UI_CONTENT);
    
    const bg = this.add.graphics();
    bg.fillStyle(GAME_CONFIG.COLORS.DANGER, 1);
    bg.fillRoundedRect(-80, -25, 160, 50, 6);
    bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.3);
    bg.strokeRoundedRect(-80, -25, 160, 50, 6);
    this.resetButton.add(bg);

    this.add.text(0, 0, 'RESET SETTINGS', {
      fontSize: '14px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.resetButton.setSize(160, 50);
    this.resetButton.setInteractive(new Phaser.Geom.Rectangle(-80, -25, 160, 50), Phaser.Geom.Rectangle.Contains);
    
    this.resetButton.on('pointerdown', () => {
      this.audioSystem?.playUIConfirm();
      this.showResetConfirm();
    });
  }

  private showResetConfirm(): void {
    const { width, height } = this.scale;
    
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.8);
    overlay.fillRect(0, 0, width, height);
    overlay.setDepth(GAME_CONFIG.Z.MODAL);

    const panel = this.add.container(width/2, height/2).setDepth(GAME_CONFIG.Z.MODAL + 1);
    
    const bg = this.add.graphics();
    bg.fillStyle(GAME_CONFIG.COLORS.PANEL, 1);
    bg.fillRoundedRect(-200, -100, 400, 200, 8);
    bg.lineStyle(2, GAME_CONFIG.COLORS.DANGER, 0.5);
    bg.strokeRoundedRect(-200, -100, 400, 200, 8);
    panel.add(bg);

    this.add.text(0, -50, 'RESET SETTINGS?', {
      fontSize: '22px',
      color: `#${GAME_CONFIG.COLORS.DANGER.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.MODAL + 2);

    this.add.text(0, -10, 'This will restore all settings to defaults.\nYour progress and unlocks will NOT be affected.', {
      fontSize: '14px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      align: 'center',
    }).setOrigin(0.5).setDepth(GAME_CONFIG.Z.MODAL + 2);

    // Cancel button
    const cancelBtn = this.add.container(0, 50).setDepth(GAME_CONFIG.Z.MODAL + 2);
    const cancelBg = this.add.graphics();
    cancelBg.fillStyle(GAME_CONFIG.COLORS.PANEL, 1);
    cancelBg.fillRoundedRect(-70, -20, 140, 40, 6);
    cancelBg.lineStyle(2, GAME_CONFIG.COLORS.TEXT_DIM, 0.3);
    cancelBg.strokeRoundedRect(-70, -20, 140, 40, 6);
    cancelBtn.add(cancelBg);
    this.add.text(0, 0, 'CANCEL', {
      fontSize: '16px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    cancelBtn.setSize(140, 40);
    cancelBtn.setInteractive(new Phaser.Geom.Rectangle(-70, -20, 140, 40), Phaser.Geom.Rectangle.Contains);
    cancelBtn.on('pointerdown', () => {
      this.audioSystem?.playUICancel();
      overlay.destroy();
      panel.destroy();
    });

    // Confirm button
    const confirmBtn = this.add.container(0, 100).setDepth(GAME_CONFIG.Z.MODAL + 2);
    const confirmBg = this.add.graphics();
    confirmBg.fillStyle(GAME_CONFIG.COLORS.DANGER, 1);
    confirmBg.fillRoundedRect(-70, -20, 140, 40, 6);
    confirmBg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.3);
    confirmBg.strokeRoundedRect(-70, -20, 140, 40, 6);
    confirmBtn.add(confirmBg);
    this.add.text(0, 0, 'RESET', {
      fontSize: '16px',
      color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    confirmBtn.setSize(140, 40);
    confirmBtn.setInteractive(new Phaser.Geom.Rectangle(-70, -20, 140, 40), Phaser.Geom.Rectangle.Contains);
    confirmBtn.on('pointerdown', () => {
      this.audioSystem?.playUIConfirm();
      saveSystem.updateSettings({
        musicVolume: GAME_CONFIG.AUDIO.MUSIC_VOLUME,
        sfxVolume: GAME_CONFIG.AUDIO.SFX_VOLUME,
        cameraShake: true,
        reducedEffects: false,
        trajectoryVisible: true,
        aimSensitivity: 1.0,
      });
      overlay.destroy();
      panel.destroy();
      this.scene.restart();
    });
  }

  private handleResize(): void {
    this.drawBackground();
  }

  destroy(): void {
    this.backgroundGraphics?.destroy();
  }
}
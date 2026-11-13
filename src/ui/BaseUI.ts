import { GAME_CONFIG } from '../config/gameConfig';

export interface UIComponent {
  destroy(): void;
  setVisible(visible: boolean): void;
  isVisible(): boolean;
}

export class BaseUIComponent implements UIComponent {
  protected scene: Phaser.Scene;
  protected container: Phaser.GameObjects.Container;
  protected visible: boolean = true;

  constructor(scene: Phaser.Scene, x: number = 0, y: number = 0) {
    this.scene = scene;
    this.container = scene.add.container(x, y);
    this.container.setDepth(GAME_CONFIG.Z.UI_CONTENT);
  }

  getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.container.setVisible(visible);
  }

  isVisible(): boolean {
    return this.visible;
  }

  destroy(): void {
    this.container.destroy();
  }

  protected createPanel(
    width: number,
    height: number,
    color: number = GAME_CONFIG.COLORS.PANEL,
    alpha: number = 0.95,
    radius: number = 8
  ): Phaser.GameObjects.Graphics {
    const gfx = this.scene.make.graphics({ x: 0, y: 0, add: false });
    gfx.fillStyle(color, alpha);
    gfx.fillRoundedRect(-width/2, -height/2, width, height, radius);
    gfx.lineStyle(2, GAME_CONFIG.COLORS.PRIMARY, 0.5);
    gfx.strokeRoundedRect(-width/2, -height/2, width, height, radius);
    const texture = gfx.generateTexture(`panel_${width}x${height}_${Date.now()}`, width, height);
    gfx.destroy();
    return this.scene.add.image(0, 0, texture).setDepth(GAME_CONFIG.Z.UI_PANEL);
  }

  protected createButton(
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    callback: () => void,
    options: {
      color?: number;
      hoverColor?: number;
      textColor?: number;
      fontSize?: number;
      radius?: number;
      enabled?: boolean;
    } = {}
  ): Phaser.GameObjects.Container {
    const {
      color = GAME_CONFIG.COLORS.PRIMARY,
      hoverColor = GAME_CONFIG.COLORS.PRIMARY_DIM,
      textColor = GAME_CONFIG.COLORS.TEXT,
      fontSize = 18,
      radius = 6,
      enabled = true,
    } = options;

    const btn = this.scene.add.container(x, y);
    const bg = this.scene.add.graphics();
    bg.fillStyle(enabled ? color : 0x444444, 1);
    bg.fillRoundedRect(-width/2, -height/2, width, height, radius);
    bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, enabled ? 0.3 : 0.1);
    bg.strokeRoundedRect(-width/2, -height/2, width, height, radius);
    btn.add(bg);

    const label = this.scene.add.text(0, 0, text, {
      fontSize: `${fontSize}px`,
      color: `#${textColor.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    btn.add(label);

    if (enabled) {
      btn.setSize(width, height);
      btn.setInteractive(new Phaser.Geom.Rectangle(-width/2, -height/2, width, height), Phaser.Geom.Rectangle.Contains);
      
      btn.on('pointerover', () => {
        bg.clear();
        bg.fillStyle(hoverColor, 1);
        bg.fillRoundedRect(-width/2, -height/2, width, height, radius);
        bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.5);
        bg.strokeRoundedRect(-width/2, -height/2, width, height, radius);
      });
      
      btn.on('pointerout', () => {
        bg.clear();
        bg.fillStyle(color, 1);
        bg.fillRoundedRect(-width/2, -height/2, width, height, radius);
        bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.3);
        bg.strokeRoundedRect(-width/2, -height/2, width, height, radius);
      });
      
      btn.on('pointerdown', () => {
        bg.clear();
        bg.fillStyle(0xaa5500, 1);
        bg.fillRoundedRect(-width/2, -height/2, width, height, radius);
        bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.5);
        bg.strokeRoundedRect(-width/2, -height/2, width, height, radius);
        callback();
      });
      
      btn.on('pointerup', () => {
        bg.clear();
        bg.fillStyle(hoverColor, 1);
        bg.fillRoundedRect(-width/2, -height/2, width, height, radius);
        bg.lineStyle(2, GAME_CONFIG.COLORS.TEXT, 0.5);
        bg.strokeRoundedRect(-width/2, -height/2, width, height, radius);
      });
    } else {
      label.setAlpha(0.5);
    }

    return btn;
  }

  protected createSlider(
    x: number,
    y: number,
    width: number,
    min: number,
    max: number,
    value: number,
    onChange: (value: number) => void,
    options: {
      height?: number;
      trackColor?: number;
      fillColor?: number;
      handleColor?: number;
      showValue?: boolean;
      step?: number;
    } = {}
  ): Phaser.GameObjects.Container {
    const {
      height = 8,
      trackColor = 0x334455,
      fillColor = GAME_CONFIG.COLORS.PRIMARY,
      handleColor = GAME_CONFIG.COLORS.TEXT,
      showValue = true,
      step = 1,
    } = options;

    const container = this.scene.add.container(x, y);
    
    const track = this.scene.add.graphics();
    track.fillStyle(trackColor, 1);
    track.fillRoundedRect(-width/2, -height/2, width, height, height/2);
    container.add(track);

    const fill = this.scene.add.graphics();
    const fillWidth = ((value - min) / (max - min)) * width;
    fill.fillStyle(fillColor, 1);
    fill.fillRoundedRect(-width/2, -height/2, fillWidth, height, height/2);
    container.add(fill);

    const handle = this.scene.add.graphics();
    const handleX = -width/2 + fillWidth;
    handle.fillStyle(handleColor, 1);
    handle.fillCircle(handleX, 0, height * 1.5);
    container.add(handle);

    if (showValue) {
      const valueText = this.scene.add.text(0, -height - 10, value.toString(), {
        fontSize: '14px',
        color: `#${GAME_CONFIG.COLORS.TEXT.toString(16).padStart(6, '0')}`,
        fontFamily: 'Arial, sans-serif',
      }).setOrigin(0.5);
      container.add(valueText);
      container.setData('valueText', valueText);
    }

    container.setSize(width, height * 3);
    container.setInteractive(new Phaser.Geom.Rectangle(-width/2, -height * 1.5, width, height * 3), Phaser.Geom.Rectangle.Contains);
    
    let dragging = false;
    
    container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      dragging = true;
      const localX = pointer.x - container.x;
      const newValue = Phaser.Math.Clamp(
        min + (localX + width/2) / width * (max - min),
        min, max
      );
      const steppedValue = Math.round(newValue / step) * step;
      this.updateSlider(container, fill, handle, valueText, steppedValue, min, max, width, height);
      onChange(steppedValue);
    });

    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (dragging) {
        const localX = pointer.x - container.x;
        const newValue = Phaser.Math.Clamp(
          min + (localX + width/2) / width * (max - min),
          min, max
        );
        const steppedValue = Math.round(newValue / step) * step;
        this.updateSlider(container, fill, handle, valueText, steppedValue, min, max, width, height);
        onChange(steppedValue);
      }
    });

    this.scene.input.on('pointerup', () => {
      dragging = false;
    });

    return container;
  }

  private updateSlider(
    container: Phaser.GameObjects.Container,
    fill: Phaser.GameObjects.Graphics,
    handle: Phaser.GameObjects.Graphics,
    valueText: Phaser.GameObjects.Text | undefined,
    value: number,
    min: number,
    max: number,
    width: number,
    height: number
  ): void {
    const fillWidth = ((value - min) / (max - min)) * width;
    fill.clear();
    fill.fillStyle(GAME_CONFIG.COLORS.PRIMARY, 1);
    fill.fillRoundedRect(-width/2, -height/2, fillWidth, height, height/2);
    
    handle.clear();
    handle.fillStyle(GAME_CONFIG.COLORS.TEXT, 1);
    handle.fillCircle(-width/2 + fillWidth, 0, height * 1.5);
    
    if (valueText) {
      valueText.setText(value.toString());
    }
    
    container.setData('value', value);
  }

  protected createText(
    x: number,
    y: number,
    text: string,
    options: {
      fontSize?: number;
      color?: number;
      align?: string;
      origin?: { x: number; y: number };
      wordWrap?: { width: number };
      fontStyle?: string;
    } = {}
  ): Phaser.GameObjects.Text {
    const {
      fontSize = 16,
      color = GAME_CONFIG.COLORS.TEXT,
      align = 'left',
      origin = { x: 0, y: 0 },
      wordWrap,
      fontStyle = 'normal',
    } = options;

    const txt = this.scene.add.text(x, y, text, {
      fontSize: `${fontSize}px`,
      color: `#${color.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial, sans-serif',
      fontStyle,
      align,
      wordWrap,
    }).setOrigin(origin.x, origin.y);

    return txt;
  }

  protected createIcon(
    x: number,
    y: number,
    texture: string,
    scale: number = 1
  ): Phaser.GameObjects.Image {
    return this.scene.add.image(x, y, texture).setScale(scale);
  }
}

export function createRoundedRect(
  scene: Phaser.Scene,
  width: number,
  height: number,
  color: number,
  alpha: number = 1,
  radius: number = 8,
  borderColor?: number,
  borderWidth: number = 2
): Phaser.GameObjects.Graphics {
  const gfx = scene.add.graphics();
  gfx.fillStyle(color, alpha);
  gfx.fillRoundedRect(0, 0, width, height, radius);
  if (borderColor) {
    gfx.lineStyle(borderWidth, borderColor, 1);
    gfx.strokeRoundedRect(0, 0, width, height, radius);
  }
  return gfx;
}

export function createGradientRect(
  scene: Phaser.Scene,
  width: number,
  height: number,
  color1: number,
  color2: number,
  horizontal: boolean = false
): Phaser.GameObjects.Graphics {
  const gfx = scene.add.graphics();
  const steps = horizontal ? width : height;
  
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const r = Math.floor(((color1 >> 16) & 0xff) * (1 - t) + ((color2 >> 16) & 0xff) * t);
    const g = Math.floor(((color1 >> 8) & 0xff) * (1 - t) + ((color2 >> 8) & 0xff) * t);
    const b = Math.floor((color1 & 0xff) * (1 - t) + (color2 & 0xff) * t);
    const color = (r << 16) | (g << 8) | b;
    
    gfx.fillStyle(color, 1);
    if (horizontal) {
      gfx.fillRect(i, 0, 1, height);
    } else {
      gfx.fillRect(0, i, width, 1);
    }
  }
  return gfx;
}
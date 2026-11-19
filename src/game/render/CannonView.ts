import Phaser from 'phaser';
import { CANNON, WORLD } from '../config';

export class CannonView {
  private scene: Phaser.Scene;
  private base: Phaser.GameObjects.Image;
  private barrelContainer: Phaser.GameObjects.Container;
  private barrel: Phaser.GameObjects.Image;
  private pin: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Graphics;
  private barrier: Phaser.GameObjects.Graphics;
  private recoilTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // Pixel shadow: three stacked bars instead of a smooth ellipse.
    this.shadow = scene.add.graphics();
    this.shadow.fillStyle(0x030608, 0.5);
    this.shadow.fillRect(CANNON.x - 68, WORLD.groundY + 1, 154, 3);
    this.shadow.fillStyle(0x030608, 0.42);
    this.shadow.fillRect(CANNON.x - 84, WORLD.groundY + 4, 186, 3);
    this.shadow.fillStyle(0x030608, 0.3);
    this.shadow.fillRect(CANNON.x - 58, WORLD.groundY + 7, 134, 2);
    this.shadow.setDepth(4);
    this.barrier = scene.add.graphics();
    this.barrier.setDepth(5);
    this.drawBarrier();
    this.base = scene.add.image(CANNON.x + 6, WORLD.groundY + 3, 'cannon-base');
    this.base.setOrigin(0.5, 1).setDepth(8);
    this.barrelContainer = scene.add.container(CANNON.x, CANNON.y);
    this.barrelContainer.setDepth(9);
    this.barrel = scene.add.image(0, 0, 'cannon-barrel');
    this.barrel.setOrigin(0, 0.5).setDisplaySize(CANNON.barrelLength, 18);
    this.barrelContainer.add(this.barrel);
    this.pin = scene.add.image(CANNON.x, CANNON.y, 'cannon-pin');
    this.pin.setDepth(10).setDisplaySize(20, 20);
    this.setAim(42);
  }

  private drawBarrier(): void {
    const g = this.barrier;
    // Sandbag / plate revetment under the firing line.
    g.fillStyle(0x0b1218, 0.9);
    g.fillRect(43, WORLD.groundY - 12, 122, 6);
    g.fillRect(38, WORLD.groundY - 6, 132, 11);
    for (let i = 0; i < 7; i += 1) {
      const x = 45 + i * 18;
      const y = WORLD.groundY - 10 + (i % 2) * 5;
      g.fillStyle(i % 2 === 0 ? 0x4f4637 : 0x5d5140, 1);
      g.fillRect(x, y, 17, 8);
      g.fillStyle(0x7a6b52, 0.5);
      g.fillRect(x + 1, y + 1, 13, 1);
      g.fillStyle(0x2a2722, 0.7);
      g.fillRect(x + 2, y + 6, 13, 1);
    }
    // hazard chevrons on the front plate
    g.fillStyle(0x1b232b, 1);
    g.fillRect(33, WORLD.groundY - 15, 142, 3);
    for (let i = 0; i < 11; i += 1) {
      g.fillStyle(i % 2 === 0 ? 0xb96d2f : 0x232d36, 1);
      g.fillRect(37 + i * 12, WORLD.groundY - 14, 7, 2);
    }
  }

  setAim(angleDeg: number): void {
    this.barrelContainer.rotation = Phaser.Math.DegToRad(-angleDeg);
  }

  setVisible(visible: boolean): void {
    this.base.setVisible(visible);
    this.barrelContainer.setVisible(visible);
    this.pin.setVisible(visible);
    this.shadow.setVisible(visible);
    this.barrier.setVisible(visible);
  }

  getBarrelTip(angleDeg: number): { x: number; y: number } {
    const rad = Phaser.Math.DegToRad(angleDeg);
    const length = CANNON.barrelLength;
    return {
      x: CANNON.x + Math.cos(rad) * length,
      y: CANNON.y - Math.sin(rad) * length,
    };
  }

  recoil(angleDeg: number): void {
    this.recoilTween?.stop();
    this.barrel.x = 0;
    const rad = Phaser.Math.DegToRad(angleDeg);
    this.recoilTween = this.scene.tweens.add({
      targets: this.barrel,
      x: -9,
      y: Math.sin(rad) * 2,
      duration: 54,
      yoyo: true,
      hold: 36,
      ease: 'Quad.easeOut',
    });
  }

  pulseReady(): void {
    this.scene.tweens.add({
      targets: this.pin,
      scale: { from: 1, to: 1.25 },
      alpha: { from: 1, to: 0.65 },
      duration: 800,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
    });
  }
}

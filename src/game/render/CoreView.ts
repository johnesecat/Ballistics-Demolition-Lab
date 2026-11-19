import Phaser from 'phaser';
import type { CoreState, RelayState } from '../stages/types';

export class CoreView {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private glow: Phaser.GameObjects.Image;
  private body: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Graphics;
  private scan: Phaser.GameObjects.Rectangle;
  private lastHp = -1;
  private lastDestroyed = false;
  private targetY: number | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setDepth(12);
    // Reference look: a solid red square in its housing. Effects may still use
    // the glow texture, but the mounted core itself is flat and halo-free.
    this.glow = scene.add.image(0, 0, 'core-glow').setDisplaySize(72, 72);
    this.glow.setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.12).setVisible(false);
    this.body = scene.add.image(0, 0, 'core-body').setDisplaySize(44, 44);
    this.ring = scene.add.graphics().setVisible(false);
    this.scan = scene.add.rectangle(0, -23, 31, 1, 0xff5040, 0.4).setVisible(false);
    this.container.add([this.glow, this.body, this.ring, this.scan]);
    this.container.setVisible(false);
  }

  setCore(core: CoreState, animateDrop = false): void {
    const previousY = this.container.y;
    const changedHp = this.lastHp !== core.hp;
    const changedDestroyed = this.lastDestroyed !== core.destroyed;
    this.container.setVisible(true);
    if (this.targetY === null || (!animateDrop && core.y !== this.targetY)) {
      this.container.setPosition(core.x, core.y);
      this.targetY = core.y;
    }
    if (animateDrop && Math.abs((this.targetY ?? core.y) - core.y) > 0.5) {
      this.targetY = core.y;
      this.scene.tweens.add({
        targets: this.container,
        y: core.y,
        duration: 560,
        ease: 'Bounce.easeOut',
      });
    } else if (!animateDrop && this.container.y !== previousY) {
      this.container.y = core.y;
    }
    this.body.setTexture(core.destroyed ? 'core-dead' : 'core-body');
    if (core.destroyed) {
      this.glow.setVisible(false);
      this.scan.setVisible(false);
      this.body.setDisplaySize(40, 40);
      this.ring.setVisible(false);
      if (changedDestroyed) {
        this.scene.tweens.add({
          targets: this.body,
          scale: { from: 1.25, to: 1 },
          duration: 300,
          ease: 'Quad.easeOut',
        });
      }
    } else {
      this.glow.setVisible(false);
      this.scan.setVisible(false);
      this.ring.setVisible(false);
      this.body.setDisplaySize(44, 44);
    }
    if (changedHp) this.drawRing(core);
    this.lastHp = core.hp;
    this.lastDestroyed = core.destroyed;
  }

  private drawRing(core: CoreState): void {
    const g = this.ring;
    g.clear();
    if (core.destroyed) return;
    const ratio = Math.max(0, Math.min(1, core.hp / core.maxHp));
    const segments = 12;
    for (let i = 0; i < segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2 - Math.PI / 2;
      const lit = i / segments < ratio;
      const radius = 26;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      g.fillStyle(lit ? 0xff2b1f : 0x401616, lit ? 0.9 : 0.65);
      g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
      if (lit) {
        g.fillStyle(0xff9a8a, 0.55);
        g.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
    // mount claws
    g.fillStyle(0x7d8d97, 0.72);
    g.fillRect(-31, -4, 3, 8);
    g.fillRect(28, -4, 3, 8);
    g.fillStyle(0x28323a, 1);
    g.fillRect(-32, -1, 4, 2);
    g.fillRect(28, -1, 4, 2);
  }

  hitFlash(): void {
    if (!this.body.visible) return;
    this.body.setTintFill(0xffffff);
    this.glow.setAlpha(0.95);
    this.scene.time.delayedCall(70, () => {
      this.body.clearTint();
      this.glow.setAlpha(0.56);
    });
    this.scene.tweens.add({
      targets: this.container,
      scaleX: 1.14,
      scaleY: 0.88,
      duration: 55,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  update(time: number): void {
    if (!this.container.visible || this.lastDestroyed) return;
    const pulse = 0.52 + Math.sin(time * 0.0027) * 0.07;
    this.glow.setAlpha(pulse);
    this.glow.setScale(1 + Math.sin(time * 0.0018) * 0.03);
    this.scan.setAlpha(0.18 + Math.sin(time * 0.004) * 0.15);
    this.scan.y = -23 + ((time * 0.013) % 46);
    if (this.lastHp >= 0) {
      // no per-frame ring rebuild: only alpha shimmer on mounted pixels
      this.ring.setAlpha(0.86 + Math.sin(time * 0.003) * 0.1);
    }
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  hide(): void {
    this.container.setVisible(false);
  }
}

export class RelayView {
  private scene: Phaser.Scene;
  private entries = new Map<
    string,
    {
      container: Phaser.GameObjects.Container;
      glow: Phaser.GameObjects.Image;
      marker: Phaser.GameObjects.Image;
      ring: Phaser.GameObjects.Graphics;
      alive: boolean;
    }
  >();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  setRelays(relays: RelayState[]): void {
    for (const relay of relays) {
      if (relay.cells.length === 0) continue;
      const x = relay.worldX ?? 0;
      const y = relay.worldY ?? 0;
      let entry = this.entries.get(relay.id);
      if (!entry) {
        const container = this.scene.add.container(x, y).setDepth(14);
        const glow = this.scene.add.image(0, 0, 'core-glow').setDisplaySize(72, 72);
        glow.setTint(0xff9b48).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.22);
        const ring = this.scene.add.graphics();
        const marker = this.scene.add.image(0, 0, 'relay-marker').setDisplaySize(30, 34);
        const bracket = this.scene.add.graphics();
        // Rectangle outlines drawn as four filled bars: no stroked paths.
        bracket.fillStyle(0xc98243, 0.6);
        bracket.fillRect(-26, -26, 52, 1);
        bracket.fillRect(-26, 25, 52, 1);
        bracket.fillRect(-26, -26, 1, 52);
        bracket.fillRect(25, -26, 1, 52);
        bracket.fillStyle(0x5a3928, 0.8);
        bracket.fillRect(-29, -29, 58, 1);
        bracket.fillRect(-29, 28, 58, 1);
        bracket.fillRect(-29, -29, 1, 58);
        bracket.fillRect(28, -29, 1, 58);
        container.add([glow, ring, marker, bracket]);
        entry = { container, glow, marker, ring, alive: relay.alive };
        this.entries.set(relay.id, entry);
      }
      entry.container.setPosition(x, y);
      if (entry.alive && !relay.alive) {
        // A brief destruction flare; actual debris comes from the damage events.
        entry.marker.setTintFill(0xffffff);
        this.scene.tweens.add({
          targets: entry.container,
          alpha: 0,
          scale: 1.5,
          duration: 340,
          ease: 'Quad.easeOut',
          onComplete: () => entry?.container.setVisible(false),
        });
        entry.alive = false;
      } else if (!entry.alive && relay.alive) {
        entry.container.setVisible(true).setAlpha(1).setScale(1);
        entry.marker.clearTint();
        entry.alive = true;
      }
      if (relay.alive) {
        entry.ring.clear();
        entry.ring.fillStyle(0xf0b26d, 0.35);
        entry.ring.fillRect(-1, -30, 2, 8);
        entry.ring.fillRect(-1, 22, 2, 8);
        entry.ring.fillRect(-30, -1, 8, 2);
        entry.ring.fillRect(22, -1, 8, 2);
      }
    }
    // remove markers for relays no longer part of the current stage
    for (const [id, entry] of this.entries) {
      if (!relays.some((relay) => relay.id === id)) {
        entry.container.destroy();
        this.entries.delete(id);
      }
    }
  }

  flash(id: string): void {
    const entry = this.entries.get(id);
    if (!entry || !entry.alive) return;
    entry.glow.setAlpha(0.85);
    this.scene.time.delayedCall(90, () => entry.glow.setAlpha(0.22));
  }

  update(time: number): void {
    for (const entry of this.entries.values()) {
      if (!entry.alive) continue;
      const blink = 0.5 + Math.sin(time * 0.006 + entry.container.x * 0.01) * 0.25;
      entry.glow.setAlpha(0.16 + blink * 0.18);
      entry.marker.setScale(1 + Math.sin(time * 0.004) * 0.03);
    }
  }

  setVisible(visible: boolean): void {
    for (const entry of this.entries.values()) entry.container.setVisible(visible);
  }

  clear(): void {
    for (const entry of this.entries.values()) entry.container.destroy();
    this.entries.clear();
  }
}

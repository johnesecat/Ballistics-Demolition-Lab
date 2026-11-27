import Phaser from 'phaser';
import { EFFECT_LIMITS, WORLD } from '../config';
import type { EffectEvent, DamageCellDelta } from '../sim/types';
import type { MaterialId } from '../materials';
import { MATERIALS } from '../materials';
import type { SoundName } from '../audio';
import { CoreView, RelayView } from './CoreView';
import { addPixelParticles } from './textures';

interface DebrisEntry {
  image: Phaser.Physics.Matter.Image;
  created: number;
}

interface BurnPatch {
  container: Phaser.GameObjects.Container;
  x: number;
  y: number;
  created: number;
}

const MATERIAL_SOUND: Record<MaterialId, SoundName> = {
  wood: 'impact-wood',
  brick: 'impact-brick',
  concrete: 'impact-concrete',
  steel: 'impact-steel',
  armor: 'impact-armor',
  slopes: 'impact-concrete',
};

export class EffectDirector {
  private scene: Phaser.Scene;
  private core: CoreView;
  private relays: RelayView;
  private reduced = false;
  private shakeEnabled = true;
  private debris: DebrisEntry[] = [];
  private burns: BurnPatch[] = [];
  private transient: Phaser.GameObjects.GameObject[] = [];
  private scorch: Phaser.GameObjects.Graphics;
  private sound: (name: SoundName) => void;

  constructor(
    scene: Phaser.Scene,
    core: CoreView,
    relays: RelayView,
    sound: (name: SoundName) => void,
  ) {
    this.scene = scene;
    this.core = core;
    this.relays = relays;
    this.sound = sound;
    this.scorch = scene.add.graphics().setDepth(7);
  }

  setOptions(reduced: boolean, shake: boolean): void {
    this.reduced = reduced;
    this.shakeEnabled = shake;
  }

  play(event: EffectEvent): void {
    switch (event.kind) {
      case 'muzzle':
        this.muzzle(event);
        break;
      case 'impact':
        this.impact(event);
        break;
      case 'penetrate':
        // Exit spark: the round has just crossed a layer and kept flying.
        this.flashAt(event.x, event.y, 7, 0xffe0a0, 0.6);
        this.spawnDebris(event.x, event.y, event.material ?? 'steel', 3, 0.35);
        break;
      case 'squash':
        // Body flattened against the plate: white bloom plus casing chips.
        this.flashAt(event.x, event.y, 12, 0xffffff, 0.8);
        this.spawnDebris(event.x, event.y, event.material ?? 'steel', 5, 0.5);
        if (this.shakeEnabled) this.scene.cameras.main.shake(90, 0.0022);
        this.sound('impact-steel');
        break;
      case 'separation':
        this.separation(event);
        break;
      case 'jet':
        this.jet(event);
        break;
      case 'blast':
        this.blast(event, false);
        break;
      case 'shock':
        this.blast(event, true);
        break;
      case 'spall':
        this.spall(event);
        break;
      case 'crush':
        this.crush(event);
        break;
      case 'fragment':
        this.fragments(event);
        break;
      case 'drill':
        this.drill(event);
        break;
      case 'tear':
        this.tear(event);
        break;
      case 'plug':
        this.plug(event);
        break;
      case 'rain':
        this.rain(event);
        break;
      case 'bounce':
        this.bounce(event);
        break;
      case 'collapse':
        this.collapse(event);
        break;
      case 'core-hit':
        this.coreHit(event);
        break;
      case 'core-drop':
        this.coreDrop(event);
        break;
      case 'burn-zone':
        this.burnZone(event);
        break;
      case 'burn-end':
        this.burnEnd(event);
        break;
      case 'miss':
        this.miss(event);
        break;
      case 'debris':
        this.spawnDebris(event.x, event.y, event.material ?? 'brick', event.count ?? 2, 0.5);
        break;
      case 'message':
        break;
    }
  }

  private limits() {
    return this.reduced ? EFFECT_LIMITS.reduced : EFFECT_LIMITS.normal;
  }

  private addTransient<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.transient.push(object);
    return object;
  }

  private flashAt(x: number, y: number, radius: number, color: number, boost = 1): void {
    const container = this.scene.add.container(x, y).setDepth(34);
    const g = this.scene.add.graphics();
    const r = Math.max(3, radius);
    // The footage blooms as an irregular white star, not a lens-flare cross:
    // a square hot core with straight pixel rays of different lengths.
    g.fillStyle(color, 0.55);
    g.fillRect(-r * 0.3, -r * 0.3, r * 0.6, r * 0.6);
    let seed = ((Math.round(x) * 374761393) ^ (Math.round(y) * 668265263)) >>> 0;
    for (let i = 0; i < 10; i += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const a = (i / 10) * Math.PI * 2 + (seed % 100) * 0.002;
      const len = r * (0.35 + ((seed >>> 8) % 90) / 100);
      const thick = i % 3 === 0 ? 2 : 1;
      for (let d = r * 0.24; d < len; d += 2) {
        g.fillStyle(i % 2 === 0 ? color : 0xfff4d8, 0.5 * (1 - d / len));
        g.fillRect(Math.cos(a) * d - thick / 2, Math.sin(a) * d - thick / 2, thick, thick);
      }
    }
    g.fillStyle(0xffffff, 0.95);
    g.fillRect(-r * 0.16, -r * 0.16, r * 0.32, r * 0.32);
    g.setBlendMode(Phaser.BlendModes.ADD);
    container.add(g);
    this.addTransient(container);
    this.scene.tweens.add({
      targets: container,
      alpha: { from: 1, to: 0 },
      scaleX: { from: 0.5, to: (this.reduced ? 1.05 : 1.35) * boost },
      scaleY: { from: 0.5, to: (this.reduced ? 1.05 : 1.35) * boost },
      duration: 170,
      ease: 'Quad.easeOut',
      onComplete: () => container.destroy(),
    });
  }

  private ringAt(x: number, y: number, radius: number, color: number, duration = 350): void {
    const container = this.scene.add.container(x, y).setDepth(33);
    const g = this.scene.add.graphics();
    const segments = this.reduced ? 18 : 30;
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      const block = i % 3 === 0 ? 3 : 1;
      g.fillStyle(i % 4 === 0 ? 0xffffff : color, i % 3 === 0 ? 0.85 : 0.4);
      g.fillRect(Math.cos(a) * 34 - block / 2, Math.sin(a) * 34 - block / 2, block, block);
    }
    g.setBlendMode(Phaser.BlendModes.ADD);
    container.add(g);
    const scale = radius / 34;
    container.setScale(0.2);
    this.addTransient(container);
    this.scene.tweens.add({
      targets: container,
      scale,
      alpha: { from: 1, to: 0 },
      duration,
      ease: 'Quad.easeOut',
      onComplete: () => container.destroy(),
    });
  }

  private shake(duration: number, intensity: number): void {
    if (!this.shakeEnabled) return;
    this.scene.cameras.main.shake(duration, intensity * (this.reduced ? 0.35 : 1));
  }

  private materialParticles(x: number, y: number, material: MaterialId, count: number, power = 1): void {
    const def = MATERIALS[material];
    const n = Math.max(1, Math.round(count * (this.reduced ? 0.4 : 1)));
    if (material === 'steel' || material === 'armor') {
      addPixelParticles(this.scene, x, y, 'spark', {
        count: Math.min(28, n * 3),
        color: def.colors.chip,
        speedMin: 45 * power,
        speedMax: 240 * power,
        lifespanMin: 130,
        lifespanMax: 430,
        gravityY: 370,
        scaleMin: 1,
        scaleMax: 0.2,
        angleMin: -175,
        angleMax: -5,
        blend: Phaser.BlendModes.ADD,
      });
      addPixelParticles(this.scene, x, y, 'px-1', {
        count: Math.min(16, n),
        color: 0xffffff,
        speedMin: 30,
        speedMax: 130,
        lifespanMin: 90,
        lifespanMax: 260,
        gravityY: 120,
        blend: Phaser.BlendModes.ADD,
      });
    } else if (material === 'wood') {
      addPixelParticles(this.scene, x, y, 'spark', {
        count: n * 2,
        color: def.colors.chip,
        speedMin: 30,
        speedMax: 160 * power,
        lifespanMin: 240,
        lifespanMax: 760,
        gravityY: 390,
        scaleMin: 0.9,
        scaleMax: 0.2,
        angleMin: -230,
        angleMax: 50,
      });
      // The recordings show chips, not a dust cloud. Keep one or two small
      // puffs for readability and let the pixel fragments carry the effect.
      addPixelParticles(this.scene, x, y, 'dust', {
        count: Math.max(1, Math.round(n * 0.25)),
        color: def.colors.dust,
        speedMin: 10,
        speedMax: 55,
        lifespanMin: 260,
        lifespanMax: 600,
        gravityY: -10,
        scaleMin: 0.8,
        scaleMax: 1.05,
        alpha: 0.26,
      });
    } else {
      addPixelParticles(this.scene, x, y, 'px-2', {
        count: n * 2,
        color: material === 'brick' ? def.colors.chip : def.colors.base,
        speedMin: 25,
        speedMax: 180 * power,
        lifespanMin: 260,
        lifespanMax: 900,
        gravityY: 430,
        scaleMin: 1,
        scaleMax: 0.25,
        angleMin: -240,
        angleMax: 60,
      });
      addPixelParticles(this.scene, x, y, 'dust', {
        count: Math.max(1, Math.round(n * 0.15)),
        color: def.colors.dust,
        speedMin: 8,
        speedMax: 55,
        lifespanMin: 280,
        lifespanMax: 600,
        gravityY: -14,
        scaleMin: 0.7,
        scaleMax: 0.9,
        alpha: 0.22,
      });
    }
  }

  private muzzle(event: EffectEvent): void {
    const angle = event.angle ?? 0;
    const flash = this.scene.add.container(event.x, event.y).setDepth(32);
    const g = this.scene.add.graphics();
    g.setRotation(angle);
    g.fillStyle(0xffe0a1, 0.95);
    g.fillRect(0, -5, 24, 10);
    g.fillRect(14, -2, 23, 4);
    g.fillStyle(0xff9d45, 0.7);
    g.fillRect(-3, -10, 12, 20);
    g.fillStyle(0xffffff, 0.8);
    g.fillRect(2, -2, 17, 4);
    g.setBlendMode(Phaser.BlendModes.ADD);
    flash.add(g);
    this.addTransient(flash);
    this.scene.tweens.add({
      targets: flash,
      scaleX: 1.35,
      scaleY: 0.8,
      alpha: 0,
      duration: 150,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });
    addPixelParticles(this.scene, event.x, event.y, 'smoke', {
      count: this.reduced ? 4 : 9,
      color: 0xb7b4a3,
      speedMin: 14,
      speedMax: 75,
      lifespanMin: 500,
      lifespanMax: 1300,
      gravityY: -12,
      scaleMin: 0.8,
      scaleMax: 2.2,
      alpha: 0.28,
      angleMin: -150,
      angleMax: -30,
    });
    addPixelParticles(this.scene, event.x, event.y, 'spark', {
      count: this.reduced ? 4 : 10,
      color: 0xffbb63,
      speedMin: 80,
      speedMax: 300,
      lifespanMin: 100,
      lifespanMax: 300,
      gravityY: 280,
      blend: Phaser.BlendModes.ADD,
      angleMin: -160,
      angleMax: -20,
    });
    this.shake(85, 0.0045);
    this.sound('cannon');
  }

  /**
   * Contact effect, dispatched by round family so each ammunition type reads
   * differently at the same wall:
   *
   *  jet (HEAT)      narrow white-hot channel along the wall face + long sparks
   *  he              round white flash bulb + expanding ring + radial spray
   *  hesh            flat charge pressed on the face, then rear-face breakup
   *  kinetic (AP)    tight bright spark cone driven into the plate
   *  soft / shock    flattened pad: squash flash and dust, never a white column
   *  aphe            piercing spark, the delayed charge supplies the blast
   *  split / drill / burn / rain / chain / popcorn
   *                  inherit the channel or pad read of their closest family
   */
  private impact(event: EffectEvent): void {
    const r = Math.max(12, (event.radius ?? event.width ?? 10) * 1.1);
    const material = event.material ?? 'concrete';
    const metal = material === 'steel' || material === 'armor';
    const family = event.family ?? 'kinetic';
    switch (family) {
      case 'he':
      case 'popcorn':
        this.roundImpact(event.x, event.y, r, material);
        break;
      case 'hesh':
        this.flatChargeImpact(event.x, event.y, r, material);
        break;
      case 'soft':
      case 'shock':
        this.padImpact(event.x, event.y, r, material);
        break;
      case 'jet':
      case 'burn':
      case 'rain':
      case 'chain':
        this.channelImpact(event.x, event.y, r, event.angle ?? 0, material);
        break;
      case 'split':
        this.channelImpact(event.x, event.y, r * 0.8, event.angle ?? 0, material);
        this.radialSpray(event.x, event.y, r, 0);
        break;
      case 'drill':
        this.channelImpact(event.x, event.y, r * 0.7, event.angle ?? 0, material);
        break;
      case 'aphe':
      case 'kinetic':
      default:
        this.kineticImpact(event.x, event.y, r, event.angle ?? 0, material);
        break;
    }
    // A hot steel face is scorched violet and amber, not sooted black; only the
    // non-metals keep the soot stamp.
    if (!metal) this.scorchAt(event.x, event.y, r * 0.85);
    if (family !== 'jet') this.materialParticles(event.x, event.y, material, metal ? (this.reduced ? 2 : 4) : (this.reduced ? 3 : 8), 1.2);
    this.sound(MATERIAL_SOUND[material]);
    const heavyBlast = family === 'he' || family === 'hesh' || family === 'popcorn';
    this.shake(heavyBlast ? 140 : metal ? 110 : 85, heavyBlast ? 0.0062 : metal ? 0.0052 : 0.0038);
  }

  /** HEAT / shaped charge: the wall-face column from the reference. */
  private channelImpact(x: number, y: number, r: number, angle: number, material: MaterialId): void {
    this.faceBurst(x, y, r);
    void angle;
    void material;
  }

  /** HE: round flash bulb, expanding ring and a radial spray of charge. */
  private roundImpact(x: number, y: number, r: number, material: MaterialId): void {
    this.roundFlash(x, y, r * 1.5);
    this.ringAt(x, y, r * 2.1, 0xffb066, 380);
    this.radialSpray(x, y, r, 1);
    this.glowAt(x, y, r * 1.15, 0xff7a24, 420, 0.34);
    void material;
  }

  /** HESH: a wide flat plate of fire on the face, then rear-face disruption. */
  private flatChargeImpact(x: number, y: number, r: number, material: MaterialId): void {
    const g = this.scene.add.graphics().setDepth(35);
    g.setBlendMode(Phaser.BlendModes.ADD);
    const w = r * 1.9;
    const h = Math.max(4, r * 0.5);
    g.fillStyle(0xfff0cf, 0.95);
    g.fillRect(x - w / 2, y - h / 2, w, h);
    g.fillStyle(0xffb066, 0.55);
    g.fillRect(x - w * 0.62, y - h * 0.85, w * 1.24, h * 1.7);
    this.addTransient(g);
    this.scene.tweens.add({
      targets: g,
      scaleX: 1.5,
      scaleY: 2.1,
      alpha: 0,
      duration: 300,
      ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
    this.glowAt(x, y, r, 0xffd0a0, 300, 0.28);
    addPixelParticles(this.scene, x, y, 'px-2', {
      count: this.reduced ? 4 : 12,
      color: MATERIALS[material].colors.chip,
      speedMin: 40,
      speedMax: 210,
      lifespanMin: 220,
      lifespanMax: 780,
      gravityY: 400,
      angleMin: -30,
      angleMax: 210,
    });
  }

  /** Soft / shock rounds: the pad squashes flat against the plate. */
  private padImpact(x: number, y: number, r: number, material: MaterialId): void {
    const g = this.scene.add.graphics().setDepth(34);
    g.setBlendMode(Phaser.BlendModes.ADD);
    g.fillStyle(0xffd2a0, 0.9);
    g.fillRect(x - r * 0.75, y - r * 0.2, r * 1.5, r * 0.4);
    this.addTransient(g);
    this.scene.tweens.add({
      targets: g,
      scaleX: 1.9,
      scaleY: 0.35,
      alpha: 0,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
    addPixelParticles(this.scene, x, y, 'dust', {
      count: this.reduced ? 4 : 10,
      color: MATERIALS[material].colors.dust,
      speedMin: 14,
      speedMax: 95,
      lifespanMin: 320,
      lifespanMax: 900,
      gravityY: -10,
      scaleMin: 1,
      scaleMax: 2.2,
      alpha: 0.4,
    });
  }

  /**
   * Kinetic entry on steel. The footage frame (imp_a) is a white-hot core on the
   * plate face, a violet-to-amber scorch hedge running along the metal each side
   * of the hole, a wide fan of embers thrown back out of the entry, and only a
   * handful of torn chips. It is a face event, not a spark cone: the bloom is
   * large and lasts long enough to read at 60 fps.
   */
  private metalEntry(x: number, y: number, r: number, angle: number, material: MaterialId): void {
    const radius = Math.max(17, r * 1.55);
    const bloom = this.scene.add.container(x, y).setDepth(36);
    const g = this.scene.add.graphics();
    g.setBlendMode(Phaser.BlendModes.ADD);
    this.pixelDisc(g, 0, 0, radius, 0xff7a24, 0.34);
    this.pixelDisc(g, 0, 0, radius * 0.7, 0xffc06a, 0.64);
    this.pixelDisc(g, 0, 0, radius * 0.4, 0xfff4dc, 0.92);
    this.pixelDisc(g, 0, 0, Math.max(2, radius * 0.16), 0xffffff, 1);
    bloom.add(g);
    bloom.setScale(0.55);
    this.addTransient(bloom);
    this.scene.tweens.add({
      targets: bloom,
      scale: this.reduced ? 1.05 : 1.3,
      alpha: 0,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => bloom.destroy(),
    });

    // Violet scorch hedge. It is laid along the face (the tangent), so it hugs
    // the plate instead of haloing into the air; the permanent heat field keeps
    // the same ring once the flash is gone.
    const band = this.scene.add.graphics().setDepth(33);
    const tangent = angle + Math.PI / 2;
    let seed = ((Math.round(x) * 83492791) ^ (Math.round(y) * 2654435761)) >>> 0;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = -15; i <= 15; i += 1) {
      const t = i / 15;
      const along = t * radius * 1.5;
      const off = (random() - 0.5) * 2.4;
      const px = x + Math.cos(tangent) * along + Math.cos(angle) * off;
      const py = y + Math.sin(tangent) * along + Math.sin(angle) * off;
      const cool = Math.abs(t) > 0.5;
      band.fillStyle(cool ? 0x7b5bd6 : 0xc2552a, 0.72 - Math.abs(t) * 0.3);
      band.fillRect(px - 1, py - 1, random() < 0.3 ? 4 : 2, 2);
    }
    this.addTransient(band);
    this.scene.tweens.add({
      targets: band,
      alpha: 0,
      duration: 620,
      ease: 'Quad.easeOut',
      onComplete: () => band.destroy(),
    });

    // Embers thrown back out of the entry: a wide fan, orange and violet.
    const back = Phaser.Math.RadToDeg(angle + Math.PI);
    addPixelParticles(this.scene, x, y, 'spark', {
      count: this.reduced ? 8 : 26,
      color: 0xffb168,
      speedMin: 120,
      speedMax: 430,
      lifespanMin: 110,
      lifespanMax: 380,
      gravityY: 330,
      scaleMin: 1,
      scaleMax: 0.2,
      angleMin: back - 70,
      angleMax: back + 70,
      blend: Phaser.BlendModes.ADD,
    });
    addPixelParticles(this.scene, x, y, 'px-1', {
      count: this.reduced ? 5 : 12,
      color: 0x9f8cff,
      speedMin: 70,
      speedMax: 300,
      lifespanMin: 150,
      lifespanMax: 470,
      gravityY: 240,
      blend: Phaser.BlendModes.ADD,
      angleMin: back - 88,
      angleMax: back + 88,
    });
    this.spawnDebris(x, y, material, this.reduced ? 2 : 5, 0.32);
    this.glowAt(x, y, radius * 1.15, 0xffb060, 340, 0.3);
  }

  /** Solid / APHE: a tight bright spark cone driven into the plate. */
  private kineticImpact(x: number, y: number, r: number, angle: number, material: MaterialId): void {
    if (material === 'steel' || material === 'armor') {
      this.metalEntry(x, y, r, angle, material);
      return;
    }
    this.flashAt(x, y, r * 0.55, 0xffe6b8, 0.9);
    this.glowAt(x, y, r * 0.5, 0xffcf8f, 200, 0.22);
    const back = angle + Math.PI;
    addPixelParticles(this.scene, x, y, 'spark', {
      count: this.reduced ? 4 : 12,
      color: MATERIALS[material].colors.chip,
      speedMin: 90,
      speedMax: 340,
      lifespanMin: 90,
      lifespanMax: 300,
      gravityY: 320,
      blend: Phaser.BlendModes.ADD,
      angleMin: Phaser.Math.RadToDeg(back) - 26,
      angleMax: Phaser.Math.RadToDeg(back) + 26,
    });
  }

  /** Round flash bulb built from stacked square rows, never a smooth circle. */
  private roundFlash(x: number, y: number, radius: number): void {
    const container = this.scene.add.container(x, y).setDepth(36);
    const g = this.scene.add.graphics();
    g.setBlendMode(Phaser.BlendModes.ADD);
    this.pixelDisc(g, 0, 0, Math.max(5, radius), 0xffb474, 0.55);
    this.pixelDisc(g, 0, 0, Math.max(3, radius * 0.66), 0xffe8c4, 0.9);
    this.pixelDisc(g, 0, 0, Math.max(2, radius * 0.38), 0xffffff, 1);
    container.add(g);
    container.setScale(0.4);
    this.addTransient(container);
    this.scene.tweens.add({
      targets: container,
      scale: this.reduced ? 1.05 : 1.35,
      alpha: 0,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => container.destroy(),
    });
  }

  /** Radial spray of charge and chips, the read that separates HE from a jet. */
  private radialSpray(x: number, y: number, r: number, power: number): void {
    addPixelParticles(this.scene, x, y, 'spark', {
      count: this.reduced ? 6 : 20,
      color: 0xffb168,
      speedMin: 90 * power,
      speedMax: 380 * power,
      lifespanMin: 140,
      lifespanMax: 520,
      gravityY: 300,
      scaleMin: 1,
      scaleMax: 0.2,
      blend: Phaser.BlendModes.ADD,
    });
    addPixelParticles(this.scene, x, y, 'px-1', {
      count: this.reduced ? 5 : 16,
      color: 0xfff0d2,
      speedMin: 60 * power,
      speedMax: 300 * power,
      lifespanMin: 90,
      lifespanMax: 340,
      gravityY: 220,
      blend: Phaser.BlendModes.ADD,
    });
    void r;
  }

  private glowAt(x: number, y: number, radius: number, color: number, duration: number, alpha: number): void {
    const glow = this.scene.add.image(x, y, 'core-glow').setDepth(29);
    glow.setDisplaySize(radius * 2.4, radius * 2);
    glow.setTint(color).setBlendMode(Phaser.BlendModes.ADD).setAlpha(alpha);
    this.addTransient(glow);
    this.scene.tweens.add({
      targets: glow,
      alpha: 0,
      scaleX: glow.scaleX * 1.55,
      scaleY: glow.scaleY * 1.55,
      duration,
      ease: 'Quad.easeOut',
      onComplete: () => glow.destroy(),
    });
  }

  /** A narrow vertical wall-face channel, without radial spark arms. */
  /** Filled disc made only of axis-aligned square rows. */
  private pixelDisc(g: Phaser.GameObjects.Graphics, cx: number, cy: number, radius: number, color: number, alpha: number): void {
    const r = Math.max(2, Math.round(radius));
    g.fillStyle(color, alpha);
    for (let row = -r; row <= r; row += 2) {
      const span = Math.round(Math.sqrt(Math.max(0, r * r - row * row)));
      if (span <= 0) continue;
      g.fillRect(cx - span, cy + row, span * 2, 2);
    }
  }

  private faceBurst(x: number, y: number, radius: number): void {
    const container = this.scene.add.container(x, y).setDepth(35);
    const g = this.scene.add.graphics();
    g.setBlendMode(Phaser.BlendModes.ADD);
    let seed = ((Math.round(x) * 73856093) ^ (Math.round(y) * 19349663)) >>> 0;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const fx = 0;
    const fy = 1;
    // Orange halo column behind the white core.
    g.fillStyle(0xff8a2e, 0.55);
    for (let d = -radius * 1.5; d <= radius * 1.5; d += 3) {
      const taper = 1 - Math.abs(d) / (radius * 1.7);
      g.fillRect(fx * d - radius * 0.34 * taper, fy * d - radius * 0.34 * taper, radius * 0.68 * taper, radius * 0.68 * taper);
    }
    // White-hot core column.
    g.fillStyle(0xffffff, 0.97);
    for (let d = -radius * 1.15; d <= radius * 1.15; d += 2) {
      const taper = 1 - Math.abs(d) / (radius * 1.3);
      const w = Math.max(1, radius * 0.3 * taper);
      g.fillRect(fx * d - w / 2, fy * d - w / 2, w, w);
    }
    g.fillStyle(0xfff3d0, 0.9);
    g.fillRect(-radius * 0.16, -radius * 0.16, radius * 0.32, radius * 0.32);
    // A few short, vertical streaks remain within the channel's narrow width.
    const sparks = this.reduced ? 4 : 8;
    for (let i = 0; i < sparks; i += 1) {
      const ox = (random() - 0.5) * radius * 0.65;
      const oy = (random() - 0.5) * radius;
      const length = radius * (0.5 + random());
      const dir = i % 2 === 0 ? -1 : 1;
      g.fillStyle(i % 2 === 0 ? 0xffe9b0 : 0xff9a3d, 0.75);
      // A column of 1x2 square pips rather than a stroked line.
      for (let d = 0; d < length; d += 2) g.fillRect(Math.round(ox), Math.round(oy + dir * d), 1, 2);
    }
    container.add(g);
    container.setScale(0.75);
    this.addTransient(container);
    this.scene.tweens.add({
      targets: container,
      scale: this.reduced ? 1.0 : 1.3,
      alpha: 0,
      duration: 300,
      ease: 'Quad.easeOut',
      onComplete: () => container.destroy(),
    });
  }

  /** Soot, chipped paint and hairline cracks left on the wall face. */
  private scorchAt(x: number, y: number, radius: number): void {
    const g = this.scorch;
    let seed = ((Math.round(x) * 83492791) ^ (Math.round(y) * 2654435761)) >>> 0;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < (this.reduced ? 6 : 14); i += 1) {
      const a = random() * Math.PI * 2;
      const distance = random() * radius * 0.9;
      const size = 2 + random() * (radius * 0.22);
      g.fillStyle(0x14100e, 0.35 + random() * 0.3);
      g.fillRect(x + Math.cos(a) * distance - size / 2, y + Math.sin(a) * distance - size / 2, size, size);
    }
  }

  private separation(event: EffectEvent): void {
    const angle = event.angle ?? 0;
    for (let i = 0; i < (this.reduced ? 2 : 4); i += 1) {
      const piece = this.scene.add.image(event.x, event.y, 'px-3');
      piece.setTint(i % 2 === 0 ? 0x6b7b86 : 0xc98a4e);
      piece.setDepth(31);
      piece.setRotation(angle + (i - 1.5) * 0.4);
      this.addTransient(piece);
      const drift = 25 + i * 14;
      this.scene.tweens.add({
        targets: piece,
        x: event.x - Math.cos(angle) * drift + (i % 2 === 0 ? 12 : -12),
        y: event.y - Math.sin(angle) * drift + 20 + i * 4,
        angle: piece.angle + 120 + i * 50,
        alpha: 0,
        scale: 0.4,
        duration: 320 + i * 90,
        ease: 'Quad.easeIn',
        onComplete: () => piece.destroy(),
      });
    }
    this.sound('ui');
  }

  private jet(event: EffectEvent): void {
    const base = event.angle ?? 0;
    const count = Math.max(1, event.count ?? 1);
    const spread = Phaser.Math.DegToRad(event.phase?.spreadDeg ?? 0);
    const length = Math.max(12, event.length ?? 30);
    const g = this.scene.add.graphics().setDepth(32);
    g.setBlendMode(Phaser.BlendModes.ADD);
    const rays: Array<{ dx: number; dy: number }> = [];
    for (let i = 0; i < count; i += 1) {
      const offset = count === 1 ? 0 : -spread / 2 + (spread * i) / (count - 1);
      const a = base + offset;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      rays.push({ dx, dy });
      for (let dist = 0; dist < length; dist += 4) {
        const alpha = 0.8 * (1 - dist / length) + 0.12;
        g.fillStyle(0xff7a2c, alpha * 0.38);
        g.fillRect(event.x + dx * dist - 2, event.y + dy * dist - 2, 4, 4);
        if (dist < length * 0.8) {
          g.fillStyle(0xffffff, alpha * 0.75);
          g.fillRect(event.x + dx * dist - 0.5, event.y + dy * dist - 0.5, 2, 2);
        }
      }
      addPixelParticles(this.scene, event.x + dx * length, event.y + dy * length, 'spark', {
        count: this.reduced ? 2 : 5,
        color: 0xffb367,
        speedMin: 20,
        speedMax: 130,
        lifespanMin: 100,
        lifespanMax: 330,
        gravityY: 300,
        blend: Phaser.BlendModes.ADD,
        angleMin: Phaser.Math.RadToDeg(a) - 20,
        angleMax: Phaser.Math.RadToDeg(a) + 20,
      });
    }
    this.addTransient(g);
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: 360,
      onComplete: () => g.destroy(),
    });
    this.sound('jet');
  }

  private blast(event: EffectEvent, shock: boolean): void {
    if (!shock && event.family === 'jet') {
      // A shaped charge's secondary blast stays on the wall face rather than
      // adding a spherical fireball and radial sparks over the jet.
      this.faceBurst(event.x, event.y, Math.max(8, (event.radius ?? 20) * 0.45));
      this.sound('explosion');
      return;
    }
    const radius = event.radius ?? 26;
    const color = shock ? 0xd6b582 : 0xff9c4d;
    // Realistic blast sequence: hot flash, fireball that grows then collapses,
    // shockwave ring, rising smoke plume, embers and material chunks.
    this.flashAt(event.x, event.y, radius * 0.72, color, 1.25);
    this.fireballAt(event.x, event.y, radius, shock);
    this.ringAt(event.x, event.y, radius * 1.25, color, shock ? 520 : 380);
    if (!shock) this.ringAt(event.x, event.y, radius * 0.7, 0xffe0a8, 250);
    const material = event.material ?? 'concrete';
    this.materialParticles(event.x, event.y, material, this.reduced ? 6 : 14, 1.25);
    // A thin wisp only. The recordings show chips and sparks, not a smoke
    // cloud; the old 10 puffs at up to 3.2x read as grey balloons.
    // No smoke balloons: the reference blast is a flash, straight sparks and
    // masonry chips. A single tiny dust puff keeps the volume readable.
    addPixelParticles(this.scene, event.x, event.y, 'dust', {
      count: 1,
      color: shock ? 0xb8a78a : 0xd8b48a,
      speedMin: 18,
      speedMax: 90,
      lifespanMin: 320,
      lifespanMax: 700,
      gravityY: -18,
      scaleMin: 0.6,
      scaleMax: 0.8,
      alpha: 0.15,
    });
    // Embers: bright streaks that rise then fall.
    addPixelParticles(this.scene, event.x, event.y, 'spark', {
      count: this.reduced ? 5 : 16,
      color: color,
      speedMin: 40,
      speedMax: 260,
      lifespanMin: 200,
      lifespanMax: 700,
      gravityY: 320,
      scaleMin: 1,
      scaleMax: 0.15,
      blend: Phaser.BlendModes.ADD,
    });
    addPixelParticles(this.scene, event.x, event.y, 'px-1', {
      count: this.reduced ? 6 : 20,
      color: color,
      speedMin: 30,
      speedMax: 220,
      lifespanMin: 120,
      lifespanMax: 480,
      gravityY: 250,
      blend: Phaser.BlendModes.ADD,
    });
    this.shake(shock ? 220 : 150, (shock ? 0.0065 : 0.0045) * Math.min(1.5, radius / 40 + 0.5));
    this.sound(shock ? 'bounce' : 'explosion');
  }

  /**
   * Fireball: layered orange/yellow glow that expands fast, then collapses
   * and darkens — the classic explosion read, not a static glow.
   */
  private fireballAt(x: number, y: number, radius: number, shock: boolean): void {
    const r = Math.max(8, radius);
    const outer = this.scene.add.image(x, y, 'core-glow').setDepth(28);
    outer.setTint(shock ? 0xd8a86a : 0xff7a24).setBlendMode(Phaser.BlendModes.ADD);
    outer.setDisplaySize(r * 1.2, r * 1.2);
    outer.setAlpha(0.85);
    this.addTransient(outer);
    this.scene.tweens.add({
      targets: outer,
      scaleX: outer.scaleX * 2.6,
      scaleY: outer.scaleY * 2.6,
      alpha: 0,
      duration: 520,
      ease: 'Quad.easeOut',
      onComplete: () => outer.destroy(),
    });
    const inner = this.scene.add.image(x, y, 'core-glow').setDepth(29);
    inner.setTint(0xffd79a).setBlendMode(Phaser.BlendModes.ADD);
    inner.setDisplaySize(r * 0.7, r * 0.7);
    inner.setAlpha(0.95);
    this.addTransient(inner);
    this.scene.tweens.add({
      targets: inner,
      scaleX: inner.scaleX * 1.7,
      scaleY: inner.scaleY * 1.7,
      alpha: 0,
      duration: 300,
      ease: 'Quad.easeOut',
      onComplete: () => inner.destroy(),
    });
    // White flash heart, gone in ~120ms.
    const heart = this.scene.add.image(x, y, 'core-glow').setDepth(30);
    heart.setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD);
    heart.setDisplaySize(r * 0.45, r * 0.45);
    heart.setAlpha(1);
    this.addTransient(heart);
    this.scene.tweens.add({
      targets: heart,
      alpha: 0,
      duration: 130,
      ease: 'Quad.easeOut',
      onComplete: () => heart.destroy(),
    });
  }

  private spall(event: EffectEvent): void {
    const rearX = event.x2 ?? event.x;
    const rearY = event.y2 ?? event.y;
    this.flashAt(rearX, rearY, event.radius ?? 14, 0xffb17e, 1);
    this.materialParticles(rearX, rearY, event.material ?? 'steel', this.reduced ? 4 : 11, 1.1);
    for (let i = 0; i < (this.reduced ? 3 : 7); i += 1) {
      const chip = this.scene.add.image(rearX, rearY, 'px-2');
      chip.setTint(0xd9d2c4).setDepth(31);
      this.addTransient(chip);
      this.scene.tweens.add({
        targets: chip,
        x: rearX + 22 + i * 9,
        y: rearY - 12 + (i % 4) * 10,
        alpha: 0,
        angle: 120 + i * 30,
        duration: 260 + i * 50,
        ease: 'Quad.easeOut',
        onComplete: () => chip.destroy(),
      });
    }
    this.shake(90, 0.0035);
    this.sound('impact-steel');
  }

  private crush(event: EffectEvent): void {
    const angle = event.angle ?? 0;
    const container = this.scene.add.container(event.x, event.y).setDepth(31);
    const g = this.scene.add.graphics();
    g.setRotation(angle);
    g.fillStyle(0xd59d68, 0.95);
    g.fillRect(-6, -13, 14, 26);
    g.fillStyle(0xffd0a1, 0.75);
    g.fillRect(-3, -9, 3, 18);
    g.fillStyle(0x8c5d3d, 0.8);
    g.fillRect(4, -10, 2, 20);
    container.add(g);
    container.setScale(1.5, 1.25);
    this.addTransient(container);
    this.scene.tweens.add({
      targets: container,
      scaleX: 0.2,
      scaleY: 2.1,
      alpha: 0,
      duration: 280,
      ease: 'Quad.easeOut',
      onComplete: () => container.destroy(),
    });
    this.materialParticles(event.x, event.y, event.material ?? 'brick', this.reduced ? 3 : 7, 0.8);
    addPixelParticles(this.scene, event.x, event.y, 'dust', {
      count: this.reduced ? 3 : 7,
      color: 0xc8b29a,
      speedMin: 8,
      speedMax: 60,
      lifespanMin: 300,
      lifespanMax: 900,
      gravityY: -6,
      scaleMin: 1,
      scaleMax: 2,
      alpha: 0.36,
    });
    this.shake(70, 0.0025);
    this.sound(MATERIAL_SOUND[event.material ?? 'brick']);
  }

  private fragments(event: EffectEvent): void {
    const base = event.angle ?? 0;
    const count = Math.max(2, event.count ?? 4);
    const spread = Phaser.Math.DegToRad(event.phase?.spreadDeg ?? 35);
    const length = Math.max(18, event.length ?? 50);
    const g = this.scene.add.graphics().setDepth(31);
    for (let i = 0; i < count; i += 1) {
      const a = base - spread / 2 + (spread * i) / Math.max(1, count - 1);
      for (let d = 4; d < length; d += 7) {
        g.fillStyle(i % 2 === 0 ? 0xffd3a1 : 0xff9f55, 0.8 - (d / length) * 0.55);
        g.fillRect(event.x + Math.cos(a) * d, event.y + Math.sin(a) * d, 2, 2);
      }
      addPixelParticles(this.scene, event.x + Math.cos(a) * length, event.y + Math.sin(a) * length, 'px-1', {
        count: this.reduced ? 1 : 3,
        color: 0xffb86e,
        speedMin: 15,
        speedMax: 90,
        lifespanMin: 160,
        lifespanMax: 500,
        gravityY: 210,
        angleMin: Phaser.Math.RadToDeg(a) - 28,
        angleMax: Phaser.Math.RadToDeg(a) + 28,
      });
    }
    this.addTransient(g);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
    this.materialParticles(event.x, event.y, event.material ?? 'wood', this.reduced ? 3 : 7, 0.8);
    this.sound('impact-wood');
  }

  private drill(event: EffectEvent): void {
    const angle = event.angle ?? 0;
    const length = Math.max(10, event.length ?? 20);
    const g = this.scene.add.graphics().setDepth(32);
    g.setBlendMode(Phaser.BlendModes.ADD);
    for (let d = 0; d < length; d += 2) {
      g.fillStyle(d % 4 === 0 ? 0xffffff : 0xffbb75, 0.82 - d / length * 0.5);
      g.fillRect(event.x + Math.cos(angle) * d, event.y + Math.sin(angle) * d, 2, 2);
    }
    this.addTransient(g);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
    addPixelParticles(this.scene, event.x, event.y, 'spark', {
      count: this.reduced ? 3 : 8,
      color: 0xffd6a1,
      speedMin: 40,
      speedMax: 190,
      lifespanMin: 100,
      lifespanMax: 360,
      gravityY: 300,
      blend: Phaser.BlendModes.ADD,
      angleMin: Phaser.Math.RadToDeg(angle) - 14,
      angleMax: Phaser.Math.RadToDeg(angle) + 14,
    });
    this.shake(55, 0.0018);
    this.sound('drill');
  }

  private tear(event: EffectEvent): void {
    const base = event.angle ?? 0;
    const count = Math.max(2, event.count ?? 4);
    const spread = Phaser.Math.DegToRad(event.phase?.spreadDeg ?? 18);
    const length = Math.max(20, event.length ?? 44);
    const g = this.scene.add.graphics().setDepth(31);
    for (let i = 0; i < count; i += 1) {
      const a = base - spread / 2 + (spread * i) / Math.max(1, count - 1);
      for (let d = 0; d < length; d += 5) {
        const bend = Math.sin((d / length) * Math.PI) * (i - (count - 1) / 2) * 2.3;
        g.fillStyle(i % 2 === 0 ? 0xffd19a : 0xe2a46e, 0.72 - d / length * 0.4);
        g.fillRect(event.x + Math.cos(a) * d - Math.sin(a) * bend, event.y + Math.sin(a) * d + Math.cos(a) * bend, 2, 2);
      }
    }
    this.addTransient(g);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 330, onComplete: () => g.destroy() });
    this.materialParticles(event.x, event.y, event.material ?? 'steel', this.reduced ? 3 : 8, 0.9);
    this.sound('impact-steel');
  }

  private plug(event: EffectEvent): void {
    const angle = event.angle ?? 0;
    const material = event.material ?? 'brick';
    const colors = MATERIALS[material].colors;
    const container = this.scene.add.container(event.x, event.y).setDepth(31);
    const g = this.scene.add.graphics();
    g.fillStyle(colors.dark, 1);
    g.fillRect(-8, -7, 16, 14);
    g.fillStyle(colors.base, 1);
    g.fillRect(-7, -6, 14, 12);
    g.fillStyle(colors.light, 0.6);
    g.fillRect(-5, -5, 8, 2);
    container.add(g);
    container.setRotation(angle);
    this.addTransient(container);
    this.scene.tweens.add({
      targets: container,
      x: event.x + Math.cos(angle) * 32,
      y: event.y + Math.sin(angle) * 32 + 8,
      angle: Phaser.Math.RadToDeg(angle) + 80,
      alpha: 0,
      duration: 460,
      ease: 'Quad.easeOut',
      onComplete: () => container.destroy(),
    });
    this.materialParticles(event.x, event.y, material, this.reduced ? 3 : 6, 1);
    this.sound('impact-concrete');
  }

  private rain(event: EffectEvent): void {
    const g = this.scene.add.graphics().setDepth(32);
    g.setBlendMode(Phaser.BlendModes.ADD);
    const count = Math.max(2, event.count ?? 5);
    for (let i = 0; i < count; i += 1) {
      const a = 0.18 + i * 0.17;
      const len = 48 + i * 9;
      for (let d = 0; d < len; d += 4) {
        g.fillStyle(i % 2 === 0 ? 0xffb36b : 0xb87943, 0.72 - (d / len) * 0.5);
        g.fillRect(event.x + Math.cos(a) * d * 0.9, event.y + Math.sin(a) * d + d * 0.35, 2, 2);
      }
    }
    this.addTransient(g);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 420, onComplete: () => g.destroy() });
    addPixelParticles(this.scene, event.x, event.y, 'spark', {
      count: this.reduced ? 5 : 16,
      color: 0xffb26e,
      speedMin: 60,
      speedMax: 250,
      lifespanMin: 200,
      lifespanMax: 650,
      gravityY: 380,
      blend: Phaser.BlendModes.ADD,
      angleMin: -10,
      angleMax: 75,
    });
    this.sound('jet');
  }

  private bounce(event: EffectEvent): void {
    this.flashAt(event.x, event.y, 9, 0xffe2a8, 0.8);
    addPixelParticles(this.scene, event.x, event.y, 'spark', {
      count: this.reduced ? 3 : 7,
      color: 0xffdc9d,
      speedMin: 30,
      speedMax: 140,
      lifespanMin: 100,
      lifespanMax: 300,
      gravityY: 300,
      blend: Phaser.BlendModes.ADD,
    });
    this.sound('bounce');
  }

  private collapse(event: EffectEvent): void {
    addPixelParticles(this.scene, event.x, event.y, 'dust', {
      count: this.reduced ? 7 : 18,
      color: 0xa99b87,
      speedMin: 10,
      speedMax: 110,
      lifespanMin: 900,
      lifespanMax: 2000,
      gravityY: -8,
      scaleMin: 1,
      scaleMax: 3.2,
      alpha: 0.4,
    });
    this.shake(380, 0.006);
    this.sound('debris');
  }

  private coreHit(event: EffectEvent): void {
    this.core.hitFlash();
    this.flashAt(event.x, event.y, event.radius ?? 24, 0xff3b30, 1.3);
    this.ringAt(event.x, event.y, 32, 0xff2418, 300);
    addPixelParticles(this.scene, event.x, event.y, 'spark', {
      count: this.reduced ? 4 : 12,
      color: 0xff8a75,
      speedMin: 40,
      speedMax: 220,
      lifespanMin: 160,
      lifespanMax: 500,
      gravityY: 180,
      blend: Phaser.BlendModes.ADD,
    });
    this.shake(100, 0.0045);
    this.sound('impact-armor');
  }

  private coreDrop(event: EffectEvent): void {
    const x = event.x;
    const fromY = event.y;
    const toY = event.y2 ?? event.y + 80;
    const streak = this.scene.add.rectangle(x, fromY, 3, Math.max(8, toY - fromY), 0xff2b1f, 0.38);
    streak.setOrigin(0.5, 0).setDepth(13);
    this.addTransient(streak);
    this.scene.tweens.add({ targets: streak, alpha: 0, duration: 600, onComplete: () => streak.destroy() });
    this.flashAt(x, toY, 20, 0xffc27e, 1);
    addPixelParticles(this.scene, x, toY, 'dust', {
      count: this.reduced ? 4 : 10,
      color: 0xb4a18c,
      speedMin: 10,
      speedMax: 85,
      lifespanMin: 400,
      lifespanMax: 1200,
      gravityY: 60,
      scaleMin: 1,
      scaleMax: 2.6,
      alpha: 0.35,
    });
    this.shake(180, 0.005);
    this.sound('debris');
  }

  private burnZone(event: EffectEvent): void {
    const radius = event.radius ?? 16;
    const container = this.scene.add.container(event.x, event.y).setDepth(30);
    const glow = this.scene.add.image(0, 0, 'core-glow').setDisplaySize(radius * 4, radius * 4);
    glow.setTint(event.material === 'steel' || event.material === 'armor' ? 0xffe5b0 : 0xff9a4b);
    glow.setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.7);
    const g = this.scene.add.graphics();
    const segments = this.reduced ? 8 : 14;
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      g.fillStyle(i % 3 === 0 ? 0xffffff : 0xff8a3d, 0.85);
      g.fillRect(Math.cos(a) * radius * 0.62 - 1, Math.sin(a) * radius * 0.62 - 1, 3, 3);
    }
    container.add([glow, g]);
    this.addTransient(container);
    const patch: BurnPatch = { container, x: event.x, y: event.y, created: this.scene.time.now };
    this.burns.push(patch);
    addPixelParticles(this.scene, event.x, event.y, 'px-1', {
      count: this.reduced ? 3 : 8,
      color: 0xffb86c,
      speedMin: 8,
      speedMax: 60,
      lifespanMin: 300,
      lifespanMax: 1100,
      gravityY: -28,
      blend: Phaser.BlendModes.ADD,
    });
    this.sound('burn');
  }

  private burnEnd(event: EffectEvent): void {
    let best: BurnPatch | null = null;
    let bestDist = Infinity;
    for (const patch of this.burns) {
      const dist = Math.hypot(patch.x - event.x, patch.y - event.y);
      if (dist < bestDist) {
        best = patch;
        bestDist = dist;
      }
    }
    if (!best) return;
    this.burns = this.burns.filter((patch) => patch !== best);
    this.scene.tweens.add({
      targets: best.container,
      alpha: 0,
      scale: 0.55,
      duration: 420,
      onComplete: () => best?.container.destroy(),
    });
  }

  private miss(event: EffectEvent): void {
    addPixelParticles(this.scene, event.x, event.y, 'dust', {
      count: this.reduced ? 2 : 5,
      color: 0xa79c8b,
      speedMin: 6,
      speedMax: 35,
      lifespanMin: 300,
      lifespanMax: 800,
      gravityY: 15,
      scaleMin: 0.8,
      scaleMax: 1.8,
      alpha: 0.24,
    });
  }

  /** Called by the timeline when the grid actually loses cells. */
  spawnCellDebris(cell: DamageCellDelta, x: number, y: number, force = 1): void {
    if (!cell.hp && cell.relayId) this.relays.flash(cell.relayId);
    const count = cell.hp === null ? (this.reduced ? 1 : 2) : 0;
    if (count > 0) this.spawnDebris(x, y, cell.material, count, force);
    if (cell.hp !== null && !this.reduced && cell.hp / MATERIALS[cell.material].health < 0.25) {
      this.materialParticles(x, y, cell.material, 1, 0.4);
    }
  }

  spawnDebris(x: number, y: number, material: MaterialId, count: number, force: number): void {
    const limit = this.limits().debrisBodies;
    const def = MATERIALS[material];
    for (let i = 0; i < count; i += 1) {
      if (this.debris.length >= limit) {
        const oldest = this.debris.shift();
        oldest?.image.destroy();
      }
      const variant = i % 3;
      const image = this.scene.matter.add.image(
        x + (Math.random() - 0.5) * 10,
        y + (Math.random() - 0.5) * 8,
        `debris-${material}-${variant}`,
        undefined,
        {
          friction: material === 'wood' ? 0.55 : 0.7,
          frictionAir: 0.02,
          restitution: material === 'steel' || material === 'armor' ? 0.28 : 0.12,
          density: def.density * 0.0012,
          collisionFilter: { category: 0x0002, mask: 0x0001, group: 0 },
        },
      );
      image.setDepth(24);
      image.setVelocity((Math.random() - 0.6) * 120 * force, -(35 + Math.random() * 120) * force);
      image.setAngularVelocity((Math.random() - 0.5) * 0.3);
      this.debris.push({ image, created: this.scene.time.now });
    }
    if (material === 'steel' || material === 'armor') {
      addPixelParticles(this.scene, x, y, 'spark', {
        count: this.reduced ? 1 : 3,
        color: def.colors.chip,
        speedMin: 20,
        speedMax: 120,
        lifespanMin: 80,
        lifespanMax: 250,
        gravityY: 300,
        blend: Phaser.BlendModes.ADD,
      });
    }
  }

  update(time: number): void {
    const keep: DebrisEntry[] = [];
    for (const entry of this.debris) {
      const age = time - entry.created;
      if (entry.image.y > WORLD.height + 180 || age > 11000) {
        entry.image.destroy();
        continue;
      }
      if (age > 8200) entry.image.setAlpha(Math.max(0, 1 - (age - 8200) / 1600));
      keep.push(entry);
    }
    this.debris = keep;
    // Effects use tweens; this.compact removes completed objects from the
    // bookkeeping array without touching the display list.
    this.transient = this.transient.filter((object) => object.active);
  }

  clear(): void {
    this.scorch.clear();
    for (const entry of this.debris) entry.image.destroy();
    this.debris = [];
    for (const patch of this.burns) patch.container.destroy();
    this.burns = [];
    for (const object of this.transient) object.destroy();
    this.transient = [];
  }
}

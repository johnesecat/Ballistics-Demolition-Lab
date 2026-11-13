import { Scene } from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
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
      gfx.fillTriangle(-length/2, -width/2, -length/2 - 8, -width, -length/2 + 3, -width/2);
      gfx.fillTriangle(-length/2, width/2, -length/2 - 8, width, -length/2 + 3, width/2);
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
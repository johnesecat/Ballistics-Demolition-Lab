import { Scene } from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { saveSystem } from '../systems/SaveSystem';
import { AudioSystem } from '../systems/AudioSystem';

export class BootScene extends Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Load actual ammo icon PNGs from public/assets
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

    const basePath = 'assets/ammo-icons/';
    for (const id of ammoIcons) {
      this.load.image(`icon_${id}`, `${basePath}${id}.png`);
    }

    // Load category badges
    const categories = ['solid', 'heat', 'hesh', 'he', 'aphe', 'soft'];
    for (const cat of categories) {
      this.load.image(`badge_${cat}`, `assets/badges/badge_${cat}.png`);
    }

    this.load.on('complete', () => {
      this.scene.start('MainMenuScene');
    });
  }

  create(): void {
    try {
      // Initialize game registry with save system
      this.game.registry.set('saveSystem', saveSystem);
      
      // Create audio system
      const audioSystem = new AudioSystem(this);
      this.game.registry.set('audioSystem', audioSystem);
      
      console.log('BootScene complete, starting MainMenuScene');
    } catch (e) {
      console.error('BootScene error:', e);
      this.scene.start('MainMenuScene');
    }
  }
}
import { GAME_CONFIG } from '../config/gameConfig';
import { saveSystem } from './SaveSystem';

export class AudioSystem {
  private scene: Phaser.Scene;
  private sounds: Map<string, Phaser.Sound.BaseSound> = new Map();
  private music: Phaser.Sound.BaseSound | null = null;
  private masterVolume: number;
  private musicVolume: number;
  private sfxVolume: number;
  private audioUnlocked: boolean = false;
  private audioContext: AudioContext | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const settings = saveSystem.getSettings();
    this.masterVolume = GAME_CONFIG.AUDIO.MASTER_VOLUME;
    this.musicVolume = settings.musicVolume;
    this.sfxVolume = settings.sfxVolume;

    this.setupAudioUnlock();
    this.initAudioContext();
    this.generateProceduralSounds();
  }

  private setupAudioUnlock(): void {
    const unlock = () => {
      if (!this.audioUnlocked) {
        this.audioUnlocked = true;
        this.scene.sound.resumeAll();
        this.scene.input.off('pointerdown', unlock);
        this.scene.input.off('keydown', unlock);
      }
    };
    this.scene.input.on('pointerdown', unlock);
    this.scene.input.on('keydown', unlock);
    this.scene.sound.pauseAll();
  }

  private initAudioContext(): void {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not available:', e);
    }
  }

  private generateProceduralSounds(): void {
    if (!this.audioContext) return;

    this.createTone('cannon_fire', 80, 0.3, 'sawtooth', 0.1);
    this.createTone('cannon_recoil', 60, 0.2, 'triangle', 0.15);
    this.createTone('projectile_flight', 120, 0.05, 'sine', 2.0, true);
    this.createNoise('impact_wood', 0.15, 0.3);
    this.createNoise('impact_brick', 0.2, 0.4);
    this.createNoise('impact_concrete', 0.25, 0.5);
    this.createNoise('impact_steel', 0.15, 0.6, 800);
    this.createNoise('impact_armor', 0.2, 0.5, 1000);
    this.createTone('explosion_small', 100, 0.4, 'square', 0.3);
    this.createTone('explosion_medium', 80, 0.5, 'square', 0.5);
    this.createTone('explosion_large', 60, 0.6, 'square', 0.8);
    this.createTone('jet_hiss', 400, 0.3, 'sawtooth', 0.4);
    this.createTone('spall_crack', 300, 0.2, 'triangle', 0.1);
    this.createTone('debris_fall', 150, 0.15, 'sine', 1.0);
    this.createTone('core_hit', 200, 0.5, 'sine', 0.3);
    this.createTone('core_destroy', 150, 0.7, 'sawtooth', 1.0);
    this.createTone('ui_select', 400, 0.1, 'sine', 0.05);
    this.createTone('ui_confirm', 600, 0.15, 'sine', 0.1);
    this.createTone('ui_cancel', 300, 0.1, 'sawtooth', 0.05);
    this.createTone('ui_slider', 500, 0.05, 'sine', 0.03);
    this.createTone('star_earn', 800, 0.2, 'sine', 0.3);
    this.createTone('mission_complete', 500, 0.3, 'sine', 0.5);
    this.createTone('mission_failed', 200, 0.3, 'sawtooth', 0.5);
    this.createTone('trajectory_warning', 350, 0.2, 'square', 0.2);
    this.createTone('ammo_switch', 450, 0.1, 'triangle', 0.05);
    this.createTone('mode_switch', 550, 0.1, 'triangle', 0.05);
  }

  private createTone(
    key: string,
    frequency: number,
    volume: number,
    type: OscillatorType,
    duration: number,
    loop: boolean = false
  ): void {
    if (!this.audioContext) return;

    const buffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * duration, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    const omega = (frequency * 2 * Math.PI) / this.audioContext.sampleRate;

    for (let i = 0; i < data.length; i++) {
      const t = i / this.audioContext.sampleRate;
      const envelope = Math.exp(-t * 3 / duration);
      let sample = 0;

      switch (type) {
        case 'sine':
          sample = Math.sin(omega * i);
          break;
        case 'square':
          sample = Math.sin(omega * i) > 0 ? 1 : -1;
          break;
        case 'sawtooth':
          sample = 2 * ((omega * i / (2 * Math.PI)) % 1) - 1;
          break;
        case 'triangle':
          sample = 2 * Math.abs(2 * ((omega * i / (2 * Math.PI)) % 1) - 1) - 1;
          break;
      }

      data[i] = sample * envelope * volume;
    }

    // Create a buffer source node for playback
    const playSound = () => {
      if (!this.audioContext || !this.audioUnlocked) return;
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.loop = loop;
      const gain = this.audioContext.createGain();
      gain.gain.value = volume * this.sfxVolume * this.masterVolume;
      source.connect(gain).connect(this.audioContext.destination);
      source.start(0);
      return { source, gain, stop: () => source.stop() };
    };

    this.sounds.set(key, { play: playSound, stop: () => {}, setVolume: (v: number) => {}, volume: volume * this.sfxVolume * this.masterVolume } as any);
  }

  private createNoise(
    key: string,
    duration: number,
    volume: number,
    filterFreq: number = 0
  ): void {
    if (!this.audioContext) return;

    const buffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * duration, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const envelope = Math.exp(-i / (this.audioContext.sampleRate * duration * 0.3));
      data[i] = (Math.random() * 2 - 1) * envelope * volume;
    }

    if (filterFreq > 0) {
      const offlineCtx = new OfflineAudioContext(1, buffer.length, this.audioContext.sampleRate);
      const source = offlineCtx.createBufferSource();
      source.buffer = buffer;
      const filter = offlineCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      source.connect(filter).connect(offlineCtx.destination);
      source.start(0);
      offlineCtx.startRendering().then(renderedBuffer => {
        const playSound = () => {
          if (!this.audioContext || !this.audioUnlocked) return;
          const source = this.audioContext.createBufferSource();
          source.buffer = renderedBuffer;
          const gain = this.audioContext.createGain();
          gain.gain.value = volume * this.sfxVolume * this.masterVolume;
          source.connect(gain).connect(this.audioContext.destination);
          source.start(0);
          return { source, gain, stop: () => source.stop() };
        };
        this.sounds.set(key, { play: playSound, stop: () => {}, setVolume: (v: number) => {}, volume: volume * this.sfxVolume * this.masterVolume } as any);
      });
    } else {
      const playSound = () => {
        if (!this.audioContext || !this.audioUnlocked) return;
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        const gain = this.audioContext.createGain();
        gain.gain.value = volume * this.sfxVolume * this.masterVolume;
        source.connect(gain).connect(this.audioContext.destination);
        source.start(0);
        return { source, gain, stop: () => source.stop() };
      };
      this.sounds.set(key, { play: playSound, stop: () => {}, setVolume: (v: number) => {}, volume: volume * this.sfxVolume * this.masterVolume } as any);
    }
  }

  play(key: string, config?: any): void {
    if (!this.audioUnlocked) return;
    const sound = this.sounds.get(key);
    if (sound && typeof sound.play === 'function') {
      sound.play(config);
    }
  }

  playCannonFire(power: number): void {
    if (!this.audioUnlocked) return;
    const pitch = 0.8 + (power / 441) * 0.4;
    this.play('cannon_fire');
    this.play('cannon_recoil');
  }

  playImpact(material: string, intensity: number = 1): void {
    if (!this.audioUnlocked) return;
    const key = `impact_${material}`;
    const sound = this.sounds.get(key) || this.sounds.get('impact_wood');
    if (sound && typeof sound.play === 'function') {
      sound.play({ volume: intensity * this.sfxVolume * this.masterVolume });
    }
  }

  playExplosion(size: 'small' | 'medium' | 'large'): void {
    if (!this.audioUnlocked) return;
    this.play(`explosion_${size}`);
  }

  playJet(): void {
    if (!this.audioUnlocked) return;
    this.play('jet_hiss');
  }

  playSpall(): void {
    if (!this.audioUnlocked) return;
    this.play('spall_crack');
  }

  playDebrisFall(): void {
    if (!this.audioUnlocked) return;
    this.play('debris_fall');
  }

  playCoreHit(): void {
    if (!this.audioUnlocked) return;
    this.play('core_hit');
  }

  playCoreDestroy(): void {
    if (!this.audioUnlocked) return;
    this.play('core_destroy');
  }

  playUISelect(): void {
    if (!this.audioUnlocked) return;
    this.play('ui_select');
  }

  playUIConfirm(): void {
    if (!this.audioUnlocked) return;
    this.play('ui_confirm');
  }

  playUICancel(): void {
    if (!this.audioUnlocked) return;
    this.play('ui_cancel');
  }

  playUISlider(): void {
    if (!this.audioUnlocked) return;
    this.play('ui_slider');
  }

  playStarEarn(): void {
    if (!this.audioUnlocked) return;
    this.play('star_earn');
  }

  playMissionComplete(): void {
    if (!this.audioUnlocked) return;
    this.play('mission_complete');
  }

  playMissionFailed(): void {
    if (!this.audioUnlocked) return;
    this.play('mission_failed');
  }

  playTrajectoryWarning(): void {
    if (!this.audioUnlocked) return;
    this.play('trajectory_warning');
  }

  playAmmoSwitch(): void {
    if (!this.audioUnlocked) return;
    this.play('ammo_switch');
  }

  playModeSwitch(): void {
    if (!this.audioUnlocked) return;
    this.play('mode_switch');
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Phaser.Math.Clamp(volume, 0, 1);
    this.updateAllVolumes();
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Phaser.Math.Clamp(volume, 0, 1);
    if (this.music) {
      (this.music as any).setVolume?.(this.musicVolume * this.masterVolume);
    }
    saveSystem.updateSettings({ musicVolume: this.musicVolume });
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = Phaser.Math.Clamp(volume, 0, 1);
    this.updateAllVolumes();
    saveSystem.updateSettings({ sfxVolume: this.sfxVolume });
  }

  private updateAllVolumes(): void {
    for (const sound of this.sounds.values()) {
      if (typeof sound.setVolume === 'function') {
        sound.setVolume(sound.volume * this.sfxVolume * this.masterVolume);
      }
    }
    if (this.music) {
      (this.music as any).setVolume?.(this.musicVolume * this.masterVolume);
    }
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  getMusicVolume(): number {
    return this.musicVolume;
  }

  getSfxVolume(): number {
    return this.sfxVolume;
  }

  destroy(): void {
    for (const sound of this.sounds.values()) {
      if (typeof sound.stop === 'function') {
        sound.stop();
      }
    }
    this.sounds.clear();
    if (this.music) {
      if (typeof this.music.stop === 'function') {
        this.music.stop();
      }
      this.music = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
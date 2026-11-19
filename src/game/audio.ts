/**
 * Original WebAudio synthesis. Nothing is fetched, and no audio is created until
 * a real user gesture unlocks the context (an iOS Safari requirement).
 */
export type SoundName =
  | 'ui'
  | 'back'
  | 'cannon'
  | 'whoosh'
  | 'impact-wood'
  | 'impact-brick'
  | 'impact-concrete'
  | 'impact-steel'
  | 'impact-armor'
  | 'explosion'
  | 'debris'
  | 'jet'
  | 'drill'
  | 'bounce'
  | 'burn'
  | 'success'
  | 'failure'
  | 'replay';

export class AudioEngine {
  private context: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private effectGain: GainNode | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private unlocked = false;
  private musicWanted = true;
  private musicVolume = 0.22;
  private effectsVolume = 0.62;

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    const Ctor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.context = new Ctor();
      await this.context.resume();
      this.master = this.context.createGain();
      this.master.gain.value = 0.86;
      this.master.connect(this.context.destination);
      this.musicGain = this.context.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.effectGain = this.context.createGain();
      this.effectGain.gain.value = this.effectsVolume;
      this.musicGain.connect(this.master);
      this.effectGain.connect(this.master);
      this.noiseBuffer = this.buildNoise();
      this.unlocked = true;
      this.startMusic();
    } catch {
      this.unlocked = false;
    }
  }

  setMusicVolume(value: number): void {
    this.musicVolume = Math.min(1, Math.max(0, value));
    if (this.musicGain && this.context) {
      this.musicGain.gain.setTargetAtTime(this.musicVolume, this.context.currentTime, 0.03);
    }
  }

  setEffectsVolume(value: number): void {
    this.effectsVolume = Math.min(1, Math.max(0, value));
    if (this.effectGain && this.context) {
      this.effectGain.gain.setTargetAtTime(this.effectsVolume, this.context.currentTime, 0.03);
    }
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicWanted = enabled;
    if (enabled) this.startMusic();
    else this.stopMusic();
  }

  startMusic(): void {
    if (!this.unlocked || !this.context || !this.musicGain || this.musicTimer !== null || !this.musicWanted) return;
    this.playPad();
    this.musicTimer = window.setInterval(() => this.playPad(), 9000);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.musicGain && this.context) {
      this.musicGain.gain.setTargetAtTime(0, this.context.currentTime, 0.4);
    }
  }

  private playPad(): void {
    if (!this.context || !this.musicGain || this.musicVolume < 0.001) return;
    const now = this.context.currentTime;
    const step = this.musicStep % 4;
    this.musicStep += 1;
    const roots = [55, 65.41, 49, 58.27];
    const root = roots[step] as number;
    for (const [interval, gainValue] of [
      [1, 0.16],
      [1.5, 0.08],
      [2, 0.055],
    ] as Array<[number, number]>) {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      const filter = this.context.createBiquadFilter();
      osc.type = 'sine';
      osc.frequency.value = root * interval;
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(gainValue, now + 1.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 7.8);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      osc.start(now);
      osc.stop(now + 8);
    }
    if (step === 2) {
      this.playPing(root * 4, 0.06, 0.2);
    }
  }

  private playPing(freq: number, volume: number, pan = 0): void {
    if (!this.context || !this.musicGain) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const panner = this.context.createStereoPanner();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 3;
    gain.gain.setValueAtTime(Math.max(0.0001, volume), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    panner.pan.value = pan;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(this.musicGain);
    osc.start(now);
    osc.stop(now + 2.5);
  }

  play(name: SoundName, intensity = 1): void {
    if (!this.unlocked || !this.context || !this.effectGain) return;
    if (this.effectsVolume <= 0.001) return;
    const now = this.context.currentTime;
    switch (name) {
      case 'ui':
        this.tone(220, 0.025, 0.045, 'square', 0.2);
        break;
      case 'back':
        this.tone(130, 0.035, 0.07, 'triangle', 0.24);
        break;
      case 'cannon':
        this.noise(0.26, 0.24, 1600, 'lowpass', 0.8);
        this.tone(68, 0.32, 0.24, 'sine', 0.8);
        this.tone(42, 0.45, 0.1, 'sine', 0.5);
        break;
      case 'whoosh':
        this.noise(0.32, 0.18, 2400, 'bandpass', 0.16);
        break;
      case 'impact-wood':
        this.noise(0.12, 0.2, 950, 'bandpass', 0.35);
        this.tone(140, 0.1, 0.09, 'triangle', 0.18);
        break;
      case 'impact-brick':
        this.noise(0.16, 0.3, 1500, 'lowpass', 0.4);
        this.tone(105, 0.15, 0.12, 'sine', 0.18);
        break;
      case 'impact-concrete':
        this.noise(0.2, 0.3, 1100, 'lowpass', 0.4);
        this.tone(90, 0.2, 0.11, 'sine', 0.2);
        break;
      case 'impact-steel':
        this.noise(0.1, 0.16, 3200, 'highpass', 0.3);
        this.tone(620, 0.28, 0.06, 'triangle', 0.18);
        this.tone(990, 0.2, 0.035, 'triangle', 0.1);
        break;
      case 'impact-armor':
        this.noise(0.14, 0.18, 2200, 'highpass', 0.2);
        this.tone(430, 0.22, 0.06, 'triangle', 0.16);
        break;
      case 'explosion':
        this.noise(0.5, 0.4, 900, 'lowpass', 0.5);
        this.tone(52, 0.5, 0.24, 'sine', 0.65);
        break;
      case 'debris':
        this.noise(0.09, 0.12, 1900, 'bandpass', 0.2);
        break;
      case 'jet':
        this.noise(0.34, 0.18, 3800, 'bandpass', 0.16);
        this.tone(880, 0.22, 0.025, 'sawtooth', 0.13);
        break;
      case 'drill':
        this.tone(160, 0.12, 0.06, 'sawtooth', 0.25);
        break;
      case 'bounce':
        this.tone(520, 0.16, 0.05, 'triangle', 0.2);
        break;
      case 'burn':
        this.noise(0.8, 0.12, 4800, 'highpass', 0.1);
        break;
      case 'success':
        this.tone(392, 0.32, 0.08, 'triangle', 0.2);
        this.tone(523, 0.5, 0.075, 'triangle', 0.2);
        this.tone(659, 0.8, 0.06, 'sine', 0.2);
        break;
      case 'failure':
        this.tone(130, 0.45, 0.1, 'sawtooth', 0.16);
        this.tone(98, 0.8, 0.09, 'sine', 0.18);
        break;
      case 'replay':
        this.tone(330, 0.05, 0.035, 'square', 0.18);
        break;
    }
    void intensity;
    void now;
  }

  private tone(frequency: number, duration: number, volume: number, type: OscillatorType, endRatio: number): void {
    if (!this.context || !this.effectGain) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, frequency * endRatio), now + duration);
    gain.gain.setValueAtTime(Math.max(0.0001, volume), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.effectGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private noise(duration: number, volume: number, frequency: number, filterType: BiquadFilterType, endRatio: number): void {
    if (!this.context || !this.effectGain || !this.noiseBuffer) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, frequency * endRatio), now + duration);
    filter.Q.value = filterType === 'bandpass' ? 1.8 : 0.7;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(Math.max(0.0001, volume), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.effectGain);
    source.start(now);
    source.stop(now + duration);
  }

  private buildNoise(): AudioBuffer {
    const context = this.context as AudioContext;
    const length = Math.floor(context.sampleRate * 1.2);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      // Sparse crackles over a modest noise floor.
      const random = Math.random() * 2 - 1;
      data[i] = random * (0.5 + 0.5 * Math.exp(-i / (length * 0.16)));
    }
    return buffer;
  }
}

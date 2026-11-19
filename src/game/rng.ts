/** Small deterministic PRNG helpers used by the generator and shot solver. */
export function hash32(...values: number[]): number {
  let h = 2166136261 >>> 0;
  for (const value of values) {
    let v = Math.trunc(value) >>> 0;
    for (let i = 0; i < 4; i += 1) {
      h ^= v & 0xff;
      h = Math.imul(h, 16777619) >>> 0;
      v >>>= 8;
    }
  }
  return h >>> 0;
}

export function hashString(value: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Mulberry32: tiny, fast and stable across JS engines. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new Error('Cannot pick from an empty list');
    return values[Math.floor(this.next() * values.length)] as T;
  }

  shuffle<T>(values: T[]): T[] {
    for (let i = values.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [values[i], values[j]] = [values[j] as T, values[i] as T];
    }
    return values;
  }
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Deterministic hash-noise useful for pixel grain and damage cracks. */
export function noise2(x: number, y: number, seed = 0): number {
  let h = hash32(x, y, seed);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export function clampNumber(value: number, min: number, max: number): number {
  return clamp(value, min, max);
}

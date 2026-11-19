import { AIM, SAVE } from './config';
import { AMMO_BY_ID, STARTER_AMMO_ID } from './ammo/catalogue';
import { ALL_STAGES, STAGES_BY_ID } from './stages/campaign';

export type TrajectorySetting = 'full' | 'hidden';

export interface Settings {
  musicVolume: number;
  effectsVolume: number;
  cameraShake: boolean;
  reducedEffects: boolean;
  trajectory: TrajectorySetting;
  aimSensitivity: number;
}

export interface StageRecord {
  stars: number;
  bestShots: number | null;
  cleared: boolean;
}

export interface SaveData {
  version: number;
  settings: Settings;
  results: Record<string, StageRecord>;
  firstClears: string[];
  lastStageId: string;
  preferredAmmo: string;
  totalShots: number;
}

export type LoadIssue = 'corrupt' | 'newer' | 'storage-unavailable' | null;

export interface LoadResult {
  data: SaveData;
  issue: LoadIssue;
  message: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  musicVolume: 0.22,
  effectsVolume: 0.62,
  cameraShake: true,
  reducedEffects: false,
  trajectory: 'full',
  aimSensitivity: AIM.defaultSensitivity,
};

function defaultData(): SaveData {
  return {
    version: SAVE.version,
    settings: { ...DEFAULT_SETTINGS },
    results: {},
    firstClears: [],
    lastStageId: ALL_STAGES[0]?.id ?? '',
    preferredAmmo: STARTER_AMMO_ID,
    totalShots: 0,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const toNumber = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const toBool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

function cleanSettings(raw: unknown): Settings {
  const value = isRecord(raw) ? raw : {};
  return {
    musicVolume: clamp(toNumber(value.musicVolume, DEFAULT_SETTINGS.musicVolume), 0, 1),
    effectsVolume: clamp(toNumber(value.effectsVolume, DEFAULT_SETTINGS.effectsVolume), 0, 1),
    cameraShake: toBool(value.cameraShake, DEFAULT_SETTINGS.cameraShake),
    reducedEffects: toBool(value.reducedEffects, DEFAULT_SETTINGS.reducedEffects),
    trajectory: value.trajectory === 'hidden' ? 'hidden' : 'full',
    aimSensitivity: clamp(
      toNumber(value.aimSensitivity, DEFAULT_SETTINGS.aimSensitivity),
      AIM.sensitivityMin,
      AIM.sensitivityMax,
    ),
  };
}

function cleanResults(raw: unknown): Record<string, StageRecord> {
  const output: Record<string, StageRecord> = {};
  if (!isRecord(raw)) return output;
  for (const stage of ALL_STAGES) {
    const entry = raw[stage.id];
    if (!isRecord(entry)) continue;
    const stars = Math.round(clamp(toNumber(entry.stars, 0), 0, 3));
    const shots = toNumber(entry.bestShots, 0);
    const cleared = entry.cleared === true || stars > 0;
    if (!cleared) continue;
    output[stage.id] = {
      stars,
      bestShots: shots >= stage.shots || shots > 0 ? Math.round(shots) : null,
      cleared: true,
    };
  }
  return output;
}

/** Validate and salvage a parsed save. Unknown fields are discarded. */
export function sanitizeSave(raw: unknown): { data: SaveData; issue: LoadIssue } {
  const base = defaultData();
  if (!isRecord(raw) || typeof raw.version !== 'number' || !isRecord(raw.settings)) {
    return { data: base, issue: 'corrupt' };
  }
  const version = toNumber(raw.version, 0);
  if (version > SAVE.version) {
    return { data: base, issue: 'newer' };
  }
  const results = cleanResults(raw.results);
  const firstClearsRaw = Array.isArray(raw.firstClears) ? raw.firstClears : [];
  const firstClears = firstClearsRaw.filter(
    (value): value is string => typeof value === 'string' && STAGES_BY_ID.has(value),
  );
  const lastStageId =
    typeof raw.lastStageId === 'string' && STAGES_BY_ID.has(raw.lastStageId) ? raw.lastStageId : base.lastStageId;
  const preferredAmmo =
    typeof raw.preferredAmmo === 'string' && AMMO_BY_ID.has(raw.preferredAmmo)
      ? raw.preferredAmmo
      : base.preferredAmmo;
  return {
    data: {
      version: SAVE.version,
      settings: cleanSettings(raw.settings),
      results,
      firstClears: [...new Set(firstClears)],
      lastStageId,
      preferredAmmo,
      totalShots: Math.max(0, Math.round(toNumber(raw.totalShots, 0))),
    },
    issue: null,
  };
}

export class SaveStore {
  data: SaveData;
  issue: LoadIssue = null;
  issueMessage: string | null = null;
  private readonly storage: Storage | null;
  private readonly memory = new Map<string, string>();
  private memoryOnly = false;
  private preserveOriginal = false;

  constructor(storage?: Storage | null) {
    this.storage = storage === undefined ? this.findStorage() : storage;
    const loaded = this.load();
    this.data = loaded.data;
    this.issue = loaded.issue;
    this.issueMessage = loaded.message;
  }

  private findStorage(): Storage | null {
    try {
      const test = '__breakwater_probe__';
      window.localStorage.setItem(test, '1');
      window.localStorage.removeItem(test);
      return window.localStorage;
    } catch {
      this.memoryOnly = true;
      return null;
    }
  }

  private readRaw(): string | null {
    if (this.storage) {
      try {
        return this.storage.getItem(SAVE.key);
      } catch {
        return null;
      }
    }
    return this.memory.get(SAVE.key) ?? null;
  }

  private writeRaw(value: string): void {
    if (this.storage) {
      try {
        this.storage.setItem(SAVE.key, value);
        return;
      } catch {
        this.memoryOnly = true;
      }
    }
    this.memory.set(SAVE.key, value);
  }

  private backupCorrupt(raw: string): boolean {
    const key = `${SAVE.backupPrefix}${Date.now()}`;
    if (this.storage) {
      try {
        this.storage.setItem(key, raw);
        return true;
      } catch {
        return false;
      }
    }
    this.memory.set(key, raw);
    return true;
  }

  private load(): LoadResult {
    const raw = this.readRaw();
    if (!raw) {
      return {
        data: defaultData(),
        issue: this.memoryOnly ? 'storage-unavailable' : null,
        message: this.memoryOnly ? 'Local storage is unavailable. Progress will last for this session only.' : null,
      };
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      const sanitized = sanitizeSave(parsed);
      if (sanitized.issue) {
        const backedUp = this.backupCorrupt(raw);
        this.preserveOriginal = !backedUp || sanitized.issue === 'newer';
        return {
          data: sanitized.data,
          issue: sanitized.issue,
          message: this.preserveOriginal
            ? 'The existing save was preserved. Progress will last for this session only.'
            : 'The local save could not be read safely. A backup was kept.',
        };
      }
      return { data: sanitized.data, issue: null, message: null };
    } catch {
      const backedUp = this.backupCorrupt(raw);
      this.preserveOriginal = !backedUp;
      return {
        data: defaultData(),
        issue: 'corrupt',
        message: backedUp
          ? 'The local save was damaged. A backup was kept and safe defaults were loaded.'
          : 'The local save was preserved because a backup could not be made. Progress is session-only.',
      };
    }
  }

  save(): boolean {
    try {
      if (this.preserveOriginal) {
        this.memory.set(SAVE.key, JSON.stringify(this.data));
        return false;
      }
      this.writeRaw(JSON.stringify(this.data));
      this.issue = this.memoryOnly ? 'storage-unavailable' : this.issue;
      return true;
    } catch {
      this.issue = 'storage-unavailable';
      return false;
    }
  }

  get settings(): Settings {
    return this.data.settings;
  }

  setSettings(settings: Settings): void {
    this.data.settings = cleanSettings(settings);
    this.save();
  }

  resetSettings(): Settings {
    this.data.settings = { ...DEFAULT_SETTINGS };
    this.save();
    return this.data.settings;
  }

  setPreferredAmmo(id: string): void {
    if (!AMMO_BY_ID.has(id)) return;
    this.data.preferredAmmo = id;
    this.save();
  }

  setLastStage(stageId: string): void {
    if (!STAGES_BY_ID.has(stageId)) return;
    this.data.lastStageId = stageId;
    this.save();
  }

  isCleared(stageId: string): boolean {
    return this.data.results[stageId]?.cleared === true;
  }

  isStageUnlocked(stageId: string): boolean {
    const index = ALL_STAGES.findIndex((stage) => stage.id === stageId);
    if (index <= 0) return index === 0;
    const previous = ALL_STAGES[index - 1];
    return previous ? this.isCleared(previous.id) : false;
  }

  isChapterUnlocked(chapterIndex: number): boolean {
    if (chapterIndex <= 0) return true;
    const preceding = ALL_STAGES.filter((stage) => stage.chapterIndex < chapterIndex);
    return preceding.every((stage) => this.isCleared(stage.id));
  }

  firstIncompleteUnlockedStage(): string {
    for (const stage of ALL_STAGES) {
      if (!this.isCleared(stage.id) && this.isStageUnlocked(stage.id)) return stage.id;
    }
    return this.data.lastStageId || ALL_STAGES[ALL_STAGES.length - 1]?.id || '';
  }

  stageRecord(stageId: string): StageRecord | undefined {
    return this.data.results[stageId];
  }

  /**
   * Record a clear. Stars only improve. First-clear rewards are paid once; a
   * replay can improve stars but cannot duplicate the award.
   */
  recordClear(stageId: string, stars: number, shotsUsed: number): { newBest: boolean; firstClear: boolean; reward: string | null } {
    const stage = STAGES_BY_ID.get(stageId);
    if (!stage) return { newBest: false, firstClear: false, reward: null };
    const firstClear = !this.data.firstClears.includes(stageId);
    const prev = this.data.results[stageId];
    const boundedStars = Math.round(clamp(stars, 1, 3));
    const newBest =
      !prev ||
      boundedStars > prev.stars ||
      (prev.bestShots === null ? true : shotsUsed < prev.bestShots);
    const storedStars = prev ? Math.max(prev.stars, boundedStars) : boundedStars;
    const bestShots = prev?.bestShots === null || prev?.bestShots === undefined ? shotsUsed : Math.min(prev.bestShots, shotsUsed);
    this.data.results[stageId] = { stars: storedStars, bestShots, cleared: true };
    if (firstClear) this.data.firstClears.push(stageId);
    this.data.totalShots += shotsUsed;
    this.data.lastStageId = stageId;
    this.save();
    return {
      newBest,
      firstClear,
      reward: firstClear ? stage.firstClearReward : null,
    };
  }

  stageStars(stageId: string): number {
    return this.data.results[stageId]?.stars ?? 0;
  }

  clearedCount(): number {
    return ALL_STAGES.filter((stage) => this.isCleared(stage.id)).length;
  }

  totalStars(): number {
    return ALL_STAGES.reduce((sum, stage) => sum + this.stageStars(stage.id), 0);
  }
}

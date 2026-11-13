import { GAME_CONFIG } from '../config/gameConfig';
import { AmmoDefinition } from '../ammo/ammoCatalogue';

export interface StageResult {
  stageId: string;
  completed: boolean;
  stars: number;
  shotsUsed: number;
  bestShots: number;
  firstClearRewardClaimed: boolean;
  timestamp: number;
}

export interface ChapterProgress {
  chapterId: number;
  unlocked: boolean;
  stages: Record<string, StageResult>;
}

export interface SaveData {
  version: number;
  currency: number;
  totalStars: number;
  currentChapter: number;
  currentStage: number;
  chapters: ChapterProgress[];
  unlockedAmmo: string[];
  ammoLoadout: string[];
  settings: {
    musicVolume: number;
    sfxVolume: number;
    cameraShake: boolean;
    reducedEffects: boolean;
    trajectoryVisible: boolean;
    aimSensitivity: number;
  };
  statistics: {
    totalShotsFired: number;
    totalMissionsCompleted: number;
    totalMissionsFailed: number;
    favoriteAmmo: string;
    ammoUsage: Record<string, number>;
  };
  lastPlayed: number;
}

const DEFAULT_SETTINGS = {
  musicVolume: GAME_CONFIG.AUDIO.MUSIC_VOLUME,
  sfxVolume: GAME_CONFIG.AUDIO.SFX_VOLUME,
  cameraShake: true,
  reducedEffects: false,
  trajectoryVisible: true,
  aimSensitivity: 1.0,
};

const DEFAULT_SAVE: SaveData = {
  version: GAME_CONFIG.SAVE_VERSION,
  currency: 500,
  totalStars: 0,
  currentChapter: 1,
  currentStage: 1,
  chapters: Array.from({ length: GAME_CONFIG.CHAPTERS }, (_, i) => ({
    chapterId: i + 1,
    unlocked: i === 0,
    stages: {},
  })),
  unlockedAmmo: ['ap_solid_shot', 'soft_nose', 'heat_round', 'hesh_round', 'he_blast', 'aphe_hybrid'],
  ammoLoadout: ['ap_solid_shot', 'soft_nose', 'heat_round', 'hesh_round', 'he_blast', 'aphe_hybrid'],
  settings: DEFAULT_SETTINGS,
  statistics: {
    totalShotsFired: 0,
    totalMissionsCompleted: 0,
    totalMissionsFailed: 0,
    favoriteAmmo: 'ap_solid_shot',
    ammoUsage: {},
  },
  lastPlayed: Date.now(),
};

export class SaveSystem {
  private saveKey: string;
  private data: SaveData;
  private listeners: Set<(data: SaveData) => void> = new Set();

  constructor(saveKey: string = GAME_CONFIG.SAVE_KEY) {
    this.saveKey = saveKey;
    this.data = this.load();
  }

  private load(): SaveData {
    try {
      const stored = localStorage.getItem(this.saveKey);
      if (!stored) {
        return this.createDefaultSave();
      }

      const parsed = JSON.parse(stored) as SaveData;

      if (!parsed.version || parsed.version < GAME_CONFIG.SAVE_VERSION) {
        return this.migrateSave(parsed);
      }

      return this.validateSave(parsed);
    } catch (e) {
      console.warn('Failed to load save data, creating new save:', e);
      return this.createDefaultSave();
    }
  }

  private createDefaultSave(): SaveData {
    const save = { ...DEFAULT_SAVE };
    this.persist(save);
    return save;
  }

  private migrateSave(oldSave: any): SaveData {
    const migrated: SaveData = {
      ...DEFAULT_SAVE,
      ...oldSave,
      version: GAME_CONFIG.SAVE_VERSION,
      chapters: oldSave.chapters?.map((c: any, i: number) => ({
        chapterId: i + 1,
        unlocked: c.unlocked ?? (i === 0),
        stages: c.stages || {},
      })) || DEFAULT_SAVE.chapters,
      settings: { ...DEFAULT_SETTINGS, ...oldSave.settings },
      statistics: {
        ...DEFAULT_SAVE.statistics,
        ...oldSave.statistics,
        ammoUsage: oldSave.statistics?.ammoUsage || {},
      },
      unlockedAmmo: Array.from(new Set([
        ...DEFAULT_SAVE.unlockedAmmo,
        ...(oldSave.unlockedAmmo || []),
      ])),
      ammoLoadout: oldSave.ammoLoadout?.filter((id: string) => 
        DEFAULT_SAVE.unlockedAmmo.includes(id) || (oldSave.unlockedAmmo || []).includes(id)
      ) || DEFAULT_SAVE.ammoLoadout,
    };
    this.persist(migrated);
    return migrated;
  }

  private validateSave(save: any): SaveData {
    const validated: SaveData = {
      version: save.version || GAME_CONFIG.SAVE_VERSION,
      currency: typeof save.currency === 'number' ? save.currency : DEFAULT_SAVE.currency,
      totalStars: typeof save.totalStars === 'number' ? save.totalStars : 0,
      currentChapter: typeof save.currentChapter === 'number' ? save.currentChapter : 1,
      currentStage: typeof save.currentStage === 'number' ? save.currentStage : 1,
      chapters: Array.isArray(save.chapters) ? save.chapters.map((c: any, i: number) => ({
        chapterId: i + 1,
        unlocked: typeof c.unlocked === 'boolean' ? c.unlocked : (i === 0),
        stages: c.stages && typeof c.stages === 'object' ? c.stages : {},
      })) : DEFAULT_SAVE.chapters,
      unlockedAmmo: Array.isArray(save.unlockedAmmo) ? save.unlockedAmmo.filter((id: string) => typeof id === 'string') : DEFAULT_SAVE.unlockedAmmo,
      ammoLoadout: Array.isArray(save.ammoLoadout) ? save.ammoLoadout.filter((id: string) => typeof id === 'string') : DEFAULT_SAVE.ammoLoadout,
      settings: {
        musicVolume: typeof save.settings?.musicVolume === 'number' ? save.settings.musicVolume : DEFAULT_SETTINGS.musicVolume,
        sfxVolume: typeof save.settings?.sfxVolume === 'number' ? save.settings.sfxVolume : DEFAULT_SETTINGS.sfxVolume,
        cameraShake: typeof save.settings?.cameraShake === 'boolean' ? save.settings.cameraShake : DEFAULT_SETTINGS.cameraShake,
        reducedEffects: typeof save.settings?.reducedEffects === 'boolean' ? save.settings.reducedEffects : DEFAULT_SETTINGS.reducedEffects,
        trajectoryVisible: typeof save.settings?.trajectoryVisible === 'boolean' ? save.settings.trajectoryVisible : DEFAULT_SETTINGS.trajectoryVisible,
        aimSensitivity: typeof save.settings?.aimSensitivity === 'number' ? save.settings.aimSensitivity : DEFAULT_SETTINGS.aimSensitivity,
      },
      statistics: {
        totalShotsFired: typeof save.statistics?.totalShotsFired === 'number' ? save.statistics.totalShotsFired : 0,
        totalMissionsCompleted: typeof save.statistics?.totalMissionsCompleted === 'number' ? save.statistics.totalMissionsCompleted : 0,
        totalMissionsFailed: typeof save.statistics?.totalMissionsFailed === 'number' ? save.statistics.totalMissionsFailed : 0,
        favoriteAmmo: typeof save.statistics?.favoriteAmmo === 'string' ? save.statistics.favoriteAmmo : DEFAULT_SAVE.statistics.favoriteAmmo,
        ammoUsage: save.statistics?.ammoUsage && typeof save.statistics.ammoUsage === 'object' ? save.statistics.ammoUsage : {},
      },
      lastPlayed: typeof save.lastPlayed === 'number' ? save.lastPlayed : Date.now(),
    };
    return validated;
  }

  private persist(data: SaveData): void {
    try {
      localStorage.setItem(this.saveKey, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to persist save data:', e);
    }
  }

  getData(): SaveData {
    return { ...this.data };
  }

  getCurrency(): number {
    return this.data.currency;
  }

  addCurrency(amount: number): void {
    this.data.currency = Math.max(0, this.data.currency + amount);
    this.persistAndNotify();
  }

  spendCurrency(amount: number): boolean {
    if (this.data.currency >= amount) {
      this.data.currency -= amount;
      this.persistAndNotify();
      return true;
    }
    return false;
  }

  getSettings() {
    return { ...this.data.settings };
  }

  updateSettings(settings: Partial<SaveData['settings']>): void {
    this.data.settings = { ...this.data.settings, ...settings };
    this.persistAndNotify();
  }

  isAmmoUnlocked(ammoId: string): boolean {
    return this.data.unlockedAmmo.includes(ammoId);
  }

  unlockAmmo(ammoId: string): boolean {
    if (!this.data.unlockedAmmo.includes(ammoId)) {
      this.data.unlockedAmmo.push(ammoId);
      this.persistAndNotify();
      return true;
    }
    return false;
  }

  getUnlockedAmmo(): string[] {
    return [...this.data.unlockedAmmo];
  }

  getAmmoLoadout(): string[] {
    return [...this.data.ammoLoadout];
  }

  setAmmoLoadout(loadout: string[]): void {
    const validLoadout = loadout.filter(id => this.data.unlockedAmmo.includes(id));
    this.data.ammoLoadout = validLoadout.slice(0, 6);
    this.persistAndNotify();
  }

  getChapterProgress(chapterId: number): ChapterProgress | undefined {
    return this.data.chapters.find(c => c.chapterId === chapterId);
  }

  isChapterUnlocked(chapterId: number): boolean {
    const chapter = this.getChapterProgress(chapterId);
    return chapter?.unlocked ?? false;
  }

  unlockChapter(chapterId: number): void {
    const chapter = this.getChapterProgress(chapterId);
    if (chapter && !chapter.unlocked) {
      chapter.unlocked = true;
      this.persistAndNotify();
    }
  }

  getStageResult(chapterId: number, stageId: string): StageResult | undefined {
    const chapter = this.getChapterProgress(chapterId);
    return chapter?.stages[stageId];
  }

  setStageResult(chapterId: number, stageId: string, result: Partial<StageResult>): void {
    const chapter = this.getChapterProgress(chapterId);
    if (chapter) {
      const existing = chapter.stages[stageId] || {
        stageId,
        completed: false,
        stars: 0,
        shotsUsed: 0,
        bestShots: 999,
        firstClearRewardClaimed: false,
        timestamp: Date.now(),
      };
      chapter.stages[stageId] = { ...existing, ...result, timestamp: Date.now() };
      this.updateTotalStars();
      this.persistAndNotify();
    }
  }

  private updateTotalStars(): void {
    let total = 0;
    for (const chapter of this.data.chapters) {
      for (const stage of Object.values(chapter.stages)) {
        total += stage.stars;
      }
    }
    this.data.totalStars = total;
  }

  getTotalStars(): number {
    return this.data.totalStars;
  }

  recordShot(ammoId: string): void {
    this.data.statistics.totalShotsFired++;
    this.data.statistics.ammoUsage[ammoId] = (this.data.statistics.ammoUsage[ammoId] || 0) + 1;
    this.updateFavoriteAmmo();
  }

  recordMissionComplete(): void {
    this.data.statistics.totalMissionsCompleted++;
    this.persistAndNotify();
  }

  recordMissionFailed(): void {
    this.data.statistics.totalMissionsFailed++;
    this.persistAndNotify();
  }

  private updateFavoriteAmmo(): void {
    let maxUsage = 0;
    let favorite = this.data.statistics.favoriteAmmo;
    for (const [ammo, usage] of Object.entries(this.data.statistics.ammoUsage)) {
      if (usage > maxUsage) {
        maxUsage = usage;
        favorite = ammo;
      }
    }
    this.data.statistics.favoriteAmmo = favorite;
  }

  getStatistics() {
    return { ...this.data.statistics };
  }

  setCurrentMission(chapter: number, stage: number): void {
    this.data.currentChapter = chapter;
    this.data.currentStage = stage;
    this.persistAndNotify();
  }

  getCurrentMission(): { chapter: number; stage: number } {
    return { chapter: this.data.currentChapter, stage: this.data.currentStage };
  }

  updateLastPlayed(): void {
    this.data.lastPlayed = Date.now();
    this.persistAndNotify();
  }

  subscribe(listener: (data: SaveData) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private persistAndNotify(): void {
    this.persist(this.data);
    for (const listener of this.listeners) {
      listener(this.data);
    }
  }

  resetSave(): void {
    this.data = this.createDefaultSave();
    for (const listener of this.listeners) {
      listener(this.data);
    }
  }

  exportSave(): string {
    return JSON.stringify(this.data, null, 2);
  }

  importSave(json: string): boolean {
    try {
      const imported = JSON.parse(json);
      const validated = this.validateSave(imported);
      this.data = validated;
      this.persistAndNotify();
      return true;
    } catch (e) {
      console.error('Failed to import save:', e);
      return false;
    }
  }
}

export const saveSystem = new SaveSystem();
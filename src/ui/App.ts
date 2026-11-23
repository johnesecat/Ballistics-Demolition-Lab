import { createGame } from '../game/createGame';
import { BattleScene } from '../game/BattleScene';
import type { AimState, ReplayState } from '../game/BattleScene';
import { AMMO_BY_ID, getAmmo } from '../game/ammo/catalogue';
import { AudioEngine } from '../game/audio';
import { DEFAULT_SETTINGS, SaveStore } from '../game/save';
import type { Settings } from '../game/save';
import { buildStage, snapshotCoreCoverFraction } from '../game/stages/generator';
import type { BuiltStage, StageDefinition, StageSnapshot } from '../game/stages/types';
import { ALL_STAGES, getStage, nextStageId } from '../game/stages/campaign';
import type { PreviewResult, ShotInput, ShotResult } from '../game/sim/types';
import { GameHud } from './GameHud';
import { renderAmmoPicker } from './AmmoPicker';
import { renderArmory } from './ArmoryScreen';
import { renderBriefing } from './BriefingScreen';
import { renderCampaign } from './CampaignScreen';
import { renderMenu } from './MenuScreen';
import { calculateStars, renderHelp, renderPause, renderResults } from './Overlays';
import { renderSettings } from './SettingsScreen';

interface MissionRuntime {
  def: StageDefinition;
  built: BuiltStage;
  ammoId: string;
  shotsUsed: number;
  over: boolean;
  pausedForMenu: boolean;
  aim: AimState;
}

type AppMode = 'boot' | 'menu' | 'campaign' | 'armory' | 'settings' | 'mission' | 'results';

interface OverlaySpec {
  kind: 'pause' | 'help' | 'briefing' | 'settings' | 'ammo' | 'results';
  render: () => HTMLElement;
  onEscape?: () => void;
}

interface AppElements {
  root: HTMLElement;
  gameLayer: HTMLElement;
  screenLayer: HTMLElement;
  hudLayer: HTMLElement;
  overlayLayer: HTMLElement;
  toastLayer: HTMLElement;
}

export class App {
  private el: AppElements;
  private save = new SaveStore();
  private audio = new AudioEngine();
  private game: ReturnType<typeof createGame> | null = null;
  private scene: BattleScene | null = null;
  private hud: GameHud | null = null;
  private mode: AppMode = 'boot';
  private mission: MissionRuntime | null = null;
  private overlays: OverlaySpec[] = [];
  private lastPreview: PreviewResult | null = null;
  private replayTicker: number | null = null;
  private toastTimer: number | null = null;
  private audioUnlocking = false;
  private portraitAllowed = false;
  private orientationPrompt: HTMLElement;
  private debugPanel: HTMLElement | null = null;
  private debugOpen = false;
  private readonly debugMode: boolean;

  constructor(root: HTMLElement) {
    const gameLayer = root.querySelector<HTMLElement>('#game-layer');
    const screenLayer = root.querySelector<HTMLElement>('#screen-layer');
    const hudLayer = root.querySelector<HTMLElement>('#hud-layer');
    const overlayLayer = root.querySelector<HTMLElement>('#overlay-layer');
    const toastLayer = root.querySelector<HTMLElement>('#toast-layer');
    if (!gameLayer || !screenLayer || !hudLayer || !overlayLayer || !toastLayer) {
      throw new Error('Application shell is incomplete');
    }
    this.el = { root, gameLayer, screenLayer, hudLayer, overlayLayer, toastLayer };
    this.debugMode = new URLSearchParams(window.location.search).has('debug');
    this.audio.setMusicVolume(this.save.settings.musicVolume);
    this.audio.setEffectsVolume(this.save.settings.effectsVolume);
    this.audio.setMusicEnabled(this.save.settings.musicVolume > 0);
    this.orientationPrompt = this.buildOrientationPrompt();
    this.el.root.append(this.orientationPrompt);
    if (this.debugMode) this.setupDebugPanel();
    this.setupGlobalEvents();
    this.updateViewport();
    this.showMenu();
    this.startGame();
  }

  // ── boot / viewport ──────────────────────────────────────────────────────
  private startGame(): void {
    try {
      this.game = createGame(this.el.gameLayer);
      this.game.events.on('battle-ready', (scene: BattleScene) => this.attachScene(scene));
      let attempts = 0;
      const wait = (): void => {
        if (this.scene) return;
        const scene = this.game?.scene.getScene('battle') as BattleScene | null;
        if (scene && scene.sys.isActive()) {
          this.attachScene(scene);
          return;
        }
        if (attempts++ < 900) requestAnimationFrame(wait);
        else this.toast('The battlefield renderer did not start. Reload to try again.');
      };
      requestAnimationFrame(wait);
    } catch (error) {
      console.error(error);
      this.toast('WebGL / canvas initialization failed. Try a different browser.');
    }
  }

  private attachScene(scene: BattleScene): void {
    if (this.scene) return;
    this.scene = scene;
    scene.setCallbacks({
      onAimChanged: (aim) => {
        if (this.mission) {
          this.mission.aim = aim;
          this.mission.ammoId = aim.ammoId;
        }
        this.hud?.updateAim(aim);
      },
      onPreview: (preview) => {
        this.lastPreview = preview;
        this.hud?.setPreview(preview);
      },
      onShotStarted: () => this.handleShotStarted(),
      onShotFinished: (result) => this.handleShotFinished(result),
      onReplayState: (state) => this.handleReplayState(state),
      onSound: (name) => this.audio.play(name),
      onMessage: (text) => this.toast(text),
    });
    scene.applySettings(this.save.settings);
    scene.showAmbient();
    this.hud = new GameHud({
      onAngleChange: (angle) => this.scene?.setAimAngle(angle),
      onPowerChange: (power) => this.scene?.setPower(power),
      onModeChange: (mode) => this.scene?.setMode(mode),
      onOpenAmmo: () => this.openAmmoPicker(),
      onChoiceChange: (choiceId) => this.scene?.setChoice(choiceId),
      onFire: () => this.fire(),
      onReset: () => this.resetAim(),
      onMenu: () => this.openPause(),
      onReplayFinish: () => this.scene?.finishReplay(),
      onReplayPause: () => this.toggleReplayPause(),
      onReplaySkip: () => this.scene?.skipReplay(),
      onReplaySpeed: (speed) => this.scene?.setReplaySpeed(speed),
      onLayout: (top, bottom) => this.scene?.setHudHeight(top, bottom),
      onToggleThermal: () => this.toggleThermal(),
    });
    this.hud.mount(this.el.hudLayer);
    this.hud.hide();
    if (this.save.issueMessage) this.toast(this.save.issueMessage);
  }

  private updateViewport(): void {
    const width = window.visualViewport?.width ?? window.innerWidth;
    const height = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty('--app-width', `${Math.round(width)}px`);
    document.documentElement.style.setProperty('--app-height', `${Math.round(height)}px`);
    if (this.game) this.game.scale.resize(Math.round(width), Math.round(height));
    this.updateOrientationPrompt();
  }

  private setupGlobalEvents(): void {
    window.addEventListener('resize', () => this.updateViewport(), { passive: true });
    window.addEventListener('orientationchange', () => window.setTimeout(() => this.updateViewport(), 80));
    window.visualViewport?.addEventListener('resize', () => this.updateViewport(), { passive: true });
    window.visualViewport?.addEventListener('scroll', () => this.updateViewport(), { passive: true });
    window.addEventListener('pointerdown', () => void this.unlockAudio(), { passive: true });
    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    document.addEventListener('gesturestart', (event) => {
      if (this.mode === 'mission') event.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturechange', (event) => {
      if (this.mode === 'mission') event.preventDefault();
    }, { passive: false });
    document.addEventListener('contextmenu', (event) => {
      if (this.mode === 'mission') event.preventDefault();
    });
    window.addEventListener('pagehide', () => this.checkpointMission());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.checkpointMission();
      if (document.hidden && this.mode === 'mission' && this.scene?.getReplayState().phase === 'playing') {
        this.scene.setReplayPaused(true);
      }
    });
  }

  private async unlockAudio(): Promise<void> {
    if (this.audio.isUnlocked || this.audioUnlocking) return;
    this.audioUnlocking = true;
    await this.audio.unlock();
    this.audioUnlocking = false;
    this.applyAudioSettings();
  }

  private applyAudioSettings(): void {
    const settings = this.save.settings;
    this.audio.setMusicVolume(settings.musicVolume);
    this.audio.setEffectsVolume(settings.effectsVolume);
    this.audio.setMusicEnabled(settings.musicVolume > 0);
  }

  // ── screens ──────────────────────────────────────────────────────────────
  private showScreen(element: HTMLElement, mode: AppMode, ambient = true): void {
    this.checkpointMission();
    this.clearOverlays();
    this.stopReplayTicker();
    this.mission = null;
    this.mode = mode;
    this.lastPreview = null;
    this.el.screenLayer.replaceChildren(element);
    this.el.screenLayer.hidden = false;
    this.el.screenLayer.inert = false;
    this.hud?.hide();
    if (this.scene && ambient) this.scene.showAmbient();
    document.body.dataset.view = mode;
    this.updateOrientationPrompt();
  }

  showMenu(): void {
    const element = renderMenu({
      save: this.save,
      issueMessage: this.save.issueMessage,
      audioOn: this.save.settings.musicVolume > 0,
      onPlay: () => {
        const saved = this.save.data.mission;
        if (saved) this.startMission(saved.stageId, true);
        else {
          const id = this.save.firstIncompleteUnlockedStage();
          this.openBriefing(id || ALL_STAGES[0]!.id);
        }
      },
      onCampaign: () => this.showCampaign(this.save.data.lastStageId),
      onArmory: () => this.showArmory(),
      onSettings: () => this.showSettingsScreen(),
      onHelp: () => this.openHelp(),
      onToggleAudio: () => {
        const on = this.save.settings.musicVolume <= 0;
        const next = { ...this.save.settings, musicVolume: on ? DEFAULT_SETTINGS.musicVolume : 0 };
        this.save.setSettings(next);
        this.audio.setMusicVolume(next.musicVolume);
        this.audio.setMusicEnabled(next.musicVolume > 0);
        this.showMenu();
        this.toast(on ? 'MUSIC ON' : 'MUSIC MUTED');
      },
    });
    this.showScreen(element, 'menu');
  }

  showCampaign(selectedStageId?: string): void {
    const selected = getStage(selectedStageId ?? '') ?? ALL_STAGES[0]!;
    const element = renderCampaign({
      save: this.save,
      initialStageId: selected.id,
      onBack: () => this.showMenu(),
      onBriefing: (stageId) => this.openBriefing(stageId),
    });
    this.showScreen(element, 'campaign');
  }

  showArmory(): void {
    const element = renderArmory({
      save: this.save,
      onBack: () => this.showMenu(),
      onSetPreferred: (id) => {
        this.save.setPreferredAmmo(id);
        this.toast(`${getAmmo(id).name} SET AS FIELD PREFERRED`);
      },
    });
    this.showScreen(element, 'armory');
  }

  showSettingsScreen(): void {
    const element = this.settingsElement(() => this.showMenu());
    this.showScreen(element, 'settings');
  }

  private settingsElement(onBack: () => void): HTMLElement {
    return renderSettings({
      settings: this.save.settings,
      storageMessage: this.save.issueMessage,
      onBack,
      onChange: (next) => this.applySettings(next),
      onReset: () => {
        const settings = this.save.resetSettings();
        this.applySettings(settings);
        this.toast('SETTINGS RESET');
      },
      onTestSound: () => {
        void this.unlockAudio().then(() => this.audio.play('explosion'));
      },
    });
  }

  /** Thermal camera toggle: a view mode, not a gameplay change. */
  private toggleThermal(): void {
    const next = { ...this.save.settings, thermalVision: !this.save.settings.thermalVision };
    this.applySettings(next);
    this.hud?.setThermal(next.thermalVision);
    this.toast(next.thermalVision ? 'THERMAL VIEW ON' : 'THERMAL VIEW OFF');
  }

  private applySettings(next: Settings): void {
    this.save.setSettings(next);
    this.audio.setMusicVolume(next.musicVolume);
    this.audio.setEffectsVolume(next.effectsVolume);
    this.audio.setMusicEnabled(next.musicVolume > 0);
    this.scene?.applySettings(next);
  }

  // ── briefing / mission ───────────────────────────────────────────────────
  private openBriefing(stageId: string): void {
    const stage = getStage(stageId);
    if (!stage) return;
    if (!this.save.isStageUnlocked(stage.id)) {
      this.toast('THAT BATTERY IS STILL LOCKED');
      return;
    }
    this.pushOverlay({
      kind: 'briefing',
      render: () =>
        renderBriefing({
          stage,
          save: this.save,
          onBack: () => this.popOverlay(),
          onPlay: () => {
            this.clearOverlays();
            this.startMission(stage.id, this.save.data.mission?.stageId === stage.id);
          },
        }),
      onEscape: () => this.popOverlay(),
    });
  }

  private startMission(stageId: string, resume = false): void {
    const def = getStage(stageId);
    if (!def) return;
    if (!this.scene) {
      this.toast('THE FIELD IS STILL LOADING');
      return;
    }
    if (!this.save.isStageUnlocked(def.id)) {
      this.toast('CLEAR THE PREVIOUS BATTERY FIRST');
      return;
    }
    let built: BuiltStage;
    try {
      built = buildStage(def);
    } catch (error) {
      console.error(error);
      this.toast('STAGE GENERATION FAILED — RETRY');
      return;
    }
    this.clearOverlays();
    this.stopReplayTicker();
    const saved = resume && this.save.data.mission?.stageId === def.id ? this.save.data.mission : null;
    this.save.setLastStage(def.id);
    const preferred = AMMO_BY_ID.has(this.save.data.preferredAmmo)
      ? this.save.data.preferredAmmo
      : def.suggestedAmmo[0] ?? 'ap-solid-shot';
    const ammoId = saved?.aim.ammoId ?? (AMMO_BY_ID.has(preferred) ? preferred : 'ap-solid-shot');
    this.mission = {
      def,
      built,
      ammoId,
      shotsUsed: saved?.shotsUsed ?? 0,
      over: false,
      pausedForMenu: false,
      aim: { angleDeg: 42, power: 330, mode: 'arc', ammoId },
    };
    this.mode = 'mission';
    this.el.screenLayer.hidden = true;
    this.el.screenLayer.inert = true;
    this.el.overlayLayer.hidden = true;
    this.hud?.show();
    this.lastPreview = null;
    this.scene.startMission(
      built,
      ammoId,
      this.save.settings,
      saved ? { snapshot: saved.snapshot, aim: saved.aim, debris: saved.debris } : undefined,
    );
    const aim = this.scene.getAim();
    this.mission.aim = aim;
    this.hud?.showMission(def, built, aim, getAmmo(aim.ammoId), this.mission.shotsUsed);
    this.hud?.setThermal(this.save.settings.thermalVision);
    const snapshot = this.scene.getRuntimeSnapshot();
    if (snapshot) this.hud?.updateObjective(snapshot);
    this.hud?.setPreview(this.lastPreview);
    document.body.dataset.view = 'mission';
    this.updateOrientationPrompt();
    if (saved?.pending) this.handleShotFinished({ final: saved.snapshot, ...saved.pending });
    else this.checkpointMission();
    requestAnimationFrame(() => requestAnimationFrame(() => this.syncHudLayout()));
  }

  private checkpointMission(): void {
    if (!this.mission || this.mission.over || !this.scene) return;
    const pending = this.scene.getPendingShot();
    const snapshot = pending?.final ?? this.scene.getRuntimeSnapshot();
    if (!snapshot) return;
    this.save.setMission({
      stageId: this.mission.def.id,
      snapshot,
      shotsUsed: this.mission.shotsUsed,
      aim: this.mission.aim,
      pending: pending ? { coreDamage: pending.coreDamage, cellDamage: pending.cellDamage } : null,
      debris: this.scene.getDebrisRecords(),
    });
  }

  private syncHudLayout(): void {
    if (!this.hud) return;
    const heights = this.hud.getObservableHeights();
    this.scene?.setHudHeight(heights.top, heights.bottom);
  }

  private fire(): void {
    if (!this.mission || this.mission.over) return;
    void this.unlockAudio();
    const input: ShotInput | null = this.scene?.fire() ?? null;
    if (!input) this.toast('THE BARREL IS NOT READY');
  }

  private resetAim(): void {
    if (!this.mission || this.mission.over) return;
    this.scene?.resetAim();
    this.toast('AIM RESET');
  }

  private handleShotStarted(): void {
    if (!this.mission) return;
    this.mission.shotsUsed += 1;
    this.checkpointMission();
    this.hud?.setPreview(null);
    this.hud?.updateShots(this.mission.shotsUsed);
    this.hud?.setBusy(true);
  }

  private handleReplayState(state: ReplayState): void {
    this.hud?.setReplay(state);
    if (state.phase === 'playing' || state.phase === 'paused') {
      this.startReplayTicker();
    } else {
      this.stopReplayTicker();
    }
    if (state.phase === 'paused' && this.mode === 'mission' && this.overlays.length === 0) {
      // A visibility change or programmatic pause should be visible to the player.
      if (!this.mission?.pausedForMenu) this.toast('REPLAY PAUSED');
    }
  }

  private handleShotFinished(result: Pick<ShotResult, 'final' | 'coreDamage' | 'cellDamage'>): void {
    if (!this.mission) return;
    this.stopReplayTicker();
    const evaluation = this.evaluate(result.final);
    const shotsLeft = Math.max(0, this.mission.def.shots - this.mission.shotsUsed);
    this.hud?.updateObjective(result.final);
    if (!evaluation.success && !evaluation.fatal && shotsLeft > 0) {
      this.checkpointMission();
      this.hud?.updateShots(this.mission.shotsUsed);
      this.hud?.setBusy(false);
      const message =
        result.coreDamage > 0
          ? 'CORE HIT — KEEP IT UNDER FIRE'
          : result.cellDamage > 0
            ? 'SMASHING! — NEXT SHOT READY'
            : 'NO CONTACT — ADJUST THE LINE';
      this.toast(message);
      return;
    }
    this.mission.over = true;
    let stars = 0;
    let firstClear = false;
    let reward: string | null = null;
    let newBest = false;
    if (evaluation.success) {
      stars = calculateStars(this.mission.def, this.mission.shotsUsed);
      const record = this.save.recordClear(this.mission.def.id, stars, this.mission.shotsUsed);
      firstClear = record.firstClear;
      reward = record.reward;
      newBest = record.newBest;
      this.save.setLastStage(this.mission.def.id);
      this.audio.play('success');
    } else {
      this.save.clearMission();
      this.audio.play('failure');
    }
    const definition = this.mission.def;
    const nextId = nextStageId(definition.id);
    const next = nextId ? (getStage(nextId) ?? null) : null;
    const reason = evaluation.success
      ? this.successReason(evaluation, this.mission.shotsUsed)
      : evaluation.reason;
    this.hud?.hide();
    this.el.screenLayer.hidden = true;
    this.el.overlayLayer.hidden = false;
    this.mode = 'results';
    document.body.dataset.view = 'results';
    this.updateOrientationPrompt();
    this.overlays = [];
    this.pushOverlay({
      kind: 'results',
      render: () =>
        renderResults({
          stage: definition,
          success: evaluation.success,
          reason,
          shotsUsed: this.mission?.shotsUsed ?? 0,
          stars,
          firstClear,
          reward,
          newBest,
          nextStage: next,
          onRetry: () => {
            this.clearOverlays();
            this.startMission(definition.id);
          },
          onNext: () => {
            if (!next) {
              this.showCampaign(definition.id);
              return;
            }
            this.clearOverlays();
            this.showCampaign(next.id);
            this.openBriefing(next.id);
          },
          onCampaign: () => {
            this.clearOverlays();
            this.showCampaign(definition.id);
          },
        }),
    });
  }

  private evaluate(snapshot: StageSnapshot): { success: boolean; fatal: boolean; reason: string; cover: number } {
    if (!this.mission) return { success: false, fatal: false, reason: '', cover: 0 };
    const definition = this.mission.def;
    if (definition.objective.kind === 'destroy-core') {
      const success = snapshot.core.destroyed || snapshot.core.hp <= 0;
      return {
        success,
        fatal: false,
        reason: success
          ? 'The core has been breached. Its signal is off the board.'
          : `The core is still intact at ${Math.ceil(snapshot.core.hp)} health.`,
        cover: snapshotCoreCoverFraction(snapshot),
      };
    }
    if (definition.objective.kind === 'expose-core') {
      if (snapshot.core.destroyed || snapshot.core.hp <= 0) {
        return {
          success: false,
          fatal: true,
          reason: 'The core was destroyed. This battery required the core to be exposed, not annihilated.',
          cover: 0,
        };
      }
      const cover = snapshotCoreCoverFraction(snapshot);
      const threshold = definition.objective.threshold ?? 0.3;
      return {
        success: cover <= threshold,
        fatal: false,
        reason: `The shield is still ${Math.round(cover * 100)}% intact. Reduce it to ${Math.round(threshold * 100)}% or less.`,
        cover,
      };
    }
    const relays = snapshot.relays;
    const success = relays.length > 0 && relays.every((relay) => !relay.alive);
    return {
      success,
      fatal: false,
      reason: success ? 'Every marked relay pod has been destroyed.' : 'The relay pod is still transmitting.',
      cover: snapshotCoreCoverFraction(snapshot),
    };
  }

  private successReason(evaluation: { cover: number }, shotsUsed: number): string {
    if (!this.mission) return '';
    const { def } = this.mission;
    if (def.objective.kind === 'destroy-core') {
      return `Core destroyed with ${shotsUsed} of ${def.shots} shots. The structure behind it is no longer a threat.`;
    }
    if (def.objective.kind === 'expose-core') {
      return `Core shield reduced to ${Math.round(evaluation.cover * 100)}% with the core intact. The battery can be recovered.`;
    }
    return `Relay pod shattered with ${shotsUsed} of ${def.shots} shots. The false coordinates have stopped.`;
  }

  // ── pause / settings / help / picker ─────────────────────────────────────
  private openPause(): void {
    if (!this.mission || this.mission.over) return;
    if (this.overlays.some((overlay) => overlay.kind === 'pause')) return;
    const replay = this.scene?.getReplayState();
    const inReplay = replay?.phase === 'playing' || replay?.phase === 'paused';
    if (inReplay) {
      this.mission.pausedForMenu = true;
      if (replay?.phase === 'playing') this.scene?.setReplayPaused(true);
    }
    const closePause = (): void => {
      this.popOverlay();
      if (this.mission?.pausedForMenu) {
        this.scene?.setReplayPaused(false);
        this.mission.pausedForMenu = false;
      }
    };
    this.pushOverlay({
      kind: 'pause',
      render: () =>
        renderPause({
          stage: this.mission!.def,
          shotsUsed: this.mission!.shotsUsed,
          inReplay: Boolean(inReplay),
          onResume: closePause,
          onRestart: () => {
            this.clearOverlays();
            this.mission!.pausedForMenu = false;
            this.startMission(this.mission!.def.id);
          },
          onSettings: () => this.openSettingsOverlay(),
          onQuit: () => {
            const id = this.mission!.def.id;
            this.clearOverlays();
            this.showCampaign(id);
          },
          onHelp: () => this.openHelp(),
        }),
      onEscape: closePause,
    });
  }

  private openSettingsOverlay(): void {
    this.pushOverlay({
      kind: 'settings',
      render: () => {
        const wrapper = document.createElement('div');
        wrapper.className = 'overlay settings-overlay';
        wrapper.setAttribute('role', 'dialog');
        wrapper.setAttribute('aria-modal', 'true');
        wrapper.append(this.settingsElement(() => this.popOverlay()));
        return wrapper;
      },
      onEscape: () => this.popOverlay(),
    });
  }

  private openHelp(): void {
    this.pushOverlay({
      kind: 'help',
      render: () => renderHelp({ onClose: () => this.popOverlay() }),
      onEscape: () => this.popOverlay(),
    });
  }

  private openAmmoPicker(): void {
    if (!this.mission || this.mission.over) return;
    const replay = this.scene?.getReplayState();
    if (replay?.phase === 'playing' || replay?.phase === 'paused') return;
    this.pushOverlay({
      kind: 'ammo',
      render: () =>
        renderAmmoPicker({
          currentId: this.mission?.ammoId ?? 'ap-solid-shot',
          onClose: () => this.popOverlay(),
          onLoad: (id) => {
            this.scene?.setAmmo(id);
            if (this.mission) this.mission.ammoId = id;
            this.popOverlay();
            this.toast(`${getAmmo(id).name} LOADED`);
          },
        }),
      onEscape: () => this.popOverlay(),
    });
  }

  private toggleReplayPause(): void {
    if (!this.scene) return;
    const state = this.scene.getReplayState();
    if (state.phase === 'playing') this.scene.setReplayPaused(true);
    else if (state.phase === 'paused') this.scene.setReplayPaused(false);
  }

  private startReplayTicker(): void {
    if (this.replayTicker !== null) return;
    this.replayTicker = window.setInterval(() => {
      const state = this.scene?.getReplayState();
      if (state && (state.phase === 'playing' || state.phase === 'paused')) {
        this.hud?.updateReplayProgress(state);
      }
    }, 100);
  }

  private stopReplayTicker(): void {
    if (this.replayTicker !== null) {
      window.clearInterval(this.replayTicker);
      this.replayTicker = null;
    }
  }

  // ── overlays ─────────────────────────────────────────────────────────────
  private pushOverlay(spec: OverlaySpec): void {
    this.overlays.push(spec);
    this.renderOverlays();
  }

  private popOverlay(): void {
    this.overlays.pop();
    this.renderOverlays();
  }

  private clearOverlays(): void {
    this.overlays = [];
    this.renderOverlays();
  }

  private renderOverlays(): void {
    const top = this.overlays[this.overlays.length - 1];
    this.el.overlayLayer.replaceChildren();
    if (!top) {
      this.el.overlayLayer.hidden = true;
      this.el.screenLayer.inert = false;
      if (this.hud) this.hud.root.inert = false;
      return;
    }
    this.el.overlayLayer.hidden = false;
    this.el.screenLayer.inert = true;
    if (this.hud) this.hud.root.inert = true;
    const node = top.render();
    this.el.overlayLayer.append(node);
    requestAnimationFrame(() => {
      const target = node.querySelector<HTMLElement>('button, input, [tabindex="0"]');
      target?.focus({ preventScroll: true });
    });
  }

  // ── keyboard / orientation / toasts ──────────────────────────────────────
  private onKeyDown(event: KeyboardEvent): void {
    const top = this.overlays[this.overlays.length - 1];
    if (event.key === 'Escape') {
      if (top?.onEscape) {
        event.preventDefault();
        top.onEscape();
        return;
      }
      if (!top && this.mode === 'mission') {
        event.preventDefault();
        this.openPause();
        return;
      }
    }
    if (top) return;
    if (this.mode !== 'mission' || !this.scene || !this.mission || this.mission.over) return;
    const target = event.target as HTMLElement | null;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      return;
    }
    const scene = this.scene;
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        scene.nudgeAngle(event.shiftKey ? 5 : 1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        scene.nudgeAngle(event.shiftKey ? -5 : -1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        scene.nudgePower(event.shiftKey ? -25 : -5);
        break;
      case 'ArrowRight':
        event.preventDefault();
        scene.nudgePower(event.shiftKey ? 25 : 5);
        break;
      case 'a':
      case 'A':
        event.preventDefault();
        scene.setMode(scene.getAim().mode === 'arc' ? 'straight' : 'arc');
        break;
      case 'd':
      case 'D':
        if (event.shiftKey) return;
        event.preventDefault();
        scene.setMode(scene.getAim().mode === 'arc' ? 'straight' : 'arc');
        break;
      case 'r':
      case 'R':
        event.preventDefault();
        scene.resetAim();
        break;
      case ' ':
        event.preventDefault();
        if (scene.getReplayState().phase === 'idle' || scene.getReplayState().phase === 'finished') this.fire();
        break;
      case 'Escape':
        event.preventDefault();
        this.openPause();
        break;
    }
  }

  private updateOrientationPrompt(): void {
    const portrait = window.matchMedia('(orientation: portrait)').matches && window.innerWidth < 820;
    const shouldShow = this.mode === 'mission' && portrait && !this.portraitAllowed;
    this.orientationPrompt.hidden = !shouldShow;
  }

  private buildOrientationPrompt(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'orientation-prompt';
    element.hidden = true;
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-modal', 'true');
    element.setAttribute('aria-label', 'Rotate device');
    element.innerHTML = `
      <div class="orientation-card">
        <div class="rotate-glyph" aria-hidden="true"><span></span></div>
        <span class="eyebrow">FIELD VIEW</span>
        <h2>TURN THE DEVICE.</h2>
        <p>Breakwater is built for landscape: the cannon, structure and core stay readable side by side. Rotate for the intended view.</p>
        <button type="button" class="primary-button" data-action="portrait">PLAY IN PORTRAIT</button>
        <small>Controls are touch-first. Landscape is strongly recommended.</small>
      </div>
    `;
    element.querySelector('[data-action="portrait"]')?.addEventListener('click', () => {
      this.portraitAllowed = true;
      this.orientationPrompt.hidden = true;
      this.syncHudLayout();
    });
    return element;
  }

  toast(message: string): void {
    if (!message) return;
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.el.toastLayer.textContent = message;
    this.el.toastLayer.classList.add('is-visible');
    this.toastTimer = window.setTimeout(() => {
      this.el.toastLayer.classList.remove('is-visible');
      this.toastTimer = null;
    }, 2300);
  }

  // ── developer diagnostics ────────────────────────────────────────────────
  private setupDebugPanel(): void {
    const panel = document.createElement('aside');
    panel.className = 'debug-panel';
    panel.hidden = true;
    panel.innerHTML = '<div class="debug-head">GENERATION DEBUG <button type="button" data-action="close">×</button></div><pre></pre>';
    panel.querySelector('[data-action="close"]')?.addEventListener('click', () => {
      this.debugOpen = false;
      panel.hidden = true;
    });
    this.el.root.append(panel);
    this.debugPanel = panel;
    this.debugOpen = true;
    panel.hidden = false;
    window.setInterval(() => this.refreshDebugPanel(), 500);
    window.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() === 'd' && event.shiftKey) {
        this.debugOpen = !this.debugOpen;
        panel.hidden = !this.debugOpen;
      }
    });
    this.refreshDebugPanel();
  }

  private refreshDebugPanel(): void {
    if (!this.debugPanel || !this.debugOpen) return;
    const sceneInfo = this.scene?.getDebugInfo() ?? {};
    const def = this.mission?.def ?? null;
    const diag = this.mission?.built.diagnostics;
    const snapshot = this.scene?.getRuntimeSnapshot();
    const cover = this.mission && snapshot
      ? snapshotCoreCoverFraction(snapshot)
      : null;
    const lines = [
      `screen     ${this.mode}`,
      `stage      ${def ? `${def.id} (${def.generator}, ${def.objective.kind})` : 'ambient'}`,
      `seed       ${diag?.generatedSeed ?? '—'}  attempts=${diag?.attempts ?? '—'}`,
      `walls      ${snapshot?.wallState?.walls.length ?? '—'}  warnings=${diag?.warnings.length ?? 0}`,
      `cover      ${cover === null ? '—' : `${Math.round(cover * 100)}%`}`,
      `shots      ${this.mission ? `${this.mission.shotsUsed}/${def?.shots ?? '—'}` : '—'}`,
      `aim        ${sceneInfo.angle ?? '—'}°  power=${sceneInfo.power ?? '—'}  zoom=${sceneInfo.zoom ?? '—'}`,
      `preview    cover=${sceneInfo.coverWarning ?? false} core=${sceneInfo.willHitCore ?? false}`,
      `render     walls=${sceneInfo.cells ?? '—'} fps=${sceneInfo.fps ?? '—'} detailed=${sceneInfo.detailed ?? '—'}`,
      `diagnostic ${diag?.warnings.length ? diag.warnings.join(' · ') : 'clean'}`,
      `note       Shift+D toggles this panel`,
    ];
    const pre = this.debugPanel.querySelector('pre');
    if (pre) pre.textContent = lines.join('\n');
  }
}

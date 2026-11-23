import type { AmmoDef } from '../game/ammo/types';
import { CATEGORY_META, getAmmo } from '../game/ammo/catalogue';
import { snapshotCoreCoverFraction } from '../game/stages/generator';
import type { BuiltStage, StageDefinition, StageSnapshot } from '../game/stages/types';
import type { FireMode, PreviewResult } from '../game/sim/types';
import type { AimState, ReplayState } from '../game/BattleScene';
import { ammoIconUrl } from './asset-url';
import { esc, starsHtml } from './dom';

export interface HudCallbacks {
  onAngleChange: (angle: number) => void;
  onPowerChange: (power: number) => void;
  onModeChange: (mode: FireMode) => void;
  onOpenAmmo: () => void;
  onChoiceChange: (choiceId: string) => void;
  onFire: () => void;
  onReset: () => void;
  onMenu: () => void;
  onReplayFinish: () => void;
  onReplayPause: () => void;
  onReplaySkip: () => void;
  onReplaySpeed: (speed: number) => void;
  onLayout: (top: number, bottom: number) => void;
  onToggleThermal: () => void;
}

/**
 * DOM controls stay outside the Phaser canvas for readable type and reliable
 * touch targets. Only the battlefield itself is rendered in the game canvas.
 */
export class GameHud {
  readonly root: HTMLElement;
  private callbacks: HudCallbacks;
  private stage: StageDefinition | null = null;
  private built: BuiltStage | null = null;
  private ammo: AmmoDef = getAmmo('aphe-hybrid');
  private angle = 42;
  private power = 330;
  private mode: FireMode = 'arc';
  private choiceId: string | undefined;
  private shotsLeft = 0;
  private shotsTotal = 0;
  private shotsUsed = 0;
  private replay: ReplayState = { phase: 'idle', speed: 1, elapsedMs: 0, durationMs: 0 };
  private observer: ResizeObserver | null = null;
  private warningForgiven = false;

  constructor(callbacks: HudCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'game-hud';
    this.root.innerHTML = `
      <header class="hud-top" data-hud="top">
        <div class="hud-mission">
          <span class="hud-kicker" data-hud="chapter">AH-01 / CHAPTER I</span>
          <strong class="hud-stage-name" data-hud="stage-name">FIRST TIDE</strong>
        </div>
        <div class="hud-objective">
          <div class="hud-objective-line">
            <span class="hud-kicker" data-hud="objective-label">DESTROY CORE</span>
            <span class="hud-objective-value" data-hud="objective-value">84 / 84</span>
          </div>
          <div class="meter meter-core"><span data-hud="objective-bar"></span></div>
        </div>
        <div class="hud-shot-block">
          <div class="hud-shots"><strong data-hud="shots">05</strong><span>SHOTS<br>LEFT</span></div>
          <div class="hud-star-target" data-hud="star-target">${starsHtml(0)}</div>
        </div>
        <div class="hud-actions">
          <button type="button" class="hud-icon-button" data-action="hud-thermal" aria-label="Toggle thermal vision" aria-pressed="false">THERMAL<br><span>VIEW</span></button>
          <button type="button" class="hud-icon-button" data-action="hud-reset" aria-label="Reset aim">RESET<br><span>AIM</span></button>
          <button type="button" class="hud-icon-button" data-action="hud-menu" aria-label="Pause and open menu">MENU</button>
        </div>
      </header>

      <div class="aim-warning" data-hud="warning" role="status" aria-live="polite" hidden></div>

      <footer class="hud-bottom hud-aim" data-hud="aim-bottom">
        <button type="button" class="ammo-pick-button" data-action="open-ammo" aria-label="Choose ammunition">
          <img data-hud="ammo-icon" src="${ammoIconUrl(this.ammo.id)}" alt="" />
          <span class="ammo-pick-copy">
            <span class="hud-kicker">ROUND</span>
            <strong data-hud="ammo-name">${esc(this.ammo.name)}</strong>
            <span class="ammo-pick-cat" data-hud="ammo-category">APHE</span>
          </span>
          <span class="chevron" aria-hidden="true">›</span>
        </button>

        <div class="aim-stack">
          <div class="aim-row top-row">
            <div class="mode-switch" role="group" aria-label="Firing mode">
              <button type="button" data-mode="arc" class="is-active">ARC</button>
              <button type="button" data-mode="straight">STRAIGHT</button>
            </div>
            <div class="angle-control">
              <button type="button" data-action="angle-down" aria-label="Lower aim by one degree">−</button>
              <div class="angle-readout"><span data-hud="angle">42°</span><small>AIM</small></div>
              <button type="button" data-action="angle-up" aria-label="Raise aim by one degree">+</button>
            </div>
            <div class="option-switch" data-hud="options"></div>
          </div>
          <div class="aim-row power-row">
            <span class="power-label">POWER</span>
            <input type="range" data-hud="power" min="40" max="441" step="1" value="330" aria-label="Shot power" />
            <output class="power-value" data-hud="power-value">330</output>
            <span class="power-max">/ 441</span>
            <button type="button" class="power-nudge" data-action="power-down" aria-label="Lower power">−</button>
            <button type="button" class="power-nudge" data-action="power-up" aria-label="Raise power">+</button>
          </div>
        </div>

        <button type="button" class="fire-button" data-action="fire" aria-label="Fire the selected round">
          <span class="fire-main">FIRE</span>
          <span class="fire-sub" data-hud="fire-sub">READY · ARC</span>
        </button>
      </footer>

      <footer class="hud-bottom hud-replay" data-hud="replay-bottom" hidden>
        <div class="replay-title">
          <span class="hud-kicker">SHOT RESOLVED</span>
          <strong data-hud="replay-shot">REPLAY</strong>
        </div>
        <div class="replay-actions">
          <button type="button" class="replay-primary" data-action="replay-finish">FINISH</button>
          <button type="button" data-action="replay-pause" class="replay-secondary" data-hud="pause-label">PAUSE</button>
          <button type="button" data-action="replay-skip" class="replay-secondary">SKIP</button>
          <div class="speed-switch" role="group" aria-label="Replay speed">
            <button type="button" data-speed="0.1">0.1×</button>
            <button type="button" data-speed="0.4">0.4×</button>
            <button type="button" data-speed="1" class="is-active">1×</button>
          </div>
          <div class="replay-progress" aria-hidden="true"><span data-hud="replay-progress"></span></div>
        </div>
      </footer>
    `;

    this.root.addEventListener('click', (event) => this.onClick(event));
    const power = this.query<HTMLInputElement>('[data-hud="power"]');
    power.addEventListener('input', () => {
      this.power = Number(power.value);
      this.query<HTMLElement>('[data-hud="power-value"]').textContent = String(this.power);
      this.callbacks.onPowerChange(this.power);
    });
    // A range drag should not bleed into the Fire button on pointer release.
    power.addEventListener('pointerdown', (event) => event.stopPropagation());
    power.addEventListener('pointerup', (event) => event.stopPropagation());
    this.root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.mode as FireMode;
        this.mode = mode;
        this.refreshMode();
        this.callbacks.onModeChange(mode);
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((button) => {
      button.addEventListener('click', () => {
        const speed = Number(button.dataset.speed);
        this.callbacks.onReplaySpeed(speed);
      });
    });
  }

  mount(parent: HTMLElement): void {
    parent.append(this.root);
    this.observer = new ResizeObserver(() => this.notifyLayout());
    this.observer.observe(this.query('[data-hud="top"]'));
    this.observer.observe(this.query('[data-hud="aim-bottom"]'));
    this.observer.observe(this.query('[data-hud="replay-bottom"]'));
    requestAnimationFrame(() => this.notifyLayout());
  }

  unmount(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.root.remove();
  }

  private query<T extends HTMLElement = HTMLElement>(selector: string): T {
    const node = this.root.querySelector<T>(selector);
    if (!node) throw new Error(`HUD node missing: ${selector}`);
    return node;
  }

  private notifyLayout(): void {
    const top = this.query('[data-hud="top"]').getBoundingClientRect().height;
    const bottomNode = this.replay.phase === 'playing' || this.replay.phase === 'paused'
      ? this.query('[data-hud="replay-bottom"]')
      : this.query('[data-hud="aim-bottom"]');
    const bottom = bottomNode.getBoundingClientRect().height;
    this.callbacks.onLayout(top, bottom);
  }

  private onClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    switch (action) {
      case 'hud-reset':
        this.callbacks.onReset();
        break;
      case 'hud-menu':
        this.callbacks.onMenu();
        break;
      case 'hud-thermal':
        this.callbacks.onToggleThermal();
        break;
      case 'open-ammo':
        this.callbacks.onOpenAmmo();
        break;
      case 'angle-down':
        this.callbacks.onAngleChange(Math.max(4, this.angle - (event.shiftKey ? 5 : 1)));
        break;
      case 'angle-up':
        this.callbacks.onAngleChange(Math.min(84, this.angle + (event.shiftKey ? 5 : 1)));
        break;
      case 'power-down':
        this.callbacks.onPowerChange(Math.max(40, this.power - (event.shiftKey ? 25 : 5)));
        break;
      case 'power-up':
        this.callbacks.onPowerChange(Math.min(441, this.power + (event.shiftKey ? 25 : 5)));
        break;
      case 'fire':
        if (!target.hasAttribute('disabled')) this.callbacks.onFire();
        break;
      case 'replay-finish':
        this.callbacks.onReplayFinish();
        break;
      case 'replay-pause':
        this.callbacks.onReplayPause();
        break;
      case 'replay-skip':
        this.callbacks.onReplaySkip();
        break;
    }
  }

  showMission(stage: StageDefinition, built: BuiltStage, aim: AimState, ammo: AmmoDef, shotsUsed: number): void {
    this.stage = stage;
    this.built = built;
    this.ammo = ammo;
    this.angle = aim.angleDeg;
    this.power = aim.power;
    this.mode = aim.mode;
    this.choiceId = aim.choiceId;
    this.shotsUsed = shotsUsed;
    this.shotsTotal = stage.shots;
    this.shotsLeft = Math.max(0, stage.shots - shotsUsed);
    this.replay = { phase: 'idle', speed: 1, elapsedMs: 0, durationMs: 0 };
    this.query('[data-hud="chapter"]').textContent = `${stage.code} / ${stage.chapterName.toUpperCase()}`;
    this.query('[data-hud="stage-name"]').textContent = stage.name.toUpperCase();
    this.query('[data-hud="objective-label"]').textContent = stage.objective.label;
    this.query('[data-hud="star-target"]').innerHTML = `${starsHtml(3, 3, 'is-target')}<small>≤ ${stage.starShots} SHOTS</small>`;
    this.query('[data-hud="aim-bottom"]').hidden = false;
    this.query('[data-hud="replay-bottom"]').hidden = true;
    this.updateAmmo(ammo, aim.choiceId);
    this.updateAim(aim);
    this.updateShots(shotsUsed);
    this.setWarning(null, false);
    this.setBusy(false);
    this.updateObjectiveTarget();
    requestAnimationFrame(() => this.notifyLayout());
  }

  updateAim(aim: AimState): void {
    this.angle = aim.angleDeg;
    this.power = aim.power;
    this.mode = aim.mode;
    if (aim.ammoId !== this.ammo.id) this.updateAmmo(getAmmo(aim.ammoId), aim.choiceId);
    if (aim.choiceId !== this.choiceId) this.updateChoice(aim.choiceId);
    this.query('[data-hud="angle"]').textContent = `${Math.round(this.angle)}°`;
    this.query<HTMLInputElement>('[data-hud="power"]').value = String(Math.round(this.power));
    this.query('[data-hud="power-value"]').textContent = String(Math.round(this.power));
    this.query('[data-hud="fire-sub"]').textContent =
      this.mode === 'arc' ? 'READY · ARC' : 'READY · STRAIGHT';
    this.refreshMode();
  }

  updateChoice(choiceId: string | undefined): void {
    this.choiceId = choiceId;
    if (!this.ammo.choice) return;
    this.root.querySelectorAll<HTMLElement>('[data-choice]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.choice === choiceId);
      button.setAttribute('aria-pressed', button.dataset.choice === choiceId ? 'true' : 'false');
    });
  }

  updateAmmo(ammo: AmmoDef, choiceId?: string): void {
    this.ammo = ammo;
    this.choiceId = choiceId;
    const icon = this.query<HTMLImageElement>('[data-hud="ammo-icon"]');
    icon.src = ammoIconUrl(ammo.id);
    icon.alt = '';
    this.query('[data-hud="ammo-name"]').textContent = ammo.name;
    this.query('[data-hud="ammo-category"]').textContent = CATEGORY_META[ammo.category].badge;
    const options = this.query('[data-hud="options"]');
    if (!ammo.choice) {
      options.innerHTML = '<span class="option-hint">TAP FIELD TO AIM</span>';
      return;
    }
    options.innerHTML = `
      <span class="option-label">${esc(ammo.choice.label)}</span>
      <div class="option-buttons" role="group" aria-label="${esc(ammo.choice.label)}">
        ${ammo.choice.options
          .map(
            (option) =>
              `<button type="button" data-choice="${option.id}" title="${esc(option.hint)}">${esc(option.label)}</button>`,
          )
          .join('')}
      </div>`;
    options.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.choice;
        if (id) this.callbacks.onChoiceChange(id);
      });
    });
    this.updateChoice(choiceId ?? ammo.choice.defaultOption);
  }

  private refreshMode(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
      const active = button.dataset.mode === this.mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  updateShots(shotsUsed: number): void {
    if (!this.stage) return;
    this.shotsUsed = shotsUsed;
    this.shotsLeft = Math.max(0, this.shotsTotal - shotsUsed);
    this.query('[data-hud="shots"]').textContent = String(this.shotsLeft).padStart(2, '0');
    this.setBusy(this.shotsLeft <= 0 || this.replay.phase === 'playing' || this.replay.phase === 'paused');
  }

  updateObjective(snapshot: StageSnapshot): void {
    if (!this.stage || !this.built) return;
    const kind = this.stage.objective.kind;
    let value = 0;
    let text = '';
    let danger = false;
    if (kind === 'destroy-core') {
      value = snapshot.core.hp / Math.max(1, snapshot.core.maxHp);
      text = snapshot.core.destroyed
        ? 'BREACHED'
        : `${Math.ceil(snapshot.core.hp)} / ${snapshot.core.maxHp}`;
      danger = snapshot.core.hp / Math.max(1, snapshot.core.maxHp) < 0.34;
    } else if (kind === 'expose-core') {
      const cover = snapshotCoreCoverFraction(snapshot);
      value = cover;
      text = `${Math.round(cover * 100)}% COVER`;
      danger = cover <= (this.stage.objective.threshold ?? 0.3) + 0.001;
    } else {
      // Relay state is wall-authoritative (relay.alive resolved in wall-simulator).
      const alive = snapshot.relays.filter((r) => r.alive).length;
      value = alive / Math.max(1, snapshot.relays.length);
      text = `${alive} / ${snapshot.relays.length} RELAYS`;
      danger = alive === 0;
    }
    const bar = this.query<HTMLElement>('[data-hud="objective-bar"]');
    bar.style.width = `${Math.max(0, Math.min(1, value)) * 100}%`;
    bar.parentElement?.classList.toggle('is-danger', danger);
    this.query('[data-hud="objective-value"]').textContent = text;
  }

  private updateObjectiveTarget(): void {
    if (!this.built) return;
    this.updateObjective({ grid: this.built.grid, wallState: this.built.wallState, core: this.built.core, relays: this.built.relays });
  }

  /** Reflect the thermal camera state on its HUD button. */
  setThermal(on: boolean): void {
    const button = this.root.querySelector<HTMLElement>('[data-action="hud-thermal"]');
    if (!button) return;
    button.classList.toggle('is-active', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  setPreview(preview: PreviewResult | null): void {
    if (!preview) {
      this.setWarning(null, false);
      return;
    }
    if (preview.coverWarning) {
      this.setWarning('HITS COVER FIRST', true);
    } else if (preview.willHitCore) {
      this.setWarning('CLEAR LINE TO CORE', false);
    } else if (preview.willHitRelay) {
      this.setWarning('RELAY IN LINE', false);
    } else if (preview.outOfBounds) {
      this.setWarning('SHOT LEAVES THE FIELD', false);
    } else {
      this.setWarning(null, false);
    }
  }

  private setWarning(text: string | null, danger: boolean): void {
    const warning = this.query('[data-hud="warning"]');
    if (!text) {
      warning.hidden = true;
      this.warningForgiven = false;
      return;
    }
    warning.hidden = this.warningForgiven && !danger;
    warning.textContent = text;
    warning.classList.toggle('is-danger', danger);
  }

  forgiveWarning(): void {
    this.warningForgiven = true;
    this.query('[data-hud="warning"]').hidden = true;
  }

  setBusy(busy: boolean): void {
    const fire = this.root.querySelector<HTMLButtonElement>('[data-action="fire"]');
    if (!fire) return;
    fire.disabled = busy || this.shotsLeft <= 0;
    fire.classList.toggle('is-disabled', fire.disabled);
    this.query('[data-hud="fire-sub"]').textContent = busy
      ? 'RESOLVING'
      : this.shotsLeft <= 0
        ? 'NO SHOTS LEFT'
        : this.mode === 'arc'
          ? 'READY · ARC'
          : 'READY · STRAIGHT';
    this.root.querySelector<HTMLButtonElement>('[data-action="open-ammo"]')?.toggleAttribute('disabled', busy);
    this.root.querySelector<HTMLButtonElement>('[data-action="hud-reset"]')?.toggleAttribute('disabled', busy);
  }

  setReplay(state: ReplayState): void {
    this.replay = state;
    const playing = state.phase === 'playing' || state.phase === 'paused';
    this.query('[data-hud="aim-bottom"]').hidden = playing;
    this.query('[data-hud="replay-bottom"]').hidden = !playing;
    if (!playing) {
      this.notifyLayout();
      return;
    }
    this.query('[data-hud="pause-label"]').textContent = state.phase === 'paused' ? 'RESUME' : 'PAUSE';
    this.query('[data-hud="replay-shot"]').textContent = `SHOT ${String(this.shotsUsed).padStart(2, '0')} · ${this.replayLabel()}`;
    const progress = this.query<HTMLElement>('[data-hud="replay-progress"]');
    progress.style.width = state.durationMs > 0 ? `${Math.min(100, (state.elapsedMs / state.durationMs) * 100)}%` : '0%';
    this.root.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((button) => {
      button.classList.toggle('is-active', Number(button.dataset.speed) === state.speed);
    });
    this.setBusy(true);
    requestAnimationFrame(() => this.notifyLayout());
  }

  updateReplayProgress(state: ReplayState): void {
    this.replay = state;
    const progress = this.query<HTMLElement>('[data-hud="replay-progress"]');
    progress.style.width = state.durationMs > 0 ? `${Math.min(100, (state.elapsedMs / state.durationMs) * 100)}%` : '0%';
    if (state.phase === 'paused' || state.phase === 'playing') {
      this.query('[data-hud="pause-label"]').textContent = state.phase === 'paused' ? 'RESUME' : 'PAUSE';
    }
  }

  private replayLabel(): string {
    return this.ammo.name.toUpperCase();
  }

  getObservableHeights(): { top: number; bottom: number } {
    const top = this.query('[data-hud="top"]').getBoundingClientRect().height;
    const bottomNode = this.replay.phase === 'playing' || this.replay.phase === 'paused'
      ? this.query('[data-hud="replay-bottom"]')
      : this.query('[data-hud="aim-bottom"]');
    return { top, bottom: bottomNode.getBoundingClientRect().height };
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}

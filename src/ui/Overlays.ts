import type { StageDefinition } from '../game/stages/types';
import { esc, starsHtml } from './dom';

export function calculateStars(stage: StageDefinition, shotsUsed: number): number {
  if (shotsUsed <= stage.starShots) return 3;
  if (shotsUsed <= stage.starShots + 1) return 2;
  return 1;
}

export interface ResultsOptions {
  stage: StageDefinition;
  success: boolean;
  reason: string;
  shotsUsed: number;
  stars: number;
  firstClear: boolean;
  reward: string | null;
  newBest: boolean;
  nextStage: StageDefinition | null;
  onRetry: () => void;
  onNext: () => void;
  onCampaign: () => void;
}

export function renderResults(options: ResultsOptions): HTMLElement {
  const { stage, success, stars } = options;
  const root = document.createElement('div');
  root.className = `overlay results-overlay ${success ? 'is-success' : 'is-failure'}`;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'results-title');
  const rewardLine = success
    ? options.firstClear && options.reward
      ? `<span class="reward-state">FIRST CLEAR</span><strong>${esc(options.reward)}</strong><small>Emblem secured. It will not be awarded twice.</small>`
      : `<span class="reward-state is-claimed">ALREADY CLAIMED</span><strong>${esc(stage.firstClearReward)}</strong><small>First-clear emblems are paid once. Stars can still improve.</small>`
    : `<span class="reward-state is-failure">NOT EARNED</span><strong>NO EMBLEM</strong><small>Complete the objective within the shot budget.</small>`;
  root.innerHTML = `
    <div class="results-panel">
      <div class="results-flare" aria-hidden="true"></div>
      <div class="results-topline">
        <span>${stage.code} · ${esc(stage.chapterName.toUpperCase())}</span>
        <span>${success ? 'OBJECTIVE COMPLETE' : 'OBJECTIVE INCOMPLETE'}</span>
      </div>
      <div class="results-title-block">
        <span class="eyebrow">${success ? 'BATTERY CLEARED' : 'FIELD REPORT'}</span>
        <h1 id="results-title">${success ? 'OBJECTIVE COMPLETE.' : 'THE LINE HOLDS.'}</h1>
        <p>${esc(options.reason)}</p>
      </div>
      <div class="results-mid">
        <div class="results-stars ${success ? 'is-earned' : ''}">
          ${starsHtml(success ? stars : 0, 3, 'results-stars-row')}
          <span>${success ? `${stars} STAR${stars === 1 ? '' : 'S'}` : 'NO STARS AWARDED'}</span>
        </div>
        <div class="results-stats">
          <div><span class="micro-label">SHOTS USED</span><strong>${options.shotsUsed}<em> / ${stage.shots}</em></strong></div>
          <div><span class="micro-label">STAR TARGET</span><strong>≤ ${stage.starShots}</strong></div>
          <div><span class="micro-label">OBJECTIVE</span><strong>${esc(stage.objective.label)}</strong></div>
          <div><span class="micro-label">RECORD</span><strong>${options.newBest ? 'NEW BEST' : 'HELD'}</strong></div>
        </div>
      </div>
      <div class="results-rule"><span></span><b>STARS FOLLOW SHOT EFFICIENCY</b><span></span></div>
      <p class="results-star-rule">3★ at ${stage.starShots} shots · 2★ at ${stage.starShots + 1} · 1★ for any clear. Replay speed never changes the result.</p>
      <div class="results-reward">${rewardLine}</div>
      <div class="results-actions">
        <button type="button" class="secondary-button" data-action="retry">RETRY</button>
        <button type="button" class="secondary-button" data-action="campaign">CAMPAIGN</button>
        ${
          success
            ? options.nextStage
              ? `<button type="button" class="primary-button results-next" data-action="next">NEXT: ${esc(options.nextStage.code)} <span aria-hidden="true">→</span></button>`
              : `<button type="button" class="primary-button results-next" data-action="campaign">BATTERY COMPLETE · CAMPAIGN <span aria-hidden="true">→</span></button>`
            : `<button type="button" class="primary-button results-next" data-action="retry">RETRY MISSION <span aria-hidden="true">→</span></button>`
        }
      </div>
      <p class="results-foot">First-clear emblem state and best stars are saved locally.</p>
    </div>
  `;
  root.querySelector('[data-action="retry"]')?.addEventListener('click', options.onRetry);
  root.querySelectorAll('[data-action="retry"]')[1]?.addEventListener('click', options.onRetry);
  root.querySelector('[data-action="campaign"]')?.addEventListener('click', options.onCampaign);
  root.querySelectorAll('[data-action="campaign"]')[1]?.addEventListener('click', options.onCampaign);
  root.querySelector('[data-action="next"]')?.addEventListener('click', options.onNext);
  return root;
}

export interface PauseOptions {
  stage: StageDefinition;
  shotsUsed: number;
  inReplay: boolean;
  onResume: () => void;
  onRestart: () => void;
  onSettings: () => void;
  onQuit: () => void;
  onHelp: () => void;
}

export function renderPause(options: PauseOptions): HTMLElement {
  const root = document.createElement('div');
  root.className = 'overlay pause-overlay';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'pause-title');
  root.innerHTML = `
    <div class="pause-panel">
      <span class="eyebrow">${options.stage.code} · ${esc(options.stage.name.toUpperCase())}</span>
      <h2 id="pause-title">HOLD THE LINE.</h2>
      <p>${options.inReplay ? 'Replay paused. The shot result is already sealed.' : `Shot ${options.shotsUsed} of ${options.stage.shots}. Damage persists until Retry.`}</p>
      <div class="pause-actions">
        <button type="button" class="primary-button" data-action="resume">${options.inReplay ? 'RESUME REPLAY' : 'RESUME MISSION'} <span aria-hidden="true">→</span></button>
        <button type="button" class="secondary-button" data-action="help">FIELD MANUAL</button>
        <button type="button" class="secondary-button" data-action="settings">SETTINGS</button>
        <button type="button" class="secondary-button" data-action="restart">RESTART BATTERY</button>
        <button type="button" class="text-button danger-text" data-action="quit">ABANDON / CAMPAIGN</button>
      </div>
      <p class="pause-foot">Restart recreates the same generated battlefield and resets the shot budget. Damage is not carried over.</p>
    </div>
  `;
  root.querySelector('[data-action="resume"]')?.addEventListener('click', options.onResume);
  root.querySelector('[data-action="help"]')?.addEventListener('click', options.onHelp);
  root.querySelector('[data-action="settings"]')?.addEventListener('click', options.onSettings);
  root.querySelector('[data-action="restart"]')?.addEventListener('click', options.onRestart);
  root.querySelector('[data-action="quit"]')?.addEventListener('click', options.onQuit);
  return root;
}

export interface HelpOptions {
  onClose: () => void;
  title?: string;
}

export function renderHelp(options: HelpOptions): HTMLElement {
  const root = document.createElement('div');
  root.className = 'overlay help-overlay';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'help-title');
  root.innerHTML = `
    <div class="help-panel">
      <header class="help-head">
        <div><span class="eyebrow">FIELD MANUAL / QUICK REFERENCE</span><h2 id="help-title">${esc(options.title ?? 'HOW TO BREAK A FORTRESS')}</h2></div>
        <button type="button" class="icon-close" data-action="close" aria-label="Close field manual">×</button>
      </header>
      <div class="help-grid">
        <section><span class="help-index">01</span><h3>READ THE TARGET</h3><p>The red core is the mission objective. Its chamber is surrounded by cover. Your dotted guide stops at the first surface it would hit; if the warning reads “HITS COVER FIRST”, your current line is blocked.</p></section>
        <section><span class="help-index">02</span><h3>AIM & POWER</h3><p>Drag anywhere in the battlefield to swing the barrel. The angle buttons make one-degree changes. Use the amber power rail to set muzzle energy. ARC falls under gravity; STRAIGHT flies fast and flat.</p></section>
        <section><span class="help-index">03</span><h3>PICK THE ROUND</h3><p>HEAT cuts focused channels. HESH spalls the rear face. HE moves and breaks wide areas. Solid rounds pierce. Soft rounds crush, fold and strip. APHE carries a charge inside. The Armory explains all 59.</p></section>
        <section><span class="help-index">04</span><h3>DAMAGE PERSISTS</h3><p>Every shot changes the actual structure. Broken supports can bring down whole sections. The next shot begins from the damage you made. Retry restores the original generated battery.</p></section>
        <section><span class="help-index">05</span><h3>REPLAY IS EVIDENCE</h3><p>After firing, Pause, Finish, Skip and 0.1×/0.5×/1×/2× only change how you watch. The damage, shot count and objective result were resolved before playback began.</p></section>
        <section><span class="help-index">06</span><h3>FIELD CONTROLS</h3><p>Touch: drag field · two-finger pinch to zoom. Mouse: drag field · wheel to zoom. Keyboard: ↑/↓ aim, ←/→ power, A/D mode, R reset, Space fire, Esc pause.</p></section>
      </div>
      <footer class="help-foot">
        <span>ROTATE TO LANDSCAPE FOR THE WIDEST VIEW. PINCH IN FOR MATERIAL DETAIL.</span>
        <button type="button" class="primary-button" data-action="close">BACK TO THE FIELD</button>
      </footer>
    </div>
  `;
  root.querySelectorAll('[data-action="close"]').forEach((button) => button.addEventListener('click', options.onClose));
  root.addEventListener('click', (event) => {
    if (event.target === root) options.onClose();
  });
  return root;
}

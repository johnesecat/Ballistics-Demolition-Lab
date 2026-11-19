import { getAmmo } from '../game/ammo/catalogue';
import type { StageDefinition } from '../game/stages/types';
import type { SaveStore } from '../game/save';
import { ammoIconUrl } from './asset-url';
import { esc, objectiveTag, starsHtml, starTargetText } from './dom';

export interface BriefingOptions {
  stage: StageDefinition;
  save: SaveStore;
  onBack: () => void;
  onPlay: () => void;
}

export function renderBriefing(options: BriefingOptions): HTMLElement {
  const { stage, save } = options;
  const root = document.createElement('div');
  root.className = 'overlay briefing-overlay';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'briefing-title');
  const alreadyCleared = save.isCleared(stage.id);
  const record = save.stageRecord(stage.id);
  root.innerHTML = `
    <div class="overlay-panel briefing-panel">
      <header class="briefing-head">
        <div>
          <span class="eyebrow">${esc(stage.chapterName)} / ${stage.code}</span>
          <h1 id="briefing-title">${esc(stage.name)}</h1>
        </div>
        <button type="button" class="icon-close" data-action="back" aria-label="Back to campaign">×</button>
      </header>
      <div class="briefing-columns">
        <div class="briefing-main">
          <div class="objective-banner">
            <span class="objective-kicker">MISSION OBJECTIVE</span>
            <strong>${esc(stage.objective.label)}</strong>
            <p>${esc(stage.objective.description)}</p>
            <div class="objective-banner-tags"><span>${objectiveTag(stage)}</span><span>${stage.shots} SHOT BUDGET</span><span>${stage.coreHp} CORE HP</span></div>
          </div>
          <div class="briefing-copy">
            <span class="micro-label">FIELD BRIEF</span>
            <p>${esc(stage.brief)}</p>
            <span class="micro-label">INTEL</span>
            <p>${esc(stage.intel)}</p>
          </div>
          <div class="suggested-rounds">
            <span class="micro-label">SUGGESTED ROUNDS</span>
            <div class="suggested-row">
              ${stage.suggestedAmmo
                .map((id) => {
                  const ammo = getAmmo(id);
                  return `<span class="suggested-round" title="${esc(ammo.description)}"><img src="${ammoIconUrl(ammo.id)}" alt="" /><span>${esc(ammo.name)}</span></span>`;
                })
                .join('')}
            </div>
          </div>
        </div>
        <aside class="briefing-side">
          <div class="brief-score">
            <span class="micro-label">YOUR RECORD</span>
            ${
              record
                ? `<div class="brief-stars">${starsHtml(record.stars)}<span>${record.bestShots ?? '—'} shots best</span></div>`
                : '<div class="brief-stars is-empty">No clear recorded</div>'
            }
          </div>
          <div class="brief-reward ${alreadyCleared ? 'is-claimed' : ''}">
            <span class="micro-label">FIRST-CLEAR EMBLEM</span>
            <strong>${esc(stage.firstClearReward)}</strong>
            <span>${alreadyCleared ? 'Already claimed' : 'Awarded once, on first success'}</span>
          </div>
          <div class="brief-stars-target">
            <span class="micro-label">STAR TARGETS</span>
            <div>${starsHtml(3, 3, 'is-target')}<span>${stage.starShots} shots</span></div>
            <div>${starsHtml(2, 3, 'is-target')}<span>${stage.starShots + 1} shots</span></div>
            <div>${starsHtml(1, 3, 'is-target')}<span>Any clear</span></div>
            <p>${starTargetText(stage)}</p>
          </div>
          <div class="brief-help-toggle">
            <button type="button" class="text-button" data-action="help" aria-expanded="false">FIELD MANUAL <span>?</span></button>
            <div class="briefing-help" hidden>
              <p><strong>AIM</strong> Drag the field. Use the arrow controls for one-degree changes.</p>
              <p><strong>POWER</strong> Slide the amber rail. ARC lobs; STRAIGHT is fast and flat.</p>
              <p><strong>ROUNDS</strong> Each round has a distinct job. The dotted path warns when cover blocks the core.</p>
              <p><strong>REPLAY</strong> Pause, finish, skip or change speed. None of them change the shot.</p>
            </div>
          </div>
        </aside>
      </div>
      <footer class="briefing-foot">
        <button type="button" class="secondary-button" data-action="back">CANCEL</button>
        <div class="briefing-foot-copy">
          <span>${alreadyCleared ? 'REPLAY BATTERY' : 'FIRST DEPLOYMENT'}</span>
          <strong>${stage.code} · ${stage.name}</strong>
        </div>
        <button type="button" class="primary-button launch-button" data-action="play">PLAY MISSION <span aria-hidden="true">→</span></button>
      </footer>
    </div>
  `;
  root.querySelector('[data-action="back"]')?.addEventListener('click', options.onBack);
  root.querySelectorAll<HTMLElement>('[data-action="back"]')[1]?.addEventListener('click', options.onBack);
  root.querySelector('[data-action="play"]')?.addEventListener('click', options.onPlay);
  const helpButton = root.querySelector<HTMLButtonElement>('[data-action="help"]');
  const help = root.querySelector<HTMLElement>('.briefing-help');
  helpButton?.addEventListener('click', () => {
    if (!help) return;
    help.hidden = !help.hidden;
    helpButton.setAttribute('aria-expanded', help.hidden ? 'false' : 'true');
  });
  return root;
}

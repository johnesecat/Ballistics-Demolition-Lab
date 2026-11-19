import { ALL_STAGES, CHAPTERS, getStage } from '../game/stages/campaign';
import type { SaveStore } from '../game/save';
import { objectiveTag, romanChapter, starsHtml } from './dom';

export interface MenuOptions {
  save: SaveStore;
  issueMessage: string | null;
  audioOn: boolean;
  onPlay: () => void;
  onCampaign: () => void;
  onArmory: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onToggleAudio: () => void;
}

export function renderMenu(options: MenuOptions): HTMLElement {
  const save = options.save;
  const cleared = ALL_STAGES.filter((stage) => save.isCleared(stage.id)).length;
  const totalStars = ALL_STAGES.reduce((sum, stage) => sum + (save.stageRecord(stage.id)?.stars ?? 0), 0);
  const nextId = save.firstIncompleteUnlockedStage();
  const next = getStage(nextId) ?? ALL_STAGES[0]!;
  const record = save.stageRecord(next.id);
  const chapter = CHAPTERS[next.chapterIndex] ?? CHAPTERS[0]!;
  const allCleared = cleared === ALL_STAGES.length;
  const root = document.createElement('section');
  root.className = 'screen menu-screen';
  root.innerHTML = `
    <div class="menu-vignette" aria-hidden="true"></div>
    <div class="menu-grid" aria-hidden="true"></div>
    <header class="menu-header">
      <div class="menu-brand">
        <span class="brand-glyph" aria-hidden="true"><span></span><span></span><span></span></span>
        <span class="brand-type">
          <strong>BREAKWATER</strong>
          <small>DEMOLITION RANGE</small>
        </span>
      </div>
      <div class="menu-header-actions">
        <button type="button" class="quiet-button" data-action="help">FIELD MANUAL</button>
        <button type="button" class="quiet-button sound-toggle" data-action="audio" aria-pressed="${options.audioOn}">
          <span class="sound-led ${options.audioOn ? 'is-on' : ''}" aria-hidden="true"></span>
          MUSIC ${options.audioOn ? 'ON' : 'OFF'}
        </button>
      </div>
    </header>

    <main class="menu-main">
      <div class="menu-copy">
        <p class="eyebrow">ORIGINAL ARTILLERY / DESTRUCTION PUZZLE</p>
        <h1>MAKE<br />AN <em>OPENING.</em></h1>
        <p class="menu-lede">
          Read the structure. Choose the right round. Put the core out of commission
          before the tide, the furnace, or the glass takes it back.
        </p>
        <div class="menu-actions">
          <button type="button" class="primary-button menu-play" data-action="play">
            <span>${allCleared ? 'REPLAY LAST BATTERY' : record ? 'CONTINUE CAMPAIGN' : 'BEGIN CAMPAIGN'}</span>
            <span class="button-arrow" aria-hidden="true">→</span>
          </button>
          <button type="button" class="secondary-button" data-action="campaign">STAGE SELECT</button>
          <button type="button" class="secondary-button" data-action="armory">ARMORY <span class="count">59</span></button>
          <button type="button" class="secondary-button" data-action="settings">SETTINGS</button>
        </div>
        <div class="menu-progress">
          <div class="progress-stat"><strong>${cleared}<span>/15</span></strong><small>BATTERIES CLEARED</small></div>
          <div class="progress-stat"><strong>${totalStars}<span>/45</span></strong><small>STARS EARNED</small></div>
          <div class="progress-stat"><strong>${String(save.data.firstClears.length).padStart(2, '0')}</strong><small>EMBLEMS HELD</small></div>
        </div>
        ${options.issueMessage ? `<p class="storage-note">${options.issueMessage}</p>` : ''}
      </div>

      <aside class="continue-card">
        <div class="continue-topline">
          <span>${allCleared ? 'ALL BATTERIES CLEARED' : 'NEXT DEPLOYMENT'}</span>
          <span class="continue-chapter">CH. ${romanChapter(next.chapterIndex)}</span>
        </div>
        <div class="continue-code">${next.code}</div>
        <h2>${next.name}</h2>
        <p class="continue-chapter-name">${chapter.name} · ${chapter.subtitle}</p>
        <div class="continue-rule"></div>
        <div class="continue-tags">
          <span>${objectiveTag(next)}</span>
          <span>${next.shots} SHOTS</span>
          <span>${next.coreHp} CORE</span>
        </div>
        <p class="continue-brief">${next.brief}</p>
        <div class="continue-bottom">
          <div>
            <span class="micro-label">BEST</span>
            ${record ? `<div class="continue-best">${starsHtml(record.stars)}<span>${record.bestShots ?? '—'} SHOTS</span></div>` : '<div class="continue-best is-empty">No record yet</div>'}
          </div>
          <div class="continue-star-target">${starsHtml(3, 3, 'is-target')}<span>3★ ≤ ${next.starShots}</span></div>
        </div>
        <button type="button" class="deploy-button" data-action="play">
          <span class="deploy-kicker">${allCleared ? 'RE-ENTER' : 'DEPLOY'}</span>
          <span>${next.code}</span>
          <span class="deploy-arrow" aria-hidden="true">↗</span>
        </button>
      </aside>
    </main>

    <footer class="menu-footer">
      <span>TOUCH · MOUSE · KEYBOARD</span>
      <span>NO ACCOUNT · NO NETWORK REQUIRED</span>
      <span>PROGRESS SAVED ON THIS DEVICE</span>
    </footer>
  `;
  root.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    switch (target.dataset.action) {
      case 'play':
        options.onPlay();
        break;
      case 'campaign':
        options.onCampaign();
        break;
      case 'armory':
        options.onArmory();
        break;
      case 'settings':
        options.onSettings();
        break;
      case 'help':
        options.onHelp();
        break;
      case 'audio':
        options.onToggleAudio();
        break;
    }
  });
  return root;
}

export function renderChapterBadge(index: number): string {
  const chapter = CHAPTERS[index];
  if (!chapter) return '';
  return `<span class="chapter-index">${romanChapter(index)}</span><span>${chapter.name}</span>`;
}

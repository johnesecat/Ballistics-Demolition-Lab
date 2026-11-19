import { ALL_STAGES, CHAPTERS, getStage } from '../game/stages/campaign';
import type { StageDefinition } from '../game/stages/types';
import type { SaveStore } from '../game/save';
import { esc, objectiveTag, romanChapter, starsHtml, starTargetText } from './dom';

export interface CampaignOptions {
  save: SaveStore;
  initialStageId: string;
  onBack: () => void;
  onBriefing: (stageId: string) => void;
}

interface CampaignState {
  chapterIndex: number;
  selectedId: string;
}

function previousStage(stage: StageDefinition): StageDefinition | null {
  const index = ALL_STAGES.findIndex((entry) => entry.id === stage.id);
  return index > 0 ? ALL_STAGES[index - 1] ?? null : null;
}

function blueprint(stage: StageDefinition): string {
  const blocks: Array<[number, number, number, number]> = [];
  const seed = stage.seed;
  if (stage.generator === 'tower') {
    blocks.push([20, 20, 58, 80], [78, 8, 48, 92], [126, 28, 56, 72]);
    for (let i = 0; i < 4; i += 1) blocks.push([82 + ((seed >> (i * 3)) % 25), 16 + i * 21, 18, 3]);
  } else if (stage.generator === 'bunker') {
    blocks.push([16, 48, 156, 52], [60, 32, 52, 16], [128, 38, 24, 12]);
  } else if (stage.generator === 'arch') {
    blocks.push([28, 22, 18, 78], [146, 22, 18, 78], [22, 14, 148, 12], [64, 45, 78, 8]);
  } else if (stage.generator === 'layered') {
    blocks.push([22, 24, 24, 76], [64, 34, 12, 66], [100, 18, 74, 82]);
    for (let i = 0; i < 3; i += 1) blocks.push([36 + i * 22, 96 - i * 8, 42, 3]);
  } else {
    blocks.push([20, 66, 50, 34], [78, 44, 52, 56], [136, 22, 42, 78], [22, 60, 46, 6]);
  }
  const coreLeft = stage.objective.kind === 'destroy-relay' ? 42 : 132;
  const coreTop = stage.generator === 'bunker' ? 64 : 46;
  return `
    <div class="blueprint blueprint-${stage.theme}" aria-label="Stage silhouette schematic">
      <span class="bp-grid"></span>
      <span class="bp-cannon"></span>
      <span class="bp-path"></span>
      ${blocks
        .map(([x, y, w, h]) => `<i style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></i>`)
        .join('')}
      <span class="bp-core ${stage.objective.kind === 'destroy-relay' ? 'is-relay' : ''}" style="left:${coreLeft}px;top:${coreTop}px"></span>
      <span class="bp-label">SILHOUETTE SCHEMATIC · SEED ${stage.seed}</span>
    </div>
  `;
}

function stageRow(save: SaveStore, stage: StageDefinition): string {
  const record = save.stageRecord(stage.id);
  const locked = !save.isStageUnlocked(stage.id);
  return `
    <button type="button" class="stage-row ${locked ? 'is-locked' : ''} ${record ? 'is-cleared' : ''}" data-stage="${stage.id}" ${
      locked ? 'aria-disabled="true"' : ''
    }>
      <span class="stage-number">${String(stage.stageIndex + 1).padStart(2, '0')}</span>
      <span class="stage-row-main">
        <span class="stage-row-top"><strong>${esc(stage.name)}</strong><span class="stage-code">${stage.code}</span></span>
        <span class="stage-row-sub">${objectiveTag(stage)} · ${stage.shots} SHOTS · ${stage.coreHp} CORE</span>
      </span>
      <span class="stage-row-stars">${locked ? '🔒' : record ? starsHtml(record.stars) : starsHtml(0)}</span>
    </button>
  `;
}

function detail(save: SaveStore, stage: StageDefinition, onBriefing: (stageId: string) => void): HTMLElement {
  const chapter = CHAPTERS[stage.chapterIndex]!;
  const record = save.stageRecord(stage.id);
  const unlocked = save.isStageUnlocked(stage.id);
  const prev = previousStage(stage);
  const el = document.createElement('article');
  el.className = `stage-detail theme-${stage.theme}`;
  el.innerHTML = `
    <div class="detail-code">${stage.code} <span>· ${chapter.name.toUpperCase()}</span></div>
    <h2>${esc(stage.name)}</h2>
    <p class="detail-tagline">${esc(chapter.subtitle)}</p>
    ${blueprint(stage)}
    <div class="detail-metrics">
      <div><span class="micro-label">OBJECTIVE</span><strong>${objectiveTag(stage)}</strong></div>
      <div><span class="micro-label">BUDGET</span><strong>${stage.shots} SHOTS</strong></div>
      <div><span class="micro-label">STAR TARGET</span><strong>≤ ${stage.starShots}</strong></div>
      <div><span class="micro-label">FIRST CLEAR</span><strong>${esc(stage.firstClearReward)}</strong></div>
    </div>
    <p class="detail-brief">${esc(stage.brief)}</p>
    <div class="detail-goal">
      <span class="micro-label">MISSION GOAL</span>
      <strong>${esc(stage.objective.label)}</strong>
      <p>${esc(stage.objective.description)}</p>
    </div>
    <div class="detail-footer">
      <div class="detail-best">
        <span class="micro-label">BEST RECORD</span>
        ${record ? `<div>${starsHtml(record.stars)}<span>${record.bestShots ?? '—'} shots</span></div>` : '<span class="muted">No clear yet</span>'}
      </div>
      <button type="button" class="primary-button" data-briefing="${stage.id}" ${
        unlocked ? '' : 'disabled aria-disabled="true"'
      }>
        ${unlocked ? 'OPEN BRIEFING' : `CLEAR ${prev ? prev.name.toUpperCase() : 'PREVIOUS STAGE'} FIRST`}
      </button>
    </div>
    <p class="detail-star-note">${starTargetText(stage)}</p>
  `;
  el.querySelector<HTMLButtonElement>('[data-briefing]')?.addEventListener('click', () => onBriefing(stage.id));
  return el;
}

export function renderCampaign(options: CampaignOptions): HTMLElement {
  const initial = getStage(options.initialStageId) ?? ALL_STAGES[0]!;
  const state: CampaignState = {
    chapterIndex: initial.chapterIndex,
    selectedId: initial.id,
  };
  const save = options.save;
  const cleared = ALL_STAGES.filter((stage) => save.isCleared(stage.id)).length;
  const totalStars = ALL_STAGES.reduce((sum, stage) => sum + (save.stageRecord(stage.id)?.stars ?? 0), 0);
  const root = document.createElement('section');
  root.className = 'screen campaign-screen';
  root.innerHTML = `
    <header class="subscreen-header">
      <button type="button" class="back-button" data-action="back"><span aria-hidden="true">←</span> MAIN MENU</button>
      <div class="subscreen-title"><span class="eyebrow">OPERATIONS BOARD</span><h1>CAMPAIGN</h1></div>
      <div class="header-progress"><strong>${cleared}/15</strong><span>CLEARED</span><strong>${totalStars}/45</strong><span>STARS</span></div>
    </header>
    <div class="chapter-tabs" role="tablist" aria-label="Chapters"></div>
    <div class="campaign-body">
      <div class="stage-column">
        <div class="stage-column-head"><span class="micro-label">BATTERY</span><span class="micro-label">STATUS</span></div>
        <div class="stage-list"></div>
      </div>
      <div class="detail-column"></div>
    </div>
  `;
  const tabs = root.querySelector<HTMLElement>('.chapter-tabs')!;
  const list = root.querySelector<HTMLElement>('.stage-list')!;
  const detailColumn = root.querySelector<HTMLElement>('.detail-column')!;
  const stageColumnHead = root.querySelector<HTMLElement>('.stage-column-head')!;

  const renderTabs = (): void => {
    tabs.innerHTML = CHAPTERS.map((chapter, index) => {
      const unlocked = save.isChapterUnlocked(index);
      const active = index === state.chapterIndex;
      const chapterStars = chapter.stages.reduce((sum, stage) => sum + (save.stageRecord(stage.id)?.stars ?? 0), 0);
      return `
        <button type="button" role="tab" aria-selected="${active}" class="chapter-tab ${active ? 'is-active' : ''} ${
          unlocked ? '' : 'is-locked'
        }" data-chapter="${index}" style="--chapter-accent:${chapter.accent}">
          <span class="chapter-tab-index">${romanChapter(index)}</span>
          <span class="chapter-tab-copy"><strong>${chapter.name}</strong><span>${chapterStars}/15 ★</span></span>
          ${unlocked ? '' : '<span class="chapter-lock" aria-label="Locked">🔒</span>'}
        </button>
      `;
    }).join('');
  };

  const render = (): void => {
    renderTabs();
    const chapter = CHAPTERS[state.chapterIndex]!;
    stageColumnHead.innerHTML = `<span class="micro-label">${chapter.name} · ${chapter.subtitle}</span><span class="micro-label">STATUS</span>`;
    if (!save.isChapterUnlocked(state.chapterIndex)) {
      list.innerHTML = `<div class="chapter-locked-card"><span class="lock-glyph">⌑</span><strong>CHAPTER LOCKED</strong><p>Clear every battery in the preceding chapters to open ${esc(chapter.name)}.</p></div>`;
      detailColumn.innerHTML = `<div class="detail-locked"><span class="lock-glyph">⌑</span><h2>${esc(chapter.name)}</h2><p>This citadel is not on the board yet. Complete the five batteries before it.</p></div>`;
      return;
    }
    list.innerHTML = chapter.stages.map((stage) => stageRow(save, stage)).join('');
    list.querySelectorAll<HTMLElement>('[data-stage]').forEach((row) => {
      row.addEventListener('click', () => {
        const id = row.dataset.stage;
        if (!id) return;
        const stage = getStage(id);
        if (!stage) return;
        state.selectedId = id;
        // A locked row stays selectable so its detail can explain the requirement;
        // the briefing action itself is disabled there.
        render();
      });
    });
    const selected = chapter.stages.find((stage) => stage.id === state.selectedId) ?? chapter.stages[0]!;
    state.selectedId = selected.id;
    detailColumn.innerHTML = '';
    detailColumn.append(detail(save, selected, options.onBriefing));
  };

  tabs.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-chapter]');
    if (!target) return;
    state.chapterIndex = Number(target.dataset.chapter);
    const chapter = CHAPTERS[state.chapterIndex]!;
    state.selectedId = chapter.stages.find((stage) => save.isStageUnlocked(stage.id))?.id ?? chapter.stages[0]!.id;
    render();
  });
  root.querySelector('[data-action="back"]')?.addEventListener('click', options.onBack);
  render();
  return root;
}

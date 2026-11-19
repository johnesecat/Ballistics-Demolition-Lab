import { AMMO, AMMO_BY_ID, CATEGORY_META, getAmmo } from '../game/ammo/catalogue';
import type { AmmoCategory, AmmoDef, AmmoPhase } from '../game/ammo/types';
import type { MaterialId } from '../game/materials';
import { MATERIAL_ORDER, MATERIALS } from '../game/materials';
import type { SaveStore } from '../game/save';
import { ammoIconUrl } from './asset-url';
import { categoryBadge, esc, materialBadge } from './dom';

type PrimaryCategory = 'all' | Exclude<AmmoCategory, 'soft'>;

export interface ArmoryOptions {
  save: SaveStore;
  onBack: () => void;
  onSetPreferred: (id: string) => void;
}

interface ArmoryState {
  category: PrimaryCategory;
  softOnly: boolean;
  material: MaterialId | null;
  selectedId: string;
  detailOpen: boolean;
}

const PRIMARY_CATEGORIES: Array<{ id: PrimaryCategory; label: string }> = [
  { id: 'all', label: 'ALL' },
  { id: 'solid', label: 'SOLID' },
  { id: 'heat', label: 'HEAT' },
  { id: 'hesh', label: 'HESH' },
  { id: 'he', label: 'HE' },
  { id: 'aphe', label: 'APHE' },
];

const PHASE_LABEL: Record<string, string> = {
  pierce: 'localized penetration',
  jet: 'copper jet',
  blast: 'radial blast',
  spall: 'rear-face spall',
  crush: 'crushing pad',
  fragment: 'fragment fan',
  shock: 'shock ring',
  drill: 'sequential drilling',
  burn: 'lingering burn',
  plug: 'material plug',
  tear: 'tearing strips',
  rain: 'downward streams',
};

function phaseSummary(ammo: AmmoDef): string {
  const phases = ammo.phases.length ? ammo.phases : [];
  const unique = [...new Set(phases.map((phase: AmmoPhase) => PHASE_LABEL[phase.kind] ?? phase.kind))];
  const base = unique.join(' → ');
  if (ammo.choice) return `${base}; ${ammo.choice.label.toLowerCase()} option changes the effect`;
  if (ammo.flight.ricochet) return `${base}; can ricochet from angles`;
  if (ammo.flight.separation === 'carrier') return `${base}; carrier sheds before impact`;
  if (ammo.flight.standoff) return `${base}; bursts just before contact`;
  return base;
}

function matches(ammo: AmmoDef, state: ArmoryState): boolean {
  if (state.softOnly) {
    if (ammo.category !== 'soft') return false;
  } else if (state.category !== 'all' && ammo.category !== state.category) {
    return false;
  }
  if (state.material && !ammo.goodVs.includes(state.material)) return false;
  return true;
}

function cardHtml(ammo: AmmoDef, selected: boolean, preferred: boolean): string {
  return `
    <button type="button" class="ammo-card ${selected ? 'is-selected' : ''}" data-ammo="${ammo.id}" aria-pressed="${selected}">
      <span class="ammo-card-top">
        ${categoryBadge(ammo)}
        ${preferred ? '<span class="preferred-mark" title="Field preferred">◆</span>' : ''}
      </span>
      <span class="ammo-card-art"><img src="${ammoIconUrl(ammo.id)}" alt="" loading="lazy" decoding="async" draggable="false" /></span>
      <span class="ammo-card-name">${esc(ammo.name)}</span>
      <span class="ammo-card-best">${esc(ammo.bestFor.split('.')[0] ?? ammo.bestFor)}</span>
    </button>
  `;
}

function statBar(label: string, value: number): string {
  const blocks = Array.from({ length: 5 }, (_, i) => `<i class="${i < value ? 'is-on' : ''}"></i>`).join('');
  return `<div class="stat-line"><span>${label}</span><span class="stat-pips">${blocks}</span><b>${value}/5</b></div>`;
}

function detailHtml(ammo: AmmoDef, save: SaveStore): string {
  const preferred = save.data.preferredAmmo === ammo.id;
  const meta = CATEGORY_META[ammo.category];
  return `
    <div class="detail-head">
      <div>
        <span class="eyebrow">ROUND DOSSIER</span>
        <h2>${esc(ammo.name)}</h2>
      </div>
      <button type="button" class="icon-close detail-close" data-action="close-detail" aria-label="Close round details">×</button>
    </div>
    <div class="round-hero" style="--cat-color:${meta.css}">
      <span class="round-hero-grid" aria-hidden="true"></span>
      <img src="${ammoIconUrl(ammo.id)}" alt="${esc(ammo.name)} illustration" draggable="false" />
      <div class="round-hero-meta">${categoryBadge(ammo)}<span>${esc(meta.label)} ROUND</span></div>
    </div>
    <div class="round-copy">
      <p class="round-description">${esc(ammo.description)}</p>
      <div class="round-best"><span class="micro-label">BEST USED FOR</span><p>${esc(ammo.bestFor)}</p></div>
      ${ammo.watchFor ? `<div class="round-watch"><span class="micro-label">WATCH FOR</span><p>${esc(ammo.watchFor)}</p></div>` : ''}
    </div>
    <div class="round-goodvs">
      <span class="micro-label">GOOD VS</span>
      <div>${ammo.goodVs.map((material) => materialBadge(material)).join('')}</div>
    </div>
    <div class="round-behavior">
      <div class="behavior-head"><span class="micro-label">FIELD BEHAVIOR</span><span class="inferred-tag">INFERRED / TUNED</span></div>
      <p>${esc(phaseSummary(ammo))}.</p>
      ${ammo.choice ? `<p class="behavior-choice">Option: ${ammo.choice.options.map((option) => `${esc(option.label)} — ${esc(option.hint)}`).join(' · ')}</p>` : ''}
    </div>
    <div class="round-stats">
      <div class="behavior-head"><span class="micro-label">GAMEPLAY PROFILE</span><span class="inferred-tag">NOT CARD TEXT</span></div>
      ${statBar('IMPACT', ammo.ratings.impact)}
      ${statBar('BLAST', ammo.ratings.blast)}
      ${statBar('PIERCE', ammo.ratings.pierce)}
      ${statBar('CONTROL', ammo.ratings.control)}
    </div>
    <div class="round-preferred">
      <button type="button" class="primary-button ${preferred ? 'is-preferred' : ''}" data-action="preferred" data-ammo="${ammo.id}">
        ${preferred ? '◆ FIELD PREFERRED' : 'SET AS FIELD PREFERRED'}
      </button>
      <p>All 59 rounds are field-issued from the start. Preferred rounds are pre-loaded when a battery begins.</p>
    </div>
    <p class="card-source-note">Card names and copy are transcribed from the supplied reference. Icons are original interpretations; mechanics, timings and stats are original tuning.</p>
  `;
}

export function renderArmory(options: ArmoryOptions): HTMLElement {
  const preferred = AMMO_BY_ID.get(options.save.data.preferredAmmo) ?? AMMO[0]!;
  const state: ArmoryState = {
    category: 'all',
    softOnly: false,
    material: null,
    selectedId: preferred.id,
    detailOpen: false,
  };
  const root = document.createElement('section');
  root.className = 'screen armory-screen';
  root.innerHTML = `
    <header class="subscreen-header armory-header">
      <button type="button" class="back-button" data-action="back"><span aria-hidden="true">←</span> MAIN MENU</button>
      <div class="subscreen-title"><span class="eyebrow">FIELD ISSUE / 59 ROUNDS</span><h1>ARMORY</h1></div>
      <div class="armory-header-note"><span>ORIGINAL ICONS</span><span>INFERRED MECHANICS</span></div>
    </header>
    <div class="armory-toolbar">
      <div class="category-tabs" role="tablist" aria-label="Ammunition category"></div>
      <button type="button" class="soft-filter" data-action="soft" aria-pressed="false"><span class="soft-dot"></span> SOFT SUBCATEGORY</button>
      <div class="material-filters" aria-label="Good versus material filters"></div>
    </div>
    <div class="armory-layout">
      <div class="armory-list-column">
        <div class="armory-list-head"><span data-count>59 ROUNDS</span><span class="micro-label">TAP A ROUND FOR DETAIL</span></div>
        <div class="armory-grid"></div>
        <div class="empty-filter" hidden>
          <strong>NO ROUNDS MATCH</strong>
          <p>This combination has no field-issued round. Clear the material filter or choose another category.</p>
          <button type="button" class="secondary-button" data-action="clear-filters">CLEAR FILTERS</button>
        </div>
      </div>
      <aside class="armory-detail" data-detail></aside>
    </div>
  `;

  const tabs = root.querySelector<HTMLElement>('.category-tabs')!;
  const materials = root.querySelector<HTMLElement>('.material-filters')!;
  const grid = root.querySelector<HTMLElement>('.armory-grid')!;
  const detail = root.querySelector<HTMLElement>('[data-detail]')!;
  const count = root.querySelector<HTMLElement>('[data-count]')!;
  const empty = root.querySelector<HTMLElement>('.empty-filter')!;
  const softButton = root.querySelector<HTMLElement>('[data-action="soft"]')!;

  const renderTabs = (): void => {
    tabs.innerHTML = PRIMARY_CATEGORIES.map(
      (entry) =>
        `<button type="button" role="tab" data-category="${entry.id}" aria-selected="${state.category === entry.id && !state.softOnly}" class="${
          state.category === entry.id && !state.softOnly ? 'is-active' : ''
        }">${entry.label}</button>`,
    ).join('');
  };

  const renderMaterials = (): void => {
    materials.innerHTML =
      `<span class="filter-label">GOOD VS</span>` +
      MATERIAL_ORDER.map((material) => {
        const active = state.material === material;
        return `<button type="button" data-material="${material}" aria-pressed="${active}" class="material-filter mat-${material} ${
          active ? 'is-active' : ''
        }">${esc(MATERIALS[material].shortLabel)}</button>`;
      }).join('');
  };

  const selected = (): AmmoDef => getAmmo(state.selectedId);

  const renderDetail = (): void => {
    detail.classList.toggle('is-open', state.detailOpen);
    detail.innerHTML = detailHtml(selected(), options.save);
  };

  const renderGrid = (): void => {
    const filtered = AMMO.filter((ammo) => matches(ammo, state));
    count.textContent = `${filtered.length} ROUND${filtered.length === 1 ? '' : 'S'}`;
    if (!filtered.some((ammo) => ammo.id === state.selectedId)) {
      state.selectedId = filtered[0]?.id ?? AMMO[0]!.id;
    }
    grid.innerHTML = filtered
      .map((ammo) => cardHtml(ammo, ammo.id === state.selectedId, options.save.data.preferredAmmo === ammo.id))
      .join('');
    empty.hidden = filtered.length > 0;
    softButton.classList.toggle('is-active', state.softOnly);
    softButton.setAttribute('aria-pressed', state.softOnly ? 'true' : 'false');
    softButton.querySelector('.soft-dot')?.classList.toggle('is-on', state.softOnly);
    renderDetail();
  };

  const rerender = (): void => {
    renderTabs();
    renderMaterials();
    renderGrid();
  };

  tabs.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-category]');
    if (!target) return;
    state.category = target.dataset.category as PrimaryCategory;
    state.softOnly = false;
    renderTabs();
    renderGrid();
  });
  materials.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-material]');
    if (!target) return;
    const material = target.dataset.material as MaterialId;
    state.material = state.material === material ? null : material;
    renderMaterials();
    renderGrid();
  });
  softButton.addEventListener('click', () => {
    state.softOnly = !state.softOnly;
    if (state.softOnly) state.category = 'all';
    renderTabs();
    renderGrid();
  });
  grid.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-ammo]');
    if (!target) return;
    state.selectedId = target.dataset.ammo ?? AMMO[0]!.id;
    state.detailOpen = true;
    renderGrid();
  });
  detail.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    if (target.dataset.action === 'close-detail') {
      state.detailOpen = false;
      detail.classList.remove('is-open');
      return;
    }
    if (target.dataset.action === 'preferred') {
      const id = target.dataset.ammo;
      if (id) {
        options.onSetPreferred(id);
        renderGrid();
      }
    }
  });
  root.querySelector('[data-action="back"]')?.addEventListener('click', options.onBack);
  root.querySelector('[data-action="clear-filters"]')?.addEventListener('click', () => {
    state.category = 'all';
    state.softOnly = false;
    state.material = null;
    rerender();
  });
  rerender();
  return root;
}


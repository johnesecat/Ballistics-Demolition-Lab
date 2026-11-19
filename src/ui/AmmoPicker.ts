import { AMMO, AMMO_BY_ID, CATEGORY_META, getAmmo } from '../game/ammo/catalogue';
import type { AmmoCategory } from '../game/ammo/types';
import { ammoIconUrl } from './asset-url';
import { esc } from './dom';

type PickerCategory = 'all' | AmmoCategory;

const PICKER_TABS: Array<{ id: PickerCategory; label: string }> = [
  { id: 'all', label: 'ALL' },
  { id: 'solid', label: 'SOLID' },
  { id: 'soft', label: 'SOFT' },
  { id: 'heat', label: 'HEAT' },
  { id: 'hesh', label: 'HESH' },
  { id: 'he', label: 'HE' },
  { id: 'aphe', label: 'APHE' },
];

export interface AmmoPickerOptions {
  currentId: string;
  onClose: () => void;
  onLoad: (id: string) => void;
}

export function renderAmmoPicker(options: AmmoPickerOptions): HTMLElement {
  let category: PickerCategory = 'all';
  let selectedId = AMMO_BY_ID.has(options.currentId) ? options.currentId : AMMO[0]!.id;
  const root = document.createElement('div');
  root.className = 'overlay ammo-picker-overlay';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Choose ammunition');
  root.innerHTML = `
    <div class="ammo-sheet">
      <header class="ammo-sheet-head">
        <div><span class="eyebrow">FIELD ISSUE / ALL 59 AVAILABLE</span><h2>SELECT ROUND</h2></div>
        <button type="button" class="icon-close" data-action="close" aria-label="Close ammunition picker">×</button>
      </header>
      <div class="category-tabs picker-tabs" role="tablist" aria-label="Ammunition category"></div>
      <div class="picker-grid" role="list"></div>
      <div class="picker-footer">
        <div class="picker-selected">
          <img data-picker-icon src="${ammoIconUrl(selectedId)}" alt="" />
          <div>
            <span class="micro-label" data-picker-cat>${CATEGORY_META[getAmmo(selectedId).category].badge} ROUND</span>
            <strong data-picker-name>${esc(getAmmo(selectedId).name)}</strong>
            <p data-picker-desc>${esc(getAmmo(selectedId).description)}</p>
          </div>
        </div>
        <div class="picker-footer-actions">
          <span class="picker-count"></span>
          <button type="button" class="secondary-button" data-action="close">CANCEL</button>
          <button type="button" class="primary-button" data-action="load">LOAD ROUND <span aria-hidden="true">→</span></button>
        </div>
      </div>
    </div>
  `;
  const tabs = root.querySelector<HTMLElement>('.picker-tabs')!;
  const grid = root.querySelector<HTMLElement>('.picker-grid')!;
  const count = root.querySelector<HTMLElement>('.picker-count')!;

  const renderTabs = (): void => {
    tabs.innerHTML = PICKER_TABS.map(
      (tab) =>
        `<button type="button" role="tab" data-cat="${tab.id}" aria-selected="${category === tab.id}" class="${
          category === tab.id ? 'is-active' : ''
        }">${tab.label}</button>`,
    ).join('');
  };

  const renderSelected = (): void => {
    const ammo = getAmmo(selectedId);
    root.querySelector<HTMLImageElement>('[data-picker-icon]')!.src = ammoIconUrl(ammo.id);
    root.querySelector('[data-picker-cat]')!.textContent = `${CATEGORY_META[ammo.category].badge} ROUND`;
    root.querySelector('[data-picker-name]')!.textContent = ammo.name;
    root.querySelector('[data-picker-desc]')!.textContent = ammo.description;
  };

  const renderGrid = (): void => {
    const list = category === 'all' ? AMMO : AMMO.filter((ammo) => ammo.category === category);
    count.textContent = `${list.length} ROUND${list.length === 1 ? '' : 'S'}`;
    if (!list.some((ammo) => ammo.id === selectedId) && list[0]) selectedId = list[0].id;
    grid.innerHTML = list
      .map(
        (ammo) => `
        <button type="button" class="picker-card ${ammo.id === selectedId ? 'is-selected' : ''}" data-ammo="${ammo.id}" role="listitem" aria-pressed="${
          ammo.id === selectedId
        }">
          <span class="picker-card-art"><img src="${ammoIconUrl(ammo.id)}" alt="" loading="lazy" decoding="async" draggable="false" /></span>
          <span class="picker-card-name">${esc(ammo.name)}</span>
          <span class="cat-dot" style="--cat-color:${CATEGORY_META[ammo.category].css}"></span>
        </button>
      `,
      )
      .join('');
    renderSelected();
    const selectedCard = grid.querySelector<HTMLElement>('.is-selected');
    selectedCard?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  tabs.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-cat]');
    if (!target) return;
    category = target.dataset.cat as PickerCategory;
    renderTabs();
    renderGrid();
  });
  grid.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-ammo]');
    if (!target) return;
    selectedId = target.dataset.ammo ?? selectedId;
    grid.querySelectorAll('.picker-card').forEach((card) => {
      card.classList.toggle('is-selected', card === target);
      card.setAttribute('aria-pressed', card === target ? 'true' : 'false');
    });
    renderSelected();
  });
  root.querySelectorAll('[data-action="close"]').forEach((button) => button.addEventListener('click', options.onClose));
  root.querySelector('[data-action="load"]')?.addEventListener('click', () => options.onLoad(selectedId));
  root.addEventListener('click', (event) => {
    if (event.target === root) options.onClose();
  });
  renderTabs();
  renderGrid();
  return root;
}

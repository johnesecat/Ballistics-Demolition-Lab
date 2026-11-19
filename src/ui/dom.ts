import type { AmmoDef } from '../game/ammo/types';
import { CATEGORY_META } from '../game/ammo/catalogue';
import type { MaterialId } from '../game/materials';
import { MATERIALS } from '../game/materials';
import type { StageDefinition } from '../game/stages/types';
import type { SaveStore } from '../game/save';
import { ammoIconUrl } from './asset-url';

export function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function starsHtml(count: number, max = 3, extraClass = ''): string {
  const filled = Math.max(0, Math.min(max, Math.round(count)));
  let out = `<span class="stars ${extraClass}" aria-label="${filled} of ${max} stars">`;
  for (let i = 0; i < max; i += 1) {
    out += `<span class="star ${i < filled ? 'is-on' : 'is-off'}" aria-hidden="true">${i < filled ? '★' : '☆'}</span>`;
  }
  out += '</span>';
  return out;
}

export function starRow(count: number, label = ''): string {
  return `<span class="star-row">${starsHtml(count)}${label ? `<span class="star-label">${esc(label)}</span>` : ''}</span>`;
}

export function categoryBadge(ammo: AmmoDef): string {
  const meta = CATEGORY_META[ammo.category];
  return `<span class="cat-badge cat-${ammo.category}" style="--cat-color:${meta.css}">${esc(meta.badge)}</span>`;
}

export function materialBadge(material: MaterialId): string {
  return `<span class="mat-badge mat-${material}">${esc(MATERIALS[material].shortLabel)}</span>`;
}

export function ammoIcon(ammo: AmmoDef, className = 'ammo-icon'): string {
  return `<img class="${className}" src="${ammoIconUrl(ammo.id)}" alt="" width="384" height="160" decoding="async" draggable="false" />`;
}

export function stageStatus(save: SaveStore, stage: StageDefinition): 'locked' | 'open' | 'cleared' {
  if (save.isCleared(stage.id)) return 'cleared';
  if (save.isStageUnlocked(stage.id)) return 'open';
  return 'locked';
}

export function starTargetText(stage: StageDefinition): string {
  return `3★ in ${stage.starShots} shots · 2★ in ${stage.starShots + 1} shot${stage.starShots + 1 === 1 ? '' : 's'}`;
}

export function objectiveTag(stage: StageDefinition): string {
  switch (stage.objective.kind) {
    case 'destroy-core':
      return 'DESTROY CORE';
    case 'expose-core':
      return 'EXPOSE CORE';
    case 'destroy-relay':
      return 'BREAK RELAY';
  }
}

export function cleanNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function romanChapter(index: number): string {
  return ['I', 'II', 'III', 'IV', 'V', 'VI'][index] ?? String(index + 1);
}

export function scrollToTop(root: HTMLElement): void {
  root.scrollTop = 0;
}

export function setButtonBusy(button: HTMLButtonElement, busy: boolean, label?: string): void {
  button.disabled = busy;
  if (label) {
    if (!button.dataset.label) button.dataset.label = button.textContent ?? '';
    button.textContent = busy ? label : button.dataset.label;
  }
}

export function focusFirst(root: HTMLElement, selector = 'button, [href], input, [tabindex]:not([tabindex="-1"])'): void {
  const target = root.querySelector<HTMLElement>(selector);
  target?.focus({ preventScroll: true });
}

export function cycleValue<T extends string>(values: readonly T[], current: T, dir = 1): T {
  const index = Math.max(0, values.indexOf(current));
  return values[(index + dir + values.length) % values.length] as T;
}

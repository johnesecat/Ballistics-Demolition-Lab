import type { Settings } from '../game/save';
import { DEFAULT_SETTINGS } from '../game/save';
import { esc } from './dom';

export interface SettingsOptions {
  settings: Settings;
  onBack: () => void;
  onChange: (settings: Settings) => void;
  onReset: () => void;
  onTestSound: () => void;
  storageMessage: string | null;
}

function pct(value: number): number {
  return Math.round(value * 100);
}

export function renderSettings(options: SettingsOptions): HTMLElement {
  let settings: Settings = { ...options.settings };
  const root = document.createElement('section');
  root.className = 'screen settings-screen';
  root.innerHTML = `
    <header class="subscreen-header">
      <button type="button" class="back-button" data-action="back"><span aria-hidden="true">←</span> BACK</button>
      <div class="subscreen-title"><span class="eyebrow">SYSTEM / LOCAL</span><h1>SETTINGS</h1></div>
      <div class="settings-stamp"><span>SAVE v1</span><span>THIS DEVICE</span></div>
    </header>
    <div class="settings-layout">
      <div class="settings-column">
        <section class="settings-group">
          <div class="settings-group-head"><span class="micro-label">AUDIO</span><span>Original synthesized sound</span></div>
          <label class="range-setting">
            <span class="range-copy"><strong>Music</strong><small>Low, deliberate ambience</small></span>
            <div class="range-control"><input type="range" min="0" max="100" value="${pct(settings.musicVolume)}" data-setting="musicVolume" /><output data-out="musicVolume">${pct(settings.musicVolume)}%</output></div>
          </label>
          <label class="range-setting">
            <span class="range-copy"><strong>Effects</strong><small>Cannon, impacts, structure, UI</small></span>
            <div class="range-control"><input type="range" min="0" max="100" value="${pct(settings.effectsVolume)}" data-setting="effectsVolume" /><output data-out="effectsVolume">${pct(settings.effectsVolume)}%</output></div>
          </label>
          <div class="setting-action-row"><button type="button" class="text-button" data-action="test-sound">TEST EFFECTS <span>▶</span></button><span class="setting-note">Audio starts after your first touch.</span></div>
        </section>

        <section class="settings-group">
          <div class="settings-group-head"><span class="micro-label">FIELD RENDERING</span><span>Performance and comfort</span></div>
          <button type="button" class="toggle-setting" data-toggle="cameraShake" aria-pressed="${settings.cameraShake}">
            <span><strong>Camera shake</strong><small>Impact and collapse emphasis</small></span><span class="switch"><i></i></span>
          </button>
          <button type="button" class="toggle-setting" data-toggle="reducedEffects" aria-pressed="${settings.reducedEffects}">
            <span><strong>Reduced effects</strong><small>Fewer particles and debris bodies for older devices</small></span><span class="switch"><i></i></span>
          </button>
          <div class="setting-block">
            <span class="range-copy"><strong>Aim sensitivity</strong><small>How much a touch drag moves the barrel</small></span>
            <div class="range-control"><input type="range" min="45" max="180" value="${Math.round(settings.aimSensitivity * 100)}" data-setting="aimSensitivity" /><output data-out="aimSensitivity">${Math.round(settings.aimSensitivity * 100)}%</output></div>
          </div>
        </section>
      </div>

      <div class="settings-column">
        <section class="settings-group">
          <div class="settings-group-head"><span class="micro-label">AIM ASSIST</span><span>Information shown before firing</span></div>
          <div class="trajectory-setting">
            <span class="range-copy"><strong>Trajectory guide</strong><small>Dotted prediction path and first-contact marker</small></span>
            <div class="segmented-setting" role="group" aria-label="Trajectory visibility">
              <button type="button" data-trajectory="full" class="${settings.trajectory === 'full' ? 'is-active' : ''}">FULL</button>
              <button type="button" data-trajectory="hidden" class="${settings.trajectory === 'hidden' ? 'is-active' : ''}">HIDDEN</button>
            </div>
          </div>
          <p class="setting-help">The cover warning still appears when the guide is hidden. Hiding the guide is a self-imposed challenge, not a difficulty setting.</p>
        </section>

        <section class="settings-group">
          <div class="settings-group-head"><span class="micro-label">DATA</span><span>Campaign and preferences</span></div>
          <p class="setting-help">Progress, stars, first-clear emblems and settings are saved to this browser. Corrupt or newer saves are backed up under a separate key before safe defaults are loaded.</p>
          ${options.storageMessage ? `<p class="storage-note">${esc(options.storageMessage)}</p>` : '<p class="storage-note is-good">LOCAL STORAGE OK</p>'}
          <button type="button" class="text-button danger-text" data-action="reset-settings">RESET SETTINGS TO DEFAULT</button>
          <p class="setting-help">This resets sound, shake, effects, guide and sensitivity. It does not erase campaign progress, stars or records.</p>
        </section>

        <aside class="settings-about">
          <span class="micro-label">BREAKWATER / FIELD BUILD</span>
          <p>Built with TypeScript, Phaser 3 and a deterministic destruction lattice. Matter.js handles debris only. No account, no backend, no network dependency.</p>
          <p class="tiny">Original game code, campaign, art, audio and tuning. Ammunition names and card copy are transcribed from the supplied reference. See the README and developer docs for observed versus inferred details.</p>
        </aside>
      </div>
    </div>
  `;

  const update = (key: keyof Settings, value: Settings[keyof Settings]): void => {
    settings = { ...settings, [key]: value } as Settings;
    options.onChange(settings);
  };

  root.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((input) => {
    input.addEventListener('input', () => {
      const key = input.dataset.setting as 'musicVolume' | 'effectsVolume' | 'aimSensitivity';
      const raw = Number(input.value);
      let value = raw / 100;
      if (key === 'aimSensitivity') value = raw / 100;
      settings = { ...settings, [key]: value };
      const out = root.querySelector<HTMLOutputElement>(`[data-out="${key}"]`);
      if (out) out.textContent = `${raw}%`;
      options.onChange(settings);
    });
  });

  root.querySelectorAll<HTMLElement>('[data-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.toggle as 'cameraShake' | 'reducedEffects';
      const value = !settings[key];
      settings = { ...settings, [key]: value };
      button.setAttribute('aria-pressed', value ? 'true' : 'false');
      button.classList.toggle('is-on', value);
      update(key, value);
    });
  });
  root.querySelectorAll<HTMLElement>('[data-trajectory]').forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.trajectory === 'hidden' ? 'hidden' : 'full';
      settings = { ...settings, trajectory: value };
      root.querySelectorAll('[data-trajectory]').forEach((entry) => entry.classList.remove('is-active'));
      button.classList.add('is-active');
      update('trajectory', value);
    });
  });
  root.querySelector('[data-action="test-sound"]')?.addEventListener('click', options.onTestSound);
  root.querySelector('[data-action="reset-settings"]')?.addEventListener('click', () => {
    settings = { ...DEFAULT_SETTINGS };
    options.onReset();
    // Reflect the reset without rebuilding the screen.
    root.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((input) => {
      const key = input.dataset.setting as 'musicVolume' | 'effectsVolume' | 'aimSensitivity';
      const value = key === 'aimSensitivity' ? settings.aimSensitivity * 100 : settings[key] * 100;
      input.value = String(Math.round(value));
      const out = root.querySelector<HTMLOutputElement>(`[data-out="${key}"]`);
      if (out) out.textContent = `${Math.round(value)}%`;
    });
    root.querySelectorAll<HTMLElement>('[data-toggle]').forEach((button) => {
      const key = button.dataset.toggle as 'cameraShake' | 'reducedEffects';
      button.setAttribute('aria-pressed', settings[key] ? 'true' : 'false');
      button.classList.toggle('is-on', settings[key]);
    });
    root.querySelectorAll<HTMLElement>('[data-trajectory]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.trajectory === settings.trajectory);
    });
  });
  root.querySelector('[data-action="back"]')?.addEventListener('click', options.onBack);

  root.querySelectorAll<HTMLElement>('[data-toggle]').forEach((button) => {
    const key = button.dataset.toggle as 'cameraShake' | 'reducedEffects';
    button.classList.toggle('is-on', settings[key]);
  });
  return root;
}

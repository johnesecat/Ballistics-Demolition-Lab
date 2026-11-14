import { Game } from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { CampaignScene } from './scenes/CampaignScene';
import { ArmoryScene } from './scenes/ArmoryScene';
import { SettingsScene } from './scenes/SettingsScene';
import { BriefingScene } from './scenes/BriefingScene';
import { GameScene } from './scenes/GameScene';
import { ResultsScene } from './scenes/ResultsScene';
import { PauseMenuScene } from './scenes/PauseMenuScene';
import { GAME_CONFIG } from './config/gameConfig';

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  showErrorOverlay(event.error?.message || 'Unknown error');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection:', event.reason);
  showErrorOverlay(event.reason?.message || 'Promise rejection');
});

function showErrorOverlay(message: string) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: #0a0f1a; color: #ff4444; z-index: 10000;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 20px; font-family: monospace; font-size: 14px; text-align: center;
  `;
  overlay.innerHTML = `
    <h2 style="color: #ff8c00; margin-bottom: 10px;">Game Error</h2>
    <pre style="white-space: pre-wrap; max-width: 90%;">${message}</pre>
    <button onclick="location.reload()" style="
      margin-top: 20px; padding: 10px 20px; background: #ff8c00; color: #0a0f1a;
      border: none; border-radius: 4px; font-weight: bold; cursor: pointer;
    ">Reload Game</button>
  `;
  document.body.appendChild(overlay);
}

// Try WebGL first, fall back to Canvas
let renderType = Phaser.WEBGL;
try {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) renderType = Phaser.CANVAS;
} catch {
  renderType = Phaser.CANVAS;
}

const config: Phaser.Types.Core.GameConfig = {
  type: renderType,
  parent: 'game-container',
  width: '100%',
  height: '100%',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    min: { width: 320, height: 180 },
    max: { width: 2560, height: 1440 },
  },
  physics: {
    default: 'matter',
    matter: {
      debug: false,
      gravity: { x: 0, y: 0 },
      enableSleeping: true,
      positionIterations: 12,
      velocityIterations: 12,
      constraintIterations: 12,
    },
  },
  render: {
    antialias: false,
    pixelArt: true,
    roundPixels: true,
  },
  scene: [
    BootScene,
    MainMenuScene,
    CampaignScene,
    ArmoryScene,
    SettingsScene,
    BriefingScene,
    GameScene,
    ResultsScene,
    PauseMenuScene,
  ],
  backgroundColor: '#0a0f1a',
  fps: { target: 60, forceSetTimeOut: true },
  audio: { disableWebAudio: false },
  dom: { createContainer: true },
  callbacks: {
    postBoot: (game: Phaser.Game) => {
      console.log('Game booted successfully, renderer:', game.renderer.type);
      const prompt = document.querySelector('.rotate-prompt');
      if (prompt && window.innerWidth > window.innerHeight) {
        (prompt as HTMLElement).style.display = 'none';
      }
    }
  }
};

let game: Phaser.Game;

try {
  game = new Game(config);
  (window as any).game = game;
} catch (e) {
  console.error('Failed to create game:', e);
  showErrorOverlay(e instanceof Error ? e.message : String(e));
}

export { game };
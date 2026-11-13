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

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: 'game-container',
  width: '100%',
  height: '100%',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    min: {
      width: 320,
      height: 180,
    },
    max: {
      width: 2560,
      height: 1440,
    },
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
  fps: {
    target: 60,
    forceSetTimeOut: true,
  },
  audio: {
    disableWebAudio: false,
  },
  dom: {
    createContainer: true,
  },
};

const game = new Game(config);

(window as any).game = game;

export { game };
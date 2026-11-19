import Phaser from 'phaser';
import { BattleScene } from './BattleScene';

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#071018',
    transparent: false,
    banner: false,
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    disableContextMenu: true,
    audio: { noAudio: true },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    input: {
      activePointers: 3,
    },
    render: {
      antialias: false,
      pixelArt: true,
      roundPixels: true,
      powerPreference: 'high-performance',
    },
    fps: {
      target: 60,
      smoothStep: true,
    },
    physics: {
      default: 'matter',
      matter: {
        gravity: { x: 0, y: 1.05 },
        enableSleeping: true,
        debug: false,
        positionIterations: 4,
        velocityIterations: 3,
        constraintIterations: 2,
      },
    },
    scene: [BattleScene],
  });
}

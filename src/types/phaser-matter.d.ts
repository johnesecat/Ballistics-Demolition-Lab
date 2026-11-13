// Phaser 3 / Matter.js type shims for Artillery Command

import 'phaser';
import Matter from 'matter-js';

// Extend Matter.js Body interface
declare module 'matter-js' {
  interface Body {
    gameObject?: any;
    isProjectile?: boolean;
    isFragment?: boolean;
    isPod?: boolean;
    isSensor?: boolean;
    isStatic?: boolean;
    isSleeping?: boolean;
    label?: string;
    collisionFilter?: { group: number };
    sleepThreshold?: number;
    deltaTime?: number;
    positionImpulse?: Matter.Vector;
    previousPositionImpulse?: Matter.Vector;
    constraintImpulse?: Matter.Vector;
  }

  interface Engine {
    world: {
      bodies: Body[];
      constraints: Constraint[];
    };
  }

  interface Query {
    ray(bodies: Body[], start: Vector, end: Vector, rayWidth: number): Collision[];
    region(bodies: Body[], bounds: Bounds, outside?: boolean): Body[];
    point(bodies: Body[], point: Vector): Body[];
  }

  interface Collision {
    body: Body;
    bodyA: Body;
    bodyB: Body;
    normal: Vector;
    depth: number;
    supports: Vector[];
    point?: Vector;
  }

  interface Pair {
    bodyA: Body;
    bodyB: Body;
    normal: Vector;
    depth: number;
    supports: Vector[];
  }

  interface IEventCollision<T> {
    pairs: Pair[];
  }

  namespace Body {
    function getVelocity(body: Body): Vector;
    function setVelocity(body: Body, velocity: Vector): void;
    function setPosition(body: Body, position: Vector): void;
    function setAngle(body: Body, angle: number): void;
    function setAngularVelocity(body: Body, velocity: number): void;
    function applyForce(body: Body, position: Vector, force: Vector): void;
    function getCentre(body: Body): Vector;
    function setCentre(body: Body, centre: Vector): void;
  }
}

// Extend Phaser types
declare module 'phaser' {
  namespace Physics {
    namespace Matter {
      interface MatterPhysics {
        world: Matter.Engine & {
          bodies: Matter.Body[];
          constraints: Matter.Constraint[];
        };
        add: {
          body(x: number, y: number, type: string, options: Matter.IBodyDefinition, config?: Matter.IBodyDefinition): Matter.Body;
          rectangle(x: number, y: number, width: number, height: number, options?: Matter.IBodyDefinition): Matter.Body;
          circle(x: number, y: number, radius: number, options?: Matter.IBodyDefinition): Matter.Body;
          constraint(bodyA: Matter.Body, bodyB: Matter.Body, length?: number, stiffness?: number, options?: Matter.IConstraintDefinition): Matter.Constraint;
        };
        query: {
          ray(bodies: Matter.Body[], start: Matter.Vector, end: Matter.Vector, rayWidth: number): Matter.Query.Result[];
          region(bodies: Matter.Body[], bounds: Matter.Bounds, outside?: boolean): Matter.Body[];
          point(bodies: Matter.Body[], point: Matter.Vector): Matter.Body[];
        };
      }
    }
  }

  interface Scene {
    matter: Physics.Matter.MatterPhysics;
  }

  interface GameObjects {
    Graphics: {
      new (scene: Scene, options?: { x?: number; y?: number; add?: boolean }): Graphics;
    };
  }

  interface Graphics {
    translate(x: number, y: number): this;
    rotate(angle: number): this;
    save(): this;
    restore(): this;
  }

  interface Sound {
    setVolume(volume: number): this;
  }

  interface BaseSound {
    volume: number;
    setVolume(volume: number): this;
  }

  interface SoundConfig {
    buffer?: AudioBuffer;
    loop?: boolean;
    volume?: number;
  }

  interface WebAudioSoundManager {
    context: AudioContext;
    resumeAll(): void;
    pauseAll(): void;
  }

  interface HTML5AudioSoundManager {
    context: AudioContext;
    resumeAll(): void;
    pauseAll(): void;
  }

  interface NoAudioSoundManager {
    context: AudioContext;
    resumeAll(): void;
    pauseAll(): void;
  }

  interface SoundManager {
    context: AudioContext;
    resumeAll(): void;
    pauseAll(): void;
  }

  interface Scene {
    sound: SoundManager;
  }

  interface ParticleEmitter {
    setSpeed(min: number, max: number): this;
    setAngle(min: number, max: number): this;
    setScale(start: number, end: number): this;
    explode(count: number, x: number, y: number): this;
  }

  namespace GameObjects {
    namespace Particles {
      interface ParticleEmitterManager {
        createEmitter(config: ParticleEmitterConfig): ParticleEmitter;
        destroy(): void;
      }
    }
  }

  interface ParticleEmitterConfig {
    texture: string | Phaser.Textures.Texture;
    lifespan?: number | { min: number; max: number };
    speed?: number | { min: number; max: number };
    angle?: number | { min: number; max: number };
    scale?: { start: number; end: number };
    alpha?: { start: number; end: number };
    gravityY?: number;
    quantity?: number;
    blendMode?: string;
    emitting?: boolean;
    tint?: number;
  }

  interface Input {
    on(event: 'pointerdown' | 'pointermove' | 'pointerup', fn: (pointer: Pointer) => void, context?: any): this;
    keyboard: KeyboardPlugin;
  }

  interface Pointer {
    x: number;
    y: number;
  }

  interface KeyboardPlugin {
    on(event: string, fn: () => void, context?: any): this;
  }

  interface Tweens {
    add(config: TweenConfig): Phaser.Tweens.Tween;
  }

  interface TweenConfig {
    targets: any;
    alpha?: { from: number; to: number };
    scale?: { from: number; to: number };
    duration?: number;
    yoyo?: boolean;
    repeat?: number;
    ease?: string;
    delay?: number;
  }

  interface Time {
    delayedCall(delay: number, callback: () => void, args?: any[], context?: any): Phaser.Time.TimerEvent;
    now: number;
  }

  interface Camera {
    shake(duration: number, intensity: number): this;
    flash(duration: number, red: number, green: number, blue: number): this;
  }

  interface Cameras {
    main: Camera;
  }

  interface Scene {
    cameras: Cameras;
    tweens: Tweens;
    time: Time;
    input: Input;
    matter: Physics.Matter.MatterPhysics;
    add: GameObjectFactory;
    make: GameObjectCreator;
    children: GameObjectContainer;
    sys: Scene.Sys;
    scale: ScaleManager;
    registry: DataManager;
    events: EventEmitter;
  }

  interface GameObjectFactory {
    graphics(options?: { x?: number; y?: number; add?: boolean }): Graphics;
    container(x: number, y: number, children?: GameObject[]): Container;
    image(x: number, y: number, texture: string | Texture): Image;
    text(x: number, y: number, text: string | string[], style?: TextStyle): Text;
    zone(x: number, y: number, width: number, height: number): Zone;
    particles(x: number, y: number, texture: string | Texture, options?: any): Particles.ParticleEmitterManager;
    rectangle(x: number, y: number, width: number, height: number, options?: any): any;
    circle(x: number, y: number, radius: number, options?: any): any;
    constraint(bodyA: Matter.Body, bodyB: Matter.Body, length: number, stiffness: number, options?: any): any;
    body(x: number, y: number, type: string, options: any, config?: any): Matter.Body;
  }

  interface GameObjectCreator {
    graphics(options?: { x?: number; y?: number; add?: boolean }): Graphics;
  }

  interface Geom {
    Rectangle: {
      new (x: number, y: number, width: number, height: number): Rectangle;
      Contains(rect: Rectangle, x: number, y: number): boolean;
    };
    Circle: {
      new (x: number, y: number, radius: number): Circle;
      Contains(circle: Circle, x: number, y: number): boolean;
    };
  }

  namespace Math {
    function DegToRad(degrees: number): number;
    function RadToDeg(radians: number): number;
    function Distance(x1: number, y1: number, x2: number, y2: number): number;
    function Clamp(value: number, min: number, max: number): number;
    function Between(min: number, max: number): number;
    function FloatBetween(min: number, max: number): number;
    namespace Interpolate {
      function ColorWithColor(color1: Color, color2: Color, steps: number, step: number): Color;
    }
  }

  interface Color {
    r: number;
    g: number;
    b: number;
  }

  interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  interface Circle {
    x: number;
    y: number;
    radius: number;
  }

  interface Container extends GameObject {
    setSize(width: number, height: number): this;
  }

  interface Zone extends GameObject {
    setData(key: string, value: any): this;
  }

  interface InteractiveObject {
    setInteractive(shape: any, callback?: any, dropZone?: boolean): this;
  }
}
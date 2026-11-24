import Phaser from 'phaser';
import { AIM, CAMERA, CANNON, EFFECT_LIMITS, POWER, WORLD, shotCameraFrame } from './config';
import { AMMO, getAmmo } from './ammo/catalogue';
import type { AmmoDef } from './ammo/types';
import type { Settings } from './save';
import { ALL_STAGES } from './stages/campaign';
import { buildStage } from './stages/generator';
import type { BuiltStage, StageSnapshot } from './stages/types';
import { cloneSnapshot } from './stages/types';
import type { ShotInput, ShotResult, PreviewResult, FireMode, DamageEvent, EffectEvent } from './sim/types';
import { attachWallState, getWallState, simulateShotWalls } from './sim/wall-simulator';
import { stepFragmentBodies, type FragmentBody } from './sim/fracture';
import { deserializeDebris, serializeDebris, type DebrisRecord } from './sim/debris-save';
import { coolHeat, type WallState } from './sim/walls';
import { previewShot } from './sim/preview';
import type { SoundName } from './audio';
import { ammoRoundUrl } from '../ui/asset-url';
import { Backdrop } from './render/Backdrop';
import { buildGameTextures } from './render/textures';
import { CannonView } from './render/CannonView';
import { StructureView } from './render/StructureView';
import { CoreView, RelayView } from './render/CoreView';
import { EffectDirector } from './render/EffectDirector';
import { DemolitionDirector } from './render/DemolitionDirector';
import { ProjectileView } from './render/ProjectileView';
import { makeProjectileBody } from './sim/projectile-body';
import { nearestObstacleDistance } from './sim/projectile-shell';
import { playbackTimeScale } from './sim/playback-scale';

export interface AimState {
  angleDeg: number;
  power: number;
  mode: FireMode;
  ammoId: string;
  choiceId?: string;
}

export type ReplayPhase = 'idle' | 'playing' | 'paused' | 'finished';

export interface ReplayState {
  phase: ReplayPhase;
  speed: number;
  elapsedMs: number;
  durationMs: number;
}

export interface BattleCallbacks {
  onReady: () => void;
  onAimChanged: (aim: AimState) => void;
  onPreview: (preview: PreviewResult | null) => void;
  onShotStarted: (input: ShotInput) => void;
  onShotFinished: (result: ShotResult) => void;
  onReplayState: (state: ReplayState) => void;
  onSound: (name: SoundName) => void;
  onMessage: (text: string) => void;
}

interface Playback {
  result: ShotResult;
  elapsed: number;
  frameCursor: number;
  effectCursor: number;
  damageCursor: number;
  speed: number;
  paused: boolean;
  effects: EffectEvent[];
  damages: DamageEvent[];
  lastTrailTime: number;
  coreVisual: boolean;
}

const ZOOM_SPEEDS = [0.1, 0.4, 1] as const;

/** Latest wreck frame at or before the replay time, or -1 before it starts. */
function wreckIndex(frames: Array<{ t: number }>, elapsed: number): number {
  if (frames.length === 0 || elapsed < frames[0]!.t) return -1;
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (frames[mid]!.t <= elapsed) low = mid;
    else high = mid - 1;
  }
  return low;
}

/**
 * Battlefield rendering and replay presentation. The simulation is finished
 * before a replay starts, so changing speed, pausing or skipping can never
 * change the outcome.
 */
export class BattleScene extends Phaser.Scene {
  private callbacks: Partial<BattleCallbacks> = {};
  private settings: Settings | null = null;
  private built: BuiltStage | null = null;
  private wallState: WallState | null = null;
  private fragmentBodies: FragmentBody[] = [];
  /** Replay presentation: wall state + spawned bodies visible so far. */
  private viewWallState: WallState | null = null;
  private viewBodies: FragmentBody[] = [];
  private runtime: StageSnapshot | null = null;
  private presentation: StageSnapshot | null = null;
  private aim: AimState = {
    angleDeg: AIM.defaultDeg,
    power: POWER.default,
    mode: 'arc',
    ammoId: 'ap-solid-shot',
  };
  private mode: 'ambient' | 'aiming' | 'playing' = 'ambient';
  private playback: Playback | null = null;
  private backdrop!: Backdrop;
  private cannon!: CannonView;
  private structure!: StructureView;
  private core!: CoreView;
  private relays!: RelayView;
  private effects!: EffectDirector;
  private demolition!: DemolitionDirector;
  private projectile!: Phaser.GameObjects.Image;
  private projectileView!: ProjectileView;
  /** Close to an object, the round converts to x-ray and stays that way. */
  private xrayLatched = false;
  private xrayLatchElapsed: number | null = null;
  private xrayPauseArm = false;
  private previewGraphics!: Phaser.GameObjects.Graphics;
  private trailGraphics!: Phaser.GameObjects.Graphics;
  private aimGuide!: Phaser.GameObjects.Graphics;
  private preview: PreviewResult | null = null;
  private previewDirty = true;
  private lastPreviewSignature = '';
  private projectileBaseScaleX = 1;
  private projectileBaseScaleY = 1;
  private activePointers = new Map<number, Phaser.Input.Pointer>();
  private aimPointerId: number | null = null;
  private pinch:
    | {
        distance: number;
        factor: number;
        midpoint: { x: number; y: number };
        center: { x: number; y: number };
      }
    | null = null;
  private zoomFactor = 1;
  private baseZoom = 1;
  private detailed = true;
  private lastDetailZoom = 0;
  private lastLodBucket = -1;
  private focusWall: string | null = null;
  private focusArmed = false;
  private debug = false;
  private layoutDone = false;
  private hudTop = 0;
  private hudBottom = 0;
  private lastProjectile: { x: number; y: number; angle: number } = { x: CANNON.x, y: CANNON.y, angle: 0 };
  private cine = {
    active: false,
    impactT: 0,
    impactX: 0,
    impactY: 0,
    focusX: 600,
    focusY: 240,
    zoom: 1,
    wideX: 600,
    wideY: 240,
    wideZoom: 1,
    slow: 1,
  };

  constructor() {
    super({ key: 'battle' });
  }

  setCallbacks(callbacks: Partial<BattleCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  preload(): void {
    for (const ammo of AMMO) {
      this.load.image(`round-${ammo.id}`, ammoRoundUrl(ammo.id));
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#071018');
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setBounds(-280, -100, 1760, 640);
    buildGameTextures(this);
    this.backdrop = new Backdrop(this);
    this.structure = new StructureView(this, 6);
    this.core = new CoreView(this);
    this.relays = new RelayView(this);
    this.cannon = new CannonView(this);
    this.previewGraphics = this.add.graphics().setDepth(17);
    this.trailGraphics = this.add.graphics().setDepth(19);
    this.aimGuide = this.add.graphics().setDepth(16);
    this.projectile = this.add.image(0, 0, 'round-ap-solid-shot').setDepth(20).setVisible(false);
    this.projectileView = new ProjectileView(this, 20);
    this.effects = new EffectDirector(this, this.core, this.relays, (name) => this.callbacks.onSound?.(name));
    this.demolition = new DemolitionDirector(this);

    // Matter is presentation-only: the destructible lattice remains the source
    // of truth. The ground shares a category with chunks so debris cannot spend
    // expensive cycles colliding with the structure's thousands of retired cells.
    this.matter.world.setBounds(-200, -300, 1800, 860, 96, true, true, true, true);
    this.matter.add.rectangle(600, WORLD.groundY + 38, 2600, 76, {
      isStatic: true,
      friction: 0.9,
      collisionFilter: { category: 0x0001, mask: 0x0002, group: 0 },
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onPointerDown(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer));
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.onPointerUp(pointer));
    this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => this.onPointerUp(pointer));
    this.input.on(
      'wheel',
      (_pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
        if (this.mode !== 'aiming') return;
        this.setZoomFactor(this.zoomFactor + (dy > 0 ? -0.16 : 0.16));
      },
    );
    this.game.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.scale.on('resize', () => this.layoutCamera(true));

    this.debug = new URLSearchParams(window.location.search).has('debug');
    if (this.debug) {
      // Diagnostics only: exposes the scene for the ?debug panel and manual QA.
      (window as unknown as { __battle?: BattleScene }).__battle = this;
    }
    this.layoutCamera(false);
    this.showAmbient();
    this.game.events.emit('battle-ready', this);
    this.callbacks.onReady?.();
  }

  setHudHeight(top: number, bottom: number): void {
    if (this.hudTop === top && this.hudBottom === bottom) return;
    this.hudTop = top;
    this.hudBottom = bottom;
    if (this.layoutDone) this.layoutCamera(true);
  }

  private layoutCamera(preserveCenter: boolean): void {
    const width = Math.max(320, this.scale.width);
    const height = Math.max(240, this.scale.height);
    const cam = this.cameras.main;
    const previousCenter = cam.midPoint;
    this.baseZoom = Math.min(width / WORLD.width, height / WORLD.height);
    if (this.cine.active) {
      // A resize during a cinematic replay must not snap the close-up away.
      const viewW = width / cam.zoom;
      const viewH = height / cam.zoom;
      cam.setBounds(-280 - Math.max(0, (viewW - 1760) / 2), -100 - Math.max(0, (viewH - 640) / 2), 1760 + Math.max(0, viewW - 1760), 640 + Math.max(0, viewH - 640));
      this.layoutDone = true;
      return;
    }
    const factor = Math.max(CAMERA.minZoomFactor, Math.min(CAMERA.maxZoomFactor, this.zoomFactor));
    cam.setZoom(this.baseZoom * factor);
    // A portrait viewport can be taller than the authored camera bounds. Phaser
    // clamps scroll inside the bounds, which would pin the battlefield to the
    // top edge; pad the bounds so centering remains possible.
    const viewW = width / cam.zoom;
    const viewH = height / cam.zoom;
    const padX = Math.max(0, (viewW - 1760) / 2);
    const padY = Math.max(0, (viewH - 640) / 2);
    cam.setBounds(-280 - padX, -100 - padY, 1760 + padX * 2, 640 + padY * 2);
    if (preserveCenter && this.layoutDone && factor > 1.001) {
      cam.centerOn(previousCenter.x, previousCenter.y);
    } else if (factor <= 1.001) {
      cam.centerOn(WORLD.width / 2, WORLD.height / 2);
      // Small phones lose the bottom of the frame behind the control tray.
      // Lift the world a little instead of shrinking the whole battlefield.
      if (height < 620) cam.scrollY += Math.min(26, Math.max(14, this.hudBottom * 0.19)) / cam.zoom;
    } else {
      cam.centerOn(previousCenter.x || WORLD.width / 2, previousCenter.y || WORLD.height / 2);
    }
    this.layoutDone = true;
    this.updateDetail();
  }

  /**
   * Real-time LOD. Far out the structure is a plain solid silhouette; as the
   * camera closes in, per-cell joints and cracks switch on.
   */
  private updateDetail(): void {
    const zoom = this.cameras.main.zoom;
    const next = zoom >= Math.max(0.95, this.baseZoom * 1.35);
    if (next !== this.detailed) this.detailed = next;
    // Pixel cubes are screen-sized; zooming must re-render them (LOD). During
    // the cinematic the zoom changes every frame, so only rebuild the whole
    // structure when the visible detail level changes or the zoom has moved
    // materially. Rebuilding every frame with the heat field was the single
    // biggest frame cost on phones.
    const bucket = this.structure.lodBucket();
    const lodChanged = bucket !== this.lastLodBucket;
    if (lodChanged) {
      this.lastDetailZoom = zoom;
      this.lastLodBucket = bucket;
      if (this.viewWallState) this.structure.setWalls(this.viewWallState, this.viewBodies);
    } else if (Math.abs(this.lastDetailZoom - zoom) > 0.16) {
      // Only the heat cell size depends on zoom; do not re-upload the baked
      // structure texture for it.
      this.lastDetailZoom = zoom;
      this.structure.refreshHeat(this.viewWallState);
    }
  }

  setZoomFactor(factor: number, center?: { x: number; y: number }): void {
    const next = Math.max(CAMERA.minZoomFactor, Math.min(CAMERA.maxZoomFactor, factor));
    const cam = this.cameras.main;
    const focus = center ?? cam.midPoint;
    this.zoomFactor = next;
    cam.setZoom(this.baseZoom * next);
    if (next <= 1.001) {
      cam.centerOn(WORLD.width / 2, WORLD.height / 2);
      if (this.scale.height < 620) cam.scrollY += Math.min(26, Math.max(14, this.hudBottom * 0.19)) / cam.zoom;
      this.zoomFactor = 1;
    } else {
      cam.centerOn(focus.x, focus.y);
    }
    this.updateDetail();
    if (this.previewDirty) this.refreshPreview();
  }

  private getAmmo(): AmmoDef {
    return getAmmo(this.aim.ammoId);
  }

  /**
   * Demolition close-up: match the reference impact framing, where the wall
   * fills the height but lattice blocks stay small solid cubes on screen
   * (roughly 18px at phone height), not giant waffle squares.
   */
  private closeZoom(): number {
    const height = Math.max(240, this.scale.height);
    // The reference cuts close enough to read the round's pixel body, not just
    // the wall it is about to hit.
    return Math.max(1.7, Math.min(2.8, height / 225));
  }

  private beginCine(result: ShotResult): void {
    const last = result.frames[result.frames.length - 1];
    const impact = result.impact;
    this.cine = {
      active: true,
      impactT: last ? last.t : 0,
      impactX: impact?.x ?? last?.x ?? CANNON.x,
      impactY: impact?.y ?? last?.y ?? CANNON.y,
      focusX: CANNON.x,
      focusY: CANNON.y,
      zoom: this.cameras.main.zoom,
      wideX: this.cameras.main.midPoint.x,
      wideY: this.cameras.main.midPoint.y,
      wideZoom: this.cameras.main.zoom,
      slow: 1,
    };
    // Keep the whole range baked as one until the round is nearly at its wall;
    // then split that wall out into the live detail layer.
    this.focusWall = (result.impact ?? result.firstContact)?.wallId ?? null;
    this.focusArmed = this.focusWall !== null;
  }

  /**
   * Cinematic slow motion. The simulation has already finished, so this only
   * changes how fast the pre-computed replay is presented.
   */
  private cinematicTimeScale(playback: Playback): number {
    if (!this.cine.active || !playback.result.impact) return 1;
    // Contact time = the first frame whose shell lattice is engaged, so the
    // replay crawls through the bore itself, not only at the terminal hit.
    const frames = playback.result.frames;
    const contactIdx = frames.findIndex((f) => f.shell && f.shell.age > 0);
    const contactT = contactIdx >= 0 ? frames[contactIdx]!.t : null;
    return playbackTimeScale(playback.elapsed, contactT, this.cine.impactT);
  }

  private updateCineCamera(delta: number): void {
    if (!this.cine.active || !this.playback) return;
    const playback = this.playback;
    const cam = this.cameras.main;
    const t = playback.elapsed;
    const framing = shotCameraFrame(t, this.cine.impactT, playback.result.durationMs, this.cine.wideZoom, this.closeZoom());
    let tx = this.cine.impactX;
    let ty = this.cine.impactY;
    if (t < this.cine.impactT && playback.result.frames.length > 0) {
      const angle = this.lastProjectile.angle;
      tx = this.lastProjectile.x + Math.cos(angle) * 20;
      ty = this.lastProjectile.y + Math.sin(angle) * 20;
    }
    const ease = 1 - Math.exp(-delta / 65);
    this.cine.focusX += (tx - this.cine.focusX) * ease;
    this.cine.focusY += (ty - this.cine.focusY) * ease;
    this.cine.zoom = framing.zoom;
    cam.setZoom(framing.zoom);
    const hudOffset = ((this.hudBottom - this.hudTop) * 0.5) / framing.zoom;
    cam.centerOn(
      this.cine.wideX + (this.cine.focusX - this.cine.wideX) * framing.tracking,
      this.cine.wideY + (this.cine.focusY + hudOffset - this.cine.wideY) * framing.tracking,
    );
    this.updateDetail();
  }

  private resetCamera(): void {
    this.cine.active = false;
    this.cine.slow = 1;
    this.zoomFactor = 1;
    this.tweens.timeScale = 1;
    this.matter.world.resume();
    this.matter.world.engine.timing.timeScale = 1;
    this.layoutCamera(false);
  }

  /**
   * Pick an opening line that actually reaches the battery. The generic 42° /
   * 330 defaults clear the whole field on many seeds, which teaches nothing and
   * wastes the first shot. Previews are cheap, so probe a coarse arc grid and
   * keep a sensible contact: core first, then relay, then any structure face.
   */
  private findOpeningAim(stage: BuiltStage, ammo: AmmoDef): { angleDeg: number; power: number } {
    const fallback = { angleDeg: AIM.defaultDeg, power: POWER.default };
    if (!this.runtime) return fallback;
    // Opening shots should read the front face first: bonus for the earliest
    // wall along the range instead of letting a rear truss win on angle alone.
    const frontX = Math.min(
      ...(stage.wallState?.walls ?? []).flatMap((w) => w.polygons.flat().map((p) => p.x)),
      Number.POSITIVE_INFINITY,
    );
    let best: { angleDeg: number; power: number; score: number } | null = null;
    // Coarse probe: the full 4x20 sweep ran ~200 complete flight traces on the
    // main thread at mission start, which stalled phones. A 6x40 grid finds
    // the same opening line, and a confirmed core hit stops the search.
    for (let angle = 8; angle <= 70; angle += 6) {
      for (let power = 180; power <= 420; power += 40) {
        const input: ShotInput = {
          angleDeg: angle,
          power,
          mode: 'arc',
          ammoId: ammo.id,
          choiceId: ammo.choice?.defaultOption,
        };
        let preview: PreviewResult | null = null;
        try {
          preview = previewShot(stage.def, this.runtime, input);
        } catch {
          continue;
        }
        if (!preview?.firstContact) continue;
        const contactX = preview.firstContact.x;
        const frontBonus = Number.isFinite(frontX) ? Math.max(0, 12 - Math.max(0, contactX - frontX) / 18) : 0;
        const score =
          (preview.willHitCore ? 120 : 0) +
          (preview.willHitRelay ? 70 : 0) +
          (preview.coverWarning ? 26 : 0) +
          frontBonus +
          10 -
          Math.abs(power - 300) / 40 -
          Math.abs(angle - 38) / 12;
        if (!best || score > best.score) best = { angleDeg: angle, power, score };
        if (best.score >= 120) return { angleDeg: best.angleDeg, power: best.power };
      }
    }
    if (!best) return fallback;
    return { angleDeg: best.angleDeg, power: best.power };
  }

  private setProjectileTexture(ammo: AmmoDef, coreVisual = false): void {
    const key = coreVisual ? 'sabot-core' : `round-${ammo.id}`;
    if (!this.textures.exists(key)) {
      this.projectile.setTexture(`round-${ammo.id}`);
    } else {
      this.projectile.setTexture(key);
    }
    const texture = this.projectile.texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const ratio = texture.height / Math.max(1, texture.width);
    const width = coreVisual ? 34 : 43 * (ammo.flight.spriteScale ?? 1);
    this.projectileBaseScaleX = width / Math.max(1, texture.width);
    this.projectileBaseScaleY = (width * ratio) / Math.max(1, texture.height);
    this.projectile.setScale(this.projectileBaseScaleX, this.projectileBaseScaleY);
  }

  showAmbient(): void {
    this.mode = 'ambient';
    this.tweens.resumeAll();
    this.tweens.timeScale = 1;
    this.matter.world.resume();
    this.playback = null;
    this.effects.clear();
    this.previewGraphics.clear();
    this.trailGraphics.clear();
    this.aimGuide.clear();
    this.projectile.setVisible(false);
    this.relays.clear();
    this.demolition.clear();
    this.zoomFactor = 1;
    this.hudTop = 0;
    this.hudBottom = 0;
    this.layoutCamera(false);
    const stage = buildStage(ALL_STAGES[0]!);
    this.built = stage;
    this.runtime = cloneSnapshot({ grid: stage.grid, wallState: stage.wallState, core: stage.core, relays: stage.relays });
    this.presentation = cloneSnapshot(this.runtime);
    this.wallState = this.runtime.wallState ?? getWallState(this.runtime);
    this.viewWallState = this.wallState;
    this.viewBodies = [];
    this.fragmentBodies = [];
    this.backdrop.setTheme(stage.def.theme, this.settings?.reducedEffects ?? false);
    this.structure.setFocus(null);
    this.focusWall = null;
    this.focusArmed = false;
    this.lastLodBucket = -1;
    this.structure.setWalls(this.wallState, []);
    this.core.setCore(this.runtime.core);
    this.relays.setRelays(this.runtime.relays);
    this.cannon.setVisible(true);
    this.cannon.setAim(38);
    this.core.setVisible(true);
    this.callbacks.onReplayState?.({ phase: 'idle', speed: 1, elapsedMs: 0, durationMs: 0 });
  }

  startMission(
    stage: BuiltStage,
    ammoId: string,
    settings: Settings,
    restored?: { snapshot: StageSnapshot; aim: AimState; debris?: DebrisRecord[] },
  ): void {
    this.settings = settings;
    this.tweens.resumeAll();
    this.tweens.timeScale = 1;
    this.matter.world.resume();
    this.activePointers.clear();
    this.aimPointerId = null;
    this.pinch = null;
    this.effects.clear();
    this.relays.clear();
    this.previewGraphics.clear();
    this.trailGraphics.clear();
    this.aimGuide.clear();
    this.demolition.clear();
    this.cine.active = false;
    this.tweens.timeScale = 1;
    this.matter.world.engine.timing.timeScale = 1;
    this.projectile.setVisible(false);
    this.trailGraphics.setData('points', []);
    this.built = stage;
    this.runtime = cloneSnapshot(restored?.snapshot ?? { grid: stage.grid, wallState: stage.wallState, core: stage.core, relays: stage.relays });
    this.wallState = getWallState(this.runtime);
    attachWallState(this.runtime, this.wallState);
    this.viewWallState = this.wallState;
    // Rubble that had settled before the reload comes back with the mission:
    // the battlefield is restored, not just the damage numbers.
    this.fragmentBodies = restored?.debris ? deserializeDebris(restored.debris) : [];
    this.viewBodies = this.fragmentBodies;
    this.presentation = cloneSnapshot(this.runtime);
    this.zoomFactor = 1;
    this.layoutCamera(false);
    this.backdrop.setTheme(stage.def.theme, settings.reducedEffects);
    this.structure.setFocus(null);
    this.focusWall = null;
    this.focusArmed = false;
    this.lastLodBucket = -1;
    this.structure.setThermal(settings.thermalVision);
    this.structure.setWalls(this.wallState, this.fragmentBodies);
    this.core.setCore(this.runtime.core);
    this.relays.setRelays(this.runtime.relays);
    this.cannon.setVisible(true);
    this.core.setVisible(true);
    this.effects.setOptions(settings.reducedEffects, settings.cameraShake);
    this.demolition.setOptions(settings.reducedEffects);
    this.structure.setThermal(settings.thermalVision);
    this.demolition.setWalls(this.wallState);
    this.mode = 'aiming';
    this.playback = null;
    const ammo = getAmmo(ammoId);
    const opening = restored ? null : this.findOpeningAim(stage, ammo);
    this.aim = restored ? { ...restored.aim } : {
      angleDeg: opening!.angleDeg,
      power: opening!.power,
      mode: 'arc',
      ammoId: ammo.id,
      choiceId: ammo.choice?.defaultOption,
    };
    this.cannon.setAim(this.aim.angleDeg);
    this.setProjectileTexture(ammo);
    this.previewDirty = true;
    this.lastPreviewSignature = '';
    this.refreshPreview();
    this.emitAim();
    this.callbacks.onReplayState?.({ phase: 'idle', speed: 1, elapsedMs: 0, durationMs: 0 });
    this.callbacks.onMessage?.(`${stage.def.code} — ${stage.def.name.toUpperCase()}`);
  }

  applySettings(settings: Settings): void {
    this.settings = settings;
    this.effects.setOptions(settings.reducedEffects, settings.cameraShake);
    this.demolition.setOptions(settings.reducedEffects);
    this.structure.setThermal(settings.thermalVision);
    if (this.built) this.backdrop.setTheme(this.built.def.theme, settings.reducedEffects);
    this.previewDirty = true;
    if (this.mode === 'aiming') this.refreshPreview();
  }

  getAim(): AimState {
    return { ...this.aim };
  }

  getReplayState(): ReplayState {
    if (!this.playback) {
      return { phase: 'idle', speed: 1, elapsedMs: 0, durationMs: 0 };
    }
    return {
      phase: this.playback.paused ? 'paused' : 'playing',
      speed: this.playback.speed,
      elapsedMs: Math.min(this.playback.elapsed, this.playback.result.durationMs),
      durationMs: this.playback.result.durationMs,
    };
  }

  getBuiltStage(): BuiltStage | null {
    return this.built;
  }

  getRuntimeSnapshot(): StageSnapshot | null {
    return this.runtime ? cloneSnapshot(this.runtime) : null;
  }

  /** Settled rubble, for the mission checkpoint. */
  getDebrisRecords(): DebrisRecord[] {
    return serializeDebris(this.fragmentBodies);
  }

  getPendingShot(): Pick<ShotResult, 'final' | 'coreDamage' | 'cellDamage'> | null {
    const result = this.playback?.result;
    return result ? { final: cloneSnapshot(result.final), coreDamage: result.coreDamage, cellDamage: result.cellDamage } : null;
  }

  setAimAngle(angleDeg: number): void {
    const next = Math.max(AIM.minDeg, Math.min(AIM.maxDeg, Math.round(angleDeg * 2) / 2));
    if (next === this.aim.angleDeg) return;
    this.aim.angleDeg = next;
    this.cannon.setAim(next);
    this.previewDirty = true;
    this.emitAim();
  }

  setPower(power: number): void {
    const next = Math.max(POWER.min, Math.min(POWER.max, Math.round(power)));
    if (next === this.aim.power) return;
    this.aim.power = next;
    this.previewDirty = true;
    this.emitAim();
  }

  setMode(mode: FireMode): void {
    if (mode === this.aim.mode) return;
    this.aim.mode = mode;
    this.previewDirty = true;
    this.emitAim();
  }

  setAmmo(ammoId: string): void {
    const ammo = getAmmo(ammoId);
    this.aim.ammoId = ammo.id;
    this.aim.choiceId = ammo.choice?.defaultOption;
    this.setProjectileTexture(ammo);
    this.previewDirty = true;
    this.emitAim();
  }

  setChoice(choiceId: string): void {
    const ammo = this.getAmmo();
    if (!ammo.choice) return;
    const exists = ammo.choice.options.some((option) => option.id === choiceId);
    if (!exists || this.aim.choiceId === choiceId) return;
    this.aim.choiceId = choiceId;
    this.previewDirty = true;
    this.emitAim();
  }

  resetAim(): void {
    this.aim.angleDeg = AIM.defaultDeg;
    this.aim.power = POWER.default;
    this.cannon.setAim(this.aim.angleDeg);
    this.previewDirty = true;
    this.emitAim();
  }

  nudgeAngle(delta: number): void {
    this.setAimAngle(this.aim.angleDeg + delta);
  }

  nudgePower(delta: number): void {
    this.setPower(this.aim.power + delta);
  }

  private emitAim(): void {
    this.callbacks.onAimChanged?.({ ...this.aim });
  }

  private refreshPreview(): void {
    if (!this.built || !this.runtime || this.mode !== 'aiming') {
      this.preview = null;
      this.previewGraphics.clear();
      this.aimGuide.clear();
      this.callbacks.onPreview?.(null);
      this.previewDirty = false;
      return;
    }
    const signature = `${this.aim.angleDeg}|${this.aim.power}|${this.aim.mode}|${this.aim.ammoId}|${this.aim.choiceId ?? ''}`;
    if (signature === this.lastPreviewSignature && !this.previewDirty) return;
    this.lastPreviewSignature = signature;
    const input: ShotInput = {
      angleDeg: this.aim.angleDeg,
      power: this.aim.power,
      mode: this.aim.mode,
      ammoId: this.aim.ammoId,
      choiceId: this.aim.choiceId,
    };
    let preview: PreviewResult | null = null;
    try {
      preview = previewShot(this.built.def, this.runtime, input);
    } catch {
      preview = null;
    }
    this.preview = preview;
    this.drawPreview(preview);
    this.callbacks.onPreview?.(preview);
    this.previewDirty = false;
  }

  private drawPreview(preview: PreviewResult | null): void {
    const g = this.previewGraphics;
    g.clear();
    this.aimGuide.clear();
    const ammo = this.getAmmo();
    if (!preview || this.settings?.trajectory === 'hidden') return;
    const danger = preview.coverWarning;
    const core = preview.willHitCore;
    const color = danger ? 0xff6f5d : core ? 0xffb25e : 0x79c6d6;
    const count = preview.samples.length;
    if (count > 1) {
      const stride = Math.max(1, Math.floor(count / (this.settings?.reducedEffects ? 42 : 76)));
      let drawn = 0;
      for (let i = 0; i < count; i += stride) {
        const sample = preview.samples[i]!;
        const t = i / count;
        const alpha = 0.18 + (1 - t) * 0.62;
        g.fillStyle(color, alpha * (0.65 + ammo.vfx.trailLength));
        const size = i % (stride * 3) === 0 ? 3 : 2;
        g.fillRect(Math.round(sample.x) - size / 2, Math.round(sample.y) - size / 2, size, size);
        drawn += 1;
        if (drawn > 90) break;
      }
    }
    const contact = preview.firstContact;
    if (contact) {
      const x = Math.round(contact.x);
      const y = Math.round(contact.y);
      // Square bracket reticle: four corner arms and a centre pixel, no lines.
      const mark = danger ? 0xff715f : 0xffcf91;
      g.fillStyle(mark, 0.9);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as Array<[number, number]>) {
        g.fillRect(x + sx * 8 - (sx < 0 ? 0 : 2), y + sy * 8 - (sy < 0 ? 0 : 2), 3, 3);
        g.fillRect(x + sx * 8 - (sx < 0 ? 0 : 4), y + sy * 8 - (sy < 0 ? 1 : 1), 4, 1);
        g.fillRect(x + sx * 8 - (sx < 0 ? 1 : 1), y + sy * 8 - (sy < 0 ? 0 : 4), 1, 4);
      }
      g.fillStyle(danger ? 0xff715f : 0xffd29a, 1);
      g.fillRect(x - 1, y - 1, 3, 3);
      // Aim guide dashes near the muzzle make it clear which direction is held.
      const radians = Phaser.Math.DegToRad(this.aim.angleDeg);
      for (let d = 22; d < 70; d += 8) {
        g.fillStyle(color, 0.28 * (1 - d / 80));
        g.fillRect(CANNON.x + Math.cos(radians) * d, CANNON.y - Math.sin(radians) * d, 2, 2);
      }
    }
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.mode !== 'aiming') return;
    this.activePointers.set(pointer.id, pointer);
    if (this.activePointers.size >= 2) {
      this.aimPointerId = null;
      this.beginPinch();
      return;
    }
    this.aimPointerId = pointer.id;
    this.aimFromPointer(pointer);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.activePointers.has(pointer.id)) return;
    if (this.pinch && this.activePointers.size >= 2) {
      this.updatePinch();
      return;
    }
    if (this.mode === 'aiming' && pointer.id === this.aimPointerId) this.aimFromPointer(pointer);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    this.activePointers.delete(pointer.id);
    if (this.activePointers.size < 2) {
      this.pinch = null;
    }
    if (pointer.id === this.aimPointerId) this.aimPointerId = null;
  }

  private beginPinch(): void {
    const pointers = [...this.activePointers.values()].slice(0, 2);
    if (pointers.length < 2) return;
    const a = pointers[0]!;
    const b = pointers[1]!;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (distance < 10) return;
    this.pinch = {
      distance,
      factor: this.zoomFactor,
      midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      center: { x: this.cameras.main.midPoint.x, y: this.cameras.main.midPoint.y },
    };
  }

  private updatePinch(): void {
    if (!this.pinch) return;
    const pointers = [...this.activePointers.values()].slice(0, 2);
    if (pointers.length < 2) return;
    const a = pointers[0]!;
    const b = pointers[1]!;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const factor = this.pinch.factor * (distance / Math.max(10, this.pinch.distance));
    const cam = this.cameras.main;
    const next = Math.max(CAMERA.minZoomFactor, Math.min(CAMERA.maxZoomFactor, factor));
    this.zoomFactor = next;
    cam.setZoom(this.baseZoom * next);
    const zoom = cam.zoom;
    if (next <= 1.001) {
      this.zoomFactor = 1;
      cam.centerOn(WORLD.width / 2, WORLD.height / 2);
      if (this.scale.height < 620) cam.scrollY += Math.min(26, Math.max(14, this.hudBottom * 0.19)) / cam.zoom;
    } else {
      cam.centerOn(
        this.pinch.center.x - (midpoint.x - this.pinch.midpoint.x) / zoom,
        this.pinch.center.y - (midpoint.y - this.pinch.midpoint.y) / zoom,
      );
    }
    this.updateDetail();
    if (this.previewDirty) this.refreshPreview();
  }

  private aimFromPointer(pointer: Phaser.Input.Pointer): void {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const raw = Phaser.Math.RadToDeg(Math.atan2(CANNON.y - world.y, world.x - CANNON.x));
    const clamped = Math.max(AIM.minDeg, Math.min(AIM.maxDeg, raw));
    const sensitivity = this.settings?.aimSensitivity ?? AIM.defaultSensitivity;
    const blended = this.aim.angleDeg + (clamped - this.aim.angleDeg) * sensitivity;
    this.setAimAngle(blended);
  }

  fire(): ShotInput | null {
    if (this.mode !== 'aiming' || !this.built || !this.runtime || !this.settings) return null;
    const input: ShotInput = {
      angleDeg: this.aim.angleDeg,
      power: this.aim.power,
      mode: this.aim.mode,
      ammoId: this.aim.ammoId,
      choiceId: this.aim.choiceId,
    };
    let result: ShotResult;
    try {
      const outcome = simulateShotWalls(this.built.def, this.runtime, input);
      result = outcome.result;
      // Runtime wall state is NOT mutated until finishShot(); replay renders
      // phase states from result.phaseWallStates so Pause/Skip/Finish are exact.
      this.wallState = outcome.wallState;
      this.fragmentBodies = [...this.fragmentBodies, ...outcome.bodies];
    } catch (error) {
      this.callbacks.onMessage?.(`SIMULATION ERROR: ${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
    this.mode = 'playing';
    this.preview = null;
    this.previewGraphics.clear();
    this.aimGuide.clear();
    this.trailGraphics.clear();
    this.trailGraphics.setData('points', []);
    this.projectile.setVisible(false);
    this.callbacks.onPreview?.(null);
    this.presentation = cloneSnapshot(result.start);
    // Wall-first replay presentation: start walls, no bodies until spawn times.
    this.viewWallState = result.start.wallState ? attachWallState(cloneSnapshot(result.start), result.start.wallState).wallState ?? null : getWallState(this.presentation);
    this.viewBodies = [];
    this.structure.setWalls(this.viewWallState, this.viewBodies);
    this.core.setCore(this.presentation.core);
    this.relays.setRelays(this.presentation.relays);
    const ammo = this.getAmmo();
    this.setProjectileTexture(ammo);
    const effects = [...result.effects].sort((a, b) => a.t - b.t);
    const damages = [...result.damageEvents].sort((a, b) => a.t - b.t);
    this.playback = {
      result,
      elapsed: 0,
      frameCursor: 0,
      effectCursor: 0,
      damageCursor: 0,
      speed: 1,
      paused: false,
      effects,
      damages,
      lastTrailTime: -1,
      coreVisual: ammo.flight.separation !== 'carrier',
    };
    this.xrayLatched = false;
    this.xrayLatchElapsed = null;
    this.tweens.timeScale = 1;
    this.matter.world.resume();
    this.matter.world.engine.timing.timeScale = 1;
    this.beginCine(result);
    this.cannon.recoil(this.aim.angleDeg);
    this.callbacks.onShotStarted?.(input);
    this.callbacks.onReplayState?.({
      phase: 'playing',
      speed: 1,
      elapsedMs: 0,
      durationMs: result.durationMs,
    });
    return input;
  }

  setReplayPaused(paused: boolean): void {
    const playback = this.playback;
    if (!playback) return;
    playback.paused = paused;
    if (paused) {
      this.tweens.pauseAll();
      this.matter.world.pause();
      this.callbacks.onReplayState?.({
        phase: 'paused',
        speed: playback.speed,
        elapsedMs: playback.elapsed,
        durationMs: playback.result.durationMs,
      });
    } else {
      this.tweens.resumeAll();
      this.tweens.timeScale = playback.speed;
      this.matter.world.resume();
      this.matter.world.engine.timing.timeScale = playback.speed;
      this.callbacks.onReplayState?.({
        phase: 'playing',
        speed: playback.speed,
        elapsedMs: playback.elapsed,
        durationMs: playback.result.durationMs,
      });
    }
  }

  /** Arm a deterministic pause on the exact latch frame of the x-ray
   * conversion (test/proof hook): the replay freezes on the first rendered
   * frame after `xrayLatched` flips, so the converted round can be shot. */
  armXrayPause(): void { this.xrayPauseArm = true; }

  /** Current x-ray state for debug/proof tools. */
  xrayState(): { latched: boolean; latchElapsed: number | null; elapsed: number } {
    return { latched: this.xrayLatched, latchElapsed: this.xrayLatchElapsed, elapsed: this.playback?.elapsed ?? 0 };
  }

  setReplaySpeed(speed: number): void {
    const playback = this.playback;
    if (!playback) return;
    const allowed = ZOOM_SPEEDS.includes(speed as (typeof ZOOM_SPEEDS)[number]) ? speed : 1;
    playback.speed = allowed;
    if (!playback.paused) this.tweens.timeScale = allowed;
    this.callbacks.onReplayState?.({
      phase: playback.paused ? 'paused' : 'playing',
      speed: playback.speed,
      elapsedMs: playback.elapsed,
      durationMs: playback.result.durationMs,
    });
  }

  /** Finish the replay while leaving the final few frames to read. */
  finishReplay(): void {
    const playback = this.playback;
    if (!playback) return;
    playback.paused = false;
    playback.speed = 1;
    this.tweens.resumeAll();
    this.tweens.timeScale = 1;
    this.matter.world.resume();
    playback.elapsed = Math.max(playback.elapsed, playback.result.durationMs - 360);
    this.callbacks.onReplayState?.({
      phase: 'playing',
      speed: playback.speed,
      elapsedMs: playback.elapsed,
      durationMs: playback.result.durationMs,
    });
  }

  skipReplay(): void {
    if (!this.playback) return;
    this.finishShot(true);
  }

  private finishShot(skipped = false): void {
    const playback = this.playback;
    if (!playback || !this.built) return;
    if (!skipped) {
      for (; playback.effectCursor < playback.effects.length; playback.effectCursor += 1) {
        this.effects.play(playback.effects[playback.effectCursor]!);
      }
    }
    for (; playback.damageCursor < playback.damages.length; playback.damageCursor += 1) {
      this.applyDamage(playback.damages[playback.damageCursor]!);
    }
    this.runtime = cloneSnapshot(playback.result.final);
    this.presentation = cloneSnapshot(playback.result.final);
    // Wall-object presentation at rest: walls + fragment bodies only. The live
    // focus wall is baked back into the single structure texture so the breach
    // and its deformation persist after the shot.
    this.structure.setFocus(null);
    this.focusWall = null;
    this.focusArmed = false;
    this.lastLodBucket = -1;
    if (this.runtime.wallState) {
      this.wallState = this.runtime.wallState;
      this.structure.setWalls(this.wallState, this.fragmentBodies);
    }
    this.viewWallState = this.wallState;
    this.viewBodies = this.fragmentBodies;
    this.core.setCore(this.runtime.core);
    this.relays.setRelays(this.runtime.relays);
    this.demolition.setWalls(this.wallState);
    this.projectile.setVisible(false);
    this.projectileView?.hide();
    this.trailGraphics.clear();
    this.playback = null;
    this.mode = 'aiming';
    this.trailGraphics.setData('points', []);
    this.tweens.timeScale = 1;
    this.tweens.resumeAll();
    this.matter.world.resume();
    this.resetCamera();
    this.previewDirty = true;
    this.lastPreviewSignature = '';
    this.refreshPreview();
    this.callbacks.onReplayState?.({
      phase: 'finished',
      speed: playback.speed,
      elapsedMs: playback.result.durationMs,
      durationMs: playback.result.durationMs,
    });
    this.callbacks.onShotFinished?.(playback.result);
  }

  /**
   * Wall-object replay (P0-10): swap to the authoritative post-phase walls
   * and reveal the bodies that phase spawned. Core/relay presentation is
   * resolved at finishShot() from the final snapshot so partial playback
   * never shows a half-applied objective state.
   */
  private applyDamage(event: DamageEvent): void {
    if (!this.presentation) return;
    if (event.wallState) {
      this.viewWallState = event.wallState;
    }
    if (event.spawnedBodies) {
      this.viewBodies.push(...event.spawnedBodies.map(b => ({ ...b })));
    }
    if (event.coreHp !== undefined) {
      this.presentation.core.hp = event.coreHp;
      if (event.coreHp <= 0) this.presentation.core.destroyed = true;
      this.core.setCore(this.presentation.core, Boolean(event.coreDropped));
    }
    this.structure.setWalls(this.viewWallState, this.viewBodies);
  }

  private updatePlayback(delta: number, time: number): void {
    const playback = this.playback;
    if (!playback || playback.paused || !this.presentation) return;
    const slow = this.cinematicTimeScale(playback);
    this.cine.slow = slow;
    const advance = delta * playback.speed * slow;
    playback.elapsed += advance;
    // Deterministic latch-frame pause (armed via armXrayPause): fires on the
    // first playback tick after the latch flips, with the converted round
    // already drawn for this frame.
    if (this.xrayPauseArm && this.xrayLatched) {
      this.xrayPauseArm = false;
      this.setReplayPaused(true);
    }
    if (this.focusArmed && this.focusWall && playback.elapsed >= this.cine.impactT - 260) {
      this.structure.setFocus(this.focusWall);
      this.focusArmed = false;
    }
    this.tweens.timeScale = playback.speed * slow;
    this.matter.world.engine.timing.timeScale = playback.speed * slow;
    this.demolition.update(advance);
    while (
      playback.effectCursor < playback.effects.length &&
      playback.effects[playback.effectCursor]!.t <= playback.elapsed
    ) {
      const event = playback.effects[playback.effectCursor]!;
      if (event.kind === 'separation' && this.getAmmo().flight.separation === 'carrier') {
        playback.coreVisual = true;
        this.setProjectileTexture(this.getAmmo(), true);
      }
      this.effects.play(event);
      playback.effectCursor += 1;
    }
    while (
      playback.damageCursor < playback.damages.length &&
      playback.damages[playback.damageCursor]!.t <= playback.elapsed
    ) {
      this.applyDamage(playback.damages[playback.damageCursor]!);
      playback.damageCursor += 1;
    }
    this.updateProjectile(playback, time);
    if (this.cine.active) this.updateCineCamera(delta);
    if (playback.elapsed >= playback.result.durationMs) this.finishShot();
  }

  private updateProjectile(playback: Playback, time: number): void {
    const frames = playback.result.frames;
    if (frames.length === 0) {
      this.projectile.setVisible(false);
      return;
    }
    while (
      playback.frameCursor + 1 < frames.length &&
      frames[playback.frameCursor + 1]!.t <= playback.elapsed
    ) {
      playback.frameCursor += 1;
    }
    const current = frames[playback.frameCursor]!;
    const next = frames[playback.frameCursor + 1];
    let x = current.x;
    let y = current.y;
    let angle = current.angle;
    let scale = current.scale;
    if (next) {
      const span = Math.max(1, next.t - current.t);
      const ratio = Math.max(0, Math.min(1, (playback.elapsed - current.t) / span));
      x += (next.x - x) * ratio;
      y += (next.y - y) * ratio;
      angle += (next.angle - angle) * ratio;
      scale += (next.scale - scale) * ratio;
    }
    const last = frames[frames.length - 1]!;
    if (playback.elapsed > last.t) {
      // The casing does not freeze at the impact. It peels off, tumbles and
      // settles along the deterministic wreck timeline produced by the solver.
      const wreck = playback.result.wreck;
      const index = wreckIndex(wreck, playback.elapsed);
      if (index >= 0) {
        const frame = wreck[index]!;
        const ammo = this.getAmmo();
        const body = makeProjectileBody(ammo.flight.mass ?? 1, 120);
        body.squash = 1;
        body.integrity = 0.3;
        this.projectileView.draw(
          frame.x,
          frame.y,
          frame.angle,
          body,
          34 * (ammo.flight.spriteScale ?? 1) * frame.scale,
          frame.shell
            ? { ...frame.shell, age: frame.shell.age + (playback.elapsed - frame.t) / 1000, xray: this.xrayLatched }
            : undefined,
        );
        this.projectile.setVisible(false);
        return;
      }
      this.projectile.setVisible(false);
      return;
    }
    // X-ray conversion: within reach of the structure the casing goes
    // translucent in the reference (orange sleeve, bright steel core), and
    // the round stays that way for the rest of the shot. Proximity is pure
    // presentation; the solver already ran the same collision either way.
    if (!this.xrayLatched) {
      const walls = this.viewWallState?.walls ?? playback.result.start.wallState?.walls ?? [];
      const core = playback.result.start.core;
      if (nearestObstacleDistance({ x, y }, walls, { x: core.x, y: core.y, radius: core.radius }) < 80) {
        this.xrayLatched = true;
        this.xrayLatchElapsed = playback.elapsed;
      }
    }
    this.lastProjectile = { x, y, angle };
    // Pixel round: the layered sprite replaces the old texture entirely. The
    // frame carries the penetration body state (squash + layers crossed), so
    // the presentation matches what the shot actually did.
    const squash = current.squash ?? 0;
    const layers = current.layers ?? 0;
    const ammo = this.getAmmo();
    const body = makeProjectileBody(ammo.flight.mass ?? 1, Math.max(120, 500 * (1 - squash * 0.6)));
    body.squash = squash;
    body.layers = layers;
    body.integrity = 1 - squash * 0.5;
    this.projectileView.draw(
      x,
      y,
      angle,
      body,
      34 * (ammo.flight.spriteScale ?? 1) * scale,
      current.shell
        ? { ...current.shell, xray: this.xrayLatched }
        : this.xrayLatched
          ? { squash: 0, crumple: 0, hardness: 0.5, speed: 600, mass: 9, integrity: 1, seed: 991, age: 0, xray: true }
          : undefined,
    );
    // The legacy texture sprite must stay hidden: drawing both produced the
    // doubled, wrong-looking bullet reported in the recordings review.
    this.projectile.setVisible(false);
    if (time - playback.lastTrailTime > 12) {
      this.appendTrail(x, y);
      playback.lastTrailTime = time;
    }
  }

  private appendTrail(x: number, y: number): void {
    if (this.playback && this.playback.elapsed > (this.playback.result.frames[this.playback.result.frames.length - 1]?.t ?? 0)) {
      return;
    }
    const points = (this.trailGraphics.getData('points') as Array<{ x: number; y: number }> | undefined) ?? [];
    const last = points[points.length - 1];
    if (!last || Math.hypot(last.x - x, last.y - y) > 1.8) points.push({ x, y });
    const max = (this.settings?.reducedEffects ? EFFECT_LIMITS.reduced.trailSamples : EFFECT_LIMITS.normal.trailSamples);
    while (points.length > max) points.shift();
    this.trailGraphics.setData('points', points);
    this.drawTrail(points);
  }

  /**
   * Twin pixel contrails (11-18 close-ups): two dashed cyan-white lines leaving
   * the tail, not one fat ribbon. Normal offset follows the local path, so the
   * trails bend with the arc exactly like the footage.
   */
  private drawTrail(points: Array<{ x: number; y: number }>): void {
    const g = this.trailGraphics;
    g.clear();
    if (points.length < 2) return;
    const ammo = this.getAmmo();
    // The newest recording's kinetic rounds trail pale blue-white dashes, not a
    // solid ribbon; the alternating colours below keep that read.
    const color = ammo.vfx.family === 'kinetic' || ammo.vfx.family === 'aphe' ? 0xb9d9ea : ammo.vfx.trail;
    const strength = ammo.vfx.trailLength;
    const offset = 2.4;
    for (let i = 1; i < points.length; i += 1) {
      const point = points[i]!;
      const prev = points[i - 1]!;
      const t = i / (points.length - 1);
      const dx = point.x - prev.x;
      const dy = point.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const alpha = Math.max(0, 0.2 + t * strength * 1.1);
      // Dashed twin contrails: every third sample is skipped so the lines read
      // as dashes rather than solid rails, and both strands are stamped every
      // sample so the trail stays visible at phone resolution.
      if (i % 3 === 0) continue;
      g.fillStyle(i % 6 < 3 ? 0xffffff : color, alpha);
      g.fillRect(point.x + nx * offset - 1, point.y + ny * offset - 1, 2, 2);
      g.fillStyle(i % 6 < 3 ? color : 0xffffff, alpha * 0.95);
      g.fillRect(point.x - nx * offset - 1, point.y - ny * offset - 1, 2, 2);
    }
  }

  update(time: number, delta: number): void {
    if (this.core) this.core.update(time);
    if (this.relays) this.relays.update(time);
    // Dynamic cooling: heat stains fade over time (presentation only).
    if (this.viewWallState) coolHeat(this.viewWallState, Math.min(50, delta) / 1000);
    if (this.mode === 'aiming' && this.previewDirty) this.refreshPreview();
    if (this.playback) this.updatePlayback(Math.min(50, delta), time);
    // Wall fragment rigid bodies (P0-7): world-space, zoom independent.
    if (this.viewWallState && this.viewBodies.length > 0) {
      stepFragmentBodies(this.viewBodies, Math.min(50, delta) / 1000, this.viewWallState.groundY, 900, this.viewWallState.walls);
      // Debris-only redraw: rebuilding every wall polygon and the heat field
      // each frame was the dominant cost on phones while rubble was moving.
      if (this.viewBodies.some((b) => !b.sleeping)) this.structure.setBodies(this.viewBodies);
      if (this.mode === 'aiming') this.fragmentBodies = this.viewBodies;
    }
    if (this.effects) this.effects.update(time);
    this.structure.update(time);
    void this.debug;
  }

  getDebugInfo(): Record<string, string | number | boolean> {
    const diag = this.built?.diagnostics;
    const core = this.runtime?.core;
    return {
      mode: this.mode,
      seed: diag?.generatedSeed ?? 0,
      attempts: diag?.attempts ?? 0,
      cells: diag?.cellCount ?? 0,
      core: Math.round(core?.hp ?? 0),
      coverWarning: this.preview?.coverWarning ?? false,
      willHitCore: this.preview?.willHitCore ?? false,
      angle: this.aim.angleDeg,
      power: this.aim.power,
      zoom: Number(this.cameras.main.zoom.toFixed(2)),
      detailed: this.detailed,
      debris: this.demolition ? this.demolition.bodyCount : 0,
      debrisCap: 700,
      impactX: Math.round(this.playback?.result.impact?.x ?? this.cine.impactX),
      impactY: Math.round(this.playback?.result.impact?.y ?? this.cine.impactY),
      slowMo: Number(this.cine.slow.toFixed(2)),
      fps: Math.round(this.game.loop.actualFps),
    };
  }
}


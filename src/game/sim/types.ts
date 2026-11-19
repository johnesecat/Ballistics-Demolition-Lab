import type { AmmoDef, AmmoPhase, AmmoVfx } from '../ammo/types';
import type { MaterialId } from '../materials';
import type { Cell, RelayState, StageDefinition, StageSnapshot } from '../stages/types';
import type { FragmentBody } from './fracture';
import type { WallState } from './walls';

export type FireMode = 'arc' | 'straight';

export interface ShotInput {
  angleDeg: number;
  power: number;
  mode: FireMode;
  ammoId: string;
  choiceId?: string;
}

export interface ProjectileFrame {
  t: number;
  x: number;
  y: number;
  angle: number;
  /** The main shell changes visual scale when a carrier or jacket separates. */
  scale: number;
  visible: boolean;
  /** Squash 0..1 at this frame (destructible body, presentation only). */
  squash?: number;
  /** Layers crossed so far (penetration audit). */
  layers?: number;
}

export interface DamageCellDelta {
  col: number;
  row: number;
  /** null means the cell was removed. */
  hp: number | null;
  material: MaterialId;
  shape: Cell['shape'];
  relayId?: string;
}

export type EffectKind =
  | 'muzzle'
  | 'impact'
  | 'penetrate'
  | 'squash'
  | 'separation'
  | 'jet'
  | 'blast'
  | 'spall'
  | 'crush'
  | 'fragment'
  | 'shock'
  | 'drill'
  | 'tear'
  | 'plug'
  | 'rain'
  | 'bounce'
  | 'debris'
  | 'collapse'
  | 'core-hit'
  | 'core-drop'
  | 'burn-zone'
  | 'burn-end'
  | 'message'
  | 'miss';

export interface EffectEvent {
  t: number;
  kind: EffectKind;
  x: number;
  y: number;
  /** Round family, so the contact effect matches the ammunition fired. */
  family?: AmmoVfx['family'];
  /** World-space angle in radians for directional effects. */
  angle?: number;
  radius?: number;
  length?: number;
  width?: number;
  count?: number;
  material?: MaterialId;
  core?: boolean;
  label?: string;
  phase?: AmmoPhase;
  /** Optional secondary endpoint for fragments/streams. */
  x2?: number;
  y2?: number;
}

export interface WallPhaseRecord {
  /** Replay timestamp (ms) at which this wall state becomes visible. */
  t: number;
  wallState: WallState;
  /** Fragment bodies spawned by the phase that produced this state. */
  bodies: FragmentBody[];
}

export interface DamageEvent {
  t: number;
  /** @deprecated Grid transport retired (P0-10). Kept only for legacy validation paths. */
  cells: DamageCellDelta[];
  /** Wall-object replay: post-phase walls + spawned bodies (authoritative). */
  wallState?: WallState;
  spawnedBodies?: FragmentBody[];
  coreHp?: number;
  coreDropped?: boolean;
  relaysDestroyed?: string[];
  label?: string;
  /** World-space origin of the damaging phase, used for debris impulses. */
  x?: number;
  y?: number;
  /** The cells were removed because their support failed, not by direct damage. */
  collapsed?: boolean;
}

export interface ImpactInfo {
  x: number;
  y: number;
  nx: number;
  ny: number;
  kind: 'cell' | 'core' | 'ground';
  material?: MaterialId;
  col?: number;
  row?: number;
  relayId?: string;
  /** Surface contact location before standoff offset. */
  contactX: number;
  contactY: number;
  /** Wall object hit first (render focus + layer diagnostics). */
  wallId?: string;
}

export interface CoreImpact {
  hit: boolean;
  damage: number;
  destroyed: boolean;
}

export interface ShotResult {
  def: StageDefinition;
  ammo: AmmoDef;
  input: ShotInput;
  phases: AmmoPhase[];
  start: StageSnapshot;
  final: StageSnapshot;
  /** Wall-object replay timeline (authoritative, P0-10). */
  phaseWallStates: WallPhaseRecord[];
  /** All fragment bodies spawned by this shot, with spawn times for replay. */
  bodies: Array<FragmentBody & { spawnT: number }>;
  frames: ProjectileFrame[];
  effects: EffectEvent[];
  damageEvents: DamageEvent[];
  firstContact: ImpactInfo | null;
  impact: ImpactInfo | null;
  coreDamage: number;
  coreDestroyed: boolean;
  relaysDestroyed: string[];
  cellDamage: number;
  durationMs: number;
  messages: string[];
  tracePath: Array<{ x: number; y: number; t: number }>;
  trajectory: Array<{ x: number; y: number; angle: number }>;
}

export interface PreviewResult {
  samples: Array<{ x: number; y: number; t: number }>;
  frames: ProjectileFrame[];
  firstContact: ImpactInfo | null;
  impact: ImpactInfo | null;
  ricochets: number;
  willHitCore: boolean;
  willHitRelay: boolean;
  /** A shot that would have come close to the core but was stopped by cover. */
  coverWarning: boolean;
  estimatedReach: number;
  predictedMaterial: MaterialId | null;
  outOfBounds: boolean;
}

export interface StageSimState {
  grid: StageSnapshot['grid'];
  core: StageSnapshot['core'];
  relays: RelayState[];
}

export function snapshotOf(state: StageSimState): StageSnapshot {
  return {
    grid: state.grid,
    core: state.core,
    relays: state.relays,
  };
}

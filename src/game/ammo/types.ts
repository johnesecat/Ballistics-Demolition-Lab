import type { DamageChannel, MaterialId } from '../materials';

export type AmmoCategory = 'solid' | 'soft' | 'heat' | 'hesh' | 'he' | 'aphe';

export type PhaseKind =
  | 'pierce'
  | 'jet'
  | 'blast'
  | 'spall'
  | 'crush'
  | 'fragment'
  | 'shock'
  | 'drill'
  | 'burn'
  | 'plug'
  | 'tear'
  | 'rain';

export type PhaseDirection = 'inward' | 'forward' | 'down' | 'up' | 'sideL' | 'sideR';

export interface AmmoPhase {
  kind: PhaseKind;
  channel: DamageChannel;
  damage: number;
  /** Milliseconds after first contact. */
  at?: number;
  /** Jet/pierce travel distance in world pixels. */
  distance?: number;
  /** Carve / crush width in world pixels. */
  width?: number;
  /** Radial damage radius in world pixels. */
  radius?: number;
  /** Number of parallel rays for jets/tears/fragments. */
  rays?: number;
  /** Total fan angle for multi-ray phases, in degrees. */
  spreadDeg?: number;
  /** Direction relative to the surface. `inward` is the default for jets. */
  dir?: PhaseDirection;
  /** Additional rotation of the ray in degrees (clockwise positive). */
  angleOffset?: number;
  /** Multiplier applied to a cell before normal material resistance. */
  materialBias?: Partial<Record<MaterialId, number>>;
  /** Multiplier against the objective core. */
  coreFactor?: number;
  /** Burn phases: how long the patch remains active. Meltdown is exactly 2000. */
  durationMs?: number;
  /** Number of internal pulses for a repeated effect. */
  count?: number;
  /** Spacing between internal pulses in milliseconds. */
  interval?: number;
  /** A short human-readable label used by the replay effect captions. */
  label?: string;
  /** Push strength passed to the debris/VFX layer. */
  force?: number;
  /** Per-phase compressive tolerance against slanted faces, 0..1. */
  angleTolerance?: number;
}

export interface AmmoChoiceOption {
  id: string;
  label: string;
  hint: string;
}

export interface AmmoChoice {
  key: 'jetPath' | 'fuse' | 'charge';
  label: string;
  defaultOption: string;
  options: AmmoChoiceOption[];
}

export interface AmmoFlight {
  /** Multiplier on the power-derived launch speed. */
  speedScale: number;
  /** Collision radius in world pixels. */
  radius: number;
  /** Exponential air drag (per second). */
  drag: number;
  mass: number;
  /** Number of permitted non-destructive ricochets. Bankshot is the specialist. */
  ricochet?: number;
  /** Visual separator: a carrier/pod breaks away before impact. */
  separation?: 'carrier' | 'petals' | 'pellets' | 'pods' | 'streams';
  /** Burst this many pixels before the surface. */
  standoff?: number;
  /** How much a glancing strike preserves penetration. 0..1. */
  angleTolerance?: number;
  /** Visual scale of the pixel round sprite. */
  spriteScale?: number;
  /** Turn rate for the simple trail/fx layer (no homing is used for gameplay). */
  trailColor?: number;
}

export interface AmmoVfx {
  /** Selects the bespoke effect recipe in the presentation layer. */
  family:
    | 'kinetic'
    | 'soft'
    | 'jet'
    | 'hesh'
    | 'he'
    | 'aphe'
    | 'split'
    | 'drill'
    | 'shock'
    | 'burn'
    | 'rain'
    | 'chain'
    | 'popcorn';
  /** Colour of the small in-flight trail. */
  trail: number;
  /** Relative trail length, 0..1. */
  trailLength: number;
  /** Size of the contact flash in world pixels. */
  flash: number;
}

export interface AmmoRatings {
  impact: number;
  blast: number;
  pierce: number;
  control: number;
}

export interface AmmoDef {
  id: string;
  name: string;
  category: AmmoCategory;
  description: string;
  bestFor: string;
  watchFor?: string;
  goodVs: MaterialId[];
  flight: AmmoFlight;
  phases: AmmoPhase[];
  choice?: AmmoChoice;
  /** Replacement phase set for each selectable option. Base phases are unused. */
  choicePhases?: Record<string, AmmoPhase[]>;
  vfx: AmmoVfx;
  ratings: AmmoRatings;
  /** All 59 rounds are field-issued in this build; the field is retained for
   * save-schema growth without showing fake locked cards. */
  availability: 'field';
}

export interface AmmoMeta {
  label: string;
  badge: string;
  color: number;
  css: string;
}

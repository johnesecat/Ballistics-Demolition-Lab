import type { DamageChannel, MaterialId } from '../materials';
import type {
  AmmoCategory,
  AmmoChoice,
  AmmoDef,
  AmmoMeta,
  AmmoPhase,
  AmmoVfx,
  PhaseKind,
} from './types';

/**
 * Original implementation notes:
 * - Card descriptions and Best Used For text are transcribed from the supplied
 *   reference. Mechanics below are a playable interpretation, not recovered
 *   source values.
 * - All damage, penetration, radius and timing numbers are our own tuning.
 * - A phase graph gives each round a distinct sequence of effects. Colour alone
 *   never differentiates ammunition.
 */
export const CATEGORY_META: Record<AmmoCategory, AmmoMeta> = {
  solid: { label: 'Solid', badge: 'SOLID', color: 0x4f7fa7, css: '#4f7fa7' },
  soft: { label: 'Soft', badge: 'SOFT', color: 0xb48759, css: '#b48759' },
  heat: { label: 'HEAT', badge: 'HEAT', color: 0xea7925, css: '#ea7925' },
  hesh: { label: 'HESH', badge: 'HESH', color: 0xcb4ca3, css: '#cb4ca3' },
  he: { label: 'HE', badge: 'HE', color: 0xd13846, css: '#d13846' },
  aphe: { label: 'APHE', badge: 'APHE', color: 0xe5c343, css: '#e5c343' },
};

export const AMMO_CATEGORY_ORDER: readonly AmmoCategory[] = ['solid', 'soft', 'heat', 'hesh', 'he', 'aphe'];

const CHANNELS: Record<PhaseKind, DamageChannel> = {
  pierce: 'kinetic',
  jet: 'jet',
  blast: 'blast',
  spall: 'spall',
  crush: 'crush',
  fragment: 'kinetic',
  shock: 'shock',
  drill: 'kinetic',
  burn: 'heat',
  plug: 'crush',
  tear: 'tear',
  rain: 'jet',
};

type PhaseOptions = Omit<AmmoPhase, 'kind' | 'damage' | 'channel'> & { channel?: DamageChannel };

function phase(kind: PhaseKind, damage: number, options: PhaseOptions = {}): AmmoPhase {
  return { kind, damage, channel: options.channel ?? CHANNELS[kind], ...options };
}

const pierce = (damage: number, distance: number, width: number, extra: PhaseOptions = {}): AmmoPhase =>
  phase('pierce', damage, { distance, width, ...extra });
const jet = (damage: number, distance: number, width: number, extra: PhaseOptions = {}): AmmoPhase =>
  phase('jet', damage, { distance, width, ...extra });
const blast = (damage: number, radius: number, extra: PhaseOptions = {}): AmmoPhase =>
  phase('blast', damage, { radius, ...extra });
const spall = (damage: number, distance: number, width: number, extra: PhaseOptions = {}): AmmoPhase =>
  phase('spall', damage, { distance, width, ...extra });
const crush = (damage: number, radius: number, extra: PhaseOptions = {}): AmmoPhase =>
  phase('crush', damage, { radius, ...extra });
const shock = (damage: number, radius: number, extra: PhaseOptions = {}): AmmoPhase =>
  phase('shock', damage, { radius, ...extra });
const fragment = (damage: number, rays: number, spreadDeg: number, distance: number, extra: PhaseOptions = {}): AmmoPhase =>
  phase('fragment', damage, { rays, spreadDeg, distance, ...extra });
const burn = (damage: number, radius: number, durationMs: number, extra: PhaseOptions = {}): AmmoPhase =>
  phase('burn', damage, { radius, durationMs, ...extra });

const flight = (overrides: Partial<AmmoDef['flight']> = {}): AmmoDef['flight'] => ({
  speedScale: 1,
  radius: 3,
  drag: 0.03,
  mass: 1,
  angleTolerance: 0.25,
  ...overrides,
});

const vfx = (family: AmmoVfx['family'], trail: number, trailLength: number, flash: number): AmmoVfx => ({
  family,
  trail,
  trailLength,
  flash,
});

interface DefSeed {
  id: string;
  name: string;
  category: AmmoCategory;
  description: string;
  bestFor: string;
  watchFor?: string;
  goodVs: MaterialId[];
  flight?: Partial<AmmoDef['flight']>;
  phases: AmmoPhase[];
  choice?: AmmoChoice;
  choicePhases?: Record<string, AmmoPhase[]>;
  vfx: AmmoVfx;
  ratings: AmmoDef['ratings'];
}

function define(seed: DefSeed): AmmoDef {
  return {
    id: seed.id,
    name: seed.name,
    category: seed.category,
    description: seed.description,
    bestFor: seed.bestFor,
    watchFor: seed.watchFor,
    goodVs: seed.goodVs,
    flight: flight(seed.flight ?? {}),
    phases: seed.phases,
    choice: seed.choice,
    choicePhases: seed.choicePhases,
    vfx: seed.vfx,
    ratings: seed.ratings,
    availability: 'field',
  };
}

const steelBias = { steel: 1.22, armor: 0.86 } as const;
const brickBias = { brick: 1.4, wood: 1.2, concrete: 0.9 } as const;
const woodBias = { wood: 1.45, brick: 1.05 } as const;
const armorBias = { armor: 1.25, steel: 0.92 } as const;

const cornerJetChoice: AmmoChoice = {
  key: 'jetPath',
  label: 'JET PATH',
  defaultOption: 'high',
  options: [
    { id: 'high', label: 'HIGH', hint: 'Jet rises into an offset interior target' },
    { id: 'low', label: 'LOW', hint: 'Jet drops into a lower interior target' },
  ],
};

const fuseChoice: AmmoChoice = {
  key: 'fuse',
  label: 'FUSE',
  defaultOption: 'delay',
  options: [
    { id: 'quick', label: 'QUICK', hint: 'Burst on the face' },
    { id: 'delay', label: 'DELAYED', hint: 'Punch in, then burst' },
  ],
};

const chargeChoice: AmmoChoice = {
  key: 'charge',
  label: 'CHARGE',
  defaultOption: 'armor',
  options: [
    { id: 'armor', label: 'ARMOR', hint: 'Delayed focused jet' },
    { id: 'building', label: 'BUILDING', hint: 'Quick wide blast' },
  ],
};

export const AMMO: readonly AmmoDef[] = [
  // ── SOLID ──────────────────────────────────────────────────────────────
  define({
    id: 'ap-solid-shot',
    name: 'AP Solid Shot',
    category: 'solid',
    description: 'A pointed steel core digs into armor while the softer copper body spreads.',
    bestFor: 'Wood and brick. Small weak points in steel.',
    watchFor: 'Little broad destruction.',
    goodVs: ['wood', 'brick', 'steel'],
    flight: { speedScale: 1.12, radius: 2.5, drag: 0.012, mass: 1.15 },
    phases: [pierce(48, 54, 4, { angleTolerance: 0.15, coreFactor: 0.85, label: 'CORE PUNCH' })],
    vfx: vfx('kinetic', 0xb7d4e9, 0.42, 15),
    ratings: { impact: 4, blast: 1, pierce: 3, control: 4 },
  }),
  define({
    id: 'apc-capped',
    name: 'APC Capped',
    category: 'solid',
    description: 'A soft copper cap cushions the first hit before the steel core digs in.',
    bestFor: 'Angled thin plates, shots at a slant.',
    goodVs: ['steel', 'slopes', 'armor'],
    flight: { speedScale: 1.08, radius: 2.7, drag: 0.018, mass: 1.12 },
    phases: [pierce(47, 58, 5, { angleTolerance: 0.68, coreFactor: 0.85, label: 'CAPPED STRIKE' })],
    vfx: vfx('kinetic', 0xb4cadc, 0.4, 15),
    ratings: { impact: 4, blast: 1, pierce: 3, control: 4 },
  }),
  define({
    id: 'apbc-ballistic-cap',
    name: 'APBC Ballistic Cap',
    category: 'solid',
    description: 'A hollow nose cover helps the round fly, then crumples on impact.',
    bestFor: 'Long, shallow arcs. Small distant openings.',
    goodVs: ['steel', 'armor', 'brick'],
    flight: { speedScale: 1.16, radius: 2.5, drag: 0.006, mass: 1.06, angleTolerance: 0.34 },
    phases: [pierce(45, 64, 4, { angleTolerance: 0.34, coreFactor: 0.82, label: 'LONG SHOT' })],
    vfx: vfx('kinetic', 0xa9d3e7, 0.35, 14),
    ratings: { impact: 4, blast: 1, pierce: 4, control: 5 },
  }),
  define({
    id: 'apcbc-combined-caps',
    name: 'APCBC Combined Caps',
    category: 'solid',
    description: 'Two soft caps protect the core as it strikes angled armor.',
    bestFor: 'Angled steel, longer flight.',
    goodVs: ['steel', 'slopes', 'armor'],
    flight: { speedScale: 1.11, radius: 2.6, drag: 0.011, mass: 1.13, angleTolerance: 0.8 },
    phases: [pierce(55, 62, 5, { angleTolerance: 0.8, coreFactor: 0.9, label: 'ANGLED DRIVE' })],
    vfx: vfx('kinetic', 0xc4dbef, 0.43, 16),
    ratings: { impact: 5, blast: 1, pierce: 4, control: 4 },
  }),
  define({
    id: 'apcr-round',
    name: 'APCR Round',
    category: 'solid',
    description: 'A small steel core digs into armor while its copper jacket mushrooms.',
    bestFor: 'Ordinary steel, concentrated digging.',
    goodVs: ['steel', 'armor'],
    flight: { speedScale: 1.2, radius: 2.3, drag: 0.016, mass: 0.95 },
    phases: [
      pierce(63, 48, 3, { materialBias: steelBias, coreFactor: 0.88, label: 'HARD CORE' }),
      crush(9, 9, { at: 45, force: 0.5 }),
    ],
    vfx: vfx('kinetic', 0xd7ecf6, 0.5, 17),
    ratings: { impact: 4, blast: 1, pierce: 5, control: 4 },
  }),
  define({
    id: 'apds-sabot',
    name: 'APDS Sabot',
    category: 'solid',
    description: 'The outer carrier falls away, leaving a slim core that wears down as it pierces armor.',
    bestFor: 'Small gaps, concentrated metal contact.',
    goodVs: ['steel', 'armor', 'slopes'],
    flight: { speedScale: 1.25, radius: 2, drag: 0.008, mass: 0.82, separation: 'carrier', angleTolerance: 0.5, spriteScale: 1.05 },
    phases: [pierce(72, 56, 3, { materialBias: steelBias, coreFactor: 0.92, label: 'SABOT CORE' })],
    vfx: vfx('split', 0xb9def2, 0.55, 16),
    ratings: { impact: 5, blast: 1, pierce: 5, control: 4 },
  }),
  define({
    id: 'finned-dart',
    name: 'Finned Dart',
    category: 'solid',
    description: 'A long finned dart pierces small weak points, losing material from its tip as it pushes through.',
    bestFor: 'Thin armor and seams, small exposed weak points.',
    goodVs: ['armor', 'steel', 'slopes'],
    flight: { speedScale: 1.28, radius: 1.8, drag: 0.014, mass: 0.76, angleTolerance: 0.52, spriteScale: 1.08 },
    phases: [
      pierce(66, 62, 3, { materialBias: armorBias, angleTolerance: 0.58, coreFactor: 0.9, label: 'DART PIERCE' }),
      pierce(15, 15, 2, { at: 90, label: 'TIP WEAR' }),
    ],
    vfx: vfx('kinetic', 0xc6ecf3, 0.58, 12),
    ratings: { impact: 4, blast: 1, pierce: 5, control: 5 },
  }),
  define({
    id: 'ap-breaker',
    name: 'AP Breaker',
    category: 'solid',
    description: 'A short core and wide body crack brick and tear thin panels.',
    bestFor: 'Brick, displacing thin panels.',
    goodVs: ['brick', 'concrete', 'steel'],
    flight: { speedScale: 1.02, radius: 3.4, drag: 0.026, mass: 1.3 },
    phases: [
      pierce(38, 38, 13, { materialBias: brickBias, label: 'BREAKER' }),
      crush(13, 19, { at: 30, materialBias: brickBias, force: 0.8 }),
    ],
    vfx: vfx('kinetic', 0xd9c6a2, 0.38, 19),
    ratings: { impact: 3, blast: 2, pierce: 2, control: 3 },
  }),
  define({
    id: 'wedge',
    name: 'Wedge',
    category: 'solid',
    description: 'A wide wedge tears thin plates along a broad seam.',
    bestFor: 'Thin angled sheet, existing seams.',
    goodVs: ['steel', 'slopes', 'armor'],
    flight: { speedScale: 0.98, radius: 3.2, drag: 0.03, mass: 1.35 },
    phases: [
      phase('tear', 44, { rays: 2, spreadDeg: 14, distance: 38, angleOffset: 0, materialBias: { steel: 1.15, slopes: 1.25 }, label: 'SEAM WEDGE' }),
      crush(9, 16, { at: 35 }),
    ],
    vfx: vfx('kinetic', 0xb9c6cb, 0.34, 18),
    ratings: { impact: 3, blast: 1, pierce: 3, control: 3 },
  }),
  define({
    id: 'pele-sidewinder',
    name: 'PELE Sidewinder',
    category: 'solid',
    description: 'The shell splits sideways on impact, sending fragments into nearby surfaces.',
    bestFor: 'Thin face plates, nearby backing and side walls.',
    goodVs: ['steel', 'slopes', 'brick'],
    flight: { speedScale: 1.06, radius: 2.8, drag: 0.022, mass: 1.05, separation: 'pellets' },
    phases: [
      pierce(29, 28, 5, { label: 'FACE PIERCE' }),
      fragment(16, 8, 142, 24, { at: 35, label: 'SIDEWAYS FRAGMENTS' }),
    ],
    vfx: vfx('split', 0xc3dae4, 0.4, 16),
    ratings: { impact: 3, blast: 2, pierce: 3, control: 4 },
  }),
  define({
    id: 'bankshot',
    name: 'Bankshot',
    category: 'solid',
    description: 'Can bounce off an angled surface, losing speed after the bounce.',
    bestFor: 'Angled surfaces, creative banked shots.',
    goodVs: ['slopes', 'steel', 'armor'],
    flight: { speedScale: 1.04, radius: 2.8, drag: 0.025, mass: 1, ricochet: 2, angleTolerance: 0.9 },
    phases: [pierce(32, 36, 4, { angleTolerance: 0.9, label: 'AFTER THE BOUNCE' })],
    vfx: vfx('kinetic', 0xcbd3d8, 0.44, 13),
    ratings: { impact: 3, blast: 1, pierce: 2, control: 5 },
  }),
  define({
    id: 'drillhead',
    name: 'Drillhead',
    category: 'solid',
    description: 'A spinning drill tip keeps boring after impact in four short pushes.',
    bestFor: 'Thick steel plates, digging toward a buried core.',
    goodVs: ['steel', 'armor', 'concrete'],
    flight: { speedScale: 1.08, radius: 2.8, drag: 0.02, mass: 1.2 },
    phases: [0, 1, 2, 3].map((index) =>
      phase('drill', 19, {
        at: index * 95,
        distance: 18,
        width: 10,
        materialBias: steelBias,
        label: index === 3 ? 'FOURTH PUSH' : `BORE ${index + 1}`,
      }),
    ),
    vfx: vfx('drill', 0xc1d6df, 0.32, 14),
    ratings: { impact: 4, blast: 1, pierce: 5, control: 3 },
  }),

  // ── SOFT ───────────────────────────────────────────────────────────────
  define({
    id: 'soft-nose',
    name: 'Soft Nose',
    category: 'soft',
    description: 'Squashes flat, locks rock-hard and slams like a hammer: folds thin steel and crushes the core behind it.',
    bestFor: 'Crushes the core even on off-center hits. Folds and rips thin steel.',
    goodVs: ['steel', 'armor', 'brick'],
    flight: { speedScale: 1.02, radius: 3.8, drag: 0.03, mass: 1.25 },
    phases: [
      crush(59, 27, { materialBias: { steel: 1.32, armor: 0.8 }, force: 1.2, label: 'PAD LOCK' }),
      phase('plug', 18, { distance: 20, width: 22, at: 50, label: 'HAMMER THROUGH' }),
    ],
    vfx: vfx('soft', 0xd4a06c, 0.3, 21),
    ratings: { impact: 4, blast: 2, pierce: 2, control: 4 },
  }),
  define({
    id: 'pancake',
    name: 'Pancake',
    category: 'soft',
    description: 'Flattens into a giant pad that folds whole panels and crushes whatever is right behind them.',
    bestFor: 'Cores pressed close behind a wall. Widest crush, easiest to land.',
    goodVs: ['steel', 'armor', 'brick'],
    flight: { speedScale: 0.96, radius: 4.5, drag: 0.038, mass: 1.4 },
    phases: [
      crush(55, 43, { coreFactor: 1.28, materialBias: { steel: 1.2, brick: 0.9 }, force: 1.5, label: 'BROADEST CRUSH' }),
      phase('plug', 15, { distance: 22, width: 32, at: 70, coreFactor: 1.15 }),
    ],
    vfx: vfx('soft', 0xd9a26b, 0.26, 25),
    ratings: { impact: 4, blast: 2, pierce: 1, control: 5 },
  }),
  define({
    id: 'petal',
    name: 'Petal',
    category: 'soft',
    description: 'Splits into four hard petals that rip thin walls into strips and open a clean hole for your next shot.',
    bestFor: 'Rips thin steel into strips. Clears the way for your next shot.',
    goodVs: ['steel', 'brick', 'armor'],
    flight: { speedScale: 1.0, radius: 3.3, drag: 0.028, mass: 1.1, separation: 'petals' },
    phases: [
      phase('tear', 29, { rays: 4, spreadDeg: 100, distance: 31, materialBias: { steel: 1.15, slopes: 1.1 }, label: 'FOUR PETALS' }),
      crush(11, 15, { at: 45, materialBias: { steel: 1.2 } }),
    ],
    vfx: vfx('split', 0xdfa26d, 0.36, 18),
    ratings: { impact: 3, blast: 2, pierce: 2, control: 4 },
  }),
  define({
    id: 'bonded-mushroom',
    name: 'Bonded Mushroom',
    category: 'soft',
    description: 'A steel backing keeps the pad driving and punches a wall across the gap into what’s behind it.',
    bestFor: 'Cores a short gap behind thin steel. Keeps pushing after the hit.',
    goodVs: ['steel', 'brick', 'concrete'],
    flight: { speedScale: 1.03, radius: 4, drag: 0.03, mass: 1.5 },
    phases: [
      phase('plug', 42, { distance: 37, width: 23, materialBias: { steel: 1.25 }, force: 1.6, label: 'WALL PLUG' }),
      crush(27, 19, { at: 65, label: 'BACKING DRIVE' }),
      pierce(12, 17, 7, { at: 110, label: 'PLUG IMPACT' }),
    ],
    vfx: vfx('soft', 0xd6a26b, 0.33, 22),
    ratings: { impact: 4, blast: 2, pierce: 2, control: 4 },
  }),
  define({
    id: 'crusher',
    name: 'Crusher',
    category: 'soft',
    description: 'Turns rock-hard the moment it hits brick, wood or glass and plows straight through to what’s behind.',
    bestFor: 'Thick brick and wood. Cores hidden behind brick.',
    goodVs: ['brick', 'wood', 'concrete'],
    flight: { speedScale: 0.98, radius: 4, drag: 0.034, mass: 1.55 },
    phases: [
      phase('plug', 39, { distance: 35, width: 21, materialBias: woodBias, force: 1.65, label: 'ROCK-HARD PAD' }),
      crush(23, 20, { at: 40, materialBias: { brick: 1.4, wood: 1.45 }, label: 'THROUGH THE BRICK' }),
    ],
    vfx: vfx('soft', 0xd3a270, 0.3, 23),
    ratings: { impact: 4, blast: 2, pierce: 2, control: 4 },
  }),
  define({
    id: 'heavy-soft-shot',
    name: 'Heavy Soft Shot',
    category: 'soft',
    description: 'The heaviest soft pad. It buckles steel beams, pillars and floors until the whole frame sags.',
    bestFor: 'Steel frames, floors and pillars. Bends frames more than any other pad.',
    goodVs: ['steel', 'armor', 'concrete'],
    flight: { speedScale: 0.9, radius: 4.6, drag: 0.042, mass: 2.1 },
    phases: [
      crush(48, 35, { materialBias: { steel: 1.1, concrete: 1.2 }, force: 2.2, label: 'FRAME BEND' }),
      shock(14, 62, { at: 50, force: 1.5, label: 'WHOLE FRAME SAGS' }),
    ],
    vfx: vfx('soft', 0xd29d69, 0.27, 25),
    ratings: { impact: 4, blast: 2, pierce: 1, control: 3 },
  }),
  define({
    id: 'cuff',
    name: 'Cuff',
    category: 'soft',
    description: 'A copper cuff keeps the nose solid as it locks into a hard pad.',
    bestFor: 'Thin steel walls, off-center hits.',
    goodVs: ['steel', 'brick', 'slopes'],
    flight: { speedScale: 1.03, radius: 3.6, drag: 0.028, mass: 1.25 },
    phases: [
      crush(51, 23, { materialBias: { steel: 1.18, slopes: 1.15 }, force: 1.1, label: 'CUFF LOCK' }),
      pierce(13, 16, 9, { at: 45, label: 'SOLID NOSE' }),
    ],
    vfx: vfx('soft', 0xd1a06e, 0.32, 20),
    ratings: { impact: 4, blast: 1, pierce: 2, control: 5 },
  }),
  define({
    id: 'splitter',
    name: 'Splitter',
    category: 'soft',
    description: 'Pops open just before impact into four soft pellets that sweep a wide area. Too small to crush metal.',
    bestFor: 'Shreds brick, wood and light cover; several weak spots at once.',
    goodVs: ['brick', 'wood', 'concrete'],
    flight: { speedScale: 1.06, radius: 3.4, drag: 0.025, mass: 1.05, separation: 'pellets', standoff: 17 },
    phases: [0, 1, 2, 3].map((index) =>
      crush(22, 15, {
        at: 35 + index * 55,
        angleOffset: -42 + index * 28,
        distance: 8 + index * 4,
        materialBias: { brick: 1.4, wood: 1.45, steel: 0.55, armor: 0.45 },
        label: `PELLET ${index + 1}`,
      }),
    ),
    vfx: vfx('split', 0xd2a270, 0.3, 14),
    ratings: { impact: 3, blast: 3, pierce: 1, control: 4 },
  }),
  define({
    id: 'anvil',
    name: 'Anvil',
    category: 'soft',
    description: 'A super heavy block. Drop it high to smash roofs and supports. Its face crumples on armored steel.',
    bestFor: 'Roofs and supports from above, shoving whole walls.',
    goodVs: ['wood', 'brick', 'concrete'],
    flight: { speedScale: 0.74, radius: 5.2, drag: 0.045, mass: 2.8, angleTolerance: 0.7 },
    phases: [
      crush(72, 40, { coreFactor: 0.85, materialBias: { wood: 1.35, brick: 1.25, armor: 0.72 }, force: 2.8, label: 'DEAD WEIGHT' }),
      shock(17, 58, { at: 60, force: 2.1, label: 'SUPPORT SHOCK' }),
      crush(14, 21, { at: 130, coreFactor: 0.7, materialBias: { armor: 0.65 }, label: 'FACE CRUMPLES' }),
    ],
    vfx: vfx('soft', 0xc59566, 0.2, 29),
    ratings: { impact: 5, blast: 2, pierce: 1, control: 2 },
  }),

  // ── HEAT ───────────────────────────────────────────────────────────────
  define({
    id: 'heat-round',
    name: 'HEAT Round',
    category: 'heat',
    description: 'An explosion forms a narrow copper jet that cuts into armor.',
    bestFor: 'Steel with backing, mixed metal and brick.',
    goodVs: ['steel', 'brick', 'armor'],
    flight: { speedScale: 0.98, radius: 3.4, drag: 0.026, mass: 1.15 },
    phases: [
      jet(82, 65, 6, { angleTolerance: 0.56, label: 'COPPER JET' }),
      blast(17, 13, { at: 35, label: 'SHAPED BLAST' }),
    ],
    vfx: vfx('jet', 0xff8b3d, 0.45, 20),
    ratings: { impact: 4, blast: 2, pierce: 4, control: 4 },
  }),
  define({
    id: 'double-jet',
    name: 'Double Jet',
    category: 'heat',
    description: 'Two copper jets cut separate paths through the target.',
    bestFor: 'Thin panels, exposed light backing.',
    goodVs: ['steel', 'armor', 'concrete'],
    flight: { speedScale: 1.0, radius: 3.4, drag: 0.025, mass: 1.12 },
    phases: [
      jet(48, 53, 5, { rays: 2, spreadDeg: 14, angleTolerance: 0.5, label: 'TWIN JETS' }),
      blast(12, 12, { at: 50 }),
    ],
    vfx: vfx('jet', 0xffa04c, 0.47, 19),
    ratings: { impact: 3, blast: 2, pierce: 4, control: 4 },
  }),
  define({
    id: 'wide-jet',
    name: 'Wide Jet',
    category: 'heat',
    description: 'A wide copper jet cuts a broader, shallower hole.',
    bestFor: 'Thin steel, preparing a larger opening.',
    goodVs: ['steel', 'brick', 'concrete'],
    flight: { speedScale: 0.97, radius: 3.7, drag: 0.027, mass: 1.2 },
    phases: [jet(63, 38, 21, { angleTolerance: 0.62, label: 'BROAD JET' }), blast(15, 17, { at: 40 })],
    vfx: vfx('jet', 0xff9b45, 0.4, 22),
    ratings: { impact: 3, blast: 2, pierce: 3, control: 4 },
  }),
  define({
    id: 'crossfire',
    name: 'Crossfire',
    category: 'heat',
    description: 'A copper jet pierces light armor while a wider blast breaks nearby cover.',
    bestFor: 'Brick beside steel, exposed loose debris.',
    goodVs: ['steel', 'brick', 'slopes'],
    flight: { speedScale: 0.99, radius: 3.6, drag: 0.026, mass: 1.24 },
    phases: [
      jet(57, 48, 7, { label: 'PIERCING JET' }),
      blast(34, 29, { at: 45, materialBias: brickBias, label: 'NEARBY COVER BLAST' }),
    ],
    vfx: vfx('jet', 0xff7b36, 0.43, 24),
    ratings: { impact: 4, blast: 3, pierce: 3, control: 3 },
  }),
  define({
    id: 'sabot-heat',
    name: 'Sabot HEAT',
    category: 'heat',
    description: 'The carrier falls away, leaving a small finned round that fires a copper jet on impact.',
    bestFor: 'Small distant openings, lower curved approaches.',
    goodVs: ['steel', 'armor', 'slopes'],
    flight: { speedScale: 1.17, radius: 2.5, drag: 0.014, mass: 0.9, separation: 'carrier', angleTolerance: 0.62, spriteScale: 1.04 },
    phases: [jet(78, 55, 5, { angleTolerance: 0.62, label: 'SABOT JET' }), blast(11, 11, { at: 35 })],
    vfx: vfx('split', 0xffa44d, 0.5, 17),
    ratings: { impact: 4, blast: 1, pierce: 5, control: 4 },
  }),
  define({
    id: 'double-strike',
    name: 'Double Strike',
    category: 'heat',
    description: 'Fires a small copper jet, then a stronger one along the same path.',
    bestFor: 'Reactive face tiles, layered cover.',
    goodVs: ['steel', 'armor', 'brick'],
    flight: { speedScale: 0.99, radius: 3.5, drag: 0.026, mass: 1.18 },
    phases: [
      jet(39, 40, 6, { label: 'FIRST JET' }),
      jet(61, 57, 6, { at: 150, label: 'SECOND JET' }),
      blast(12, 12, { at: 190 }),
    ],
    vfx: vfx('jet', 0xff8f3d, 0.44, 21),
    ratings: { impact: 4, blast: 2, pierce: 4, control: 4 },
  }),
  define({
    id: 'cornerjet',
    name: 'Cornerjet',
    category: 'heat',
    description: 'Fires its copper jet at an angle. Choose the direction before shooting.',
    bestFor: 'Oblique surfaces, offset interior targets.',
    goodVs: ['steel', 'brick', 'armor'],
    flight: { speedScale: 0.98, radius: 3.5, drag: 0.026, mass: 1.15 },
    phases: [],
    choice: cornerJetChoice,
    choicePhases: {
      high: [jet(74, 48, 6, { angleOffset: -36, label: 'HIGH JET' }), blast(12, 12, { at: 50 })],
      low: [jet(74, 48, 6, { angleOffset: 36, label: 'LOW JET' }), blast(12, 12, { at: 50 })],
    },
    vfx: vfx('jet', 0xff9d45, 0.42, 20),
    ratings: { impact: 4, blast: 2, pierce: 3, control: 3 },
  }),
  define({
    id: 'forkjet',
    name: 'Forkjet',
    category: 'heat',
    description: 'Two copper jets spread apart to hit separate areas.',
    bestFor: 'Nearby separated targets, thin layered protection.',
    goodVs: ['steel', 'brick', 'concrete'],
    flight: { speedScale: 1.0, radius: 3.5, drag: 0.025, mass: 1.14 },
    phases: [
      jet(46, 43, 5, { rays: 2, spreadDeg: 44, label: 'FORKED JETS' }),
      blast(10, 11, { at: 45 }),
    ],
    vfx: vfx('jet', 0xffa24a, 0.43, 20),
    ratings: { impact: 3, blast: 2, pierce: 3, control: 3 },
  }),
  define({
    id: 'roofbreaker',
    name: 'Roofbreaker',
    category: 'heat',
    description: 'Bursts above and fires a copper jet downward. Use a high arc.',
    bestFor: 'Top armor, targets behind front shields.',
    goodVs: ['armor', 'steel', 'concrete'],
    flight: { speedScale: 0.94, radius: 3.7, drag: 0.03, mass: 1.3, standoff: 19 },
    phases: [
      jet(76, 62, 7, { dir: 'down', angleOffset: 0, label: 'DOWNWARD JET' }),
      blast(20, 20, { at: 35, label: 'ABOVE-BURST' }),
    ],
    vfx: vfx('jet', 0xff8640, 0.39, 26),
    ratings: { impact: 4, blast: 2, pierce: 4, control: 3 },
  }),
  define({
    id: 'needle-jet',
    name: 'Needle Jet',
    category: 'heat',
    description: 'A deep copper cone shoots a very long, thin jet with almost no blast.',
    bestFor: 'Several plates in a row, cores far behind cover.',
    goodVs: ['steel', 'armor', 'concrete'],
    flight: { speedScale: 1.09, radius: 2.6, drag: 0.016, mass: 0.95 },
    phases: [jet(70, 111, 3, { label: 'NEEDLE JET' })],
    vfx: vfx('jet', 0xc7fbff, 0.52, 12),
    ratings: { impact: 4, blast: 1, pierce: 5, control: 5 },
  }),

  // ── HESH ───────────────────────────────────────────────────────────────
  define({
    id: 'hesh-round',
    name: 'HESH Round',
    category: 'hesh',
    description: 'The nose flattens, then explodes to break fragments off the back of armor.',
    bestFor: 'Armor with an open space behind it, brick and thin metal.',
    goodVs: ['armor', 'brick', 'steel'],
    flight: { speedScale: 0.95, radius: 4, drag: 0.032, mass: 1.45 },
    phases: [
      crush(15, 18, { at: 0, label: 'NOSE FLATTENS' }),
      spall(54, 36, 17, { at: 65, label: 'REAR-FACE SPALL' }),
      phase('fragment', 9, { rays: 5, spreadDeg: 100, distance: 15, at: 95 }),
    ],
    vfx: vfx('hesh', 0xe071c0, 0.34, 23),
    ratings: { impact: 4, blast: 2, pierce: 2, control: 4 },
  }),
  define({
    id: 'broadhead',
    name: 'Broadhead',
    category: 'hesh',
    description: 'A wide, flat charge breaks a broad, shallow layer off the armor.',
    bestFor: 'Thin steel sheets, wide exposed backing.',
    goodVs: ['steel', 'armor', 'concrete'],
    flight: { speedScale: 0.94, radius: 4.4, drag: 0.034, mass: 1.5 },
    phases: [
      crush(13, 24, { label: 'WIDE FLAT CHARGE' }),
      spall(57, 24, 28, { at: 55, label: 'BROAD SPALL' }),
    ],
    vfx: vfx('hesh', 0xe37cc7, 0.3, 25),
    ratings: { impact: 4, blast: 3, pierce: 2, control: 4 },
  }),
  define({
    id: 'scab-lifter',
    name: 'Scab Lifter',
    category: 'hesh',
    description: 'Throws more fragments from the back of damaged armor.',
    bestFor: 'Exposed crates behind plates, fragment coverage.',
    goodVs: ['armor', 'steel', 'brick'],
    flight: { speedScale: 0.97, radius: 3.8, drag: 0.032, mass: 1.36 },
    phases: [
      spall(60, 38, 20, { label: 'SCAB LIFT' }),
      phase('fragment', 7, { rays: 8, spreadDeg: 126, distance: 24, at: 75, label: 'SCAB FRAGMENTS' }),
    ],
    vfx: vfx('hesh', 0xdc6bbc, 0.37, 23),
    ratings: { impact: 4, blast: 2, pierce: 2, control: 4 },
  }),
  define({
    id: 'shock',
    name: 'Shock',
    category: 'hesh',
    description: 'A concentrated blast bends metal and pushes loose pieces.',
    bestFor: 'Loose steel, compact plate displacement.',
    goodVs: ['steel', 'armor', 'slopes'],
    flight: { speedScale: 1.0, radius: 3.8, drag: 0.03, mass: 1.45 },
    phases: [
      crush(24, 25, { materialBias: { steel: 1.2 }, force: 2.1, label: 'CONCENTRATED SHOCK' }),
      shock(20, 49, { at: 40, force: 1.8, label: 'METAL BENDS' }),
    ],
    vfx: vfx('shock', 0xe377c7, 0.32, 23),
    ratings: { impact: 3, blast: 3, pierce: 1, control: 4 },
  }),
  define({
    id: 'hesh-demolition',
    name: 'HESH Demolition',
    category: 'hesh',
    description: 'A wide blast breaks brick and damages the surface around armor.',
    bestFor: 'Brick, surface breakup around plates.',
    goodVs: ['brick', 'armor', 'concrete'],
    flight: { speedScale: 0.91, radius: 4.5, drag: 0.038, mass: 1.7 },
    phases: [
      crush(17, 25, { label: 'FACE CHARGE' }),
      spall(36, 29, 21, { at: 55, label: 'SPALL' }),
      blast(36, 28, { at: 70, materialBias: brickBias, label: 'SURFACE BREAKUP' }),
    ],
    vfx: vfx('hesh', 0xe36d8d, 0.26, 28),
    ratings: { impact: 4, blast: 4, pierce: 2, control: 3 },
  }),
  define({
    id: 'ribbon-hesh',
    name: 'Ribbon HESH',
    category: 'hesh',
    description: 'A wide, flat charge breaks fragments from a broad area behind the armor.',
    bestFor: 'Broad thin metal, rear-face fragment release.',
    goodVs: ['steel', 'armor', 'concrete'],
    flight: { speedScale: 0.94, radius: 4.4, drag: 0.035, mass: 1.55 },
    phases: [
      crush(12, 29, { label: 'RIBBON CHARGE' }),
      spall(57, 18, 38, { at: 65, label: 'BROAD REAR SPALL' }),
    ],
    vfx: vfx('hesh', 0xe37bd0, 0.33, 27),
    ratings: { impact: 4, blast: 3, pierce: 2, control: 4 },
  }),
  define({
    id: 'echo-hesh',
    name: 'Echo HESH',
    category: 'hesh',
    description: 'Two blasts hit the same patch of armor, one after the other.',
    bestFor: 'Already stressed plates, layered rear surfaces.',
    goodVs: ['armor', 'steel', 'slopes'],
    flight: { speedScale: 0.96, radius: 4, drag: 0.033, mass: 1.45 },
    phases: [
      spall(33, 26, 21, { label: 'FIRST BLOW' }),
      spall(36, 30, 22, { at: 175, label: 'ECHO BLOW' }),
      shock(8, 20, { at: 205 }),
    ],
    vfx: vfx('hesh', 0xe57fd4, 0.38, 24),
    ratings: { impact: 4, blast: 2, pierce: 2, control: 3 },
  }),
  define({
    id: 'quake',
    name: 'Quake',
    category: 'hesh',
    description: 'Flattens, then sends a wide shock ring that shakes loose bricks and supports.',
    bestFor: 'Brick walls and pillars, shaking loose roof supports.',
    goodVs: ['brick', 'concrete', 'wood'],
    flight: { speedScale: 0.9, radius: 4.6, drag: 0.04, mass: 1.8 },
    phases: [
      crush(19, 27, { force: 1.6, label: 'FLATTEN' }),
      shock(29, 79, { at: 90, force: 2.2, label: 'QUAKE RING' }),
      crush(13, 37, { at: 150, materialBias: brickBias, label: 'LOOSE BRICKS' }),
    ],
    vfx: vfx('shock', 0xd67fc4, 0.26, 31),
    ratings: { impact: 3, blast: 4, pierce: 1, control: 3 },
  }),

  // ── HE ─────────────────────────────────────────────────────────────────
  define({
    id: 'he-blast',
    name: 'HE Blast',
    category: 'he',
    description: 'Explodes on impact, blasting nearby material apart.',
    bestFor: 'Brick and wood, exposed loose pieces.',
    goodVs: ['brick', 'wood', 'concrete'],
    flight: { speedScale: 0.98, radius: 4, drag: 0.03, mass: 1.35 },
    phases: [blast(57, 32, { materialBias: brickBias, label: 'HE BLAST' })],
    vfx: vfx('he', 0xff6b4f, 0.3, 29),
    ratings: { impact: 4, blast: 4, pierce: 1, control: 3 },
  }),
  define({
    id: 'he-demolition',
    name: 'HE Demolition',
    category: 'he',
    description: 'A stronger blast breaks brick and throws nearby debris.',
    bestFor: 'Brick, loose debris movement.',
    goodVs: ['brick', 'concrete', 'wood'],
    flight: { speedScale: 0.9, radius: 4.5, drag: 0.038, mass: 1.65 },
    phases: [blast(71, 40, { materialBias: brickBias, force: 1.7, label: 'DEMOLITION CHARGE' })],
    vfx: vfx('he', 0xff6645, 0.25, 33),
    ratings: { impact: 4, blast: 5, pierce: 1, control: 3 },
  }),
  define({
    id: 'fragmentation',
    name: 'Fragmentation',
    category: 'he',
    description: 'A thick shell bursts into a wide spray of fragments.',
    bestFor: 'Exposed wood and glass, broad fragment coverage.',
    goodVs: ['wood', 'brick', 'steel'],
    flight: { speedScale: 1.01, radius: 3.7, drag: 0.03, mass: 1.4 },
    phases: [
      blast(29, 21, { materialBias: { wood: 1.2 }, label: 'BURST CASING' }),
      phase('fragment', 16, { rays: 14, spreadDeg: 162, distance: 28, at: 40, label: 'FRAGMENT SPRAY' }),
    ],
    vfx: vfx('he', 0xff7a53, 0.31, 23),
    ratings: { impact: 3, blast: 4, pierce: 2, control: 4 },
  }),
  define({
    id: 'thermal',
    name: 'Thermal',
    category: 'he',
    description: 'A hot blast leaves the struck material glowing longer.',
    bestFor: 'Repeated hits on the same patch, exposed thin surfaces.',
    goodVs: ['steel', 'wood', 'concrete'],
    flight: { speedScale: 0.98, radius: 3.9, drag: 0.029, mass: 1.35 },
    phases: [
      blast(34, 23, { label: 'HOT BLAST' }),
      burn(4, 18, 1400, { at: 30, label: 'GLOWING PATCH' }),
    ],
    vfx: vfx('burn', 0xffb04f, 0.31, 25),
    ratings: { impact: 3, blast: 3, pierce: 1, control: 3 },
  }),
  define({
    id: 'rainmaker',
    name: 'Rainmaker',
    category: 'he',
    description: 'Bursts near a defense, spraying five glowing copper streams forward and downward.',
    bestFor: 'Open roofs and exposed sides, thin metal and light cover.',
    goodVs: ['steel', 'brick', 'wood'],
    flight: { speedScale: 0.94, radius: 4, drag: 0.032, mass: 1.45, separation: 'streams', standoff: 25 },
    phases: [
      blast(17, 15, { label: 'AIR BURST' }),
      phase('rain', 15, {
        at: 25,
        rays: 5,
        spreadDeg: 64,
        distance: 40,
        angleOffset: 30,
        width: 4,
        label: 'FIVE COPPER STREAMS',
      }),
      blast(11, 19, { at: 80, label: 'RAIN PATTERN' }),
    ],
    vfx: vfx('rain', 0xff8c3f, 0.36, 26),
    ratings: { impact: 3, blast: 4, pierce: 2, control: 4 },
  }),
  define({
    id: 'crownburst',
    name: 'Crownburst',
    category: 'he',
    description: 'Bursts just before contact, sending blast pressure and fragments into the target.',
    bestFor: 'Fragile exposed cover, thin spaced layers.',
    goodVs: ['wood', 'steel', 'brick'],
    flight: { speedScale: 1.0, radius: 3.8, drag: 0.028, mass: 1.3, standoff: 12 },
    phases: [
      blast(43, 28, { label: 'PRE-CONTACT BURST' }),
      fragment(13, 9, 76, 26, { at: 20, label: 'CROWN FRAGMENTS' }),
    ],
    vfx: vfx('he', 0xffb64d, 0.34, 26),
    ratings: { impact: 3, blast: 4, pierce: 1, control: 3 },
  }),
  define({
    id: 'obstacle-reducer',
    name: 'Obstacle Reducer',
    category: 'he',
    description: 'A strong blast breaks wood supports and brick obstacles.',
    bestFor: 'Brick obstacles, wood supports.',
    goodVs: ['brick', 'wood', 'concrete'],
    flight: { speedScale: 0.92, radius: 4.2, drag: 0.034, mass: 1.55 },
    phases: [
      blast(41, 33, { materialBias: woodBias, force: 1.4, label: 'OBSTACLE BLAST' }),
      crush(16, 29, { at: 45, materialBias: { wood: 1.5, brick: 1.35 }, label: 'SUPPORT SHOVE' }),
    ],
    vfx: vfx('he', 0xff8a55, 0.24, 30),
    ratings: { impact: 4, blast: 4, pierce: 1, control: 3 },
  }),
  define({
    id: 'foundation-breaker',
    name: 'Foundation Breaker',
    category: 'he',
    description: 'Explodes shortly after impact to break nearby supports.',
    bestFor: 'Lower joints, brittle foundations.',
    goodVs: ['concrete', 'brick', 'wood'],
    flight: { speedScale: 0.94, radius: 4.2, drag: 0.033, mass: 1.5 },
    phases: [
      blast(23, 18, { label: 'DELAY FUSE' }),
      blast(53, 31, { at: 280, dir: 'down', label: 'FOUNDATION BLAST' }),
      shock(13, 44, { at: 315, force: 1.5, label: 'SUPPORT SHOCK' }),
    ],
    vfx: vfx('he', 0xff7a4f, 0.23, 30),
    ratings: { impact: 3, blast: 5, pierce: 1, control: 3 },
  }),
  define({
    id: 'pressure-hammer',
    name: 'Pressure Hammer',
    category: 'he',
    description: 'A wide blast pushes nearby cover and bends thin plates.',
    bestFor: 'Nearby light cover, thin unsupported plates.',
    goodVs: ['steel', 'wood', 'slopes'],
    flight: { speedScale: 0.96, radius: 4.4, drag: 0.034, mass: 1.6 },
    phases: [
      blast(22, 31, { force: 1.6, label: 'PRESSURE WAVE' }),
      shock(21, 61, { at: 50, force: 2.4, label: 'WIDE PRESSURE' }),
      crush(11, 33, { at: 95, label: 'THIN PLATE BEND' }),
    ],
    vfx: vfx('shock', 0xff9e56, 0.22, 28),
    ratings: { impact: 2, blast: 5, pierce: 1, control: 3 },
  }),
  define({
    id: 'popcorn-burst',
    name: 'Popcorn Burst',
    category: 'he',
    description: 'Splits before impact into four pop pods that scatter and pop one after another.',
    bestFor: 'Wide brick and wood cover, clearing several spots at once.',
    goodVs: ['brick', 'wood', 'concrete'],
    flight: { speedScale: 1.0, radius: 3.8, drag: 0.03, mass: 1.35, separation: 'pods', standoff: 23 },
    phases: [0, 1, 2, 3].map((index) =>
      blast(27, 19, {
        at: 30 + index * 135,
        angleOffset: -55 + index * 35,
        label: `POP POD ${index + 1}`,
        materialBias: brickBias,
      }),
    ),
    vfx: vfx('popcorn', 0xffa14e, 0.3, 23),
    ratings: { impact: 3, blast: 5, pierce: 1, control: 3 },
  }),
  define({
    id: 'meltdown',
    name: 'Meltdown',
    category: 'he',
    description: 'Bursts on contact and leaves a white-hot patch that melts into steel for two seconds.',
    bestFor: 'Steel plates, opening a hole in one spot.',
    goodVs: ['steel', 'armor', 'concrete'],
    flight: { speedScale: 1.0, radius: 4, drag: 0.03, mass: 1.4 },
    phases: [
      blast(28, 19, { label: 'CONTACT BURST' }),
      burn(9, 17, 2000, {
        at: 0,
        materialBias: { steel: 1.8, armor: 1.05 },
        channel: 'heat',
        label: 'WHITE-HOT PATCH / 2.0 s',
      }),
    ],
    vfx: vfx('burn', 0xfff2cd, 0.3, 24),
    ratings: { impact: 3, blast: 3, pierce: 2, control: 3 },
  }),

  // ── APHE ───────────────────────────────────────────────────────────────
  define({
    id: 'aphe-hybrid',
    name: 'APHE Hybrid',
    category: 'aphe',
    description: 'A steel nose pierces the surface before a delayed charge explodes.',
    bestFor: 'Thin barriers, light enclosed targets.',
    goodVs: ['steel', 'brick', 'wood'],
    flight: { speedScale: 1.07, radius: 3, drag: 0.022, mass: 1.2 },
    phases: [
      pierce(35, 26, 6, { angleTolerance: 0.4, label: 'NOSE PIERCE' }),
      blast(43, 23, { at: 190, label: 'DELAYED CHARGE' }),
    ],
    vfx: vfx('aphe', 0xe6c94d, 0.41, 21),
    ratings: { impact: 4, blast: 3, pierce: 3, control: 4 },
  }),
  define({
    id: 'capped-aphe',
    name: 'Capped APHE',
    category: 'aphe',
    description: 'A soft cap helps the steel nose strike angled armor before the charge explodes.',
    bestFor: 'Oblique thin steel, light backing.',
    goodVs: ['steel', 'slopes', 'armor'],
    flight: { speedScale: 1.05, radius: 3.1, drag: 0.024, mass: 1.22, angleTolerance: 0.8 },
    phases: [
      pierce(41, 29, 6, { angleTolerance: 0.82, label: 'CAPPED NOSE' }),
      blast(39, 22, { at: 180, label: 'DELAYED BURST' }),
    ],
    vfx: vfx('aphe', 0xecd258, 0.4, 21),
    ratings: { impact: 4, blast: 3, pierce: 3, control: 4 },
  }),
  define({
    id: 'bunkerbreaker',
    name: 'Bunkerbreaker',
    category: 'aphe',
    description: 'A short steel nose breaks into light cover before a quick blast.',
    bestFor: 'Brick, thin enclosures.',
    goodVs: ['brick', 'concrete', 'wood'],
    flight: { speedScale: 1.0, radius: 3.4, drag: 0.027, mass: 1.35 },
    phases: [
      pierce(33, 23, 8, { materialBias: brickBias, label: 'SHORT STEEL NOSE' }),
      blast(51, 27, { at: 105, materialBias: brickBias, label: 'QUICK INTERNAL BLAST' }),
    ],
    vfx: vfx('aphe', 0xe8c94e, 0.36, 25),
    ratings: { impact: 4, blast: 4, pierce: 2, control: 4 },
  }),
  define({
    id: 'emberpiercer',
    name: 'Emberpiercer',
    category: 'aphe',
    description: 'Pierces light cover, then bursts inside and leaves a longer-lasting glow.',
    bestFor: 'Thin enclosed targets, visible heat marking.',
    goodVs: ['steel', 'brick', 'wood'],
    flight: { speedScale: 1.06, radius: 3.1, drag: 0.024, mass: 1.2 },
    phases: [
      pierce(39, 27, 5, { label: 'PIERCE' }),
      blast(34, 20, { at: 150, label: 'INTERNAL BURST' }),
      burn(3, 15, 2200, { at: 170, label: 'LONG-LASTING EMBER' }),
    ],
    vfx: vfx('burn', 0xffb34d, 0.43, 22),
    ratings: { impact: 4, blast: 3, pierce: 3, control: 4 },
  }),
  define({
    id: 'switchfuse',
    name: 'Switchfuse',
    category: 'aphe',
    description: 'Choose a quick burst at the surface or a delayed burst inside the target.',
    bestFor: 'Mixed thin cover, choosing where the charge bursts.',
    goodVs: ['steel', 'brick', 'concrete'],
    flight: { speedScale: 1.05, radius: 3.1, drag: 0.024, mass: 1.22 },
    phases: [],
    choice: fuseChoice,
    choicePhases: {
      quick: [blast(55, 25, { label: 'QUICK SURFACE BURST' })],
      delay: [
        pierce(30, 25, 5, { label: 'DELAYED PIERCE' }),
        blast(51, 23, { at: 190, label: 'DELAYED INTERNAL BURST' }),
      ],
    },
    vfx: vfx('aphe', 0xe9cc55, 0.39, 22),
    ratings: { impact: 4, blast: 4, pierce: 2, control: 4 },
  }),
  define({
    id: 'sideburst',
    name: 'Sideburst',
    category: 'aphe',
    description: 'Pierces light cover, then sends fragments sideways from its shell.',
    bestFor: 'Interior side walls, nearby parallel supports.',
    goodVs: ['brick', 'steel', 'wood'],
    flight: { speedScale: 1.04, radius: 3.2, drag: 0.025, mass: 1.24 },
    phases: [
      pierce(30, 27, 5, { label: 'PIERCE SHELL' }),
      phase('fragment', 18, { at: 140, rays: 2, spreadDeg: 160, distance: 32, dir: 'sideL', label: 'SIDEWAYS BURST' }),
      blast(18, 17, { at: 155 }),
    ],
    vfx: vfx('aphe', 0xe6cc5b, 0.38, 22),
    ratings: { impact: 3, blast: 3, pierce: 2, control: 4 },
  }),
  define({
    id: 'latchburst',
    name: 'Latchburst',
    category: 'aphe',
    description: 'A hooked jacket grips the surface before the charge explodes.',
    bestFor: 'Thin oblique cover, keeping a burst near the strike.',
    goodVs: ['steel', 'slopes', 'brick'],
    flight: { speedScale: 1.04, radius: 3.2, drag: 0.025, mass: 1.25, angleTolerance: 0.75 },
    phases: [
      crustPhase(),
      blast(56, 25, { at: 150, label: 'LATCHED BURST' }),
    ],
    vfx: vfx('aphe', 0xe9ce58, 0.38, 24),
    ratings: { impact: 3, blast: 4, pierce: 1, control: 4 },
  }),
  define({
    id: 'adaptive-shell',
    name: 'Adaptive Shell',
    category: 'aphe',
    description: 'Choose a delayed blast for armor or a quicker, wider blast for buildings.',
    bestFor: 'Mixed defense types, choosing the blast timing.',
    goodVs: ['armor', 'brick', 'steel'],
    flight: { speedScale: 1.05, radius: 3.3, drag: 0.025, mass: 1.3 },
    phases: [],
    choice: chargeChoice,
    choicePhases: {
      armor: [
        pierce(34, 25, 5, { angleTolerance: 0.6, label: 'ARMOR PIERCE' }),
        jet(44, 31, 7, { at: 150, label: 'ADAPTED JET' }),
      ],
      building: [blast(57, 34, { at: 80, materialBias: brickBias, label: 'WIDE BUILDING BLAST' })],
    },
    vfx: vfx('aphe', 0xecd15b, 0.38, 24),
    ratings: { impact: 4, blast: 4, pierce: 3, control: 4 },
  }),
  define({
    id: 'chain-blast',
    name: 'Chain Blast',
    category: 'aphe',
    description: 'Pokes through the surface, then sets off three blasts that step deeper inside.',
    bestFor: 'Thick layered cover, reaching a core behind armor.',
    goodVs: ['armor', 'steel', 'concrete'],
    flight: { speedScale: 1.02, radius: 3.4, drag: 0.026, mass: 1.35 },
    phases: [
      pierce(24, 16, 5, { label: 'POKE THROUGH' }),
      blast(28, 14, { at: 90, label: 'STEP ONE' }),
      blast(32, 14, { at: 260, label: 'STEP TWO' }),
      blast(36, 15, { at: 430, label: 'STEP THREE' }),
    ],
    vfx: vfx('chain', 0xf0d866, 0.35, 23),
    ratings: { impact: 4, blast: 4, pierce: 2, control: 3 },
  }),
];

// A named latch impression rather than a generic crush: the hooked jacket grips
// first, then the charge follows after 150 ms. Defined below the list so the
// helper reads naturally beside its use.
function crustPhase(): AmmoPhase {
  return phase('crush', 12, { radius: 18, force: 0.4, label: 'HOOKED JACKET GRIP' });
}

export const AMMO_BY_ID: ReadonlyMap<string, AmmoDef> = new Map(AMMO.map((item) => [item.id, item]));
export const AMMO_NAMES: readonly string[] = AMMO.map((item) => item.name);
export const STARTER_AMMO_ID = 'ap-solid-shot';

export function getAmmo(id: string): AmmoDef {
  const found = AMMO_BY_ID.get(id);
  return found ?? (AMMO_BY_ID.get(STARTER_AMMO_ID) as AmmoDef);
}

export function getPhases(ammo: AmmoDef, choiceId: string | undefined): AmmoPhase[] {
  if (!ammo.choice || !ammo.choicePhases) return ammo.phases;
  const selected = choiceId ?? ammo.choice.defaultOption;
  return ammo.choicePhases[selected] ?? ammo.phases;
}

export function categoryLabel(category: AmmoCategory): string {
  return CATEGORY_META[category].label;
}

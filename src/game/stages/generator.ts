import { WORLD } from '../config';
import { WallBuilder, wallArea } from './wall-builder';
import { coreCoverFraction as wallCoreCoverFraction, detachUnsupported, pointInWalls, wallsFromSnapshot } from '../sim/walls';
import type { Wall } from '../sim/fracture';
import type { MaterialId } from '../materials';
import { Rng, hashString } from '../rng';
import type {
  BuiltStage,
  GeneratorStyle,
  ObjectiveKind,
  RelayState,
  StageDefinition,
} from './types';

interface Draft {
  cols: number;
  rows: number;
  originX: number;
  originY: number;
  coreCol: number;
  coreRow: number;
  coreRadius: number;
  cover: Array<{ col: number; row: number }>;
  relays: RelayState[];
  warnings: string[];
  /** Authoritative geometry. There is no damage raster in the draft. */
  walls: Wall[];
  coreCenter?: { x: number; y: number };
}

const STYLE_COLS: Record<GeneratorStyle, [number, number]> = {
  tower: [44, 56],
  bunker: [52, 68],
  arch: [48, 64],
  layered: [50, 64],
  bastion: [52, 68],
  tank: [56, 72],
  fort: [52, 68],
};

const STYLE_ROWS: Record<GeneratorStyle, [number, number]> = {
  tower: [34, 46],
  bunker: [22, 30],
  arch: [30, 42],
  layered: [30, 42],
  bastion: [32, 44],
  tank: [20, 28],
  fort: [30, 40],
};

/**
 * Wall thickness caps (in cells), per the reference build rules: metal never
 * thicker than 5, brick/concrete/wood/slopes never thicker than 7.
 */
export const THICKNESS_CAP: Record<MaterialId, number> = {
  steel: 5,
  armor: 5,
  brick: 7,
  concrete: 7,
  wood: 7,
  slopes: 7,
};

export const THEME_PALETTES = {
  harbor: {
    skyTop: 0x0a1420,
    skyLow: 0x20394a,
    haze: 0x9b8e72,
    far: 0x1b2c3a,
    near: 0x101a25,
    ground: 0x151d27,
    glow: 0xe48242,
  },
  foundry: {
    skyTop: 0x130f13,
    skyLow: 0x3f2825,
    haze: 0xbf714c,
    far: 0x2a1f23,
    near: 0x171318,
    ground: 0x1b1719,
    glow: 0xf4772e,
  },
  citadel: {
    skyTop: 0x0c101c,
    skyLow: 0x263247,
    haze: 0x9497b2,
    far: 0x1f2638,
    near: 0x101522,
    ground: 0x141822,
    glow: 0xd4a060,
  },
} as const;

/**
 * Generator builder (P0-11): wall-direct. Geometry is emitted as `Wall[]`
 * via WallBuilder from the first `put`; `cells` is a derived diagnostics
 * raster (recomputed from walls), never a damage model.
 */
class DraftBuilder extends WallBuilder {
  readonly seed: number;
  constructor(cols: number, rows: number, originX: number, originY: number, tile: number, seed: number) {
    super(cols, rows, originX, originY, tile);
    this.seed = seed;
    this.rng = new Rng(seed);
  }
  get groundY(): number { return this.originY + this.rows * this.tile; }
  supported(): boolean { return super.supported(this.groundY); }
  removeFloating(): void { super.removeFloating(this.groundY); }
}

function materialSets(theme: StageDefinition['theme'], difficulty: number): {
  skin: MaterialId;
  backing: MaterialId;
  frame: MaterialId;
  floor: MaterialId;
  cap: MaterialId;
  slope: MaterialId;
  armor: MaterialId;
} {
  if (theme === 'harbor') {
    return {
      skin: difficulty > 2 ? 'concrete' : 'brick',
      backing: difficulty > 3 ? 'steel' : 'wood',
      frame: 'wood',
      floor: difficulty > 1 ? 'concrete' : 'wood',
      cap: 'brick',
      slope: 'slopes',
      armor: 'steel',
    };
  }
  if (theme === 'foundry') {
    return {
      skin: difficulty > 2 ? 'steel' : 'brick',
      backing: difficulty > 3 ? 'armor' : 'concrete',
      frame: difficulty > 2 ? 'steel' : 'brick',
      floor: 'steel',
      cap: 'concrete',
      slope: 'slopes',
      armor: 'armor',
    };
  }
  return {
    skin: difficulty > 2 ? 'armor' : 'steel',
    backing: 'armor',
    frame: 'steel',
    floor: difficulty > 2 ? 'armor' : 'concrete',
    cap: 'armor',
    slope: 'slopes',
    armor: 'armor',
  };
}

function buildTower(builder: DraftBuilder, mats: ReturnType<typeof materialSets>, difficulty: number): void {
  const { cols, rows } = builder;
  const skinMetal = mats.skin === 'steel' || mats.skin === 'armor';
  const inset = skinMetal ? 5 : 6; // metal skin 5 = cap, brick skin 6 <= 7 cap
  const left = 0;
  const right = cols - 1;
  const top = 2;
  const bottom = rows - 1;
  // Fort-tower: a hollow shell, not a solid slab. Walls capped per material,
  // steel frame members 1 cell wide (well inside the 5 metal cap). The
  // outline top IS the roof — no separate roof fill stacking over the cap.
  builder.outline(left, top, right, bottom, inset, mats.skin);
  const floorCount = Math.max(2, Math.floor((rows - 8) / 9));
  for (let f = 1; f <= floorCount; f += 1) {
    const row = top + Math.round(((rows - 4) * f) / (floorCount + 1));
    builder.fill(left + 1, row, right - 1, row, mats.floor);
  }
  // Angled slope corners on the roofline.
  for (let c = 0; c < 10; c += 1) {
    builder.put(left + c, top - 2, mats.slope, 'slopeR');
    builder.put(right - c, top - 2, mats.slope, 'slopeL');
    if (c < 5) {
      builder.put(left + c, top - 1, mats.slope, 'slopeR');
      builder.put(right - c, top - 1, mats.slope, 'slopeL');
    }
  }
  // Internal timber frame column.
  const beamCol = builder.rng.int(left + inset + 1, right - inset - 1);
  builder.fill(beamCol, top + 2, beamCol, bottom - 1, mats.frame);
  // Steel load-bearing columns and girder courses. Metal folds and bends
  // instead of shattering, which is what makes the demolition read
  // differently from brick.
  const steelColumns = [left + inset + 1, right - inset - 2];
  for (const column of steelColumns) {
    builder.fill(column, top + 2, column, bottom - 1, 'steel');
  }
  builder.fill(left + inset, top + 9, right - inset, top + 9, 'steel');
  builder.fill(left + inset, bottom - 7, right - inset, bottom - 7, 'steel');
  if (difficulty > 2) {
    builder.fill(left + inset, top + 9, right - inset, top + 11, 'armor', 0.5);
  }
  const coreCol = Math.max(left + inset + 2, Math.round(cols * 0.54));
  const coreRow = Math.max(top + 3, Math.round(rows * 0.33));
  builder.carveCavity(coreCol, coreRow, 4, 4);
  builder.makeCoreSurround(coreCol, coreRow);
}


function buildBunker(builder: DraftBuilder, mats: ReturnType<typeof materialSets>, _difficulty: number): void {
  const { cols, rows } = builder;
  const bottom = rows - 1;
  const wall = 5; // brick skin: 5 <= 7 cap
  // The outline top is the roof; no stacking roof fill over the cap.
  builder.outline(0, 2, cols - 1, bottom, wall, mats.skin);
  builder.fill(0, 8, cols - 1, 8, mats.floor); // ceiling course, 1 row
  // Long sloped glacis at the front (angled).
  for (let c = 0; c < 14; c += 1) {
    builder.put(c, 1 - Math.min(1, Math.floor(c / 7)), mats.slope, 'slopeR');
  }
  // Roof ribs, 1 cell wide.
  for (let c = 8; c < cols - 6; c += 8) {
    builder.fill(c, 2, c, 8, mats.frame);
  }
  const coreCol = Math.round(cols * 0.56);
  const coreRow = Math.round(rows * 0.4);
  builder.carveCavity(coreCol, coreRow, 4, 4);
  builder.makeCoreSurround(coreCol, coreRow);
  // Side room openings (2x3, inside the wall band).
  builder.carve(2, bottom - 4);
  builder.carve(2, bottom - 5);
  builder.carve(2, bottom - 6);
  builder.carve(cols - 3, bottom - 5);
  builder.carve(cols - 3, bottom - 6);
  builder.carve(cols - 3, bottom - 7);
  // External buttress on the cannon side.
  builder.fill(1, bottom - 4, 5, bottom, mats.cap, 0.75);
}

function buildArch(builder: DraftBuilder, mats: ReturnType<typeof materialSets>, difficulty: number): void {
  const { cols, rows } = builder;
  const bottom = rows - 1;
  const leftPillar = 3;
  const pillarW = mats.skin === 'steel' || mats.skin === 'armor' ? 5 : 7; // capped
  const rightPillar = cols - 3 - pillarW;
  // Pillars at the material cap.
  builder.fill(leftPillar, 6, leftPillar + pillarW - 1, bottom, mats.skin);
  builder.fill(rightPillar, 6, rightPillar + pillarW - 1, bottom, mats.skin);
  builder.fill(0, 2, cols - 1, 6, mats.cap); // deck slab, 5 rows
  builder.fill(leftPillar + 1, bottom, leftPillar + pillarW - 2, bottom, mats.cap);
  builder.fill(rightPillar + 1, bottom, rightPillar + pillarW - 2, bottom, mats.cap);
  // The arch: supports at the shoulders, empty central span. Beam (3 rows)
  // hangs below the deck with a gap row so neither stacks over the cap.
  builder.fill(leftPillar + pillarW, 9, rightPillar - 1, 11, mats.backing); // beam, 3 rows
  for (let c = leftPillar + pillarW + 3; c < rightPillar - 1; c += 9) {
    builder.fill(c, 12, c, Math.min(bottom - 1, 21), mats.frame);
  }
  // Sloped braces (angled).
  for (let c = 0; c < 7; c += 1) {
    builder.put(c + leftPillar + pillarW - 1, 13 + c, mats.slope, 'slopeR');
    builder.put(rightPillar - c, 13 + c, mats.slope, 'slopeL');
  }
  const coreCol = Math.round(cols * 0.55);
  const coreRow = Math.round(rows * 0.4);
  // An arch leaves the core hanging beneath a protected deck.
  builder.carveCavity(coreCol, coreRow, 4, 4);
  builder.makeCoreSurround(coreCol, coreRow);
  builder.fill(coreCol - 3, 6, coreCol + 7, 6, mats.cap);
  builder.fill(coreCol - 2, coreRow - 1, coreCol + 6, coreRow - 1, mats.backing);
  // Small protected stair/shaft to the objective.
  builder.fill(rightPillar - 3, 14, rightPillar - 3, bottom, mats.floor);
  if (difficulty > 2) builder.fill(leftPillar + 3, 14, rightPillar - 5, 14, mats.frame);
}

function buildLayered(builder: DraftBuilder, mats: ReturnType<typeof materialSets>, difficulty: number): void {
  const { cols, rows } = builder;
  const bottom = rows - 1;
  // Curtain wall (7 wide = brick cap), air gap, then a hard backing box
  // (outline shell; metal walls capped at 5, so a metal backing box is 3
  // thick and its roof 2 rows — roof + outline never stack over the cap).
  // The gap is gameplay-legible: jets and delayed charges cross it, blasts
  // do not.
  const backingMetal = mats.backing === 'steel' || mats.backing === 'armor';
  const boxT = backingMetal ? 3 : 5;
  const roofRows = 2; // 2 roof rows + boxT (<=5) never exceeds either cap
  const curtainW = mats.skin === 'steel' || mats.skin === 'armor' ? 5 : 7; // capped
  builder.fill(0, 5, curtainW - 1, bottom, mats.skin); // curtain, capped width
  builder.fill(0, 5, curtainW - 1, 9, mats.cap); // curtain crown, same width
  builder.outline(10, 5, cols - 1, bottom, boxT, mats.backing); // backing box
  builder.fill(13, 5, 14, bottom, mats.cap); // inner rib, 2 wide
  for (let r = 11; r < bottom - 3; r += 8) {
    builder.fill(0, r, 6, r, mats.floor); // curtain floor ties
    builder.fill(10, r, cols - 1, r, mats.floor);
  }
  // Roof plates + sloped front shoulder (angled). Roof sits directly on the
  // backing-box top: roofRows + boxT stays within the material cap.
  builder.fill(0, 5 - roofRows, cols - 1, 4, mats.cap);
  for (let c = 0; c < 9; c += 1) builder.put(c, 5 - roofRows - 1, mats.slope, 'slopeR');
  const coreCol = Math.round(cols * 0.58);
  const coreRow = Math.max(10, Math.round(rows * 0.42));
  builder.carveCavity(coreCol, coreRow, 4, 4);
  builder.makeCoreSurround(coreCol, coreRow);
  if (difficulty > 2) builder.fill(coreCol + 6, 5, cols - 1, 9, mats.armor, 0.75);
  // A side entrance distracts from the core.
  builder.carve(cols - 6, bottom - 6);
  builder.carve(cols - 6, bottom - 7);
  builder.carve(cols - 6, bottom - 8);
}

function buildBastion(builder: DraftBuilder, mats: ReturnType<typeof materialSets>, difficulty: number): void {
  const { cols, rows } = builder;
  const bottom = rows - 1;
  // Stepped citadel silhouette: three hollow shell tiers, low front, tall
  // rear. Every wall is capped (brick 5, armor 5); no solid fills.
  const tier1 = Math.floor(cols * 0.34);
  const tier2 = Math.floor(cols * 0.68);
  builder.outline(0, 16, tier1, bottom, 5, mats.skin);
  builder.outline(tier1 - 2, 9, tier2, bottom, 5, mats.skin);
  builder.outline(tier2 - 2, 2, cols - 1, bottom, 5, mats.cap);
  // Stair-step parapets (2 rows each).
  builder.fill(0, 14, tier1, 15, mats.cap);
  builder.fill(tier1 - 2, 7, tier2, 8, mats.cap);
  builder.fill(tier2 - 2, 0, cols - 1, 1, mats.cap);
  // Sloped face at the leading edge (angled staircase).
  for (let c = 0; c < 13; c += 1) builder.put(c, 18 + Math.floor(c / 3), mats.slope, 'slopeR');
  // Internal columns, 1-2 cells wide.
  builder.fill(6, 16, 7, bottom, mats.backing);
  builder.fill(tier1 + 5, 9, tier1 + 6, bottom, mats.frame);
  builder.fill(tier2 + 4, 2, tier2 + 5, bottom, mats.backing);
  for (let r = 18; r < bottom - 2; r += 8) {
    builder.fill(0, r, tier1, r, mats.floor);
    builder.fill(tier1 - 2, r, tier2, r, mats.floor);
  }
  const coreCol = Math.max(20, Math.round(cols * 0.5));
  const coreRow = Math.max(12, Math.round(rows * 0.45));
  builder.carveCavity(coreCol, coreRow, 4, 4);
  builder.makeCoreSurround(coreCol, coreRow);
  builder.fill(coreCol - 3, coreRow - 1, coreCol + 7, coreRow - 1, mats.cap);
  if (difficulty > 2) builder.fill(tier2 + 8, coreRow, tier2 + 12, coreRow + 5, mats.armor);
}

function buildTank(builder: DraftBuilder, mats: ReturnType<typeof materialSets>, difficulty: number): void {
  const { cols, rows } = builder;
  const bottom = rows - 1;
  // A tank: steel hull shell (5 = metal cap), armor tracks, turret, barrel
  // pointing at the cannon, angled glacis plate on the nose.
  const hullL = 10;
  const hullR = cols - 1;
  const hullT = 9;
  const hullB = bottom - 4;
  builder.outline(hullL, hullT, hullR, hullB, 5, 'steel');
  // Tracks: 3 armor rows + return rollers.
  builder.fill(6, hullB + 1, hullR, bottom, 'armor');
  builder.fill(6, hullB - 1, 9, hullB, mats.frame);
  // Angled glacis (slope staircase) on the nose.
  for (let i = 0; i < 8; i += 1) {
    builder.put(hullL - 2 + i, hullT + 1 + Math.floor(i / 2), mats.slope, 'slopeR');
  }
  // Turret: steel shell, 3 thick, bottom border overlapping the hull top
  // band so turret + hull never stack over the 5 metal cap.
  const turL = Math.floor(cols * 0.42);
  const turR = Math.floor(cols * 0.72);
  builder.outline(turL, 2, turR, hullT + 2, 3, 'steel');
  // Barrel: 2 steel rows reaching toward the cannon.
  builder.fill(0, 4, turL - 1, 5, 'steel');
  builder.fill(0, 6, turL - 1, 6, 'armor', 0.4); // muzzle brake flecks
  // Engine deck + stowage bins (armor, capped).
  builder.fill(turR + 2, hullT, hullR, hullT + 2, 'armor');
  builder.fill(hullL, hullT + 6, hullL + 4, hullT + 8, mats.frame);
  if (difficulty > 1) builder.fill(turL + 2, 2, turR - 2, 3, 'armor'); // turret roof applique
  const coreCol = Math.round(cols * 0.58);
  const coreRow = Math.max(hullT + 6, Math.round(rows * 0.5));
  builder.carveCavity(coreCol, coreRow, 4, 4);
  builder.makeCoreSurround(coreCol, coreRow);
}

function buildFort(builder: DraftBuilder, mats: ReturnType<typeof materialSets>, difficulty: number): void {
  const { cols, rows } = builder;
  const bottom = rows - 1;
  // A star fort: central keep shell + two corner bastions + angled wings.
  builder.outline(0, 5, cols - 1, bottom, 5, mats.skin);
  // Corner bastions (small shells, overlapping the keep top so they stay
  // grounded through the shared wall). The keep outline top is the roof —
  // no stacking roof fill.
  builder.outline(0, 0, 18, 10, 3, mats.cap);
  builder.outline(cols - 19, 0, cols - 1, 10, 3, mats.cap);
  // Angled wings: slope staircases descending from the bastions.
  for (let i = 0; i < 12; i += 1) {
    builder.put(19 + i, 12 + Math.floor(i / 2), mats.slope, 'slopeR');
    builder.put(cols - 20 - i, 12 + Math.floor(i / 2), mats.slope, 'slopeL');
  }
  // Interior floors + columns.
  for (let r = 14; r < bottom - 3; r += 9) {
    builder.fill(5, r, cols - 6, r, mats.floor);
  }
  builder.fill(Math.floor(cols * 0.3), 5, Math.floor(cols * 0.3) + 1, bottom, mats.frame);
  builder.fill(Math.floor(cols * 0.7), 5, Math.floor(cols * 0.7) + 1, bottom, mats.frame);
  builder.fill(6, bottom - 6, 7, bottom, 'steel');
  builder.fill(cols - 8, bottom - 6, cols - 7, bottom, 'steel');
  if (difficulty > 1) builder.fill(8, 13, 12, 15, 'armor');
  const coreCol = Math.round(cols * 0.52);
  const coreRow = Math.max(10, Math.round(rows * 0.42));
  builder.carveCavity(coreCol, coreRow, 4, 4);
  builder.makeCoreSurround(coreCol, coreRow);
}

/**
 * Video test range (11-18-A/B): the first playable map.
 *
 * Measured off the recordings in native frames (2554x1180): a slender column
 * of three separated blocks (steel / brick / steel, roughly 1:3.6 each), a
 * square timber truss with a diagonal brace sitting on the dock, and a
 * blue-grey steel core box whose front window exposes a solid red core.
 * Authored in world coordinates so the silhouette is identical on every seed.
 */
function buildTestRange(builder: DraftBuilder): { coreCol: number; coreRow: number; coreCenter: { x: number; y: number } } {
  const groundY = WORLD.groundY;
  // --- Column: three display blocks bolted to the hidden range frame. ---
  const colX = 872;
  const colW = 24;
  builder.rect(colX, groundY - 88, colW, 88, 'steel');
  builder.rect(colX, groundY - 198, colW, 84, 'brick');
  builder.rect(colX, groundY - 316, colW, 92, 'steel');
  // --- Timber truss: square frame + diagonal brace. ---
  const tx = 958;
  const tw = 84;
  const th = 104;
  const ty = groundY - th;
  const beam = 6;
  builder.rect(tx, ty, beam, th, 'wood');
  builder.rect(tx + tw - beam, ty, beam, th, 'wood');
  builder.rect(tx, ty, tw, beam, 'wood');
  builder.rect(tx, groundY - beam, tw, beam, 'wood');
  builder.poly([
    { x: tx + beam, y: ty + beam },
    { x: tx + tw - beam, y: groundY - beam },
    { x: tx + tw - beam, y: groundY - beam - 7 },
    { x: tx + beam, y: ty + beam + 7 },
  ], 'wood');
  // --- Core box: steel shell with a front window and the red core behind it. ---
  const bx = 1072;
  const bw = 66;
  const bh = 108;
  const by = groundY - bh;
  const shell = 6;
  builder.rect(bx, by, bw, shell, 'steel');
  builder.rect(bx, groundY - shell, bw, shell, 'steel');
  builder.rect(bx + bw - shell, by, shell, bh, 'steel');
  builder.rect(bx, by, shell, bh, 'steel');
  // Window through the cannon-facing face: the video shows the red core
  // square sitting in this opening. Splitting the face keeps a real steel
  // lintel above and sill below, so the core still has cover.
  builder.carveRect(bx, groundY - 84, shell, 40);
  const coreCenter = { x: bx + 32, y: groundY - 64 };
  const coreCol = Math.round((coreCenter.x - builder.originX) / builder.tile) - 2;
  const coreRow = Math.round((coreCenter.y - builder.originY) / builder.tile) - 2;
  // Every authored part is bolted down; gaps are intentional display spacing.
  builder.anchorAll();
  return { coreCol, coreRow, coreCenter };
}

function runBuilder(def: StageDefinition, seed: number): Draft {
  const rng = new Rng(seed);
  const [minCols, maxCols] = STYLE_COLS[def.generator];
  const [minRows, maxRows] = STYLE_ROWS[def.generator];
  const cols = rng.int(minCols, maxCols);
  const rows = rng.int(minRows, maxRows);
  const tile = WORLD.tile;
  const originX = Math.round(WORLD.structureLeft + rng.int(0, 32));
  const originY = WORLD.groundY - rows * tile;
  const isTestRange = def.id === 'ash-harbor-01' || def.code === 'AH-01';
  // Test range spans x 750..1132, y 94..346 — needs a wide, tall raster.
  const effRows = isTestRange ? Math.max(rows, 44) : rows;
  const effCols = isTestRange ? Math.max(cols, 68) : cols;
  const effOriginY = WORLD.groundY - effRows * tile;
  const builder = new DraftBuilder(effCols, effRows, originX, effOriginY, tile, seed);
  const mats = materialSets(def.theme, def.chapterIndex);
  const style = def.generator;
  if (isTestRange) {
    const core = buildTestRange(builder);
    const warnings: string[] = [];
    const cover = Array.from({ length: 20 }, (_, i) => ({ col: core.coreCol + (i % 5), row: core.coreRow + Math.floor(i / 5) }));
    return {
      cols: effCols,
      rows: effRows,
      originX,
      originY: effOriginY,
      coreCol: core.coreCol,
      coreRow: core.coreRow,
      coreRadius: 13,
      cover,
      relays: [],
      warnings,
      walls: builder.walls,
      coreCenter: core.coreCenter,
    };
  }
  if (style === 'tower') buildTower(builder, mats, def.chapterIndex);
  else if (style === 'bunker') buildBunker(builder, mats, def.chapterIndex);
  else if (style === 'arch') buildArch(builder, mats, def.chapterIndex);
  else if (style === 'layered') buildLayered(builder, mats, def.chapterIndex);
  else if (style === 'tank') buildTank(builder, mats, def.chapterIndex);
  else if (style === 'fort') buildFort(builder, mats, def.chapterIndex);
  else buildBastion(builder, mats, def.chapterIndex);

  // Place the core inside the part of the silhouette a cannon can plausibly
  // reach in the available shot budget. Deep interior placements were rejected
  // during solver validation: even the longest jet cannot cross a 17-cell wall.
  // Every silhouette gets a side firing corridor. Vertical roof shafts were
  // visually interesting but produced layouts that could only be solved with a
  // near-pixel-perfect high arc after the roof was already open; that is not a
  // fair iPhone aiming puzzle. The side corridor keeps the objective protected
  // but gives the player a readable route at a useful range.
  const topRoute = false;
  const preferredCol = style === 'bunker' ? cols * 0.4 : cols * 0.5;
  const preferredRow = style === 'bunker' ? rows * 0.4 : rows * 0.44;
  const coreCol = Math.max(6, Math.min(cols - 7, Math.round(preferredCol)));
  const coreRow = Math.max(3, Math.min(rows - 7, Math.round(preferredRow)));
  builder.carveCavity(coreCol, coreRow, 4, 4);
  builder.makeCoreSurround(coreCol, coreRow);

  // A deliberately authored weak access seam turns "buried behind everything"
  // into a real aiming puzzle. A short shaft/corridor leads to the core but is
  // capped by a plate that must be broken first. Layouts remain generated; only
  // the principle of a reachable seam is fixed.
  const capMaterial: MaterialId =
    def.theme === 'harbor' ? 'wood' : def.theme === 'foundry' ? 'brick' : 'concrete';
  const shieldCover: Array<{ col: number; row: number }> = [];
  if (topRoute) {
    for (let r = 0; r < coreRow - 1; r += 1) {
      for (let c = coreCol - 1; c < coreCol + 5; c += 1) builder.carve(c, r);
    }
    // One breakable hatch row across a deliberately aimable six-cell shaft.
    for (let c = coreCol - 1; c < coreCol + 5; c += 1) {
      builder.put(c, 0, capMaterial);
      const cell = builder.get(c, 0);
      if (cell) {
        cell.preStressed = true;
        cell.hp = Math.max(9, Math.round(cell.hp * 0.62));
        cell.maxHp = cell.hp;
      }
    }
  } else {
    const corridorRow = Math.max(2, Math.min(rows - 9, coreRow - 2));
    const corridorHeight = Math.max(6, 9 - def.chapterIndex * 2);
    for (let c = 0; c < coreCol - 1; c += 1) {
      for (let dy = 0; dy < corridorHeight; dy += 1) builder.carve(c, corridorRow + dy);
    }
    // Destroy-core missions read as a precision-through-the-slit puzzle, so
    // leave the firing corridor open. Expose missions keep a real front shield
    // that must be blasted away without killing the core behind it.
    if (def.objective.kind === 'expose-core') {
      const thickness = 2 + def.chapterIndex;
      for (let c = 0; c < thickness; c += 1) {
        for (let r = corridorRow; r < corridorRow + corridorHeight; r += 1) {
          builder.put(c, r, capMaterial);
          const cell = builder.get(c, r);
          if (cell) {
            cell.preStressed = true;
            cell.hp = Math.max(12, Math.round(cell.hp * 0.7));
            cell.maxHp = cell.hp;
          }
          shieldCover.push({ col: c, row: r });
        }
      }
    }
    // A few shard cells at the mouth create spark hits without blocking the
    // deliberate route to the core.
    if (def.objective.kind === 'destroy-relay') {
      for (let dy = 0; dy < corridorHeight; dy += 1) {
        if (!builder.get(0, corridorRow + dy)) builder.put(0, corridorRow + dy, capMaterial);
      }
    }
  }

  const coreCenter = {
    x: originX + (coreCol + 2) * tile,
    y: originY + (coreRow + 2) * tile,
  };

  const relays: RelayState[] = [];
  if (def.objective.kind === 'destroy-relay') {
    // The relay is a deliberately visible pod on the cannon-facing side. Its
    // outer shield is one real cell thick, so a direct or arcing shot can reach
    // it while the rest of the fortress remains a useful decoy.
    const relayCol = 1;
    const relayRow = Math.max(2, Math.min(rows - 6, coreRow - 4));
    for (let c = relayCol; c < relayCol + 2; c += 1) {
      for (let r = relayRow; r < relayRow + 3; r += 1) builder.carve(c, r);
    }
    for (let r = relayRow - 1; r <= relayRow + 3; r += 1) {
      builder.put(relayCol - 1, r, mats.skin);
      builder.put(relayCol + 2, r, mats.backing);
    }
    for (let c = 0; c < 4; c += 1) {
      if (!builder.get(c, relayRow + 4)) builder.put(c, relayRow + 4, mats.frame);
    }
    // A dedicated support column keeps the objective physically grounded.
    for (let r = relayRow + 4; r < rows; r += 1) {
      if (!builder.get(relayCol, r)) builder.put(relayCol, r, mats.frame);
      if (!builder.get(relayCol + 1, r)) builder.put(relayCol + 1, r, mats.frame);
    }
    relays.push(builder.makeRelay(relayCol, relayRow, `${def.id}-relay-0`));
  }

  // Small, deliberately placed chips of pre-existing damage sell the idea that
  // these are old fortifications. It does not compromise the support graph.
  const stressCount = 2 + def.chapterIndex * 2;
  for (let i = 0; i < stressCount; i += 1) {
    const c = rng.int(2, cols - 3);
    const r = rng.int(3, Math.max(4, rows - 4));
    const cell = builder.get(c, r);
    if (cell && cell.relayId === undefined) {
      cell.hp = Math.max(4, Math.round(cell.hp * rng.range(0.72, 0.94)));
      cell.preStressed = true;
    }
  }

  builder.removeFloating();

  // The expose-core mission measures the actual front shield that guards the
  // firing corridor. Other objectives still display a cover estimate in the HUD.
  const cover: Array<{ col: number; row: number }> = [];
  if (def.objective.kind === 'expose-core' && shieldCover.length > 0) {
    for (const entry of shieldCover) {
      if (builder.get(entry.col, entry.row)) cover.push(entry);
    }
  } else {
    const coreWorldX = originX + (coreCol + 2) * tile;
    for (let r = coreRow - 2; r <= coreRow + 5; r += 1) {
      for (let c = coreCol - 3; c <= coreCol + 6; c += 1) {
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const cell = builder.get(c, r);
        if (!cell) continue;
        const x = originX + (c + 0.5) * tile;
        if (x <= coreWorldX + tile * 1.4) cover.push({ col: c, row: r });
      }
    }
  }

  const warnings: string[] = [];
  if (coreCenter.x > WORLD.width - 20) warnings.push('core outside right bound');
  if (coreCenter.y < 20) warnings.push('core above field');
  if (cover.length < 6) warnings.push('core cover too thin');
  if (relays.length === 0 && def.objective.kind === 'destroy-relay') warnings.push('relay missing');
  if (!builder.supported()) warnings.push('unsupported structure after cleanup');

  return {
    cols,
    rows,
    originX,
    originY,
    coreCol,
    coreRow,
    coreRadius: 17,
    cover,
    relays,
    warnings,
    walls: builder.walls,
    coreCenter,
  };
}

function validateDraft(draft: Draft, def: StageDefinition): string[] {
  const issues = [...draft.warnings];
  // Wall-direct validation: area, support and the core pocket all come from
  // polygons. No raster is generated (the old cells adapter was O(walls x
  // rows x cols) on every read and dominated mobile load time).
  const area = wallArea(draft.walls);
  if (area < 1500) issues.push('structure too small');
  if (draft.relays.length > 0 && def.objective.kind !== 'destroy-relay') {
    // Relays are not added unless the objective asks for them.
    issues.push('unexpected relay');
  }
  if (def.objective.kind === 'destroy-relay' && draft.relays.length === 0) issues.push('no relay target');
  // The core must have at least a small pocket of air around it. Samples are
  // taken through wall polygons; an embedded core is impossible to damage.
  const centre = draft.coreCenter ?? {
    x: draft.originX + (draft.coreCol + 2) * WORLD.tile,
    y: draft.originY + (draft.coreRow + 2) * WORLD.tile,
  };
  let cavity = 0;
  for (let iy = -2; iy <= 2; iy += 1) {
    for (let ix = -2; ix <= 2; ix += 1) {
      const p = { x: centre.x + ix * 7, y: centre.y + iy * 7 };
      if (!pointInWalls(draft.walls, p)) cavity += 1;
    }
  }
  if (cavity < 8) issues.push('core not accessible');
  const detached = detachUnsupported(draft.walls, WORLD.groundY).detached.length;
  if (detached > 0 && def.code !== 'AH-01') issues.push('floating structure after cleanup');
  if (def.objective.kind === 'expose-core' && draft.cover.length < 12) issues.push('not enough cover to expose');
  return issues;
}

/**
 * Deterministically build a stage. Invalid deterministic attempts advance an
 * internal seed; the stage's public seed remains stable, so Retry recreates the
 * exact same battlefield.
 */
export function buildStage(def: StageDefinition): BuiltStage {
  let fallback: { draft: Draft; seed: number; attempts: number; issues: string[] } | null = null;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const seed = (def.seed + attempt * 7919) >>> 0;
    const draft = runBuilder(def, seed);
    const issues = validateDraft(draft, def);
    if (fallback === null || issues.length < fallback.issues.length) {
      fallback = { draft, seed, attempts: attempt + 1, issues };
    }
    if (issues.length === 0) {
      return finalize(def, draft, seed, attempt + 1);
    }
  }
  if (!fallback) throw new Error(`Stage ${def.id} failed to generate`);
  return finalize(def, fallback.draft, fallback.seed, fallback.attempts);
}

function finalize(def: StageDefinition, draft: Draft, seed: number, attempts: number): BuiltStage {
  const core = {
    x: draft.coreCenter?.x ?? draft.originX + (draft.coreCol + 2) * WORLD.tile,
    y: draft.coreCenter?.y ?? draft.originY + (draft.coreRow + 2) * WORLD.tile,
    radius: draft.coreRadius,
    hp: def.coreHp,
    maxHp: def.coreHp,
    dropped: false,
    destroyed: false,
  };
  // The grid survives only as a coordinate frame (origin, tile, rows/cols) for
  // legacy relay cell metadata. Its cells array is deliberately empty: all
  // stage geometry is the wall set below.
  const grid = {
    originX: draft.originX,
    originY: draft.originY,
    tile: WORLD.tile,
    cols: draft.cols,
    rows: draft.rows,
    cells: [],
  };
  const wallState = {
    walls: draft.walls.map((w) => ({ ...w, polygons: w.polygons.map((p) => p.map((pt) => ({ ...pt }))) })),
    heat: [],
    groundY: WORLD.groundY,
    version: 1 as const,
  };
  wallState.groundY = WORLD.groundY;
  // Relay markers carry world coordinates so views never need the grid.
  for (const relay of draft.relays) {
    if (relay.cells.length === 0) continue;
    const cols = relay.cells.map((c) => c.col);
    const rows = relay.cells.map((c) => c.row);
    relay.worldX = draft.originX + ((Math.min(...cols) + Math.max(...cols) + 1) / 2) * WORLD.tile;
    relay.worldY = draft.originY + ((Math.min(...rows) + Math.max(...rows) + 1) / 2) * WORLD.tile;
  }
  return {
    def,
    grid,
    wallState,
    core,
    relays: draft.relays,
    coreCoverCells: draft.cover,
    groundY: WORLD.groundY,
    diagnostics: {
      generatedSeed: seed,
      attempts,
      grounded: true,
      coreCover: draft.cover.length,
      cellCount: wallState.walls.reduce((sum, w) => sum + w.polygons.length, 0),
      warnings: draft.warnings,
    },
  };
}

/** Exposed for development diagnostics and stage validation. */
export function regenerateWithSeed(def: StageDefinition, seed: number): BuiltStage {
  const draft = runBuilder(def, seed);
  return finalize(def, draft, seed, 1);
}

export function coreCoverFraction(stage: BuiltStage): number {
  // Wall-based cover (P0-9): perimeter coverage of wall polygons.
  // coreCoverCells is retained only as generation metadata.
  return stage.wallState ? wallCoreCoverFraction(stage.wallState, stage.core) : 0;
}

/** Snapshot variant used by HUD / App (P0-9): wall geometry only. */
export function snapshotCoreCoverFraction(snapshot: import('../stages/types').StageSnapshot): number {
  const ws = (snapshot as { wallState?: import('../sim/walls').WallState }).wallState;
  return ws ? wallCoreCoverFraction(ws, snapshot.core) : coreCoverFraction({ wallState: wallsFromSnapshot(snapshot), core: snapshot.core } as BuiltStage);
}

export function objectiveLabel(kind: ObjectiveKind): string {
  switch (kind) {
    case 'destroy-core':
      return 'Destroy the core';
    case 'expose-core':
      return 'Expose the core';
    case 'destroy-relay':
      return 'Destroy marked relay';
  }
}

export function stageFingerprint(def: StageDefinition): string {
  return `${def.id}:${hashString(def.id).toString(16)}:${def.seed.toString(16)}`;
}

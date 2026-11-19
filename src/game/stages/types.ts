import type { MaterialId } from '../materials';
import type { WallState } from '../sim/walls';

export type StageTheme = 'harbor' | 'foundry' | 'citadel';
export type GeneratorStyle = 'tower' | 'bunker' | 'arch' | 'layered' | 'bastion' | 'tank' | 'fort';
export type ObjectiveKind = 'destroy-core' | 'expose-core' | 'destroy-relay';
export type CellShape = 'block' | 'slopeL' | 'slopeR';

export interface Cell {
  material: MaterialId;
  hp: number;
  maxHp: number;
  shape: CellShape;
  /** Marked objective cell. */
  relayId?: string;
  /** Purely presentational damage seed; does not affect damage. */
  grain: number;
  /** Pre-existing stress applied by the generator. */
  preStressed?: boolean;
  /** Presentation-only plastic deformation. Never read by the damage solver. */
  warpX?: number;
  warpY?: number;
  warpRot?: number;
  /** Presentation-only residual heat used for ember colouring. */
  heat?: number;
}

export type Grid = Array<Array<Cell | null>>;

export interface Objective {
  kind: ObjectiveKind;
  label: string;
  description: string;
  /** Used by expose-core as the share of protective cells that may remain. */
  threshold?: number;
}

export interface StageDefinition {
  id: string;
  chapterId: string;
  chapterIndex: number;
  chapterName: string;
  stageIndex: number;
  globalIndex: number;
  name: string;
  code: string;
  seed: number;
  theme: StageTheme;
  generator: GeneratorStyle;
  objective: Objective;
  shots: number;
  starShots: number;
  coreHp: number;
  brief: string;
  intel: string;
  firstClearReward: string;
  suggestedAmmo: string[];
}

export interface ChapterDefinition {
  id: string;
  index: number;
  name: string;
  subtitle: string;
  theme: StageTheme;
  accent: string;
  stages: StageDefinition[];
}

export interface CoreState {
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  /** Support at the anchor point was destroyed and the core has dropped. */
  dropped: boolean;
  destroyed: boolean;
}

export interface RelayState {
  id: string;
  cells: Array<{ col: number; row: number }>;
  /** World-space marker centre (wall-object world). Views read this, never a grid. */
  worldX?: number;
  worldY?: number;
  alive: boolean;
  label: string;
}

export interface StructureGrid {
  originX: number;
  originY: number;
  tile: number;
  cols: number;
  rows: number;
  cells: Grid;
}

export interface BuiltStage {
  def: StageDefinition;
  grid: StructureGrid;
  /** Authoritative wall-object world (P0). Grid remains only as the generation raster. */
  wallState: WallState;
  core: CoreState;
  relays: RelayState[];
  /** Cells counted for the expose-core objective. */
  coreCoverCells: Array<{ col: number; row: number }>;
  groundY: number;
  /** Diagnostics shown only in the developer overlay. */
  diagnostics: {
    generatedSeed: number;
    attempts: number;
    grounded: boolean;
    coreCover: number;
    cellCount: number;
    warnings: string[];
  };
}

export interface StageSnapshot {
  grid: StructureGrid;
  /** Authoritative wall-object world. Damage/penetration/collapse read this. */
  wallState?: WallState;
  core: CoreState;
  relays: RelayState[];
}

export function cloneCell(cell: Cell): Cell {
  return { ...cell };
}

export function cloneGrid(grid: StructureGrid): StructureGrid {
  return {
    ...grid,
    cells: grid.cells.map((row) => row.map((cell) => (cell ? cloneCell(cell) : null))),
  };
}

export function cloneSnapshot(snapshot: StageSnapshot): StageSnapshot {
  const out: StageSnapshot = {
    grid: cloneGrid(snapshot.grid),
    core: { ...snapshot.core },
    relays: snapshot.relays.map((relay) => ({ ...relay, cells: relay.cells.map((cell) => ({ ...cell })) })),
  };
  if (snapshot.wallState) {
    const ws = snapshot.wallState;
    out.wallState = {
      walls: ws.walls.map((w) => ({ ...w, polygons: w.polygons.map((p) => p.map((pt) => ({ ...pt }))) })),
      heat: ws.heat.map((r) => ({ ...r })),
      groundY: ws.groundY,
      version: 1,
    };
  }
  return out;
}

export function cellWorldCenter(grid: StructureGrid, col: number, row: number): { x: number; y: number } {
  return {
    x: grid.originX + (col + 0.5) * grid.tile,
    y: grid.originY + (row + 0.5) * grid.tile,
  };
}

export function getCell(grid: StructureGrid, col: number, row: number): Cell | null {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null;
  return grid.cells[row]?.[col] ?? null;
}

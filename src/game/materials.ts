/**
 * Material data for the destructible lattice. Damage is applied to a material's
 * health with a per-channel resistance multiplier. Values are original tuning
 * used to make card descriptions legible in play, not recovered source values.
 */
export type MaterialId = 'wood' | 'brick' | 'concrete' | 'steel' | 'armor' | 'slopes';

export type DamageChannel = 'kinetic' | 'jet' | 'blast' | 'crush' | 'spall' | 'heat' | 'shock' | 'tear';

export type ChannelResistance = Record<DamageChannel, number>;

export interface MaterialDef {
  id: MaterialId;
  label: string;
  shortLabel: string;
  health: number;
  density: number;
  /**
   * Structural physics per material, used by the pixel fracture solver.
   * strength  0..1  how much strain a cell link survives before it tears
   * yield     0..1  strain at which deformation becomes permanent (plastic)
   * sag       0..1  how far the material bends under heat plus gravity
   * conduct   0..1  how quickly heat travels through the material
   * soften    0..1  how much heat weakens the material (metal loses strength)
   */
  strength: number;
  yieldStrain: number;
  sag: number;
  conduct: number;
  soften: number;
  /** Colors are deliberately desaturated except for player-facing accents. */
  colors: {
    base: number;
    light: number;
    dark: number;
    joint: number;
    chip: number;
    dust: number;
  };
  resistance: ChannelResistance;
  debris: 'splinter' | 'chunk' | 'rubble' | 'spark' | 'plate';
  isMetal: boolean;
}

export const MATERIALS: Record<MaterialId, MaterialDef> = {
  wood: {
    id: 'wood',
    label: 'Wood',
    shortLabel: 'WOOD',
    health: 22,
    density: 0.7,
    colors: { base: 0x8a5a36, light: 0xb17a49, dark: 0x4f3322, joint: 0x3b261b, chip: 0xc08b58, dust: 0x9b7958 },
    resistance: { kinetic: 1.15, jet: 0.55, blast: 1.35, crush: 1.4, spall: 1.25, heat: 1.25, shock: 1.05, tear: 1.35 },
    debris: 'splinter',
    isMetal: false,
    strength: 0.42,
    yieldStrain: 0.09,
    sag: 0.35,
    conduct: 0.06,
    soften: 0.15,
  },
  brick: {
    id: 'brick',
    label: 'Brick',
    shortLabel: 'BRICK',
    health: 40,
    density: 1.15,
    colors: { base: 0x7a4a38, light: 0x8a5a44, dark: 0x452b20, joint: 0x5d3a2d, chip: 0x96603f, dust: 0x9a7a63 },
    resistance: { kinetic: 1.05, jet: 0.6, blast: 1.2, crush: 1.15, spall: 1.05, heat: 1.0, shock: 1.15, tear: 0.9 },
    debris: 'rubble',
    isMetal: false,
    strength: 0.5,
    yieldStrain: 0.05,
    sag: 0.12,
    conduct: 0.12,
    soften: 0.2,
  },
  concrete: {
    id: 'concrete',
    label: 'Concrete',
    shortLabel: 'CONC',
    health: 58,
    density: 1.65,
    colors: { base: 0x707c88, light: 0x8593a0, dark: 0x424d58, joint: 0x39434e, chip: 0x93a1ad, dust: 0x9a9c9a },
    resistance: { kinetic: 0.95, jet: 0.72, blast: 1.0, crush: 0.95, spall: 0.9, heat: 0.8, shock: 1.0, tear: 0.7 },
    debris: 'chunk',
    isMetal: false,
    strength: 0.62,
    yieldStrain: 0.045,
    sag: 0.1,
    conduct: 0.22,
    soften: 0.25,
  },
  steel: {
    id: 'steel',
    label: 'Steel',
    shortLabel: 'STEEL',
    health: 76,
    density: 2.4,
    colors: { base: 0x66798d, light: 0x7d92a8, dark: 0x39485a, joint: 0x2f3d4d, chip: 0xaab9c9, dust: 0x67798a },
    resistance: { kinetic: 0.78, jet: 1.0, blast: 0.74, crush: 0.66, spall: 0.8, heat: 1.08, shock: 0.86, tear: 0.62 },
    debris: 'spark',
    isMetal: true,
    strength: 0.86,
    yieldStrain: 0.032,
    sag: 0.85,
    conduct: 0.72,
    soften: 0.8,
  },
  armor: {
    id: 'armor',
    label: 'Armor',
    shortLabel: 'ARMOR',
    health: 108,
    density: 3.1,
    colors: { base: 0x47545f, light: 0x748792, dark: 0x222c35, joint: 0x18212a, chip: 0xb1c1c8, dust: 0x5f747f },
    resistance: { kinetic: 0.64, jet: 0.92, blast: 0.51, crush: 0.54, spall: 0.7, heat: 0.92, shock: 0.7, tear: 0.45 },
    debris: 'plate',
    isMetal: true,
    strength: 0.95,
    yieldStrain: 0.026,
    sag: 0.6,
    conduct: 0.65,
    soften: 0.55,
  },
  slopes: {
    id: 'slopes',
    label: 'Slopes',
    shortLabel: 'SLOPE',
    health: 64,
    density: 1.8,
    colors: { base: 0x6b675a, light: 0x96917d, dark: 0x3c3b35, joint: 0x2a2a27, chip: 0x8e8a78, dust: 0x96917d },
    resistance: { kinetic: 0.88, jet: 0.72, blast: 0.96, crush: 0.9, spall: 0.9, heat: 0.8, shock: 0.9, tear: 0.6 },
    debris: 'chunk',
    isMetal: false,
    strength: 0.7,
    yieldStrain: 0.04,
    sag: 0.14,
    conduct: 0.2,
    soften: 0.3,
  },
};

export const MATERIAL_ORDER: readonly MaterialId[] = ['steel', 'armor', 'brick', 'wood', 'concrete', 'slopes'];

export function materialResistance(material: MaterialId, channel: DamageChannel): number {
  return MATERIALS[material].resistance[channel];
}

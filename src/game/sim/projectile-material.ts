/**
 * Physical data for the materials the round is made of.
 *
 * Walls use `materials.ts` (a material id per polygon). The projectile is a
 * different problem: its parts are alloys that only exist inside the round, and
 * its behaviour is dominated by ductility and heat, not by how many hit points
 * a block has. Keeping the two tables apart means a copper jacket can be soft
 * and highly conductive without turning every copper-coloured wall in the
 * campaign into a different surface.
 *
 * `density` is relative (steel = 1). `strength` is the strain a link tolerates
 * before it yields, `yieldStrain` the plastic threshold, `soften` how much heat
 * removes that strength, `conduct` how fast heat travels through the part.
 */

export type ProjectileMaterialId = 'copper' | 'steel';

export interface ProjectileMaterial {
  id: ProjectileMaterialId;
  label: string;
  /** Relative density; steel = 1. */
  density: number;
  /** Link strength, 0..1. */
  strength: number;
  /** Strain at which deformation becomes permanent, 0..1. */
  yieldStrain: number;
  /** How much heat weakens the part, 0..1. */
  soften: number;
  /** Heat conductance between neighbours, 0..1. */
  conduct: number;
  /** How far the part warps once it is hot, 0..1. */
  sag: number;
  /** Plastic flow under heat: hot metal creeps instead of springing back. */
  creep: number;
  color: number;
}

export const PROJECTILE_MATERIALS: Record<ProjectileMaterialId, ProjectileMaterial> = {
  // Copper jacket: dense, very ductile, and the best heat conductor in the
  // round. It folds and mushrooms long before it snaps, which is why the jacket
  // absorbs the hit and the core survives it.
  copper: {
    id: 'copper',
    label: 'COPPER',
    density: 1.14,
    strength: 0.5,
    yieldStrain: 0.018,
    soften: 0.88,
    conduct: 0.95,
    sag: 0.9,
    creep: 1.15,
    color: 0xc0754a,
  },
  // Steel penetrator: harder, stiffer, keeps its ogive. It bends a little and
  // then holds, which is what lets it break free and keep driving.
  steel: {
    id: 'steel',
    label: 'STEEL',
    density: 1,
    strength: 0.92,
    yieldStrain: 0.011,
    soften: 0.6,
    conduct: 0.58,
    sag: 0.6,
    creep: 0.55,
    color: 0x9fb4c6,
  },
};

/** Effective resistance of a jacketed round: it mushrooms and gives up energy. */
export const JACKET_QUALITY = 1;
/**
 * Effective resistance of a bare hard core. A steel ogive does not deform on the
 * face, so the area-normalised energy it needs to cross a layer is much lower
 * than a copper-wrapped ball round's. This is the whole reason AP ammunition
 * separates its penetrator.
 */
export const PENETRATOR_QUALITY = 0.56;

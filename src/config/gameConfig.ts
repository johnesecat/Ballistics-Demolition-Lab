export const GAME_CONFIG = {
  // Display
  VIRTUAL_WIDTH: 1280,
  VIRTUAL_HEIGHT: 720,
  SAFE_AREA_PADDING: 24,

  // Physics
  PHYSICS_TIMESTEP: 1000 / 60,
  MAX_SUB_STEPS: 4,
  GRAVITY: 980,
  DRAG_COEFFICIENT: 0.001,
  MAX_PROJECTILE_SPEED: 1200,
  MIN_PROJECTILE_SPEED: 50,

  // Projectile
  DEFAULT_POWER_MAX: 441,
  DEFAULT_POWER_MIN: 10,
  POWER_STEP: 1,
  ANGLE_MIN: -85,
  ANGLE_MAX: 85,
  TRAJECTORY_POINTS: 120,
  TRAJECTORY_TIMESTEP: 1/60,

  // Materials
  MATERIALS: {
    WOOD: { name: 'wood', color: 0x8b5a2b, density: 0.6, friction: 0.6, restitution: 0.2, health: 80, breakThreshold: 0.7 },
    BRICK: { name: 'brick', color: 0x8b3e2f, density: 1.2, friction: 0.8, restitution: 0.1, health: 120, breakThreshold: 0.6 },
    CONCRETE: { name: 'concrete', color: 0x6b6b6b, density: 1.8, friction: 0.7, restitution: 0.05, health: 200, breakThreshold: 0.5 },
    STEEL: { name: 'steel', color: 0x8899aa, density: 2.5, friction: 0.5, restitution: 0.15, health: 300, breakThreshold: 0.4 },
    ARMOR: { name: 'armor', color: 0x5a6a7a, density: 3.0, friction: 0.4, restitution: 0.2, health: 500, breakThreshold: 0.3 },
    SLOPE: { name: 'slope', color: 0x7a5a3a, density: 1.0, friction: 0.6, restitution: 0.15, health: 100, breakThreshold: 0.6 },
  },

  // Ammo Categories
  AMMO_CATEGORIES: [
    'all',
    'solid',
    'heat',
    'hesh',
    'he',
    'aphe',
    'soft',
  ] as const,

  // Material Filters
  MATERIAL_FILTERS: [
    'steel',
    'armor',
    'brick',
    'wood',
    'concrete',
    'slopes',
  ] as const,

  // Campaign
  CHAPTERS: 3,
  STAGES_PER_CHAPTER: 8,

  // Stars
  STAR_THRESHOLDS: {
    1: 0.75,
    2: 0.5,
    3: 0.25,
  },

  // Save
  SAVE_VERSION: 1,
  SAVE_KEY: 'artillery-command-save',

  // Colors
  COLORS: {
    BACKGROUND: 0x0a0f1a,
    PANEL: 0x141d2e,
    PANEL_LIGHT: 0x1e2d42,
    PRIMARY: 0xff8c00,
    PRIMARY_DIM: 0xcc6600,
    TEXT: 0xf0f0f0,
    TEXT_DIM: 0x8899aa,
    RED_CORE: 0xff2244,
    RED_CORE_GLOW: 0xff6688,
    TRAJECTORY: 0xff8c00,
    TRAJECTORY_WARNING: 0xff2244,
    SELECTION: 0x00ccff,
    SUCCESS: 0x00cc66,
    WARNING: 0xffaa00,
    DANGER: 0xff3344,
    WOOD: 0x8b5a2b,
    BRICK: 0x8b3e2f,
    CONCRETE: 0x6b6b6b,
    STEEL: 0x8899aa,
    ARMOR: 0x5a6a7a,
    HEAT_ORANGE: 0xff6600,
    HESH_PURPLE: 0xaa44ff,
    HE_RED: 0xff3344,
    APHE_YELLOW: 0xffdd00,
    SOFT_COPPER: 0xcd7f32,
  },

  // Z-Indices
  Z: {
    BACKGROUND: 0,
    TERRAIN: 10,
    STRUCTURE: 20,
    CORE: 25,
    DEBRIS: 30,
    PROJECTILE: 40,
    EFFECTS: 50,
    TRAJECTORY: 60,
    UI_BACKGROUND: 100,
    UI_PANEL: 110,
    UI_CONTENT: 120,
    UI_OVERLAY: 130,
    MODAL: 200,
    TOAST: 300,
  },

  // Audio
  AUDIO: {
    MASTER_VOLUME: 0.7,
    MUSIC_VOLUME: 0.4,
    SFX_VOLUME: 0.7,
  },

  // Effects
  MAX_DEBRIS_PIECES: 150,
  MAX_PARTICLES: 300,
  DEBRIS_LIFETIME: 8000,
  CAMERA_SHAKE_INTENSITY: 0.008,
};
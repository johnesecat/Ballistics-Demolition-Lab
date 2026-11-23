/** Global, tunable gameplay dimensions and physics constants. */
export const GAME_TITLE = 'BREAKWATER';
export const GAME_SUBTITLE = 'DEMOLITION RANGE';

export const WORLD = {
  width: 1200,
  height: 420,
  groundY: 346,
  structureLeft: 742,
  tile: 6,
} as const;

export const CANNON = {
  x: 128,
  y: 294,
  barrelLength: 78,
  wheelRadius: 24,
} as const;

export const POWER = {
  min: 40,
  max: 441,
  default: 330,
  /** Arc launch speed in world px/s at power=0 and power=max. */
  arcSpeedMin: 300,
  arcSpeedMax: 820,
  /** Straight mode is faster and much flatter. */
  straightSpeedMin: 410,
  straightSpeedMax: 940,
} as const;

export const PHYSICS = {
  /** Fixed simulation frequency. Outcome never depends on render frame rate. */
  step: 1 / 240,
  maxFlightSeconds: 8,
  arcGravity: 410,
  straightGravity: 74,
  wind: 0,
  arcMaxRise: 70,
  /** Hard limits protect Safari from runaway shots or bad data. */
  maxSimulationSteps: 240 * 12,
  previewSteps: 240 * 6,
} as const;

export const AIM = {
  minDeg: 4,
  maxDeg: 84,
  defaultDeg: 42,
  sensitivityMin: 0.45,
  sensitivityMax: 1.8,
  defaultSensitivity: 1,
} as const;

export const CAMERA = {
  fitWidth: WORLD.width,
  fitHeight: WORLD.height,
  minZoomFactor: 1,
  maxZoomFactor: 2.25,
  lodZoom: 1.22,
} as const;

/** Replay-time camera framing, independent of frame rate and playback speed. */
export function shotCameraFrame(elapsed: number, impactTime: number, duration: number, wideZoom: number, closeZoom: number): { tracking: number; zoom: number } {
  const clamp = (value: number): number => Math.max(0, Math.min(1, value));
  const smooth = (value: number): number => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  const opening = smooth(elapsed / 360);
  const returnStart = Math.min(impactTime + 300, Math.max(impactTime, duration - 1));
  const returning = smooth((elapsed - returnStart) / Math.max(1, duration - returnStart));
  const tracking = opening * (1 - returning);
  const impactApproach = smooth((elapsed - (impactTime - 450)) / 450);
  const flightZoom = Math.max(wideZoom, closeZoom * 0.72);
  const detailZoom = flightZoom + (Math.max(flightZoom, closeZoom) - flightZoom) * impactApproach;
  return { tracking, zoom: wideZoom + (detailZoom - wideZoom) * tracking };
}

export const STAGE = {
  gridColsMin: 24,
  gridColsMax: 35,
  gridRowsMin: 13,
  gridRowsMax: 24,
  /** Shot budgets are data-driven per stage; these are generator guardrails. */
  minShots: 3,
  maxShots: 7,
} as const;

export const SAVE = {
  key: 'breakwater.save',
  version: 3,
  backupPrefix: 'breakwater.save.corrupt.',
} as const;

export const STAR = {
  /** A clear always gets one star. Two/three use shots relative to target. */
  max: 3,
} as const;

export const EFFECT_LIMITS = {
  normal: { debrisBodies: 54, chips: 220, trailSamples: 70, rings: 8 },
  reduced: { debrisBodies: 18, chips: 80, trailSamples: 34, rings: 4 },
} as const;

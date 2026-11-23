import { Rng } from '../rng';
import { MATERIALS, type MaterialId } from '../materials';

export interface Point { x: number; y: number }
export type Polygon = Point[];

/** An intact wall has one identity and one or more continuous surfaces. */
export interface Wall {
  id: string;
  material: MaterialId;
  polygons: Polygon[];
  /**
   * Bolted/anchored geometry (the authored test range). Anchored walls ignore
   * the support solve until they take damage, so display blocks separated by
   * air gaps do not fall on their own. Fracturing a wall clears the flag.
   */
  anchored?: boolean;
}

export interface FractureFragment {
  wallId: string;
  material: MaterialId;
  polygon: Polygon;
}

export interface FractureResult {
  wall: Wall;
  fragments: FractureFragment[];
}

export interface PenetrationResult {
  walls: Wall[];
  fragments: FractureFragment[];
  end: Point;
  remainingEnergy: number;
}

export interface WallContact {
  wallId: string;
  material: MaterialId;
  x: number;
  y: number;
  nx: number;
  ny: number;
  t: number;
}

/** Sweep a circular projectile against convex wall polygons. Contact coordinates
 * describe the projectile center; the normal points away from the surface. */
export function traceWalls(walls: Wall[], from: Point, to: Point, radius = 0): WallContact | null {
  if (!Number.isFinite(radius) || radius < 0) throw new RangeError('Invalid projectile radius');
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const speed2 = dx * dx + dy * dy;
  let best: WallContact | null = null;
  const consider = (wall: Wall, t: number, nx: number, ny: number): void => {
    if (t < 0 || t > 1 || (best && t >= best.t)) return;
    best = { wallId: wall.id, material: wall.material, x: from.x + dx * t, y: from.y + dy * t, nx: nx || 0, ny: ny || 0, t };
  };
  for (const wall of walls) {
    for (const polygon of wall.polygons) {
      if (polygon.length < 3) continue;
      let signedArea = 0;
      for (let i = 0; i < polygon.length; i += 1) {
        const a = polygon[i]!;
        const b = polygon[(i + 1) % polygon.length]!;
        signedArea += a.x * b.y - b.x * a.y;
      }
      if (Math.abs(signedArea) < 1e-9) continue;
      const orientation = Math.sign(signedArea);
      let inside = true;
      let closestDistance2 = Infinity;
      let closestNormal: Point = { x: 0, y: -1 };
      for (let i = 0; i < polygon.length; i += 1) {
        const a = polygon[i]!;
        const b = polygon[(i + 1) % polygon.length]!;
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const length2 = ex * ex + ey * ey;
        if (length2 < 1e-18) continue;
        const length = Math.sqrt(length2);
        const nx = orientation * ey / length;
        const ny = -orientation * ex / length;
        const offsetX = from.x - a.x;
        const offsetY = from.y - a.y;
        const distance = offsetX * nx + offsetY * ny;
        if (distance > 1e-9) inside = false;
        const along = Math.max(0, Math.min(1, (offsetX * ex + offsetY * ey) / length2));
        const nearX = offsetX - ex * along;
        const nearY = offsetY - ey * along;
        const dist2 = nearX * nearX + nearY * nearY;
        if (dist2 < closestDistance2) {
          closestDistance2 = dist2;
          const dist = Math.sqrt(dist2);
          closestNormal = distance > 0 && dist > 1e-9 ? { x: nearX / dist, y: nearY / dist } : { x: nx, y: ny };
        }
        const normalVelocity = dx * nx + dy * ny;
        if (normalVelocity < -1e-9) {
          const t = (radius - distance) / normalVelocity;
          if (t >= 0 && t <= 1) {
            const cx = from.x + dx * t - nx * radius - a.x;
            const cy = from.y + dy * t - ny * radius - a.y;
            const u = (cx * ex + cy * ey) / length2;
            if (u >= 0 && u <= 1) consider(wall, t, nx, ny);
          }
        }
        if (radius > 0 && speed2 > 0) {
          const projection = offsetX * dx + offsetY * dy;
          const discriminant = projection * projection - speed2 * (offsetX * offsetX + offsetY * offsetY - radius * radius);
          if (discriminant >= 0) {
            const t = (-projection - Math.sqrt(discriminant)) / speed2;
            if (t >= 0 && t <= 1) {
              const cx = from.x + dx * t - a.x;
              const cy = from.y + dy * t - a.y;
              consider(wall, t, cx / radius, cy / radius);
            }
          }
        }
      }
      if (inside || closestDistance2 <= radius * radius) consider(wall, 0, closestNormal.x, closestNormal.y);
    }
  }
  return best;
}

/**
 * Length of the span a ray spends inside one wall, in world units. Used by the
 * kinetic solver to compare a layer against the material thickness cap instead
 * of guessing from the projectile radius. Returns 0 when the ray misses.
 */
export function raySpanInWall(wall: Wall, from: Point, dir: Point): number {
  const len = Math.hypot(dir.x, dir.y) || 1;
  const dx = dir.x / len;
  const dy = dir.y / len;
  let best = 0;
  for (const polygon of wall.polygons) {
    if (polygon.length < 3) continue;
    const hits: number[] = [];
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i]!;
      const b = polygon[(i + 1) % polygon.length]!;
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const denom = dx * ey - dy * ex;
      if (Math.abs(denom) < 1e-12) continue;
      const t = ((a.x - from.x) * ey - (a.y - from.y) * ex) / denom;
      const u = ((a.x - from.x) * dy - (a.y - from.y) * dx) / denom;
      if (t >= 0 && u >= 0 && u <= 1) hits.push(t);
    }
    if (hits.length < 2) continue;
    hits.sort((a, b) => a - b);
    const span = hits[hits.length - 1]! - hits[0]!;
    if (span > best) best = span;
  }
  return best;
}

export function polygonArea(polygon: Polygon): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) * 0.5;
}

/** Clip a convex polygon against one axis-aligned half-plane. */
function clip(polygon: Polygon, axis: 'x' | 'y', boundary: number, lower: boolean): Polygon {
  if (polygon.length < 3) return [];
  const result: Polygon = [];
  let previous = polygon[polygon.length - 1]!;
  let previousInside = lower ? previous[axis] <= boundary : previous[axis] >= boundary;
  for (const current of polygon) {
    const inside = lower ? current[axis] <= boundary : current[axis] >= boundary;
    if (inside !== previousInside) {
      const denominator = current[axis] - previous[axis];
      const t = (boundary - previous[axis]) / denominator;
      result.push({ x: previous.x + (current.x - previous.x) * t, y: previous.y + (current.y - previous.y) * t });
    }
    if (inside) result.push({ ...current });
    previous = current;
    previousInside = inside;
  }
  return result.length >= 3 && polygonArea(result) > 1e-8 ? result : [];
}

function intersectBox(polygon: Polygon, left: number, top: number, right: number, bottom: number): Polygon {
  let part = clip(polygon, 'x', left, false);
  part = clip(part, 'x', right, true);
  part = clip(part, 'y', top, false);
  return clip(part, 'y', bottom, true);
}

/**
 * Replace only the impacted region with small pieces. The rest stays as wall
 * geometry; subdivision is temporary and never used as a damage lattice.
 * Inputs must be convex polygons. The region is presently a square footprint,
 * so callers must not treat it as a calibrated circular blast model.
 */
export function fractureWall(wall: Wall, impact: Point, radius: number, fragmentSize: number): FractureResult {
  if (!Number.isFinite(radius) || radius < 0 || !Number.isFinite(fragmentSize) || fragmentSize <= 0 || !Number.isFinite(impact.x) || !Number.isFinite(impact.y)) {
    throw new RangeError('Invalid fracture dimensions');
  }
  if (radius === 0) return { wall: { ...wall, polygons: wall.polygons.map((p) => p.map((point) => ({ ...point }))) }, fragments: [] };
  return fractureBox(wall, impact.x - radius, impact.y - radius, impact.x + radius, impact.y + radius, fragmentSize);
}

/** Remove a directional rectangle from a wall in local coordinates. */
function fractureBox(wall: Wall, left: number, top: number, right: number, bottom: number, fragmentSize: number): FractureResult {
  const survivors: Polygon[] = [];
  const fragments: FractureFragment[] = [];
  for (const polygon of wall.polygons) {
    const inside = intersectBox(polygon, left, top, right, bottom);
    if (!inside.length) {
      survivors.push(polygon.map((p) => ({ ...p })));
      continue;
    }
    let rest = polygon;
    for (const [axis, boundary, lower] of [['x', left, true], ['x', right, false], ['y', top, true], ['y', bottom, false]] as const) {
      const outside = clip(rest, axis, boundary, lower);
      if (outside.length) survivors.push(outside);
      rest = clip(rest, axis, boundary, !lower);
    }
    const minX = Math.min(...inside.map((p) => p.x));
    const maxX = Math.max(...inside.map((p) => p.x));
    const minY = Math.min(...inside.map((p) => p.y));
    const maxY = Math.max(...inside.map((p) => p.y));
    // A timber beam splits lengthwise along its long axis; masonry and metal
    // retain compact chips. All pieces still partition the exact removed area.
    const wood = wall.material === 'wood';
    const xs = polygon.map(p => p.x);
    const ys = polygon.map(p => p.y);
    const horizontalGrain = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
    const fragmentWidth = wood ? fragmentSize * (horizontalGrain ? 2 : 0.5) : fragmentSize;
    const fragmentHeight = wood ? fragmentSize * (horizontalGrain ? 0.5 : 2) : fragmentSize;
    const cols = Math.ceil((maxX - minX) / fragmentWidth);
    const rows = Math.ceil((maxY - minY) / fragmentHeight);
    if (cols * rows > 100000) throw new RangeError('Fracture would create too many fragments');
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = minX + col * fragmentWidth;
        const y = minY + row * fragmentHeight;
        const part = intersectBox(inside, x, y, x + fragmentWidth, y + fragmentHeight);
        if (part.length) fragments.push({ wallId: wall.id, material: wall.material, polygon: part });
      }
    }
  }
  // Damage releases the anchor: the surviving remainder now obeys the support
  // solve, so a blown-through display block can actually fall. An undamaged
  // wall is returned byte-identical (no stray `anchored` key).
  return {
    wall: fragments.length > 0
      ? { ...wall, polygons: survivors, anchored: false }
      : { ...wall, polygons: survivors },
    fragments,
  };
}

/** Cut a narrow, oriented penetration channel through a wall. Fragment size
 * is specified in world units and must not depend on the camera zoom. */
export function fractureWallBand(wall: Wall, from: Point, to: Point, width: number, fragmentSize: number): FractureResult {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(width) || width <= 0 || !Number.isFinite(fragmentSize) || fragmentSize <= 0) {
    throw new RangeError('Invalid penetration dimensions');
  }
  const ux = dx / length;
  const uy = dy / length;
  const local = (point: Point): Point => ({ x: (point.x - from.x) * ux + (point.y - from.y) * uy, y: -(point.x - from.x) * uy + (point.y - from.y) * ux });
  const world = (point: Point): Point => ({ x: from.x + point.x * ux - point.y * uy, y: from.y + point.x * uy + point.y * ux });
  const transformed: Wall = { ...wall, polygons: wall.polygons.map((polygon) => polygon.map(local)) };
  const result = fractureBox(transformed, 0, -width / 2, length, width / 2, fragmentSize);
  return {
    wall: { ...wall, polygons: result.wall.polygons.map((polygon) => polygon.map(world)) },
    fragments: result.fragments.map((fragment) => ({ ...fragment, polygon: fragment.polygon.map(world) })),
  };
}

/** Spend energy per world unit of material along a continuous jet. Surviving
 * polygons are still authoritative; fragment size only controls emitted pieces. */
export function penetrateWalls(
  walls: Wall[], from: Point, to: Point, width: number, fragmentSize: number,
  energy: number, resistance: Partial<Record<MaterialId, number>>,
): PenetrationResult {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(energy) || energy < 0 ||
      !Number.isFinite(width) || width <= 0 || !Number.isFinite(fragmentSize) || fragmentSize <= 0) {
    throw new RangeError('Invalid penetration parameters');
  }
  const ux = dx / length;
  const uy = dy / length;
  const intervals: Array<{ start: number; end: number; cost: number }> = [];
  const polygonStarts = new Map<Wall, Map<Polygon, number>>();
  for (const wall of walls) {
    const cost = resistance[wall.material] ?? 1;
    if (!Number.isFinite(cost) || cost <= 0) throw new RangeError('Invalid material resistance');
    const wallIntervals: Array<{ start: number; end: number }> = [];
    for (const polygon of wall.polygons) {
      if (polygon.length < 3) continue;
      let signedArea = 0;
      for (let i = 0; i < polygon.length; i += 1) {
        const a = polygon[i]!;
        const b = polygon[(i + 1) % polygon.length]!;
        signedArea += a.x * b.y - b.x * a.y;
      }
      if (Math.abs(signedArea) < 1e-9) continue;
      const orientation = Math.sign(signedArea);
      let start = 0;
      let end = length;
      for (let i = 0; i < polygon.length; i += 1) {
        const a = polygon[i]!;
        const b = polygon[(i + 1) % polygon.length]!;
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const initial = orientation * (ex * (from.y - a.y) - ey * (from.x - a.x));
        const change = orientation * (ex * uy - ey * ux);
        if (Math.abs(change) < 1e-9) {
          if (initial < -1e-9) { end = -1; break; }
        } else if (change > 0) start = Math.max(start, -initial / change);
        else end = Math.min(end, -initial / change);
        if (end <= start) break;
      }
      if (end > start + 1e-9) {
        wallIntervals.push({ start, end });
        const starts = polygonStarts.get(wall) ?? new Map<Polygon, number>();
        starts.set(polygon, start);
        polygonStarts.set(wall, starts);
      }
    }
    wallIntervals.sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [];
    for (const interval of wallIntervals) {
      const last = merged[merged.length - 1];
      if (last && interval.start <= last.end + 1e-9) last.end = Math.max(last.end, interval.end);
      else merged.push({ ...interval });
    }
    for (const interval of merged) intervals.push({ ...interval, cost });
  }
  const boundaries = [...new Set([0, length, ...intervals.flatMap(({ start, end }) => [start, end])])].sort((a, b) => a - b);
  let remainingEnergy = energy;
  let reached = energy > 0 ? length : 0;
  for (let i = 0; i < boundaries.length - 1 && energy > 0; i += 1) {
    const start = boundaries[i]!;
    const end = boundaries[i + 1]!;
    const midpoint = (start + end) / 2;
    const rate = intervals.reduce((sum, interval) => sum + (interval.start < midpoint && interval.end > midpoint ? interval.cost : 0), 0);
    if (rate === 0) continue;
    const required = (end - start) * rate;
    if (remainingEnergy <= required) {
      reached = start + remainingEnergy / rate;
      remainingEnergy = 0;
      break;
    }
    remainingEnergy -= required;
  }
  const end = { x: from.x + ux * reached, y: from.y + uy * reached };
  const fragments: FractureFragment[] = [];
  const resultWalls = walls.map((wall) => {
    const polygons: Polygon[] = [];
    let damaged = false;
    for (const polygon of wall.polygons) {
      const start = polygonStarts.get(wall)?.get(polygon);
      if (start === undefined || reached <= start + 1e-9) {
        polygons.push(polygon.map((p) => ({ ...p })));
        continue;
      }
      const result = fractureWallBand({ ...wall, polygons: [polygon] }, from, end, width, fragmentSize);
      polygons.push(...result.wall.polygons);
      if (result.fragments.length > 0) damaged = true;
      fragments.push(...result.fragments);
    }
    return damaged ? { ...wall, polygons, anchored: false } : { ...wall, polygons };
  });
  return { walls: resultWalls, fragments, end, remainingEnergy };
}

/** A detached fracture piece with deterministic rigid-body state. Heat is
 * presentation data (0 = ambient, 1 = white hot), never a damage lattice. */
export interface FragmentBody {
  fragment: FractureFragment;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  heat: number;
  sleeping: boolean;
  /** Seconds spent quiet while supported; sleeps after a short settle. */
  rest?: number;
  /** Set during a step when the body touches ground, wall or another body. */
  supported?: boolean;
  /** Ground or wall support (not another chip): treated as static in piles. */
  staticSupport?: boolean;
}

function hslToRgbPacked(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  const toByte = (v: number): number => Math.round(Math.max(0, Math.min(1, v + m)) * 255);
  return (toByte(r) << 16) | (toByte(g) << 8) | toByte(b);
}

/** Thermal colour ramp measured off the reference strike footage: a cool
 * violet-blue fringe burns into magenta and red, then orange, then an amber
 * band, then a white-hot core as heat goes 0 -> 1. The sequence follows real
 * blackbody emission -- cooling steel never passes through cyan or green, and
 * the old ramp's green detour read as a rainbow instead of a scorch. */
/** Mix the blackbody ramp toward the material's own base color. */
export function heatColor(heat: number, base?: number): number {
  if (!Number.isFinite(heat)) throw new RangeError('Invalid heat');
  const t = Math.max(0, Math.min(1, heat));
  if (t >= 0.92) return 0xffffff;
  if (base !== undefined) {
    const ramp = heatColor(heat);
    const mix = 0.35; // 35% material hue, 65% blackbody — dynamically chosen from the material
    const r = Math.round((((ramp >> 16) & 0xff) * (1 - mix) + ((base >> 16) & 0xff) * mix));
    const g = Math.round((((ramp >> 8) & 0xff) * (1 - mix) + ((base >> 8) & 0xff) * mix));
    const b = Math.round(((ramp & 0xff) * (1 - mix) + (base & 0xff) * mix));
    return (r << 16) | (g << 8) | b;
  }
  const stops: Array<{ at: number; hue: number; sat: number; light: number }> = [
    { at: 0, hue: 274, sat: 0.52, light: 0.33 },
    { at: 0.18, hue: 270, sat: 0.58, light: 0.42 },
    { at: 0.34, hue: 288, sat: 0.6, light: 0.44 },
    { at: 0.5, hue: 312, sat: 0.62, light: 0.45 },
    { at: 0.64, hue: 344, sat: 0.68, light: 0.47 },
    { at: 0.78, hue: 18, sat: 0.82, light: 0.52 },
    { at: 0.88, hue: 38, sat: 0.86, light: 0.6 },
    { at: 1, hue: 46, sat: 0.5, light: 0.86 },
  ];
  for (let i = 1; i < stops.length; i += 1) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    if (t <= b.at) {
      const f = (t - a.at) / (b.at - a.at);
      // Interpolate hue the short way around the wheel. Red (352) to orange (20)
      // is a 28 degree step, but taking the raw difference walks backwards
      // through violet and blue and puts a cyan band in the middle of the burn.
      let from = a.hue;
      let span = b.hue - a.hue;
      if (span > 180) span -= 360;
      else if (span < -180) span += 360;
      from = ((from % 360) + 360) % 360;
      return hslToRgbPacked(from + span * f, a.sat + (b.sat - a.sat) * f, a.light + (b.light - a.light) * f);
    }
  }
  return 0xffffff;
}

/** Timber chars dark brown, masonry scorches, and only metal uses the hot-metal ramp. */
export function materialHeatColor(material: MaterialId, heat: number): number {
  if (MATERIALS[material].isMetal) return heatColor(heat, MATERIALS[material].colors.base);
  const base = MATERIALS[material].colors.base;
  const target = material === 'wood' ? 0x23150f : 0x353330;
  const amount = Math.max(0, Math.min(1, heat)) * (material === 'wood' ? 0.82 : 0.55);
  const blend = (shift: number): number => Math.round(((base >> shift) & 255) * (1 - amount) + ((target >> shift) & 255) * amount);
  return (blend(16) << 16) | (blend(8) << 8) | blend(0);
}

/** Turn fracture fragments into flying bodies. Velocities are deterministic:
 * same seed + same impact always produces the same debris field. Heat falls
 * off with distance from the impact point. */
export function spawnFragmentBodies(
  fragments: FractureFragment[],
  impact: Point,
  impulse: Point,
  seed: number,
  maxHeat = 1,
): FragmentBody[] {
  if (!Number.isFinite(impulse.x) || !Number.isFinite(impulse.y) || !Number.isFinite(seed)) throw new RangeError('Invalid fragment impulse');
  const rng = new Rng(seed >>> 0);
  return fragments.map((fragment) => {
    const centroid = fragment.polygon.reduce((sum, p) => ({ x: sum.x + p.x / fragment.polygon.length, y: sum.y + p.y / fragment.polygon.length }), { x: 0, y: 0 });
    const dist = Math.hypot(centroid.x - impact.x, centroid.y - impact.y);
    const heat = Math.max(0, Math.min(1, maxHeat * Math.exp(-dist / 40)));
    // Use area × density as a 2D mass proxy; equal impulse accelerates lighter
    // fragments more. The bounded square-root response keeps tiny chips stable.
    const mass = Math.max(1, polygonArea(fragment.polygon) * MATERIALS[fragment.material].density);
    const response = Math.max(0.3, Math.min(1.65, Math.sqrt(56 / mass)));
    const spread = 60;
    return {
      fragment,
      x: centroid.x,
      y: centroid.y,
      vx: (impulse.x + rng.range(-spread, spread)) * response,
      vy: (impulse.y + rng.range(-spread, spread)) * response - 40,
      angle: rng.range(-Math.PI, Math.PI),
      angularVelocity: rng.range(-4, 4),
      heat,
      sleeping: false,
    };
  });
}

function fragmentRadius(body: FragmentBody): number {
  return Math.max(1.2, Math.sqrt(Math.max(0, polygonArea(body.fragment.polygon))) * 0.5);
}

/**
 * Push a circle out of one convex polygon. Returns the outward normal and the
 * penetration depth, or null when there is no contact. Covers both the
 * outside-touching case and a centre that has ended up inside the polygon
 * (fast debris would otherwise tunnel and pop out the far face).
 */
function pushOutOfPolygon(
  polygon: Polygon,
  x: number,
  y: number,
  radius: number,
): { nx: number; ny: number; depth: number } | null {
  if (polygon.length < 3) return null;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (x + radius < minX || x - radius > maxX || y + radius < minY || y - radius > maxY) return null;
  let signedArea = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    signedArea += a.x * b.y - b.x * a.y;
  }
  if (Math.abs(signedArea) < 1e-9) return null;
  const orientation = Math.sign(signedArea);
  let inside = true;
  let bestD2 = Infinity;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len2 = ex * ex + ey * ey;
    if (len2 < 1e-12) continue;
    const cross = ex * (y - a.y) - ey * (x - a.x);
    if (orientation * cross < 0) inside = false;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / len2));
    const px = a.x + ex * t;
    const py = a.y + ey * t;
    const dx = x - px;
    const dy = y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; cx = px; cy = py; }
  }
  const dist = Math.sqrt(bestD2);
  if (inside) {
    const nx = dist > 1e-6 ? -(x - cx) / dist : 0;
    const ny = dist > 1e-6 ? -(y - cy) / dist : -1;
    return { nx, ny, depth: radius + dist };
  }
  if (dist >= radius) return null;
  const nx = dist > 1e-6 ? (x - cx) / dist : 0;
  const ny = dist > 1e-6 ? (y - cy) / dist : -1;
  return { nx, ny, depth: radius - dist };
}

/**
 * Integrate fragment bodies: gravity, ground rest, wall contact and body-on-body
 * stacking. World units only; camera zoom must never change these outcomes.
 *
 * Debris now collides with the surviving structure and with other fragments,
 * so rubble piles on ledges and stacks on the deck instead of sliding through
 * walls and through each other. Walls and the ground wake nothing: sleeping
 * bodies act as static supports until something hits them hard enough.
 */
export function stepFragmentBodies(
  bodies: FragmentBody[],
  dt: number,
  groundY: number,
  gravity = 900,
  walls: Wall[] = [],
): void {
  if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(groundY)) throw new RangeError('Invalid fragment step');
  if (bodies.length === 0) return;
  // Substep fast motion so a 20 px/frame chip cannot tunnel a 6 px beam.
  const steps = dt > 1 / 90 ? 2 : 1;
  const h = dt / steps;
  const resolveContacts = (body: FragmentBody): void => {
    const radius = fragmentRadius(body);
    let supported = false;
    for (const wall of walls) {
      for (const polygon of wall.polygons) {
        const push = pushOutOfPolygon(polygon, body.x, body.y, radius);
        if (!push) continue;
        body.x += push.nx * push.depth;
        body.y += push.ny * push.depth;
        const vn = body.vx * push.nx + body.vy * push.ny;
        if (vn < 0) {
          body.vx -= 1.18 * vn * push.nx;
          body.vy -= 1.18 * vn * push.ny;
          body.vx *= 0.82;
          body.vy *= 0.82;
          body.angularVelocity *= 0.7;
        }
        supported = true;
      }
    }
    if (body.y + radius >= groundY) {
      body.y = groundY - radius;
      body.vy = Math.abs(body.vy) > 40 ? -body.vy * 0.25 : 0;
      body.vx *= 0.6;
      body.angularVelocity *= 0.5;
      supported = true;
    }
    body.supported = body.supported === true || supported;
    if (supported) body.staticSupport = true;
  };
  for (let sub = 0; sub < steps; sub += 1) {
    for (const body of bodies) {
      if (body.sleeping) continue;
      body.vy += gravity * h;
      body.x += body.vx * h;
      body.y += body.vy * h;
      body.angle += body.angularVelocity * h;
      body.heat = Math.max(0, body.heat - h * 0.05);
      body.supported = false;
      body.staticSupport = false;
    }
    for (const body of bodies) {
      if (!body.sleeping) resolveContacts(body);
    }
    // Body-on-body stacking. Two passes settle a small pile without a long
    // iteration budget; bodies are circles for contact (pixel cubes visually).
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < bodies.length; i += 1) {
        const a = bodies[i]!;
        const ra = fragmentRadius(a);
        for (let j = i + 1; j < bodies.length; j += 1) {
          const b = bodies[j]!;
          if (a.sleeping && b.sleeping) continue;
          const rb = fragmentRadius(b);
          // Pixel cubes stack on their flat faces: resolve as axis-aligned
          // squares with a minimum-translation push. Circle contact let a
          // 1-pixel offset grow into a sideways slide, so piles rolled apart
          // instead of stacking.
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const ox = ra + rb - Math.abs(dx);
          const oy = ra + rb - Math.abs(dy);
          if (ox <= 0 || oy <= 0) continue;
          let nx = 0;
          let ny = 0;
          let overlap = 0;
          if (ox < oy) {
            nx = dx < 0 ? -1 : 1;
            overlap = ox;
          } else {
            ny = dy < 0 ? -1 : 1;
            overlap = oy;
          }
          // Ground/wall-backed chips act as static supports, so an upper chip
          // receives the full normal impulse. Splitting it 50/50 let a pile
          // pump itself downward every frame (gravity added 15, the lower chip
          // absorbed half and was clamped, the upper kept ~30 forever).
          const aStatic = a.sleeping || a.staticSupport === true;
          const bStatic = b.sleeping || b.staticSupport === true;
          const aMove = aStatic ? 0 : bStatic ? 1 : 0.5;
          const bMove = bStatic ? 0 : aStatic ? 1 : 0.5;
          a.x -= nx * overlap * aMove;
          a.y -= ny * overlap * aMove;
          b.x += nx * overlap * bMove;
          b.y += ny * overlap * bMove;
          const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (vn < 0) {
            const invA = aStatic ? 0 : 1 / Math.max(1, polygonArea(a.fragment.polygon) * MATERIALS[a.fragment.material].density);
            const invB = bStatic ? 0 : 1 / Math.max(1, polygonArea(b.fragment.polygon) * MATERIALS[b.fragment.material].density);
            const total = invA + invB || 1;
            const impulse = -1.08 * vn / total;
            if (invA) { a.vx -= impulse * invA * nx; a.vy -= impulse * invA * ny; }
            if (invB) { b.vx += impulse * invB * nx; b.vy += impulse * invB * ny; }
            if (a.sleeping && Math.abs(vn) > 18) { a.sleeping = false; a.rest = 0; }
            if (b.sleeping && Math.abs(vn) > 18) { b.sleeping = false; b.rest = 0; }
          }
          a.supported = true;
          b.supported = true;
          if (!a.sleeping) { a.vx *= 0.97; a.vy *= 0.97; }
          if (!b.sleeping) { b.vx *= 0.97; b.vy *= 0.97; }
        }
      }
    }
    // Pairs run after the first contact pass, so a lower chip can be pushed
    // into the deck at the end of a step. Re-resolve contacts to keep piles
    // stable and let them fall asleep instead of jittering forever.
    for (const body of bodies) {
      if (!body.sleeping) resolveContacts(body);
    }
    for (const body of bodies) {
      if (body.sleeping) continue;
      // Friction on any support (ground, wall or another chip). Without this a
      // chip resting on top of a pile kept spinning at its spawn rate forever
      // and never met the sleep threshold. The downward clamp stops a stack
      // from pumping itself into the deck every frame as gravity is re-applied.
      if (body.supported) {
        if (body.vy > 0) body.vy *= 0.25;
        body.vx *= 0.9;
        body.angularVelocity *= 0.9;
      }
      const quiet = Math.abs(body.vx) < 10 && Math.abs(body.vy) < 12 && Math.abs(body.angularVelocity) < 1.4;
      if (quiet && body.supported) {
        body.rest = (body.rest ?? 0) + h;
        if (body.rest > 0.45) {
          body.sleeping = true;
          body.vx = 0;
          body.vy = 0;
          body.angularVelocity = 0;
        }
      } else {
        body.rest = 0;
      }
    }
  }
}

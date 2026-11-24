import type { MaterialId } from '../materials';
import type { Polygon, Wall, Point } from '../sim/fracture';

/**
 * Line-defined wall authoring. A wall is set up by its outline (the line
 * segments, in world space) and is then populated by its material:
 *
 *   - `hollow: true`  -> the outline's perimeter band only (a shell the
 *     projectile must physically bore through), thickness world units deep;
 *   - `hollow: false` -> the whole interior is solid material.
 *
 * Both produce the same `Wall` objects the simulator already reads, so
 * collision, fracture, support and saves work unchanged. Hollow bands are
 * emitted as one quad per outline edge (each convex, each boreable); the
 * inner cavity stays empty, so cell counts never grow to hide decoration.
 */

export interface OutlineWallOptions {
  /** Perimeter only. Default false (solid). */
  hollow?: boolean;
  /** Band thickness in world units for hollow walls. Default 12. */
  thickness?: number;
  /** Bolt the wall into place (authored range). Default false. */
  anchored?: boolean;
  /** Wall id. Default `wl<outline hash>` (deterministic per shape). */
  id?: string;
}

/** Shrink a convex outline toward its centroid by `offset` world units. */
function shrink(outline: Point[], offset: number): Point[] {
  const cx = outline.reduce((s, p) => s + p.x, 0) / outline.length;
  const cy = outline.reduce((s, p) => s + p.y, 0) / outline.length;
  return outline.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy);
    const t = len > 0 ? Math.max(0, len - offset) / len : 0;
    return { x: cx + dx * t, y: cy + dy * t };
  });
}

/**
 * Build a wall from its world-space outline. Solid when `hollow` is false;
 * a perimeter band of `thickness` world units when true. The outline must be
 * a simple convex polygon (the same tools the renderer and fracture code
 * assume); at least 3 points, otherwise the wall is rejected.
 */
export function defineOutlineWall(outline: Polygon, material: MaterialId, options: OutlineWallOptions = {}): Wall {
  if (outline.length < 3) throw new RangeError('an outline needs at least 3 points');
  const pts = outline.map((p) => ({ x: p.x, y: p.y }));
  const hollow = options.hollow === true;
  const thickness = Math.max(1, options.thickness ?? 12);
  const polygons: Polygon[] = [];
  if (!hollow) {
    polygons.push(pts);
  } else {
    const inner = shrink(pts, thickness);
    // Empty when the band eats the whole shape: fall back to solid outline.
    const collapsed = inner.every((p, i) => Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y) < 1e-6);
    if (collapsed) {
      polygons.push(pts);
    } else {
      for (let i = 0; i < pts.length; i += 1) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        const a2 = inner[i]!;
        const b2 = inner[(i + 1) % inner.length]!;
        polygons.push([a, b, b2, a2]);
      }
    }
  }
  const id = options.id ?? `wl${[...pts.map((p) => `${Math.round(p.x)}_${Math.round(p.y)}`)].join('.').length.toString(36)}${Math.round(pts.reduce((s, p) => s + p.x + p.y, 0))}`;
  const wall: Wall = { id, material, polygons };
  if (options.anchored) wall.anchored = true;
  return wall;
}

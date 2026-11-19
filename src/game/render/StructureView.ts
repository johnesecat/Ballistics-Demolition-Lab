import Phaser from 'phaser';
import { MATERIALS } from '../materials';
import { WORLD } from '../config';
import { heatColor, type FragmentBody, type Polygon } from '../sim/fracture';
import type { WallState } from '../sim/walls';
import { pixelRuns } from './pixel-raster';

/**
 * Screen-pixel cube size. The recordings show crumble/heat as ~2-3 screen
 * pixels at any zoom — world size therefore shrinks as the camera zooms in.
 * Zooming out merges world area into the same screen pixels (shape-preserving
 * LOD) instead of drawing thousands of tiny world cubes.
 */
function pixelWorldSize(scene: Phaser.Scene): number {
  const zoom = scene.cameras.main?.zoom ?? 1;
  return Math.max(0.8, 2.6 / Math.max(0.4, zoom));
}

/**
 * Structure rendering, wall-object only.
 *
 * The structure is a set of solid polygons. An intact wall is ONE flat slab of
 * material colour with no mortar grid, no per-block shading and no cracks at any
 * zoom, exactly like the reference. Damage removes geometry -- it never reveals
 * blocks -- because a breach is a hole in the polygon set.
 *
 * Performance shape:
 *  - Every wall except the shot's focus wall is baked into ONE RenderTexture.
 *    Phaser then draws the whole range as a single quad every frame instead of
 *    replaying a fill path per polygon.
 *  - The wall the projectile is about to hit is drawn live, at full detail, so
 *    the breach edge and its heat remain crisp. When the shot ends the live
 *    wall is baked back in, preserving all deformation.
 *  - Zoomed-out views rasterize wall polygons onto a coarser grid (corners and
 *    small edges simplify), while the live focus wall is never simplified.
 */
export class StructureView {
  readonly container: Phaser.GameObjects.Container;
  private rt: Phaser.GameObjects.RenderTexture;
  private rtDepth: number;
  private rtBounds = { x: 0, y: 0, w: 0, h: 0 };
  private lastBakeKey = '';
  private bake: Phaser.GameObjects.Graphics;
  private detail: Phaser.GameObjects.Graphics;
  private bodyLayer: Phaser.GameObjects.Graphics;
  private heatLayer: Phaser.GameObjects.Graphics;
  private heatMaskSource: Phaser.GameObjects.Graphics;
  private lastWalls: WallState | null = null;
  private focusWall: string | null = null;
  private bodiesPainted = -1;

  private scene: Phaser.Scene;
  constructor(scene: Phaser.Scene, depth = 6) {
    this.scene = scene;
    // One world-sized texture. A 1200x675 RGBA surface is ~3.2 MB and turns 12
    // wall polygons (plus any future authored detail) into a single quad.
    // Sized to the occupied range on the first bake (see bakeWalls). A 1x1
    // placeholder avoids allocating a full-world transparent quad that would
    // overdraw the screen every frame.
    this.rt = scene.add.renderTexture(0, 0, 1, 1).setOrigin(0, 0).setDepth(depth).setVisible(false);
    this.rtDepth = depth;
    this.bake = scene.make.graphics({ x: 0, y: 0 }, false);
    this.detail = scene.add.graphics().setDepth(depth + 1);
    this.bodyLayer = scene.add.graphics().setDepth(depth + 2);
    this.container = scene.add.container(0, 0).setDepth(depth);
    this.heatLayer = scene.add.graphics().setDepth(depth + 3);
    this.heatLayer.setBlendMode(Phaser.BlendModes.NORMAL);
    // Thermal stain belongs to the wall face only, so it is clipped to the
    // surviving polygons: a bloom over a breach must not float in the air where
    // the geometry was blown away. The mask source holds the same wall shapes.
    this.heatMaskSource = scene.make.graphics({ x: 0, y: 0 }, false);
    this.heatLayer.setMask(this.heatMaskSource.createGeometryMask());
  }

  /** World bounds of the structure, or null when nothing is standing. */
  occupiedBounds(): Phaser.Geom.Rectangle | null {
    const state = this.lastWalls;
    if (!state || state.walls.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const wall of state.walls) {
      for (const poly of wall.polygons) {
        for (const p of poly) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
      }
    }
    if (!Number.isFinite(minX)) return null;
    return new Phaser.Geom.Rectangle(minX, minY, maxX - minX, maxY - minY);
  }

  /**
   * LOD bucket for the current camera. Every step simplifies wall corners onto
   * a coarser world grid; the bucket is also used to decide when to rebake.
   */
  lodBucket(): number {
    const zoom = this.scene.cameras.main?.zoom ?? 1;
    if (zoom >= 0.9) return 3;
    if (zoom >= 0.7) return 2;
    if (zoom >= 0.5) return 1;
    return 0;
  }

  /**
   * World size of one rendered pixel. Zooming out uses a bigger square, so the
   * silhouette loses small corners instead of gaining detail it cannot show.
   * Integers keep every edge on the same grid at every zoom.
   */
  private bakeCell(): number {
    const bucket = this.lodBucket();
    return bucket >= 2 ? 2 : bucket === 1 ? 3 : 4;
  }

  /** Live wall for the incoming projectile; null bakes everything together. */
  setFocus(wallId: string | null): void {
    if (this.focusWall === wallId) return;
    this.focusWall = wallId;
    this.bakeWalls();
  }

  /**
   * Heat-only refresh for a zoom change inside one LOD bucket. A bucket change
   * rebakes (cell size changed); sub-bucket zooms only need the heat pixels
   * resampled.
   */
  refreshHeat(state: WallState | null): void {
    this.heatLayer.clear();
    if (state) this.drawHeatField(state);
  }

  /** Solid polygons + thermal stain + fragment cubes. */
  setWalls(state: WallState | null, bodies: FragmentBody[] = []): void {
    this.lastWalls = state;
    // The cinematic asks for a wall frame on every projectile tick, but the
    // polygons only change on a fracture. Re-baking the whole RenderTexture per
    // frame would add a full-screen GPU pass during exactly the busiest scene.
    if (this.wallKey(state) !== this.lastBakeKey) this.bakeWalls();
    this.heatLayer.clear();
    if (state) this.drawHeatField(state);
    this.setBodies(bodies, true);
  }

  /** Cheap identity of the visible geometry: fragmenting always changes a
   * polygon's point count, while ordinary playback ticks do not. */
  private wallKey(state: WallState | null): string {
    if (!state) return 'none';
    // Include the cell size bucket: zooming out changes the raster and must
    // invalidate the bake even when no wall was damaged.
    let key = `${this.lodBucket()}|${state.walls.length}|`;
    for (const wall of state.walls) {
      key += `${wall.id}${wall.material}|`;
      for (const poly of wall.polygons) key += `${poly.length},`;
    }
    // Heat bends the bake. A new bloom must invalidate it; cooling (same
    // centres, falling heat) must not, or the texture would re-upload every
    // frame. Include anchor and radius, never the temperature.
    key += `|h${state.heat.length}`;
    for (const r of state.heat) key += `:${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.radius)}`;
    return key;
  }

  private bakeWalls(): void {
    this.lastBakeKey = this.wallKey(this.lastWalls);
    const bake = this.bake;
    const detail = this.detail;
    bake.clear();
    detail.clear();
    const mask = this.heatMaskSource;
    mask.clear();
    if (!this.lastWalls || this.lastWalls.walls.length === 0) {
      this.rt.clear();
      this.rt.setVisible(false);
      return;
    }
    // Crop the display to the occupied range. A full-world transparent quad
    // would overdraw the whole screen every frame; the cropped quad only covers
    // the structure (roughly a third of the width) and still renders in one
    // draw call.
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const wall of this.lastWalls.walls) {
      for (const poly of wall.polygons) {
        for (const p of poly) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
      }
    }
    // Bend pushes a steel vertex up to 18 * 1.6 = 28.8 units past the authored
    // outline. The old 24-unit pad clipped the bulge at the crop edge; keep a
    // full cap plus margin so warped plates stay whole in the bake.
    const pad = 40;
    const cropX = Math.max(0, Math.floor(minX - pad));
    const cropY = Math.max(0, Math.floor(minY - pad));
    const cropW = Math.max(1, Math.min(WORLD.width - cropX, Math.ceil(maxX - minX + pad * 2)));
    const cropH = Math.max(1, Math.min(WORLD.height - cropY, Math.ceil(maxY - minY + pad * 2)));
    this.ensureRT(cropX, cropY, cropW, cropH);
    // Re-read the texture: ensureRT may have replaced the old surface when the
    // structure bounds changed (damage widened or shrank the range).
    const rt = this.rt;
    rt.clear();
    rt.setVisible(true);
    const cell = this.bakeCell();
    const focusCell = 1;
    mask.fillStyle(0xffffff, 1);
    for (const wall of this.lastWalls.walls) {
      const focused = wall.id === this.focusWall;
      const g = focused ? detail : bake;
      const def = MATERIALS[wall.material];
      for (const poly of wall.polygons) {
        // Warping is baked, not just a live-focus flourish: a steel plate that
        // peeled at impact stays peeled in every later view and replay. Edges
        // are subdivided first so a long plate can actually curve instead of
        // only moving its four far-away corners.
        const refined = refinePolygon(poly, 12);
        const bent = this.bendPoly(refined, this.lastWalls, def.isMetal ? 1.6 : 1);
        this.fillPixelPoly(g, bent, def.colors, focused ? focusCell : cell);
        mask.beginPath();
        mask.moveTo(bent[0]!.x, bent[0]!.y);
        for (let i = 1; i < bent.length; i += 1) mask.lineTo(bent[i]!.x, bent[i]!.y);
        mask.closePath();
        mask.fillPath();
      }
    }
    rt.draw(bake, -cropX, -cropY);
  }

  private ensureRT(x: number, y: number, w: number, h: number): void {
    if (this.rtBounds.x === x && this.rtBounds.y === y && this.rtBounds.w === w && this.rtBounds.h === h) return;
    this.rt.destroy();
    this.rt = this.scene.add.renderTexture(x, y, w, h).setOrigin(0, 0).setDepth(this.rtDepth);
    this.rtBounds = { x, y, w, h };
  }

  /**
   * Debris-only redraw. Fragment cubes are tiny screen-pixel cubes (see
   * pixelWorldSize): physics bodies keep their polygon size; only the render
   * shrinks, matching the recordings where zoomed-in crumble is a few pixels
   * across. Called every frame while debris is awake, so it must never touch
   * the wall/heat geometry.
   */
  setBodies(bodies: FragmentBody[], force = false): void {
    // Once every chip is asleep the layer is static. Repainting it every frame
    // was pure waste at rest; skip until motion resumes or the wall state swaps
    // in a new body list.
    if (!force && bodies.length === this.bodiesPainted && bodies.length > 0 && bodies.every((b) => b.sleeping)) return;
    const g = this.bodyLayer;
    g.clear();
    this.bodiesPainted = bodies.length;
    if (bodies.length === 0) return;
    const px = pixelWorldSize(this.scene);
    for (const b of bodies) {
      const col = b.heat >= 0.5 ? heatColor(b.heat) : MATERIALS[b.fragment.material].colors.base;
      g.fillStyle(col, b.sleeping ? 0.9 : 1);
      // Debris is always a ~2.6 screen-pixel cube, so per-cube canvas rotation
      // was invisible while forcing a transform + draw-call flush per body.
      // Axis-aligned rects batch into one pass and look identical at this size.
      g.fillRect(b.x - px / 2, b.y - px / 2, px, px);
    }
  }

  /**
   * Thermal scorch field (P1-3 calibration vs A-82/B-55).
   *
   * Each bloom contributes a falling temperature; the strongest contribution at
   * a point wins and the point is painted once, from a single ramp. Painting
   * bloom by bloom instead let overlapping stains stamp their own independent
   * rainbows, which read as confetti rather than a burn. Compositing a field
   * first gives one coherent scorch: violet fringe, magenta and red body, then
   * orange, amber and a white-hot rim against the breach, exactly as the
   * reference shows. Samples are a fixed grid so the result is byte-identical on
   * every replay.
   */
  private drawHeatField(state: WallState): void {
    const hg = this.heatLayer;
    if (state.heat.length === 0 || state.walls.length === 0) return;
    const field = new Map<number, { heat: number; base: number }>();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of state.heat) {
      if (r.heat <= 0.03) continue;
      const radius = r.radius > 0 ? r.radius : 20 + r.heat * 34;
      minX = Math.min(minX, r.x - radius);
      minY = Math.min(minY, r.y - radius);
      maxX = Math.max(maxX, r.x + radius);
      maxY = Math.max(maxY, r.y + radius);
    }
    if (!Number.isFinite(minX)) return;
    // Heat pixels share the wall raster's grid, so the burn is made of the
    // same squares as the slab instead of a second, offset particle field.
    const step = this.bakeCell();
    minX = Math.floor(minX / step) * step;
    minY = Math.floor(minY / step) * step;
    const cols = Math.ceil((maxX - minX) / step);
    for (const r of state.heat) {
      if (r.heat <= 0.03) continue;
      const radius = r.radius > 0 ? r.radius : 20 + r.heat * 34;
      const gx0 = Math.max(0, Math.floor((r.x - radius - minX) / step));
      const gx1 = Math.min(cols - 1, Math.ceil((r.x + radius - minX) / step));
      const gy0 = Math.max(0, Math.floor((r.y - radius - minY) / step));
      const gy1 = Math.ceil((r.y + radius - minY) / step);
      for (let gy = gy0; gy <= gy1; gy += 1) {
        for (let gx = gx0; gx <= gx1; gx += 1) {
          const px = minX + (gx + 0.5) * step;
          const py = minY + (gy + 0.5) * step;
          const frac = Math.hypot(px - r.x, py - r.y) / radius;
          if (frac > 1) continue;
          // Cool fast with distance. A nearly flat falloff painted whole faces
          // amber and read as gold tiles; the footage keeps the bright burn
          // tight to the breach and lets it fade within about a third of the
          // bloom radius.
          const heat = r.heat * Math.pow(1 - frac, 1.9);
          if (heat < 0.1) continue;
          const key = gy * cols + gx;
          const prev = field.get(key);
          if (prev === undefined || heat > prev.heat) {
            // Dynamically chosen from the material's own color.
            field.set(key, { heat, base: MATERIALS[r.material ?? 'steel'].colors.base });
          }
        }
      }
    }
    // The heat layer is masked to surviving wall geometry (see constructor),
    // so cells are clipped once by the GPU mask. No per-cell point-in-polygon
    // test runs here — the old duplicate pass doubled the cost and could
    // disagree with the mask at edges, printing a halo outside the wall.
    for (const [key, cell] of field) {
      const gx = key % cols;
      const gy = Math.floor(key / cols);
      const px = minX + gx * step;
      const py = minY + gy * step;
      hg.fillStyle(heatColor(cell.heat, cell.base), 0.94);
      hg.fillRect(px, py, step, step);
    }
  }

  /** Displace a polygon's vertices away from hot blooms on the same wall. */
  private bendPoly(poly: Polygon, state: WallState, strength = 1): Polygon {
    if (state.heat.length === 0) return poly;
    return poly.map((p) => {
      let bloom: { x: number; y: number; radius: number; heat: number } | null = null;
      for (const r of state.heat) {
        const d = Math.hypot(p.x - r.x, p.y - r.y);
        if (d > r.radius) continue;
        const h = r.heat * (1 - d / r.radius);
        if (!bloom || h > bloom.heat) bloom = { x: r.x, y: r.y, radius: r.radius, heat: h };
      }
      if (!bloom || bloom.heat < 0.1) return { ...p };
      const dx = p.x - bloom.x;
      const dy = p.y - bloom.y;
      const dist = Math.hypot(dx, dy);
      const len = dist || 1;
      // Scale with distance so the fold grows outward from the breach (A-82).
      // Edge points far from the bloom still move a few pixels, which is what
      // makes a long steel plate visibly bow instead of only its corners.
      const push = Math.min(18, bloom.heat * 24 * (dist / bloom.radius)) * strength;
      return { x: p.x + (dx / len) * push, y: p.y + (dy / len) * push };
    });
  }

  /**
   * Solid-square raster. The wall is still a true polygon for collision, but
   * every visible pixel is an axis-aligned square; breaches and bends become
   * stair-stepped runs instead of diagonal vector edges and triangle slivers.
   * Top and bottom exposed cells take the material's light/dark swatch, which
   * keeps the slab readable without gradients, curves or outlines.
   */
  private fillPixelPoly(
    g: Phaser.GameObjects.Graphics,
    poly: Polygon,
    colors: { base: number; light: number; dark: number },
    cell: number,
  ): void {
    // Same-colour cells arrive merged into horizontal runs. A run is a row of
    // squares, so the pixels are identical while the live focus wall drops from
    // thousands of fill quads to a few hundred.
    for (const run of pixelRuns(poly, colors, cell)) {
      g.fillStyle(run.color, 1);
      g.fillRect(run.x, run.y, run.w, run.h);
    }
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
    this.rt.setVisible(visible);
    this.detail.setVisible(visible);
    this.bodyLayer.setVisible(visible);
    this.heatLayer.setVisible(visible);
  }
}

/** Insert points along long edges so a bloom can bend the middle of a plate. */
function refinePolygon(poly: Polygon, maxEdge: number): Polygon {
  if (poly.length < 3) return poly;
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / maxEdge));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      out.push({ x: a.x + dx * t, y: a.y + dy * t });
    }
  }
  return out;
}

export function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

import Phaser from 'phaser';
import { WORLD } from '../config';
import { MATERIALS } from '../materials';
import type { MaterialId } from '../materials';
import { shade } from './StructureView';
import { pointInWalls, type WallState } from '../sim/walls';

export interface VisualCell {
  x: number;
  y: number;
  material: MaterialId;
  grain: number;
  hp: number;
  maxHp: number;
}

interface Cube {
  image: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  va: number;
  contact: number;
  asleep: boolean;
  rest: number;
}

const MAX_CUBES = 700;
const GRAVITY = 940;
const GROUND = WORLD.groundY;

/**
 * Fully dynamic demolition: every destroyed lattice cell becomes ONE
 * individual solid-colour cube (tile-sized, exactly the lattice cell size).
 * No grouped slabs, no textured pieces. Cubes fly with bullet momentum +
 * radial blast velocity, spin, collide with the ground, with the remaining
 * lattice, and with each other, then sleep into a rubble pile.
 *
 * Presentation only — the deterministic simulator decides which cells die,
 * including pierce paths through multiple layers (steel or brick, per ammo).
 */
export class DemolitionDirector {
  private scene: Phaser.Scene;
  private cubes: Cube[] = [];
  private max = MAX_CUBES;
  private pool: Phaser.GameObjects.Image[] = [];
  private walls: WallState | null = null;
  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Quality switch: fewer live cubes on low-end devices. */
  setOptions(reduced: boolean): void {
    this.max = reduced ? 160 : MAX_CUBES;
  }

  setWalls(state: WallState | null): void {
    this.walls = state;
  }

  private obtain(): Phaser.GameObjects.Image {
    const image = this.pool.pop() ?? this.scene.add.image(0, 0, 'cube').setDepth(18);
    image.setTexture('cube');
    image.setVisible(true);
    image.setDepth(18);
    const size = WORLD.tile * 0.45;
    image.setDisplaySize(size, size);
    image.setAlpha(1);
    return image;
  }

  private addCube(cell: VisualCell, vx: number, vy: number, va: number): void {
    if (this.cubes.length >= this.max) this.trim();
    if (this.cubes.length >= this.max) return;
    const image = this.obtain();
    // Material-specific debris shape (spec section 3/5): wood splits into
    // elongated splinters, metal into small bright fragments, masonry into
    // blocky chunks. All well under one lattice cell.
    const tile = WORLD.tile;
    if (cell.material === 'wood') image.setDisplaySize(tile * 0.9, tile * 0.3);
    else if (cell.material === 'steel' || cell.material === 'armor') image.setDisplaySize(tile * 0.35, tile * 0.35);
    const colors = MATERIALS[cell.material].colors;
    // Near-flat shade: reference chunks are the material colour, barely varied.
    const tone = 0.95 + (cell.grain % 3) * 0.02 + Math.random() * 0.03;
    image.setTint(shade(colors.base, Math.min(1.02, tone)));
    image.setPosition(cell.x, cell.y);
    image.setRotation(Math.random() * Math.PI * 2);
    this.cubes.push({ image, x: cell.x, y: cell.y, vx, vy, angle: image.rotation, va, contact: 0, asleep: false, rest: 0 });
  }

  /** Impact: cubes burst radially from the blast origin, carried forward by the bullet. */
  spawnImpact(cells: VisualCell[], origin?: { x: number; y: number }, force = 1, dir?: { x: number; y: number }): void {
    if (cells.length === 0) return;
    const center = origin ?? {
      x: cells.reduce((sum, cell) => sum + cell.x, 0) / cells.length,
      y: cells.reduce((sum, cell) => sum + cell.y, 0) / cells.length,
    };
    const d = dir ?? { x: 1, y: 0 };
    for (const cell of cells) {
      const dx = cell.x - center.x;
      const dy = cell.y - center.y;
      const dist = Math.hypot(dx, dy) || 1;
      const radial = (40 + Math.random() * 130) * force;
      const vx = (dx / dist) * radial + d.x * (60 + Math.random() * 90) * force;
      const vy = (dy / dist) * radial + d.y * 60 * force - (30 + Math.random() * 60) * force;
      this.addCube(cell, vx, vy, (Math.random() - 0.5) * 4 * force);
    }
  }

  /** Collapse: unsupported cells drop as individual cubes with a sideways shove. */
  spawnCollapse(cells: VisualCell[], impact?: { x: number; y: number }): void {
    if (cells.length === 0) return;
    for (const cell of cells) {
      const push = impact ? Math.sign(cell.x - impact.x || 1) : 1;
      this.addCube(cell, push * (8 + Math.random() * 30), -6 - Math.random() * 18, push * (0.4 + Math.random() * 0.8));
    }
  }

  update(deltaMs: number): void {
    const delta = Math.min(48, Math.max(0, deltaMs)) / 1000;
    if (delta <= 0) return;
    const steps = delta > 1 / 40 ? 2 : 1;
    for (let step = 0; step < steps; step += 1) this.step(delta / steps);
    // Settled debris fades out and recycles instead of piling up forever
    // (spec section 5: settle, despawn, or fade; bounded body count).
    for (let i = this.cubes.length - 1; i >= 0; i -= 1) {
      const c = this.cubes[i]!;
      if (c.asleep) {
        c.rest += delta;
        if (c.rest > 7) {
          c.image.setVisible(false);
          this.pool.push(c.image);
          this.cubes.splice(i, 1);
          continue;
        }
        if (c.rest > 5) c.image.setAlpha(Math.max(0, 1 - (c.rest - 5) / 2));
      }
      c.image.setPosition(c.x, c.y);
      c.image.setRotation(c.angle);
    }
  }

  private step(dt: number): void {
    const tile = 12;
    for (const c of this.cubes) {
      if (c.asleep) continue;
      c.vy += GRAVITY * dt;
      c.vx *= 1 - 0.14 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.angle += c.va * dt;
      let touched = false;
      // Ground: chunk half-diagonal (chunks are ~0.55 tile).
      const half = tile * 0.38;
      if (c.y + half > GROUND) {
        c.y = GROUND - half;
        if (c.vy > 0) {
          c.vy = -c.vy * 0.18;
          c.vx *= 0.78;
          c.va *= 0.62;
          if (Math.abs(c.vy) < 22) c.vy = 0;
        }
        touched = true;
      }
      // Remaining structure (circle vs surviving wall polygons).
      if (this.walls && pointInWalls(this.walls.walls, { x: c.x, y: c.y })) {
        // Inside a wall: push out along the shallower axis (presentation only).
        c.y -= 6; c.vy = Math.min(0, c.vy); c.va *= 0.8; touched = true;
      }
      if (touched) c.contact += dt;
      else c.contact = Math.max(0, c.contact - dt);
      if (!c.asleep && c.contact > 0 && Math.hypot(c.vx, c.vy) < 8 && Math.abs(c.va) < 0.14) {
        c.asleep = true;
        c.vx = 0; c.vy = 0; c.va = 0;
      }
    }
    // Cube vs cube (circle, equal size). Bucketed on a coarse grid so the pair
    // count stays low even with hundreds of tumbling blocks on a phone.
    const minDist = tile * 0.62;
    const cellSize = Math.max(tile * 2, 24);
    const buckets = new Map<string, Cube[]>();
    const bucketKey = (x: number, y: number): string => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
    for (const cube of this.cubes) {
      const key = bucketKey(cube.x, cube.y);
      const list = buckets.get(key);
      if (list) list.push(cube);
      else buckets.set(key, [cube]);
    }
    const pairs: Array<[Cube, Cube]> = [];
    for (const [key, list] of buckets) {
      const [bx, by] = key.split(',').map(Number) as [number, number];
      for (let ox = 0; ox <= 1; ox += 1) {
        for (let oy = ox === 0 ? 0 : -1; oy <= 1; oy += 1) {
          const other = ox === 0 && oy === 0 ? list : buckets.get(`${bx + ox},${by + oy}`);
          if (!other) continue;
          for (let i = 0; i < list.length; i += 1) {
            const a = list[i]!;
            // Within one bucket, visit each unordered pair once. Neighbouring
            // buckets are already visited once by the offset traversal.
            for (let j = other === list ? i + 1 : 0; j < other.length; j += 1) {
              const b = other[j]!;
              if (a.asleep && b.asleep) continue;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              if (dx * dx + dy * dy < minDist * minDist) pairs.push([a, b]);
            }
          }
        }
      }
    }
    for (const [a, b] of pairs) {
      if (a.asleep && b.asleep) continue;
      {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= minDist) continue;
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const relativeSpeed = Math.hypot(rvx, rvy);
        // Coincident centers have no geometric normal. Use the incoming
        // relative velocity, or a fixed axis when both pieces are stationary.
        const nx = dist > 1e-9 ? dx / dist : relativeSpeed > 1e-9 ? -rvx / relativeSpeed : 1;
        const ny = dist > 1e-9 ? dy / dist : relativeSpeed > 1e-9 ? -rvy / relativeSpeed : 0;
        // Settled rubble can be struck and displaced by later-falling cells.
        if (a.asleep) a.image.setAlpha(1);
        if (b.asleep) b.image.setAlpha(1);
        a.asleep = false; b.asleep = false;
        a.rest = 0; b.rest = 0;
        const overlap = (minDist - dist) * 0.5;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b.x += nx * overlap; b.y += ny * overlap;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          const imp = -(1 + 0.14) * vn * 0.5;
          a.vx -= imp * nx; a.vy -= imp * ny;
          b.vx += imp * nx; b.vy += imp * ny;
          a.va += (Math.random() - 0.5) * 0.25;
          b.va += (Math.random() - 0.5) * 0.25;
        }
      }
    }
  }

  private trim(): void {
    while (this.cubes.length >= this.max) {
      let idx = this.cubes.findIndex((c) => c.asleep);
      if (idx < 0) idx = 0;
      const [removed] = this.cubes.splice(idx, 1);
      if (removed) {
        removed.image.setVisible(false);
        this.pool.push(removed.image);
      }
      if (idx === 0 && this.cubes.length >= this.max) break;
    }
  }

  clear(): void {
    for (const c of this.cubes) {
      c.image.setVisible(false);
      this.pool.push(c.image);
    }
    this.cubes = [];
  }

  get bodyCount(): number {
    return this.cubes.length;
  }
}

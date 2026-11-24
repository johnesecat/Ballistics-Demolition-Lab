/**
 * Render the AP Solid Shot lattice (pristine, crushing, wreck) as PPM frames
 * into `artifacts/ref/`, so the side-by-side in `artifacts/ap-solid-shot-compare.png`
 * is reproducible from `scripts/sample_projectile.py` plus this file:
 *
 *     python3 scripts/sample_projectile.py
 *     npx tsx scripts/render_round.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('artifacts/ref', { recursive: true });
import { ShellImpact } from '../src/game/sim/shell-pixels';
import { pristineShell, type ShellCell } from '../src/game/sim/projectile-shell';
import { SHELL_COLORS } from '../src/game/render/ProjectileView';

const SCALE = 8;
const BG = 0x0e1624;

function render(cells: ShellCell[], file: string): void {
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const c of cells) {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
  }
  const pad = 2;
  const w = (maxX - minX + 1 + pad * 2) * SCALE;
  const h = (maxY - minY + 1 + pad * 2) * SCALE;
  const buf = Buffer.alloc(w * h * 3);
  const bg = [(BG >> 16) & 255, (BG >> 8) & 255, BG & 255];
  for (let i = 0; i < w * h; i += 1) buf.set(bg, i * 3);
  for (const cell of cells) {
    const col = SHELL_COLORS[cell.part] ?? 0xff00ff;
    const r = (col >> 16) & 255; const g = (col >> 8) & 255; const b = col & 255;
    const px = (cell.x - minX + pad) * SCALE;
    const py = (cell.y - minY + pad) * SCALE;
    for (let y = 0; y < SCALE; y += 1) {
      for (let x = 0; x < SCALE; x += 1) {
        const at = ((py + y) * w + px + x) * 3;
        buf[at] = r; buf[at + 1] = g; buf[at + 2] = b;
      }
    }
  }
  const header = Buffer.from(`P6\n${w} ${h}\n255\n`, 'ascii');
  writeFileSync(file, Buffer.concat([header, buf]));
  console.log(file, `${w}x${h}`, `${cells.length} cells`);
}

render(pristineShell(), 'artifacts/ref/round_pristine.ppm');
const crushed = new ShellImpact({ speed: 470, mass: 9, material: 'steel', integrity: 0.9, seed: 4242, hardness: 0.9, crumple: 0.5 });
crushed.stepTo(0.16);
render(crushed.cells(), 'artifacts/ref/round_crushed.ppm');
const wrecked = new ShellImpact({ speed: 470, mass: 9, material: 'steel', integrity: 0.6, seed: 4242, hardness: 0.9, crumple: 0.9 });
wrecked.stepTo(0.55);
render(wrecked.cells(), 'artifacts/ref/round_wreck.ppm');
console.log('shrapnel', wrecked.shrapnel().length, 'of', wrecked.pixels.length);

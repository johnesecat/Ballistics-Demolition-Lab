# Pixel-Destruction Plan (2026-11-18)

Order: cleanup first, then walls, then look/physics. Each phase ends with `npx tsc --noEmit` + `npm run build`; live Playwright screenshots only at phase ends.

## Phase 0 — Heat cleanup + dead grid removal
1. `StructureView`: remove the per-cell `pointInPolygon` loop in `drawHeatField`; keep the geometry mask as the single clip. Remove `hashUnit` jitter duplication if it becomes dead.
2. `DemolitionDirector`: replace `setGrid(grid)` + `solids` set with `setWalls(state: WallState | null)`; cube-vs-structure collision tests point-in-polygon against wall rects/polys. Remove `VisualCell` grid shape dependency (`shape` field).
3. `CoreView`/`RelayView`: `setRelays(relays, grid)` → `setRelays(relays)`; relay position from world rect (new `RelayState.rect`), fallback to legacy col/row conversion inside `RelayView` until generator migration lands.
4. `ShotResult`: delete `initialGrid`; remove construction in `wall-simulator.ts`; delete legacy `DamageEvent.cells` consumers if any remain (keep type field deprecated for one phase, then remove).
5. `BattleScene`: update all call sites; `getDebugInfo` unchanged.
6. Check: tsc + build; live: heat still clipped, no floating scorch.

## Phase 1 — Generator emits walls directly (P0-11/P0-12)
1. New `src/game/stages/wall-builder.ts`: `rect(x,y,w,h,material)`, `poly(points,material)`, `carve(rect)` (rect subtraction via polygon clipping), `cap(thickness, material)`; enforces caps wood 4 / steel 5 / armor 7 / metal 4 in world units.
2. Rewrite `generator.ts`: replace `DraftBuilder` cell grid with `WallBuilder`; each `buildTower/Bunker/…` becomes wall ops in world coordinates; core cavity = carve; corridor = carve; relay = rect wall + `RelayState.rect`; cover = wall-perimeter sampling (already wall-based).
3. `BuiltStage.grid` → compatibility shell (origin/tile/cols/rows, all cells null); `wallState` is the emitted walls. `wallsFromSnapshot` legacy path kept for old saves.
4. Author AH-01 as the video test range (see design doc).
5. `validate-stages.ts` validates wall invariants (grounded, core covered, no self-overlap, caps).
6. Check: tsc + build + `scripts/test-fracture.ts` + `test-walls.ts`.

## Phase 2 — Tiny cubes + shape-preserving LOD
1. `StructureView`: `pixelSize = clamp(base / zoom, min, max)`; wall fill subdivided into `pixelSize` cubes at close zoom, merged runs at far zoom; edges snapped to polygon boundaries so holes stay jagged; same scale for fragments/heat.
2. `CAMERA.maxZoomFactor` stays 2.25; effective cube size at max zoom ≈ 1–2 world units (~5× smaller than current 6.5).
3. Check: screenshots at min/mid/max zoom, jagged bullet hole preserved zoomed out.

## Phase 3 — Metal-only thermal + material tint + cooling + bending
1. `walls.ts`: `WallHeatRegion.material`; `addHeat` no-ops for non-metals; `MATERIALS.isMetal` gate in `wall-simulator.applyPhase`.
2. `fracture.ts`: `heatColor(heat, base?)` mixes ramp with material base color; `coolHeat(state, dt)` decay 0.02/s.
3. `StructureView`: `drawHeatField` uses per-region material tint; bending pass displaces polygon vertices ∝ heat along stored normal (add `nx,ny` to region).
4. `BattleScene.update`: call `coolHeat` on `viewWallState` each frame.
5. Brick: heat region count for brick stays 0; crumble already via fracture.
6. Check: HEAT shot on steel = tinted scorch + visible bend (A-82); HE on brick = no heat stain, crumble only.

## Phase 4 — Destructible x-ray projectile
1. New `src/game/sim/projectile-body.ts`: `ProjectileBody { mass, integrity, squash, casing[], filler }`; `stepProjectile` (penetration loop: ` speed -= resistance × thickness / mass`, stop when speed ≤ 0 or thickness > material cap); squash = f(impact energy, material strength, thickness); fragment shedding via existing `spawnFragmentBodies`.
2. `wall-simulator`: route kinetic (non-explosive) phases through the penetration loop instead of instant break; explosive rounds keep phases.
3. `BattleScene` + new `ProjectileView`: draws pixel cubes for casing (grey), orange rear band, amber filler octagon, white nose, fins; during squash the filler is drawn exposed (x-ray); trail dashes like the footage.
4. Check: slow-mo impact frames vs crop-X-0140 (boxy casing + yellow core).

## Phase 5 — First map + calibration
1. AH-01 test range live as default; colors sampled from B-55 (steel blue-grey #66798d, brick orange-brown #7a4a38, wood #8a5a36, core red #ff2b1f).
2. Playwright: fire HEAT at steel column, HE at brick, compare screenshots to A-82/B-55/B-70.
3. Update `tasks.md` (P0-11, P0-12, P0-10b closed; new P1 entries for projectile/thermal).

## Verification (every phase)
`npx tsc --noEmit`, `npm run build`, existing `scripts/test-fracture.ts` / `test-walls.ts`; final: live browser playthrough + screenshots. No commit/push without authorization.

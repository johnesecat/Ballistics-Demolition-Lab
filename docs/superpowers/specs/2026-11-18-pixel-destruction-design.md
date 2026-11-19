# Pixel-Destruction Replica — Design (2026-11-18)

## Intent
Rebuild the Phaser artillery game as a 1:1 replica of the 11-18-2026 recordings: grid-free wall objects, tiny solid-color pixel cubes at full zoom, destructible projectiles with a visible x-ray interior right before impact, metal-only thermal scorch + bending, brick crumble, and the newest video's test range as the first playable map.

## Goals / Non-goals / Anti-goals
- Goals: heat cleanup (no duplicate clipping, no dead grid code); generator emits `Wall[]` directly; no `grid` params on CoreView/RelayView/DemolitionDirector; no `ShotResult.initialGrid`; cubes ~1/5 current size at max zoom with shape-preserving LOD on zoom-out; projectile = layered pixel body (casing/filler/core/fins) that squashes, sheds fragments, penetrates by speed+mass vs per-material thickness caps (wood 4, steel 5, armor 7, metal 4) and loses speed per layer; heat only on steel/armor/metal, tinted from the material's own color, cooling over time; hot metal bends dynamically (A-82 fold); brick crumbles only where hit; first map = newest video test range (column of 3 separated steel/brick/steel blocks, wooden truss + diagonal, blue-grey box + solid red core).
- Non-goals: full pixel-field sim (option 1, rejected — undoes P0, can't do A-82 bending or mass penetration); new ammo families; new HUD screens.
- Anti-goals: no placeholder/dead code paths; no grid damage model kept "just in case"; no commit/push/deploy without authorization.

## Evidence (frames pulled 2026-11-18, video A 2554x1180 60fps)
- Flight: small finned missile, grey-blue casing, orange/red band near rear, dashed white trail.
- Just before/at impact (crop-X-0140): projectile squashes into a boxy grey body exposing a yellow octagonal filler core; white/cyan flash at the contact face; orange spark spray. This is the x-ray reveal to replicate.
- A-82: steel column bends/folds with violet→magenta→red→orange→amber→white scorch, sheared slab on top.
- B-55: steel column cratered white/yellow with sparks; wooden truss (thin frame + one diagonal brace); blue-grey box, solid red square core.
- B-70 / sheet-10: brick wall explodes into tiny crumbling cubes + fireball.

## Approaches considered
1. Full pixel-field sim — most literal, rejected: heavy, fights wall-object P0, no natural bending/penetration.
2. **Wall polygons + pixel skin (chosen).** Walls stay authoritative polygons; renderer draws tiny cubes scaled by zoom; hot-metal walls bend via vertex displacement; projectile is a segmented body. Equivalent to the recordings in the long run with a fraction of the cost.
3. Hybrid rigid-body with squash scaling — rejected: can't reproduce bending/crumble detail.

## Parts (as decided)
- **Cleanup:** `StructureView` keeps the geometry mask only (drop per-cell `pointInPolygon` duplicate); delete `DemolitionDirector` grid-solid path (cube-vs-wall uses `WallState`); delete `initialGrid` from `ShotResult` and its construction.
- **Generator:** new `WallBuilder` (rect + polygon + rect-subtract carve) emits `Wall[]` + core + world-rect relays directly; `BuiltStage.grid` becomes a compatibility shell (empty cells, correct origin/tile) until consumers migrate. Caps enforced in world units: wood 4, steel 5, armor 7, metal 4 (steel family incl. armor plate for wall thickness — penetration resistance stays per-material). The first stage (AH-01) is authored as the video test range; campaign stages keep their silhouettes via the same builder.
- **Renderer:** cube size `worldPerPixel` shrinks with zoom (max zoom ≈ 1.4px cubes); zoom-out merges 2×2/4×4 cubes but preserves polygon edges (bullet holes stay jagged) via edge-aware LOD. Applied to walls, fragments, heat cells, projectile.
- **Thermal:** `WallHeatRegion` gains `material` (stamped only when the hit wall is metal); `heatColor(heat, baseColor)` mixes blackbody ramp toward the material color; cooling decay in `BattleScene.update` (0.02/s); bending: walls with heat > 0.55 displace vertices along the impact normal, magnitude ∝ heat, capped, deterministic.
- **Projectile:** `ProjectileBody` (casing/filler/nose/fins, mass, integrity) flies as pixel cubes; on contact: squash factor from impact energy vs material strength, casing fragments shed, filler exposed (x-ray), penetration loop consumes speed per thickness cap; non-explosive unless the round's phases say so; explosive rounds keep their existing phases.
- **First map:** test range authored in world coordinates: bottom steel column block, middle brick block, top steel block (gaps between), truss frame + diagonal (wood), core box (blue-grey) + red core square; dark navy sky, skyline silhouettes, thin ground line.

## Constraints
Deterministic replays/saves; iPhone 15 Safari landscape touch; GitHub Pages subpath build; no new dependencies.

## Builder's open items (my calls, reversible)
- Relay storage migrates from `cells: {col,row}[]` to `rect: {x,y,w,h}` with a legacy adapter in `wallsFromSnapshot`.
- LOD merge threshold tied to camera zoom, not wall content.

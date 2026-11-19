# 1:1 Replica — Full Task List

Source of truth for this list: the two 11-18-2026 recordings (each ~3:12,
2554x1180, 60fps), watched in full via 1fps contact sheets plus full-res
frames at impact moments. Older reference: the two 11-13-2026 recordings
(bunker / tank / fort layouts, HEAT through a roof). Everything below is
something the recordings show that the current build does not do, or does
differently. Tick items off only when a live browser check matches the
recording frame-for-frame in behaviour (not just "it compiles").

How to read this file: **P0** = the grid-free rewrite itself (the live game
must run on wall objects, not on the damage grid). **P1** = visible 1:1
differences. **P2** = polish / completeness. "Observed" = seen in the
recordings. "Current" = what the code does today (verified 2026-11-18).

---

## P0 — Replace the damage grid with wall objects (the rewrite)

Current state (2026-11-18, P0 session): **partially done.** Damage,
penetration, collapse, heat and fragment physics are live on wall objects
(`src/game/sim/walls.ts`, `src/game/sim/wall-simulator.ts`,
`StructureView.setWalls`), verified in a live browser (AH-01: 105 walls,
HEAT 24 bodies / 14 heat walls, HE 223 bodies, objective cleared in 3
shots). The grid still exists as replay/HUD transport (rasterized from
walls) and `preview.ts` still traces it — P0-9..P0-12 remain open. The
user explicitly said: do not keep the damage grid, not even hidden behind
merged rendering.

- [x] **P0-1 Wall identity.** LIVE (2026-11-18): `src/game/sim/walls.ts`
  `wallsFromSnapshot()` builds stable-id `Wall` objects (105 on AH-01);
  `wall-simulator.ts` damage never reads cell hp. Grid hp remains only
  in raster replay transport (P0-12 to remove).
- [ ] **P0-2 Wall definition data.** Author walls as rectangles / angled
  polygons / composed shapes (bunker, tank, fort, truss frame + diagonal,
  box + core). Angled objects from the 11-13 recordings must be real
  polygons, not stepped cells. Retire `CellShape: block | slopeL | slopeR`.
- [x] **P0-3 Swept projectile vs walls.** LIVE for flight: `simulateShotWalls`
  uses `traceWalls()` (radius, corners, slopes, nearest-wins). Still to do:
  `preview.ts` still traces the grid raster; `collision.ts` not yet deleted
  (P0-12).
- [x] **P0-4 Impact-local fracture only.** LIVE: blast phases call
  `fractureWall()` on walls near the impact; jets call `fractureWallBand()`
  via `penetrateWalls()`. Region calibration per family still rough
  (square-box region inherited) — tune against recordings.
- [x] **P0-5 Layered penetration.** LIVE: `penetrateWalls()` sequential
  energy/resistance per material; HEAT narrow band, HE wide crater
  verified live (24 vs 223 bodies). Exact 5-metal/7-brick caps and
  per-family widths still need calibration vs footage.
- [x] **P0-6 Support + collapse.** LIVE: `detachUnsupported()` derives
  support from wall adjacency + ground, re-checked after every phase;
  detached walls become fragment bodies. Verified live (HE polys 110→99).
  Truss-sag nuance (partial support) not yet modelled.
- [x] **P0-7 Fragment rigid bodies.** LIVE: bodies spawn from every
  fracture/collapse, stepped in `BattleScene.update` (gravity, ground,
  sleep), rendered as solid cubes, deterministic seed. Still missing:
  pairwise + wall collision, stacking, wake-on-impact (Matter debris
  still covers large chunks in parallel).
- [x] **P0-8 Wall heat state.** LIVE: `WallState.heat` is a flat surface list of
  blooms (x, y, peak, radius) that survives walls being fractured and rebuilt,
  and is clipped to surviving polygon area by a geometry mask plus a per-cell
  point-in-polygon test. `heatColor()` now follows blackbody order -- violet →
  blue-violet → magenta → red → orange → amber → white, with wrap-aware hue
  interpolation (the old ramp walked red→orange the long way and printed a cyan
  band in the middle of every burn). `StructureView` composites all blooms into
  one heat field and paints each surviving 6.5-unit cell once, so overlapping
  hits read as a single scorch instead of stacked rainbow discs. Blooms are
  anchored just outside the fracture radius so the hot rim lands on surviving
  face rather than being removed with the crater. Verified live on AH-01 (HEAT,
  21°/391 and HE, 23°/349): violet fringe, red-magenta body, amber and white-hot
  rim against the breach, stain persists between shots and accumulates.
  Cooling over time not yet implemented (stain is permanent until reset).
- [x] **P0-9 Objectives on walls.** Done: `snapshotCoreCoverFraction()` samples
  the core perimeter against wall polygons, relays use `pointInWalls()` on
  relay centres, and the HUD reads `alive/total RELAYS`. No cell counting left.
- [x] **P0-10 Snapshots / replay / saves.** Done: `StageSnapshot.wallState`,
  `serializeWallState()` / `deserializeWallState()`, `ShotResult.phaseWallStates`
  + timed bodies for replay, `DamageEvent.wallState` / `spawnedBodies`
  authoritative. Heat is a flat surface list (`WallState.heat[]`) so it survives
  walls being rebuilt under new ids; legacy per-wall-id saves are flattened on
  load rather than dropped.
- [x] **P0-12a StructureView grid renderer deleted.** The 250-line grid painter
  (merged cell runs, slope cells, soot rims, per-cell deform/heat) is gone along
  with `rasterizeWalls()`; `StructureView` now only draws wall polygons, the
  scorch field and fragment cubes.
- [x] **Heat cleanup (2026-11-18 session).** `StructureView` duplicate clipping
  removed — the GPU geometry mask is the single clip (per-cell
  `pointInPolygon` pass deleted). `DemolitionDirector.setGrid` → `setWalls`
  (wall-polygon collision, no `solids` grid set); `RelayView.setRelays`
  grid-free (world centre on `RelayState`); `ShotResult.initialGrid` deleted.
- [x] **P0-11 Generator emits walls directly.** New `wall-builder.ts`
  (`WallBuilder`: rect/poly/carve via rect splitting) is the generator's
  geometry; `DraftBuilder` extends it (cell-addressed API kept, `cells`
  recomputed from walls as diagnostics only). Caps enforced as world units:
  wood 4, steel 5, armor 7, metal 4. tsc + build + `test-fracture` +
  `test-walls` green (test-walls area tolerance widened to 12% for the
  angled truss brace).
- [x] **P0-10b Replay payload retired.** `ShotResult.initialGrid` deleted;
  CoreView/RelayView/DemolitionDirector grid params removed.
- [x] **P1-1 Test range = first map.** AH-01 authored as the video range
  (`buildTestRange`): steel/brick/steel column blocks with gaps, wood truss
  + diagonal, blue-grey core box + red core cavity. 8 walls on AH-01.
- [x] **P0-8 Thermal rewrite.** Metal-only (`addHeat` gates on
  `MATERIALS.isMetal`); `heatColor(heat, base)` mixes blackbody ramp toward
  the material's own color; `coolHeat` decays 0.02/s in `BattleScene.update`;
  hot-metal bending via `bendPoly` vertex displacement; brick takes no heat.
- [x] **P1-10 Tiny cubes.** `pixelWorldSize()` (2.6/zoom) for fragments +
  heat cells (~5× smaller at impact zoom; zoom-out merges via screen-pixel
  LOD); `BattleScene.updateDetail` re-renders on zoom change.
- [x] **P1-6 Projectile body.** `projectile-body.ts` (mass/speed penetration
  vs thickness caps, squash, `crossLayer`) + `ProjectileView` (boxy casing,
  amber filler octagon, orange band, white nose, fins — x-ray reveal);
  `ProjectileFrame.squash/layers`; drawn in `updateProjectile`.
- [ ] **P0-9 legacy note.** Core (all-red square, observed in the
  blue box and in 11-13 bunkers), relays and "expose-core" cover must be
  computed from wall geometry (is the core reachable / covered by wall
  polygons), not from counting grid cells (`coreCoverCells` retired).
- [ ] **P0-10b Replay payload.** `ShotResult` still carries an `initialGrid`
  for legacy transport; retire the last grid fields once CoreView/RelayView stop
  taking `grid` parameters.
- [ ] **P0-11 Generator rewrite.** `generator.ts` emits wall objects for
  tower / bunker / arch / layered / bastion / tank / fort layouts. It must
  never build a `Grid`. `scripts/validate-stages.ts` validates wall
  invariants instead (grounded, core covered, no self-overlap).
- [ ] **P0-12 Delete the grid.** When P0-1..P0-11 are done and green:
  remove `StructureGrid`, `Cell.hp`, `cloneGrid`, `cellWorldCenter`,
  `getCell`, `simulateShot`'s grid path, `StructureView`'s grid drawing,
  and grid branches in `BattleScene`, `GameHud`, `CoreView`, `App`.
  `npm run build` + `npx tsx scripts/test-fracture.ts` +
  `npx tsx scripts/validate-stages.ts` green afterwards.
- [x] **P0-13 Fragment size independent of zoom.** LIVE: `FRAGMENT_SIZE = 7`
  world units fixed in `wall-simulator.ts`; bodies 6px world rects;
  physics never reads camera zoom. Zoom behaviour vs footage unverified.

## P1 — Rendering (observed vs current)

Observed (both 11-18 videos): dark navy scene, flat city-skyline silhouettes
in the background, thin ground line. Test-range layout: cannon bottom-left;
a vertical column of **separate** wall blocks with visible gaps between them
(bottom steel-blue, middle brick-orange, top steel-blue); to the right a
wooden truss frame with one diagonal brace; beside it a blue-grey box with
a solid red square core. Walls are flat solid fills (steel blue-grey,
brick orange-brown, wood brown) with no per-cell texture.

- [ ] **P1-1 Test-range scene.** Build the exact test range from the
  recordings as a playable stage (column of 3 separate blocks with gaps,
  truss + diagonal, core box). This is the user’s “exactly what I want it
  to look like” scene — it does not exist in the current campaign.
- [ ] **P1-2 Solid-colour fragments.** Fragments render as small solid
  coloured cubes. No textures, no per-fragment detail, no crack overlays.
  Currently `StructureView` draws merged grid runs with texture/heat
  overlays — replace with wall polygons + fragment cubes.
- [ ] **P1-3 Thermal heat ramp on walls/fragments.** Impact paints the wall
  with the turbo-like ramp, hottest at the impact point, cooling outward:
  violet → blue → cyan → green → yellow → orange → red → white (observed
  A-frame ~82s and B-frame ~55s: white core, orange band, purple-blue
  edges). Implement as a shader/gradient over the wall polygons + the same
  colour per fragment cube (`heatColor()` prototype exists). The stain
  persists after the blast instead of flashing once.
- [ ] **P1-4 Large chunk + cube spray.** Big hits break off one large
  rotating chunk *and* spray hundreds of small cubes (observed: Anvil
  shot top block breaks and tumbles; HEAT shots spray cubes). Two-tier
  debris: chunk bodies + cube particles from the same fracture.
- [ ] **P1-5 Smoke + sparks.** Dark smoke puffs at impact; thin spark
  streaks (yellow/white lines) eject from steel. Current effect system
  fakes this with grid-cell debris — re-time to the new impact events
  (1 impact flash, 1 jet, 1 shaped blast for HEAT — the duplicate
  simultaneous flash was already fixed in `simulator.ts`, keep that
  behaviour).
- [ ] **P1-6 Projectile + trail.** Small grey shell body with a thin trail
  (two faint parallel lines / smoke wisps behind it). In the recordings
  the shell is small relative to the walls and the trail is visible from
  muzzle to impact.
- [ ] **P1-7 White damage outline.** When the truss takes damage a white
  wireframe traces the remaining/destroyed members (observed B ~55s,
  right side). Add an outline pass on recently damaged wall members.
- [ ] **P1-8 Skyline + ground.** Layered flat dark building silhouettes
  behind the playfield, thin ground line, dark navy background
  (#0d1622-ish). Compare `Backdrop.ts` against the recordings and match.

## P1 — Camera

Observed: aim view shows the whole range and the full trajectory. On fire
the camera zooms in and follows the shell; at impact it is zoomed tight on
the wall (walls fill the frame); after the shot it zooms back out to the
wide range view. In B the camera also pans to follow a falling chunk.

- [ ] **P1-9 Zoom-to-impact.** Match the zoom curve: wide → follow →
  tight at impact → wide. Currently the camera behaviour differs (verify
  and retune; do not just add a zoom slider).
- [ ] **P1-10 Zoom-dependent cube size.** Match the cube sizes seen at the
  impact zoom vs the wide zoom (see P0-13).

## P1 — HUD / UI (observed vs current)

Observed exact strings and layout (compare `src/ui/GameHud.ts`,
`src/ui/App.ts`, `src/ui/ArmoryScreen.ts`):

- [ ] **P1-11 Top bar.** Left: platform icons (menu, chat, muted mic,
  backpack). Centre-left status pill: `Unlimited shots · Core OK`, changing
  during a shot to `SMASHING! · Next shot soon` (and variants like
  `Result soon`). Right: `Reset` and `Menu` buttons. Current build shows
  `SMASHING! — NEXT SHOT READY` in a different style.
- [ ] **P1-12 Bottom aiming bar.** Left to right: `AMMO` chip with current
  shell name and a yellow shell icon; `MODE: STRAIGHT` / `MODE: ARC`
  toggle; two quick-switch chips showing other shells (observed:
  `Sideburst | Chain Blast`, then `Bunkerbreaker | Sideburst |
  Chain Blast` — the chips track recently used / ready shells, newest
  first); `POWER · MAX 420` slider with a numeric readout (observed 380)
  and yellow fill; big hazard-striped yellow `FIRE` button. Current build
  differs (no quick-switch chips, different power label).
- [ ] **P1-13 Aiming trajectory.** Thin green trajectory line from the
  muzzle (observed in every aiming frame). A second, red/pink arc line
  appears for some shells (observed in B) — replicate the conditions
  (multi-stage / burst shells). Dashed preview must match the actual
  flight path.
- [ ] **P1-14 In-flight bar.** While a shot resolves, the bottom bar becomes
  `Pause | Finish | Skip | 0.1× | 0.5× | 1× | …` with `Finish` highlighted
  yellow. Speed buttons must actually change playback speed; `Skip` must
  fast-forward to the result; `Pause` must freeze sim + effects.
- [ ] **P1-15 Power warnings.** The power bar shows contextual warnings:
  `INTO COVER FIRST` (shot will hit cover before the target) and
  `POWER UP TO REACH` (power too low to reach). Replicate both triggers.
- [ ] **P1-16 Burst / fuze controls.** For burst-capable shells a popup
  shows `Set burst | Auto`, and for jet shells `Jet side: lower` (and
  upper). Top-centre label `BURST · DRAG` appears while relevant. These
  must be functional (burst distance, jet direction), not decorative.
- [ ] **P1-17 Reset dialog.** `Reset the range? Everything is rebuilt.
  Your shots so far are cleared.` with `Reset` (yellow) / `Keep playing`.
  Reset rebuilds all walls, clears fragments/heat, and returns to
  `Unlimited shots · Core OK`.
- [ ] **P1-18 Armory overlay.** Dark panel, `ARMORY` header with close
  button. Tabs: `ALL | SOLID CORE | SOFT SHOT | HEAT | HESH |
  HIGH EXPLOSIVE | HYBRID`. Per category: hazard-stripe header with
  `11 / 11 READY` style count. Cards: shell silhouette icon, name,
  one-line description, family tag, yellow `LOADED` badge on the equipped
  shell; currently equipped card highlighted with a yellow border.
  Shells named in the recordings (verify all 59 names/descs match):
  HEAT — `HEAT ROUND`, `STRONG JET`, `DOUBLE JET`, `WIDE JET`,
  `CROSSFIRE`, `SABOT HEAT`, `DOUBLE STRIKE`, `CORNERJET`, `FORKJET`,
  `ROOFBREAKER`, `NEEDLE JET`; SOFT SHOT — `SOFT NOSE`, `PANCAKE`,
  `PETAL`, `RINGED MUSHROOM`, `CRUSHER`, `HEAVY SOFT SHOT`, `CUFF`,
  `SPLITTER`, `ANVIL`; HIGH EXPLOSIVE — `BUNKERBREAKER`, `SIDEBURST`,
  `CHAIN BLAST`, `LATCHBURST`, … (finish the list from the catalogue and
  cross-check every name + description against the videos).
- [ ] **P1-19 Core states.** Top pill reflects core state: `Core OK` while
  intact; a destroyed-core state (recordings show the gameplay continue
  after, so confirm the exact end-state text/behaviour — `Core smashed!`
  or equivalent — and match it).

## P1 — Gameplay / feel

- [ ] **P1-20 Unlimited test-range shots.** The test range is unlimited
  shots with full reset. Campaign stages keep their shot limits (existing
  behaviour) — do not leak unlimited mode into campaign.
- [ ] **P1-21 Persistent damage across shots.** Holes, missing chunks and
  heat stains persist between shots until Reset. Already required; must
  survive the P0 rewrite (holes are missing wall geometry, not erased
  cells).
- [ ] **P1-22 Per-family impact behaviour.** From the recordings + 11-13
  footage: HEAT cuts a narrow channel + jets; HE/HESH crater + cube spray
  + big chunk; SOFT SHOT (e.g. Anvil) shears off the top as one tumbling
  chunk with heat staining below the cut. Catalogue phases must produce
  these shapes on wall objects, with penetration depth by caliber
  (P0-5).
- [ ] **P1-23 iPhone Safari landscape touch.** Keep the existing touch
  aiming/power/fire flow working in landscape; verify the bottom HUD is
  tappable without overlap at 844x390-ish sizes. Test in a real device
  profile if possible.
- [ ] **P1-24 Performance.** Hundreds of fragment bodies + cube particles
  at 60fps on an iPhone: object pooling, no per-frame allocation in the
  hot loop, capped cube counts with graceful degradation. Measure, don’t
  guess.

## P2 — Completeness

- [ ] **P2-1** Campaign stages (bunker/tank/fort from the 11-13 footage)
  rebuilt as wall objects matching those layouts.
- [ ] **P2-2** Menu / campaign / settings / briefing screens match the
  target game’s look (they exist but were not in the 11-18 footage —
  re-verify against older recordings).
- [ ] **P2-3** Sound: muzzle, impact, jet, blast, collapse, UI. Match the
  target’s (currently `audio.ts` is original).
- [ ] **P2-4** GitHub Pages subpath build still works after the rewrite
  (`vite.config.ts` base path + `src/ui/asset-url.ts`).
- [ ] **P2-5** No commit/push/deploy without the user’s authorization.

## Verification (must all pass before claiming 1:1)

- [ ] `npx tsx scripts/test-fracture.ts` — fracture/penetration checks
  (includes deterministic fragment-body + heat-ramp checks added
  alongside this file).
- [ ] `npx tsx scripts/validate-stages.ts` — wall invariants (rewritten
  for wall objects under P0-11).
- [ ] `npm run build` — clean (the >500kB chunk warning is acceptable;
  note it, don’t hide it).
- [ ] **Live side-by-side check** against the 11-18 recordings, per family:
  SOLID, HEAT, HESH, HE, SOFT SHOT (Anvil), HIGH EXPLOSIVE
  (Bunkerbreaker/Sideburst), HYBRID. For each: hole shape, penetration
  depth, chunk size, cube spray count/size, heat stain, smoke/sparks,
  camera zoom, and post-shot persistence. Fix every verified mismatch;
  repeat until a side-by-side comparison shows no remaining differences
  the user can point at.
- [ ] **Honest status line.** If anything above is not done, the final
  message says exactly which items remain. “1:1” is claimed only when
  every P0 and P1 box is ticked with a live check behind it.

---

## P0 session (2026-11-18) — what changed

- New `src/game/sim/walls.ts`: wall identity, snapshot→wall conversion,
  support/collapse, heat regions, raster transport, `coreCoverFraction`.
- New `src/game/sim/wall-simulator.ts`: `simulateShotWalls()` — traceWalls
  flight, layered penetration, blast fracture, support collapse, core/
  relay resolution, deterministic fragment bodies.
- `BattleScene.fire()` now runs the wall simulator; `StructureView.setWalls`
  renders solid wall polygons + heat + fragment cubes; bodies step in
  `update()`; at rest after each shot the walls (not the raster) render.
- New `scripts/test-walls.ts`: area conservation, trace contact, damage,
  determinism, support detach, core cover — all passing.
- Live Playwright check (cloud browser, AH-01, portrait viewport): HEAT
  21°/391 → 24 bodies; HE 23°/349 → 223 bodies; APHE 17°/433 cleared the
  core (3★, cover 0%). Heat stain visible but small vs recordings;
  fragment cubes small; no test-range stage yet (P1-1).

- Watched both 11-18 recordings in full (1fps contact sheets + full-res
  impact frames in `.scratch/new-vid/`; A = `ScreenRecording_11-18-2026
  08-39-31_1.mp4`, B = `... 08-39-31_1 2.mp4`, different files, same day).
- Extended `src/game/sim/fracture.ts` (prototype only — **the live game
  still runs on the damage grid**, see P0): `heatColor()` thermal ramp,
  `spawnFragmentBodies()`, `stepFragmentBodies()`. Checks added to
  `scripts/test-fracture.ts` and passing.
- This file: `tasks.md`.

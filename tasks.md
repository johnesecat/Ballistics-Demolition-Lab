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

## Session — one body, per-pixel collision, profile and rebalance (2026-11-26)

The round is now **one physics model** from the moment it touches something.

- **Deleted the two-model split.** `sim/shell-pixels.ts` (`ShellImpact`, the
  local crush lattice) and `sim/soft-body.ts` (`ProjectileWreck`, the
  post-impact solver) are gone. `sim/body-sim.ts` (`ProjectileBodySim`) is the
  only round: world-space cell lattice, springs with plastic creep and ductile
  tearing, heat conduction, and a raster wall (`sim/wall-pixels.ts`, 2-unit
  pixels) it collides with one pixel at a time.
- **All pixels are physical.** A cell either pays for the pixel in front of it
  out of its own kinetic energy and destroys it, or it is stopped on that face.
  Penetration depth is now the body's own carving, not a layer cost table:
  `crossLayer`/`releaseJacket` no longer decide the shot. Wall damage is produced
  from the carved pixel set (`fractureWallBand` + `tearRim` + `addHeat`), so the
  hole is exactly the shape of the nose. A round no longer bounces off: it piles
  up in the hole it made (a Bankshot round skids off a face instead of biting,
  which is the same contact rule with high restitution, not a scripted bounce).
- **Replay is a bake.** The solver records at 60 Hz into `BodyTrack` (Int16
  quarter-units + byte heat) and the renderer only draws it, interpolated.
  `ShotResult.wreck` is gone; `ShotResult.track` (+ optional `body`) replaced it.
- **Profile** (`npm run bench:body`, desktop, node; the phone estimate is the
  desktop median ×4, not a measurement): replay frame median **0.71 ms**
  (p95 1.44, worst 2.71), contact window 22 frames / **19.4 ms**, whole-shot
  resolve median **19.5 ms** worst 23.7, baked track 24 frames / 18.0 KiB. On a
  phone estimate that is **~2.8 ms per replay frame** (inside a 60 Hz budget) and
  **~78 ms once per shot** for the resolve. The device never steps the body, so
  only the resolve reaches it, and the bench guards that at 80 ms.
  `integrateLinks` merged the three per-link passes and the anti-diagonal spring
  was dropped (450 → 324 links); 1/180 s was tried and is unstable, so the body
  stays at 1/240 s.
- **Rebalance.** Core damage is now the energy the round still has when it
  arrives (`share = clamp(arrive/420, 0.3, 1)`), and core health was raised ~2.5×
  (AH-01 84 → 210 ... GC-05 198 → 495). `npm run balance` (new) sweeps every
  battery with a greedy angle/power/ammo search: before, **14/15 fell in one
  shot**; now **0/15 destroy-core batteries do**, all clear in 2–3 shots, and the
  six one-shot clears left are relay/expose objectives, where one clean shot is
  the puzzle.
- **Reference clips re-watched** (11-13, 11-18, both 2554×1180 @ 60 fps; sheets
  and frames in `artifacts/ref/`): impact notches a pale steel beam, the rim goes
  white → orange → violet and cools in a few frames, debris is ragged pixels, and
  the round stops **nose-first inside** the notch. The live shot now does that
  (`artifacts/verify/land2.png`, `land4.png`): a square punched hole with a ragged
  edge, an ember at the entry, the rod embedded, nothing bouncing away.

Checks: `npx tsc --noEmit`, `npm test` (raster, collision, body, projectile,
save, deform) and `npm run build` all pass; `npm run bench:body` and
`npm run balance` pass their guards. Live: AH-02 fired in landscape at 1280×760,
no console errors, hole + embedded round as above.

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
  angled truss brace). **2026-11-19:** `mergeWallRects()` now coalesces
  touching same-material rects before support validation, so generated
  stages are real wall objects rather than one wall per cell (AH-02
  833 -> 66 walls; a full shot 3.4 s -> ~29 ms). Deterministic id order.
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
- [x] **P1-6 Projectile + trail.** Rebuilt from the newest recording as a
  whole-pixel dart: bulky grey-blue casing, swept upper fin, small belly
  fin, stepped light nose, orange drive band with red flecks, cyan exhaust
  and a yellow octagonal filler that opens as the casing crumples. Squash
  deforms the cells in pixels (snapped to whole smaller-than-wall squares),
  never a scaled sprite. The shell keeps its physics after contact: the
  solver emits a deterministic wreck timeline (57 frames) so the casing
  peels off, tumbles and settles on the seabed instead of freezing at the
  wall. The wreck is only spawned on a terminal impact: a round that crosses
  a thin layer and flies on bores a real diameter hole with cube chips and
  keeps its flight frames. Kinetic trail is the footage's warm orange/white
  dashed pair. Verified live at AH-01 (flight, penetration, tumbling casing
  settling on the seabed) and at AH-02 (two-shot expose, 58% -> 21%).
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

## Projectile destruction physics (2026-11-26)

The round is no longer a sprite with a pre-baked wreck. Design:
`docs/superpowers/specs/2026-11-26-projectile-physics-design.md`.

- **Components.** `sim/projectile-shell.ts` tags every sampled cell with a
  component (`jacket` copper, `penetrator` steel, `band` copper, `cap` steel).
  `SHELL_COMPONENT_MASS` / `SHELL_CORE_FRACTION` derive each part's mass from the
  lattice, so the penetrator's share is geometry, not a per-ammo constant.
  `sim/projectile-material.ts` holds the copper/steel physical data.
- **World-space soft body.** `sim/soft-body.ts` (`ProjectileWreck`) integrates the
  round after contact against the shot's own wall polygons and the ground:
  axial/shear springs with heat softening, plastic rest-length creep (bounded
  around the cast length), cumulative ductile tearing, volume constraint,
  cluster detachment and surface spall, per-cell heat, fixed 1/480 s substeps and
  deterministic seeding. `ShotResult.wreck` is now a `WreckState` (pose,
  momentum, mass, cell scale, seed, surviving components) instead of 57 scripted
  frames; `ProjectileView.drawWreck` steps it from replay time.
- **Penetration + separation.** `projectile-body.ts` carries jacket/penetrator
  masses and a shape quality. When a layer cannot be paid for, the jacket is shed
  (`releaseJacket`) and the bare steel core retries that layer at a much lower
  area-normalised resistance — the AP round's real trick. A released round flies
  on with `scale 0.58`; if the core also fails, the wreck is solved from the
  penetrator alone.
- **X-ray diagram.** Zoomed past `XRAY_ZOOM` (1.2x, i.e. the shot-follow camera)
  the round is drawn per component in its own colour with one labelled box per
  component (`COPPER JACKET`, `STEEL PENETRATOR`, `DRIVING BAND`, `BOAT-TAIL`),
  joined by leader lines. `componentBoxes()` is pure and tested.
- **Thermal working window.** `settleHotMetal()` runs a transient heat field
  (permanent scorch subtracted) through `deformHeatedWalls` until it decays, so
  hot metal bends like butter for a moment and then freezes. Deformation is now a
  **bend** (strip translation, area-exact) instead of a radial dilation, so
  working a plate no longer adds cover. All metal, and only metal, warps.
- **Hot fragments.** A metal fragment still glowing when it lands gets a plastic
  squash (`FragmentBody.squash`) and is drawn flattened; cold chips keep their
  cast shape.
- Tests: new `npm run test:softbody`; `test-deform` covers the thermal window and
  hot fragments; `test-projectile` pins the separation and the new wreck payload.
  `npm test` and `npm run build` are green. **Open:** the release gives the round
  roughly one extra layer, so the campaign star targets (1:1 validator finds
  1-shot clears on several stages) need a balance pass; the in-flight crush
  during penetration still uses the single-material local lattice.

## Physics and camera follow-up (2026-11-23)

- Wall-state deserialization merges legacy rectangular cells without bridging
  gaps or rounding away damaged geometry, while preserving anchors and heat.
  Campaign saves currently contain progress/settings only; in-progress mission
  resume is not implemented, so this migration is not yet wired to a resume UI.
- All 15 campaign seeds have a deterministic generation smoke check; AH-01's
  separate anchored test-range parts retain their authored identities. AH-02's
  pinned two-shot expose proof still passes.
- Pass-through shells no longer trigger terminal phases at their last entry;
  blasts can fracture the middle of a large wall even when its vertices are
  distant. Brick debris uses finer pieces than metal for blast impacts.
- The replay camera now transitions wide → projectile follow → impact → wide
  using replay time; visual alignment against the videos is still unverified.
  Steel bending, per-material deformation and large chunks remain open.

## Physics session (2026-11-19)

- Pass-through rounds now bore their own diameter through every crossed
  layer (`boreWall()` in `wall-simulator.ts`), shedding cube chips and
  publishing a `PENETRATION` damage event. They keep flying with their
  flight frames; a wreck is only built for a terminal wall/ground impact,
  so no pancake is left on an entry face. Verified live at AH-01: the APHE
  opening shot crossed three layers, then the peeled casing tumbled and
  settled on the seabed.
- AH-02 revalidated after the chamber-cover change. Pinned two-shot proof
  in `scripts/test-walls.ts`: `quake 31°/330` -> 38% cover, then
  `petal 43°/290` -> 21% with the 110 HP core intact. Live run matched:
  58% -> 38% -> 21%, 3 stars, 2/4 shots, Harbor Seal.
- Wall coalescing fixed the multi-second shot stall on generated stages.

- Watched both 11-18 recordings in full (1fps contact sheets + full-res
  impact frames in `.scratch/new-vid/`; A = `ScreenRecording_11-18-2026
  08-39-31_1.mp4`, B = `... 08-39-31_1 2.mp4`, different files, same day).
- Extended `src/game/sim/fracture.ts` (prototype only — **the live game
  still runs on the damage grid**, see P0): `heatColor()` thermal ramp,
  `spawnFragmentBodies()`, `stepFragmentBodies()`. Checks added to
  `scripts/test-fracture.ts` and passing.
- This file: `tasks.md`.

### Preview parity, exact pixel holes, wall soft body (2026-11-26, final pass)

- [x] `previewShot()` runs the one shot solver with damage generation off;
      deleted the preview's layer arithmetic and scripted ricochet. The guide
      path, core claim, ricochet count and stop point all come from the body.
- [x] Preview refreshes are throttled to 120 ms during a drag; `findOpeningAim`
      uses the flight-only `probeAim()` (never displayed).
- [x] `subtractPixelCells()` replaces `fractureWallBand` for projectile bores:
      the hole is the exact union of detached 2-unit cells, not a rotated
      square. Anchored walls stay bolted unless the bore takes >45% of them.
- [x] `WallPixels` now rigs a 22-unit pixel patch as a mass-spring soft body:
      density × area mass, strength-scaled axial/diagonal links, plastic flow
      past yield, tear; each contact pushes the touched pixel and its connected
      neighbours. `deformationAt()` bends the surviving wall polygons after the
      shot. Only awake nodes are integrated.
- [x] Tests: wall patch dents, ripple reaches connected pixels, speed/mass
      increase the dent, wood deforms more than steel, carve removes exactly
      one pixel, plus the full existing suite. `tsc` / `npm test` / `build`
      green; `bench:body` 19.4 ms median / 77.6 ms phone estimate (budget 80).
- [x] Campaign validator on the rebalanced core health: **15/15 stages
      validated as solvable** (`artifacts/verify/validate-final.log`). After
      the probe filter, the harness simulates the 80 nearest core lines per
      shell/mode: destroy-core clears in 2–3 APDS shots (cores 210→495 HP),
      destroy-relay in one wide-jet (×3), expose-core in one shell (HE blast
      ×2, quake ×1). `unsupported=0` on every generated stage.
- [x] Guide ends at the shot's first contact (the solver's trace also carries
      the resting centre, which used to be joined back to the entry), and the
      expose-core warning only fires when that contact is cover around the
      core. Live check: AH-02 20°/300 shows "CLEAR LINE TO CORE" and the dots
      stop on the roof where the replay's round enters.

### 60 fps reference comparison (impact frames `artifacts/ref/imp_a..c`)

Captured `artifacts/verify/hit-a..d.png` (AH-02, AP Solid, 20°/300). The shot
enters the roof, bores through, reaches the core. Differences still visible:

1. **Scenario.** The reference is a near-normal hit on a thin (~10 px) steel
   plate; the capture is a shallow (~10°) hit on a thick timber roof. Hole
   shape and lip cannot be matched one-to-one until the same plate is fired at
   in-game (AH-01 w2 is the closest steel plate).
2. **Entry flash.** Reference: white-hot core, violet/red scorch ring, embers.
   Ours: one small orange ember, char on timber; metal heat was verified in
   `test:deform` (3 blooms, 14 strips) but not captured on a steel hit here.
3. **Hole.** Reference: about 1.5× the round diameter with a curled, bright
   lip. Ours: exact pixel stair-step, and on an oblique hit a long gouge
   (~300 world units) because the round keeps carving while it slides.
4. **Round.** Reference: the round stops embedded with its nose just through
   the plate. Ours: it keeps going through layers until its energy is spent,
   which is the requested multi-layer behaviour; this shot reached the core.
5. **Debris.** Reference: almost no chips. Ours: a large grey/wood chip cloud,
   one chip per removed area block.
6. **Wall warp.** Reference: a tight local bow. Ours: a broad V bend from the
   22-unit patch (visible in `hit-a`), with the crease following the bore.
7. **Pixel scale.** Reference plate is ~6–8 art pixels thick; ours reads
   ~5 pixels for the timber roof, but the round is ~20 art pixels long, so the
   round/plate ratio is close.

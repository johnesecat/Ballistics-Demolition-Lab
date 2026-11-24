# Physics and Round Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make out-of-bounds explosive rounds still count, rebuild the AP Solid Shot 1:1 from the 7 reference frames (4 newest: `IMG_4969/4971/4972/4974` + 3 previous: `IMG_4966/4967/4968`), and add real-time heat along the bore path, metal warp/bend, near-object slow-down, material-tuned squash, and line-defined hollow/solid walls populated by material — all physics-simulated, deterministic, and fast enough for iPhone 15 Safari.

**Architecture:** One plan, five independently-testable tasks ordered so each lands green before the next starts. The round stays one lattice driven by `ShellImpact` (no parallel model); wall authoring gains a segment API that compiles down to the existing cell grid so saves and the renderer never change. All tuning is headless-provable before any browser check.

**Tech Stack:** TypeScript + Phaser 3, `tsx` test scripts (`scripts/test-*.ts`), Python (numpy/scipy/PIL) sampler, Playwright for browser verification.

**Spec:** User request 2026-11-24 (this plan). Reference frames: `IMG_4966-4968` (in-flight, x-ray, damage) and `IMG_4969/4971/4972/4974` (zoomed-out flight ×3 + annotated two-outline frame).

## Global Constraints

- All visible pixels are squares; 1:1 replica of the reference; iPhone 15 Safari landscape touch; deterministic replay.
- GitHub Pages subpath builds; work on feature branch `freebuff/18394e9f51583429d52668a6`; never push `main` (auto-deploys) without explicit authorization.
- No new npm dependencies. Rendering converts the lattice to icon-style chunks in real time; unaffecting chunks are rasterised, but zoomed-out zoom (0.27) must NOT lose the dart read (reference zoomed-out frames).
- Wall cell count only grows to show deformation (inward/outward). Max rim vertices 48; max strips/wall 14; max polygons/wall 48 (already landed).
- One physics model drives the round (the `ShellImpact` lattice) — no parametric deform path.
- `npm test` (8 suites), `npx tsc --noEmit`, `npm run build`, `npm run validate` must stay green after every task.

## Review Focus

1. **OOB detonation through walls** — a round that exits the range with an unexploded charge must apply damage at its exit point, not through a wall it never touched.
2. **Zoomed-out melt** — at zoom 0.27 the round must stay a coherent dart with amber band (per `IMG_4969-4972`), not a blob or invisible.
3. **Hollow walls must not break missions** — the line-defined authoring must keep all four validated stages clearing with the same ammo.
4. **Squash vs steel** — tuning must not make AP bounce off steel it should pierce, nor bore armor it should stop on.
5. **Perf / cell blow-up** — heat/warp additions must not push real-time sim over budget at 60 fps on iPhone 15 (cap affected chunks; rasterise unaffected).

---

### Task 1: Out-of-bounds explosives still count

**Files:**
- Modify: `src/game/sim/wall-simulator.ts`
- Modify: `scripts/test-projectile.ts` (replace the "must not retain entry as terminal impact" assertion with the new detonate-on-exit behavior)
- Test: `scripts/test-projectile.ts`

**Interfaces:**
- Consumes: existing flight loop in `wall-simulator.ts` (`impact`, `impactTime`, `stoppedByLayer`, `terminalImpact`, phase queue `phaseQueue`, `applyPhase(state, bodies, phase, origin, impact, incoming, tMs, def, rng, effects, damageEvents, onArea)`).
- Produces: rounds whose charge hasn't fired when they leave the range detonate at the exit point on the last flight frame; `result.impact` stays `null` for OOB but `phaseWallStates`/effects still record the detonation, so `applyPhase` effects run instead of nothing.

- [ ] **Step 1: Write the failing test** — in `scripts/test-projectile.ts`, replace the `impact === null` assertion for an OOB shell with: an explosive round (HE) fired to leave the range must produce a detonation effect and non-zero cell damage total, AND its `impact` must still be `null` (no fake terminal impact).
- [ ] **Step 2: Run to verify it fails** — `npx tsx scripts/test-projectile.ts` → FAIL (currently `applyPhase` never runs for OOB; wall-simulator.ts:285 resets `impact = null` and continues).
- [ ] **Step 3: Implement in `wall-simulator.ts`** — when the loop breaks on the bounds check (`x < -90 || x > WORLD.width + 110 || y > WORLD.height + 100 || y < -220`) with phases still queued and `impact === null`, synthesize an exit `impact` + `impactTime` at the last frame position with the outward normal, so the phase queue runs. Keep the OOB `impact` null in the result (detonation is recorded via effects + damage).
- [ ] **Step 4: Run test to verify it passes** — `npx tsx scripts/test-projectile.ts` → ok; then `npm test` → all 8 suites pass.
- [ ] **Step 5: Commit** — `git commit -m "Detonate unexploded charges when rounds leave the range"`.

### Task 2: Rebuild the bullet 1:1 from the seven frames

**Files:**
- Modify: `scripts/sample_projectile.py` (sample `IMG_4974`'s two outlines: outer shell = blue outline, inner main projectile = red outline, orange sleeve between; keep the 3 previous samples as majority vote)
- Modify: `src/game/sim/projectile-shell.ts` (new sampled mask, palette, core/sleeve ranges)
- Modify: `src/game/render/ProjectileView.ts` (SHELL_COLORS from new sample; zoom-out: at low zoom the icon instancing must keep band + nose readable — verify at zoom 0.27)
- Regenerate: `artifacts/ap-solid-shot-compare.png` (side-by-side with all 7 frames) via `npm run sample-round`
- Test: `scripts/test-projectile.ts` (round bbox/parts/core/core-under-skin assertions rewritten against the new sampled ranges)

**Interfaces:**
- Consumes: reference frames `IMG_4966-4974`; `scripts/sample_projectile.py`, `scripts/render_round.ts`.
- Produces: `projectile-shell.ts` exported `SAMPLED_MASK/SKIN/CORE/CELL_MASS`, `SHELL_L`/`SHELL_L_ROWS`, and `SHELL_COLORS` in `ProjectileView.ts` consistent with the sampled frames; round renders identically at 0° and at any flight angle (rotation from the lattice, never a scaled sprite).

- [ ] **Step 1: Write the failing test** — update `scripts/test-projectile.ts` bounds/parts/core assertions to the `IMG_4974` two-outline ranges (outer shell bbox, inner main-projectile bbox, sleeve band position, 1-cell nose). Run → FAIL against current 24×7 lattice.
- [ ] **Step 2: Run to verify it fails** — `npx tsx scripts/test-projectile.ts` → FAIL.
- [ ] **Step 3: Extend the sampler** — `scripts/sample_projectile.py`: extract both outlines from `IMG_4974` (blue = shell, red = main projectile); cross-check against the 3 previous frames' core ranges; emit the mask rows. Run it: `python3 scripts/sample_projectile.py`.
- [ ] **Step 4: Rebuild the lattice** — rewrite `projectile-shell.ts` from the sample; update `SHELL_COLORS`; regenerate side-by-side with `npm run sample-round`; visually compare against `IMG_4974` (the user's note: the green line in older frames = the main projectile path; `IMG_4974`'s two outlines = shell + main projectile).
- [ ] **Step 5: Run all checks** — `npx tsx scripts/test-projectile.ts`, `npm test`, `npx tsc --noEmit`, `npm run build` → green.
- [ ] **Step 6: Browser check** — fire at zoom 0.27 and at zoomed-in; screenshot both; dart + amber band must read in both. Use the cloud browser on port 3003.
- [ ] **Step 7: Commit** — `git commit -m "Rebuild the AP Solid Shot 1:1 from the seven frames"`.

### Task 3: Heat/thermal path, metal warp, wobble and bend in real time

**Files:**
- Modify: `src/game/sim/wall-simulator.ts` (friction heat: each crossed layer deposits heat along the bore; `deformHeatedWalls` already exists — extend to bend/wobble)
- Modify: `src/game/sim/walls.ts` (heat ramp `pruneHeat`/temper colors, `HEAT_REGION_LIMIT` — verify against bore path)
- Modify: `src/game/render/StructureView.ts` (heat tint + bend render along the bore; unaffected walls rasterise)
- Test: `scripts/test-deform.ts` (extend: AP bore through steel leaves a bent, heat-tinted column)

**Interfaces:**
- Consumes: penetration loop in `wall-simulator.ts` (`crossLayer`, contact points), `deformHeatedWalls(state)`.
- Produces: every steel/armor layer crossed leaves a heat stain + permanent bend/warp cell displacement; render shows temper colors + deformed column in real time.

- [ ] **Step 1: Write the failing test** — extend `scripts/test-deform.ts`: a 20°/300 AP shot through steel must leave ≥1 bent (displaced > 0.4 cell) steel cell and a heat region on the bore path.
- [ ] **Step 2: Run to verify it fails** — `npx tsx scripts/test-deform.ts` → FAIL (no bend on the bore column today).
- [ ] **Step 3: Implement** — deposit heat + bend per crossed layer in the penetration loop; extend `deformHeatedWalls` to displace (not just tint) hot steel cells; `StructureView` renders the temper ramp + bend.
- [ ] **Step 4: Run test to verify it passes** — `npx tsx scripts/test-deform.ts` + `npm test` green.
- [ ] **Step 5: Browser check** — fire into steel at 0.25×; screenshot the bore: heat tint + bent column visible.
- [ ] **Step 6: Commit** — `git commit -m "Heat and warp along the bore path"`.

### Task 4: Near-object slow-down and material-tuned squash

**Files:**
- Modify: `src/game/sim/projectile-body.ts` (penetration cost + squash curve per material: steel/metal/armor squash the lattice progressively; wood/brick don't)
- Modify: `src/game/BattleScene.ts` (playback: when the round is inside/near a wall, the shot clock slows so damage is watchable — a time-scale effect, NOT a physics change)
- Test: `scripts/test-projectile.ts` (squash at steel contact > squash at wood contact for the same shot) and `scripts/test-walls.ts` (20°/300 still stops on the steel shield — the stop point must not move)

**Interfaces:**
- Consumes: `crossLayer(pBody, material, span, resistance)`, `pBody.squash`, `shellState(...)`.
- Produces: squash grows with cumulative steel/metal/armor thickness crossed (dynamic pixel squash of the lattice), and playback slows near objects while the sim stays bit-exact (playback speed only affects `setReplaySpeed`-style pacing).

- [ ] **Step 1: Write the failing test** — squash(steel) > squash(wood) at equal speed; AP stop point on the shield unchanged (12 layers/~1125,338 region).
- [ ] **Step 2: Run to verify it fails** — FAIL with current linear squash.
- [ ] **Step 3: Implement** — per-material squash weights in `projectile-body.ts`; near-object pacing in `BattleScene` playback (sim time untouched).
- [ ] **Step 4: Run tests** — `npm test` + `npx tsc --noEmit` green.
- [ ] **Step 5: Browser check** — 0.25× into steel: lattice visibly squashes progressively; pacing slows on approach.
- [ ] **Step 6: Commit** — `git commit -m "Material-tuned squash and near-object pacing"`.

### Task 5: Line-defined walls populated by material (hollow vs solid)

**Files:**
- Create: `src/game/stages/wallAuthoring.ts` — `defineWall(outline: Point[], material: MaterialId, hollow: boolean): WallDef` (outline = the line segments; hollow → perimeter cells only; solid → filled)
- Modify: `src/game/stages/generator.ts` (use the new authoring for new walls; existing generated walls unchanged)
- Test: `scripts/test-walls.ts` (hollow steel box has empty interior and full perimeter; solid box is full; all four validated stages still clear)

**Interfaces:**
- Consumes: `WallDef`, `MaterialId` from `src/game/sim/types.ts`, cell grid from `src/game/sim/walls.ts`.
- Produces: authoring API compiles to the same `WallState` cells the renderer/simulator already use; save format untouched.

- [ ] **Step 1: Write the failing test** — hollow box: perimeter filled, center empty; solid box: fully filled; `npm run validate` still clears all 4 stages.
- [ ] **Step 2: Run to verify it fails** — FAIL (no `wallAuthoring.ts`).
- [ ] **Step 3: Implement** — `defineWall` → cell fill (perimeter if hollow, filled if solid); wire one existing patterned wall through it as proof.
- [ ] **Step 4: Run tests + validate** — `npm test`, `npm run validate` green.
- [ ] **Step 5: Commit** — `git commit -m "Line-defined walls populated by material"`.

### Task 6: Full verification and comparison

- [ ] `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run validate` — all green, fresh run.
- [ ] Browser: fire AP into the damage-frame layout at 0.25×; side-by-side vs `IMG_4968`; fix anything off.
- [ ] Code-review skill pass (Standards + Spec axes) over the branch since `58f3e79`.
- [ ] Commit + push to feature branch only.

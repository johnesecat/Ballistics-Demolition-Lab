# Projectile Destruction Physics — Implementation Plan

> **For agentic workers:** execute task by task, TDD (failing test → minimal code
> → green). Steps use `- [ ]`.

**Goal:** make the round's destruction, penetration, core separation, x-ray
diagram and hot-metal warping fully physical and procedural.

**Architecture:** `sim/soft-body.ts` solves the round as a mass lattice in world
space, stepped from replay time. `ShotResult.wreck` carries a `WreckState`
instead of baked frames. `sim/projectile-body.ts` gains jacket/penetrator masses
and a shape-quality release so the steel core breaks free. `wall-deform.ts`
gains a transient thermal window.

**Spec:** `docs/superpowers/specs/2026-11-26-projectile-physics-design.md`

## Global constraints

- Deterministic: fixed timestep, seeded noise, no wall-clock or frame-rate input.
- Presentation never changes the damage outcome (damage resolves at fire time).
- iPhone-safe: bounded node count, bounded springs, no per-frame allocation in
  hot loops, bounded vertex growth in wall geometry.
- TypeScript strict, `noUnusedLocals`, `noUnusedParameters`.

## Task 1 — Components and mass (test:softbody)

- [x] Test: every sampled cell has a component from a fixed set; component labels
      unique; every component mass > 0; penetrator fraction in (0.2, 0.8);
      `pristineShell()` still 24×7 cells with no visible steel.
- [x] Implement `ComponentId`, `COMPONENTS`, `componentOf`, `componentMass`,
      `SHELL_COMPONENT_MASS`, `SHELL_CORE_FRACTION`; tag cells in `buildBase()`.

## Task 2 — Round body with jacket/core masses

- [x] Test: `makeProjectileBody` keeps `coreMass + jacketMass ≈ mass`;
      `shapeQuality` is 1 before release and lower after; `releaseJacket()`
      returns true exactly once.
- [x] Implement the fields and `releaseJacket`.

## Task 3 — Soft-body solver

- [x] Test: a steel impact crushes and shortens the lattice; some nodes detach;
      detached nodes keep moving; no node ends inside a wall polygon; every node
      ends above the ground; the run is deterministic; a heavier round penetrates
      deeper into the face; hot copper warps further than cold.
- [x] Implement `ProjectileWreck` (`step(seconds)`, `cells()`, `boxes()`) with
      world-space collision, plastic yield, fracture, heat and cluster splitting.

## Task 4 — Wreck payload

- [x] Test: a stopped shot yields a `WreckState` with impact pose, momentum,
      seed and components; `wreck` frames are gone from the result.
- [x] Replace `ShotResult.wreck: ProjectileFrame[]` with `wreck: WreckState|null`;
      build it from the terminal impact.

## Task 5 — Core separation in the penetration loop

- [x] Test: a shot that stops on steel either releases the core and crosses an
      extra layer or pancakes the core; a released round reports a `separation`
      effect and flies on with `scale < 1`; the shot stays deterministic.
- [x] Shed the jacket when integrity drops or a layer cannot be paid for; retry
      the layer with the penetrator quality.

## Task 6 — Thermal window for metal

- [x] Test: `settleHotMetal` moves hot steel across the window, keeps moving it
      over successive hot calls, and stops once the transient heat has decayed;
      cold steel and brick are untouched; deterministic.
- [x] Implement `settleHotMetal` and call it once per phase in the shot solver.

## Task 7 — Hot fragment deformation

- [x] Test: a hot metal fragment that lands gains a plastic squash; a cold one
      does not.
- [x] Add `squash` to `FragmentBody`, set it on contact when `heat` is high and
      the material is metal; draw it squashed in `StructureView`.

## Task 8 — Renderer: world-space wreck + x-ray diagram

- [x] Test: `componentBoxes()` returns one axis-aligned box per surviving
      component and is stable for degenerate input.
- [x] `ProjectileView`: `drawWreck(wreck, age, walls, groundY, zoom)`, and in
      x-ray mode (zoom ≥ `XRAY_ZOOM`) paint each component in its own colour with
      a labelled box. BattleScene drives it from replay time.

## Task 9 — Verification

- [x] `npm test` green, `npm run build` clean.

## Task 10 — One body, sized for a phone (done 2026-11-26)

- [x] Merged the spring, plastic/tear and conduction passes into
      `integrateLinks(dt)`; dropped the anti-diagonal spring (450 → 324 links).
- [x] `npm run bench:body` with the replay-frame, catch-up and whole-resolve
      timings and an explicit ×4 phone estimate.
- [x] `scripts/test-body.ts` (pixel collision, energy-paid penetration,
      determinism, mass→depth, seabed rest); `test-projectile` and
      `test-collision` rewritten for `track`/`body` and the one-body contact
      rule.
- [x] `npm run balance`: greedy sweep over all 15 batteries, failing if any
      destroy-core battery falls in one shot.

## Task 11 — preview parity, pixel holes, soft-body wall

1. Delete the preview's second model: no `makeProjectileBody`, no
   `crossLayer`, no scripted bounce. Route `previewShot()` through
   `simulateShotWalls(..., { damage: false })`; keep `probeAim()` for the
   mission-start heuristic only.
2. Replace the rotated `fractureWallBand` bore with `subtractPixelCells()`:
   exact cells → merged rectangles → exact convex subtraction → merged
   survivors; preserve the anchor unless most of the wall is gone.
3. Rig `WallPixels` as a local mass-spring soft body (`armSoftBody`, `push`,
   `stepSoftBody`, `deformationAt`); wake only the contact neighbourhood;
   apply the plastic field to the surviving wall vertices in `applyCarves()`.
4. Re-verify `npm test`, `npm run bench:body` (≤ 80 ms phone estimate),
   `npm run build`, then run `npm run validate` and compare the impact frames
   against the 60 fps reference frames.

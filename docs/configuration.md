# Configuration and limitations

- `src/game/config.ts`: world size, cannon, power limits, gravity, fixed step (1/240 s), simulation bounds, camera zoom and debris limits.
- `src/game/materials.ts`: health, density, damage-channel multipliers and palettes. Structural support uses a grounded, four-neighbor tile graph; it is not a rigid-body simulation. Matter.js handles visual debris only.
- `src/game/ammo/catalogue.ts`: descriptions, flight, phases, fuse options, material multipliers and visual families. Timings and values are interpreted rather than measured from the reference. The two-second Meltdown burn uses 250 ms ticks.
- `src/game/stages/campaign.ts` and `generator.ts`: stage definitions, seeds, objectives and structural layouts. `npm run validate` searches for a feasible solution to each shipped campaign stage. It is not an exhaustive proof for arbitrary seeds.
- `src/game/save.ts`: versioned localStorage save, best results and first-clear emblems. A newer save is preserved, and progress is session-only when preserving it or if backing it up fails. No in-game economy is implemented.
- `src/game/render/EffectDirector.ts`, `textures.ts`, `Backdrop.ts`: bounded pixel effects, art and Matter debris. Reduced effects lowers body and particle counts. `?debug` exposes stage diagnostics.
- Stars: three for clearing at or below the stage target, two at target + 1, one for any other successful clear. A first-clear emblem is awarded only once.

## Known limitations

This is a reference-inspired implementation, not source-game code or exact physics. Several specialized rounds share effect families and their geometry is an approximation; the authored SVG-style diagrams requested in the original brief are represented by editable Python drawing code instead. Pixel sprites are coarse geometric interpretations, not guaranteed identical to the original artwork. The procedural campaign validator searches the shipped seeds, not arbitrary generated levels. Precise iPhone 15 Safari behavior, touch gestures, performance, audio interruption handling, complete replay interactions and GitHub Pages hosting have not been verified on a physical device or deployed site. See the README for publishing instructions.

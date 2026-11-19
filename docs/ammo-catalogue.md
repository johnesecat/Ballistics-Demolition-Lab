# Ammunition catalogue

Card descriptions and recommendations are transcribed from the supplied brief. All damage, geometry, timing and visual recipes are original interpretations, not recovered source-game values.

Phase values below are simulator configuration. Phase names describe the intended effect; they do not assert exact source behavior.

## AP Solid Shot (SOLID)

**Card:** A pointed steel core digs into armor while the softer copper body spreads.

**Best used for:** Wood and brick. Small weak points in steel.

**Watch for:** Little broad destruction.

**Flight:** speed multiplier 1.12; mass 1.15; radius 2.5; drag 0.012.

**Phases:** pierce (damage: 48, channel: kinetic, distance: 54, width: 4, angleTolerance: 0.15, coreFactor: 0.85, label: CORE PUNCH).

**Visual family:** kinetic; good-vs filters: wood, brick, steel.

## APC Capped (SOLID)

**Card:** A soft copper cap cushions the first hit before the steel core digs in.

**Best used for:** Angled thin plates, shots at a slant.

**Flight:** speed multiplier 1.08; mass 1.12; radius 2.7; drag 0.018.

**Phases:** pierce (damage: 47, channel: kinetic, distance: 58, width: 5, angleTolerance: 0.68, coreFactor: 0.85, label: CAPPED STRIKE).

**Visual family:** kinetic; good-vs filters: steel, slopes, armor.

## APBC Ballistic Cap (SOLID)

**Card:** A hollow nose cover helps the round fly, then crumples on impact.

**Best used for:** Long, shallow arcs. Small distant openings.

**Flight:** speed multiplier 1.16; mass 1.06; radius 2.5; drag 0.006.

**Phases:** pierce (damage: 45, channel: kinetic, distance: 64, width: 4, angleTolerance: 0.34, coreFactor: 0.82, label: LONG SHOT).

**Visual family:** kinetic; good-vs filters: steel, armor, brick.

## APCBC Combined Caps (SOLID)

**Card:** Two soft caps protect the core as it strikes angled armor.

**Best used for:** Angled steel, longer flight.

**Flight:** speed multiplier 1.11; mass 1.13; radius 2.6; drag 0.011.

**Phases:** pierce (damage: 55, channel: kinetic, distance: 62, width: 5, angleTolerance: 0.8, coreFactor: 0.9, label: ANGLED DRIVE).

**Visual family:** kinetic; good-vs filters: steel, slopes, armor.

## APCR Round (SOLID)

**Card:** A small steel core digs into armor while its copper jacket mushrooms.

**Best used for:** Ordinary steel, concentrated digging.

**Flight:** speed multiplier 1.2; mass 0.95; radius 2.3; drag 0.016.

**Phases:** pierce (damage: 63, channel: kinetic, distance: 48, width: 3, coreFactor: 0.88, label: HARD CORE; material multipliers: {"steel":1.22,"armor":0.86}) → crush (damage: 9, channel: crush, radius: 9, at: 45, force: 0.5).

**Visual family:** kinetic; good-vs filters: steel, armor.

## APDS Sabot (SOLID)

**Card:** The outer carrier falls away, leaving a slim core that wears down as it pierces armor.

**Best used for:** Small gaps, concentrated metal contact.

**Flight:** speed multiplier 1.25; mass 0.82; radius 2; drag 0.008; separation carrier.

**Phases:** pierce (damage: 72, channel: kinetic, distance: 56, width: 3, coreFactor: 0.92, label: SABOT CORE; material multipliers: {"steel":1.22,"armor":0.86}).

**Visual family:** split; good-vs filters: steel, armor, slopes.

## Finned Dart (SOLID)

**Card:** A long finned dart pierces small weak points, losing material from its tip as it pushes through.

**Best used for:** Thin armor and seams, small exposed weak points.

**Flight:** speed multiplier 1.28; mass 0.76; radius 1.8; drag 0.014.

**Phases:** pierce (damage: 66, channel: kinetic, distance: 62, width: 3, angleTolerance: 0.58, coreFactor: 0.9, label: DART PIERCE; material multipliers: {"armor":1.25,"steel":0.92}) → pierce (damage: 15, channel: kinetic, distance: 15, width: 2, at: 90, label: TIP WEAR).

**Visual family:** kinetic; good-vs filters: armor, steel, slopes.

## AP Breaker (SOLID)

**Card:** A short core and wide body crack brick and tear thin panels.

**Best used for:** Brick, displacing thin panels.

**Flight:** speed multiplier 1.02; mass 1.3; radius 3.4; drag 0.026.

**Phases:** pierce (damage: 38, channel: kinetic, distance: 38, width: 13, label: BREAKER; material multipliers: {"brick":1.4,"wood":1.2,"concrete":0.9}) → crush (damage: 13, channel: crush, radius: 19, at: 30, force: 0.8; material multipliers: {"brick":1.4,"wood":1.2,"concrete":0.9}).

**Visual family:** kinetic; good-vs filters: brick, concrete, steel.

## Wedge (SOLID)

**Card:** A wide wedge tears thin plates along a broad seam.

**Best used for:** Thin angled sheet, existing seams.

**Flight:** speed multiplier 0.98; mass 1.35; radius 3.2; drag 0.03.

**Phases:** tear (damage: 44, channel: tear, rays: 2, spreadDeg: 14, distance: 38, angleOffset: 0, label: SEAM WEDGE; material multipliers: {"steel":1.15,"slopes":1.25}) → crush (damage: 9, channel: crush, radius: 16, at: 35).

**Visual family:** kinetic; good-vs filters: steel, slopes, armor.

## PELE Sidewinder (SOLID)

**Card:** The shell splits sideways on impact, sending fragments into nearby surfaces.

**Best used for:** Thin face plates, nearby backing and side walls.

**Flight:** speed multiplier 1.06; mass 1.05; radius 2.8; drag 0.022; separation pellets.

**Phases:** pierce (damage: 29, channel: kinetic, distance: 28, width: 5, label: FACE PIERCE) → fragment (damage: 16, channel: kinetic, rays: 8, spreadDeg: 142, distance: 24, at: 35, label: SIDEWAYS FRAGMENTS).

**Visual family:** split; good-vs filters: steel, slopes, brick.

## Bankshot (SOLID)

**Card:** Can bounce off an angled surface, losing speed after the bounce.

**Best used for:** Angled surfaces, creative banked shots.

**Flight:** speed multiplier 1.04; mass 1; radius 2.8; drag 0.025.

**Phases:** pierce (damage: 32, channel: kinetic, distance: 36, width: 4, angleTolerance: 0.9, label: AFTER THE BOUNCE).

**Visual family:** kinetic; good-vs filters: slopes, steel, armor.

## Drillhead (SOLID)

**Card:** A spinning drill tip keeps boring after impact in four short pushes.

**Best used for:** Thick steel plates, digging toward a buried core.

**Flight:** speed multiplier 1.08; mass 1.2; radius 2.8; drag 0.02.

**Phases:** drill (damage: 19, channel: kinetic, at: 0, distance: 18, width: 10, label: BORE 1; material multipliers: {"steel":1.22,"armor":0.86}) → drill (damage: 19, channel: kinetic, at: 95, distance: 18, width: 10, label: BORE 2; material multipliers: {"steel":1.22,"armor":0.86}) → drill (damage: 19, channel: kinetic, at: 190, distance: 18, width: 10, label: BORE 3; material multipliers: {"steel":1.22,"armor":0.86}) → drill (damage: 19, channel: kinetic, at: 285, distance: 18, width: 10, label: FOURTH PUSH; material multipliers: {"steel":1.22,"armor":0.86}).

**Visual family:** drill; good-vs filters: steel, armor, concrete.

## Soft Nose (SOFT)

**Card:** Squashes flat, locks rock-hard and slams like a hammer: folds thin steel and crushes the core behind it.

**Best used for:** Crushes the core even on off-center hits. Folds and rips thin steel.

**Flight:** speed multiplier 1.02; mass 1.25; radius 3.8; drag 0.03.

**Phases:** crush (damage: 59, channel: crush, radius: 27, force: 1.2, label: PAD LOCK; material multipliers: {"steel":1.32,"armor":0.8}) → plug (damage: 18, channel: crush, distance: 20, width: 22, at: 50, label: HAMMER THROUGH).

**Visual family:** soft; good-vs filters: steel, armor, brick.

## Pancake (SOFT)

**Card:** Flattens into a giant pad that folds whole panels and crushes whatever is right behind them.

**Best used for:** Cores pressed close behind a wall. Widest crush, easiest to land.

**Flight:** speed multiplier 0.96; mass 1.4; radius 4.5; drag 0.038.

**Phases:** crush (damage: 55, channel: crush, radius: 43, coreFactor: 1.28, force: 1.5, label: BROADEST CRUSH; material multipliers: {"steel":1.2,"brick":0.9}) → plug (damage: 15, channel: crush, distance: 22, width: 32, at: 70, coreFactor: 1.15).

**Visual family:** soft; good-vs filters: steel, armor, brick.

## Petal (SOFT)

**Card:** Splits into four hard petals that rip thin walls into strips and open a clean hole for your next shot.

**Best used for:** Rips thin steel into strips. Clears the way for your next shot.

**Flight:** speed multiplier 1; mass 1.1; radius 3.3; drag 0.028; separation petals.

**Phases:** tear (damage: 29, channel: tear, rays: 4, spreadDeg: 100, distance: 31, label: FOUR PETALS; material multipliers: {"steel":1.15,"slopes":1.1}) → crush (damage: 11, channel: crush, radius: 15, at: 45; material multipliers: {"steel":1.2}).

**Visual family:** split; good-vs filters: steel, brick, armor.

## Bonded Mushroom (SOFT)

**Card:** A steel backing keeps the pad driving and punches a wall across the gap into what’s behind it.

**Best used for:** Cores a short gap behind thin steel. Keeps pushing after the hit.

**Flight:** speed multiplier 1.03; mass 1.5; radius 4; drag 0.03.

**Phases:** plug (damage: 42, channel: crush, distance: 37, width: 23, force: 1.6, label: WALL PLUG; material multipliers: {"steel":1.25}) → crush (damage: 27, channel: crush, radius: 19, at: 65, label: BACKING DRIVE) → pierce (damage: 12, channel: kinetic, distance: 17, width: 7, at: 110, label: PLUG IMPACT).

**Visual family:** soft; good-vs filters: steel, brick, concrete.

## Crusher (SOFT)

**Card:** Turns rock-hard the moment it hits brick, wood or glass and plows straight through to what’s behind.

**Best used for:** Thick brick and wood. Cores hidden behind brick.

**Flight:** speed multiplier 0.98; mass 1.55; radius 4; drag 0.034.

**Phases:** plug (damage: 39, channel: crush, distance: 35, width: 21, force: 1.65, label: ROCK-HARD PAD; material multipliers: {"wood":1.45,"brick":1.05}) → crush (damage: 23, channel: crush, radius: 20, at: 40, label: THROUGH THE BRICK; material multipliers: {"brick":1.4,"wood":1.45}).

**Visual family:** soft; good-vs filters: brick, wood, concrete.

## Heavy Soft Shot (SOFT)

**Card:** The heaviest soft pad. It buckles steel beams, pillars and floors until the whole frame sags.

**Best used for:** Steel frames, floors and pillars. Bends frames more than any other pad.

**Flight:** speed multiplier 0.9; mass 2.1; radius 4.6; drag 0.042.

**Phases:** crush (damage: 48, channel: crush, radius: 35, force: 2.2, label: FRAME BEND; material multipliers: {"steel":1.1,"concrete":1.2}) → shock (damage: 14, channel: shock, radius: 62, at: 50, force: 1.5, label: WHOLE FRAME SAGS).

**Visual family:** soft; good-vs filters: steel, armor, concrete.

## Cuff (SOFT)

**Card:** A copper cuff keeps the nose solid as it locks into a hard pad.

**Best used for:** Thin steel walls, off-center hits.

**Flight:** speed multiplier 1.03; mass 1.25; radius 3.6; drag 0.028.

**Phases:** crush (damage: 51, channel: crush, radius: 23, force: 1.1, label: CUFF LOCK; material multipliers: {"steel":1.18,"slopes":1.15}) → pierce (damage: 13, channel: kinetic, distance: 16, width: 9, at: 45, label: SOLID NOSE).

**Visual family:** soft; good-vs filters: steel, brick, slopes.

## Splitter (SOFT)

**Card:** Pops open just before impact into four soft pellets that sweep a wide area. Too small to crush metal.

**Best used for:** Shreds brick, wood and light cover; several weak spots at once.

**Flight:** speed multiplier 1.06; mass 1.05; radius 3.4; drag 0.025; separation pellets; standoff 17.

**Phases:** crush (damage: 22, channel: crush, radius: 15, at: 35, angleOffset: -42, distance: 8, label: PELLET 1; material multipliers: {"brick":1.4,"wood":1.45,"steel":0.55,"armor":0.45}) → crush (damage: 22, channel: crush, radius: 15, at: 90, angleOffset: -14, distance: 12, label: PELLET 2; material multipliers: {"brick":1.4,"wood":1.45,"steel":0.55,"armor":0.45}) → crush (damage: 22, channel: crush, radius: 15, at: 145, angleOffset: 14, distance: 16, label: PELLET 3; material multipliers: {"brick":1.4,"wood":1.45,"steel":0.55,"armor":0.45}) → crush (damage: 22, channel: crush, radius: 15, at: 200, angleOffset: 42, distance: 20, label: PELLET 4; material multipliers: {"brick":1.4,"wood":1.45,"steel":0.55,"armor":0.45}).

**Visual family:** split; good-vs filters: brick, wood, concrete.

## Anvil (SOFT)

**Card:** A super heavy block. Drop it high to smash roofs and supports. Its face crumples on armored steel.

**Best used for:** Roofs and supports from above, shoving whole walls.

**Flight:** speed multiplier 0.74; mass 2.8; radius 5.2; drag 0.045.

**Phases:** crush (damage: 72, channel: crush, radius: 40, coreFactor: 0.85, force: 2.8, label: DEAD WEIGHT; material multipliers: {"wood":1.35,"brick":1.25,"armor":0.72}) → shock (damage: 17, channel: shock, radius: 58, at: 60, force: 2.1, label: SUPPORT SHOCK) → crush (damage: 14, channel: crush, radius: 21, at: 130, coreFactor: 0.7, label: FACE CRUMPLES; material multipliers: {"armor":0.65}).

**Visual family:** soft; good-vs filters: wood, brick, concrete.

## HEAT Round (HEAT)

**Card:** An explosion forms a narrow copper jet that cuts into armor.

**Best used for:** Steel with backing, mixed metal and brick.

**Flight:** speed multiplier 0.98; mass 1.15; radius 3.4; drag 0.026.

**Phases:** jet (damage: 82, channel: jet, distance: 65, width: 6, angleTolerance: 0.56, label: COPPER JET) → blast (damage: 17, channel: blast, radius: 13, at: 35, label: SHAPED BLAST).

**Visual family:** jet; good-vs filters: steel, brick, armor.

## Double Jet (HEAT)

**Card:** Two copper jets cut separate paths through the target.

**Best used for:** Thin panels, exposed light backing.

**Flight:** speed multiplier 1; mass 1.12; radius 3.4; drag 0.025.

**Phases:** jet (damage: 48, channel: jet, distance: 53, width: 5, rays: 2, spreadDeg: 14, angleTolerance: 0.5, label: TWIN JETS) → blast (damage: 12, channel: blast, radius: 12, at: 50).

**Visual family:** jet; good-vs filters: steel, armor, concrete.

## Wide Jet (HEAT)

**Card:** A wide copper jet cuts a broader, shallower hole.

**Best used for:** Thin steel, preparing a larger opening.

**Flight:** speed multiplier 0.97; mass 1.2; radius 3.7; drag 0.027.

**Phases:** jet (damage: 63, channel: jet, distance: 38, width: 21, angleTolerance: 0.62, label: BROAD JET) → blast (damage: 15, channel: blast, radius: 17, at: 40).

**Visual family:** jet; good-vs filters: steel, brick, concrete.

## Crossfire (HEAT)

**Card:** A copper jet pierces light armor while a wider blast breaks nearby cover.

**Best used for:** Brick beside steel, exposed loose debris.

**Flight:** speed multiplier 0.99; mass 1.24; radius 3.6; drag 0.026.

**Phases:** jet (damage: 57, channel: jet, distance: 48, width: 7, label: PIERCING JET) → blast (damage: 34, channel: blast, radius: 29, at: 45, label: NEARBY COVER BLAST; material multipliers: {"brick":1.4,"wood":1.2,"concrete":0.9}).

**Visual family:** jet; good-vs filters: steel, brick, slopes.

## Sabot HEAT (HEAT)

**Card:** The carrier falls away, leaving a small finned round that fires a copper jet on impact.

**Best used for:** Small distant openings, lower curved approaches.

**Flight:** speed multiplier 1.17; mass 0.9; radius 2.5; drag 0.014; separation carrier.

**Phases:** jet (damage: 78, channel: jet, distance: 55, width: 5, angleTolerance: 0.62, label: SABOT JET) → blast (damage: 11, channel: blast, radius: 11, at: 35).

**Visual family:** split; good-vs filters: steel, armor, slopes.

## Double Strike (HEAT)

**Card:** Fires a small copper jet, then a stronger one along the same path.

**Best used for:** Reactive face tiles, layered cover.

**Flight:** speed multiplier 0.99; mass 1.18; radius 3.5; drag 0.026.

**Phases:** jet (damage: 39, channel: jet, distance: 40, width: 6, label: FIRST JET) → jet (damage: 61, channel: jet, distance: 57, width: 6, at: 150, label: SECOND JET) → blast (damage: 12, channel: blast, radius: 12, at: 190).

**Visual family:** jet; good-vs filters: steel, armor, brick.

## Cornerjet (HEAT)

**Card:** Fires its copper jet at an angle. Choose the direction before shooting.

**Best used for:** Oblique surfaces, offset interior targets.

**Flight:** speed multiplier 0.98; mass 1.15; radius 3.5; drag 0.026.

**JET PATH / HIGH:** jet (damage: 74, channel: jet, distance: 48, width: 6, angleOffset: -36, label: HIGH JET) → blast (damage: 12, channel: blast, radius: 12, at: 50).

**JET PATH / LOW:** jet (damage: 74, channel: jet, distance: 48, width: 6, angleOffset: 36, label: LOW JET) → blast (damage: 12, channel: blast, radius: 12, at: 50).

**Visual family:** jet; good-vs filters: steel, brick, armor.

## Forkjet (HEAT)

**Card:** Two copper jets spread apart to hit separate areas.

**Best used for:** Nearby separated targets, thin layered protection.

**Flight:** speed multiplier 1; mass 1.14; radius 3.5; drag 0.025.

**Phases:** jet (damage: 46, channel: jet, distance: 43, width: 5, rays: 2, spreadDeg: 44, label: FORKED JETS) → blast (damage: 10, channel: blast, radius: 11, at: 45).

**Visual family:** jet; good-vs filters: steel, brick, concrete.

## Roofbreaker (HEAT)

**Card:** Bursts above and fires a copper jet downward. Use a high arc.

**Best used for:** Top armor, targets behind front shields.

**Flight:** speed multiplier 0.94; mass 1.3; radius 3.7; drag 0.03; standoff 19.

**Phases:** jet (damage: 76, channel: jet, distance: 62, width: 7, dir: down, angleOffset: 0, label: DOWNWARD JET) → blast (damage: 20, channel: blast, radius: 20, at: 35, label: ABOVE-BURST).

**Visual family:** jet; good-vs filters: armor, steel, concrete.

## Needle Jet (HEAT)

**Card:** A deep copper cone shoots a very long, thin jet with almost no blast.

**Best used for:** Several plates in a row, cores far behind cover.

**Flight:** speed multiplier 1.09; mass 0.95; radius 2.6; drag 0.016.

**Phases:** jet (damage: 70, channel: jet, distance: 111, width: 3, label: NEEDLE JET).

**Visual family:** jet; good-vs filters: steel, armor, concrete.

## HESH Round (HESH)

**Card:** The nose flattens, then explodes to break fragments off the back of armor.

**Best used for:** Armor with an open space behind it, brick and thin metal.

**Flight:** speed multiplier 0.95; mass 1.45; radius 4; drag 0.032.

**Phases:** crush (damage: 15, channel: crush, radius: 18, at: 0, label: NOSE FLATTENS) → spall (damage: 54, channel: spall, distance: 36, width: 17, at: 65, label: REAR-FACE SPALL) → fragment (damage: 9, channel: kinetic, rays: 5, spreadDeg: 100, distance: 15, at: 95).

**Visual family:** hesh; good-vs filters: armor, brick, steel.

## Broadhead (HESH)

**Card:** A wide, flat charge breaks a broad, shallow layer off the armor.

**Best used for:** Thin steel sheets, wide exposed backing.

**Flight:** speed multiplier 0.94; mass 1.5; radius 4.4; drag 0.034.

**Phases:** crush (damage: 13, channel: crush, radius: 24, label: WIDE FLAT CHARGE) → spall (damage: 57, channel: spall, distance: 24, width: 28, at: 55, label: BROAD SPALL).

**Visual family:** hesh; good-vs filters: steel, armor, concrete.

## Scab Lifter (HESH)

**Card:** Throws more fragments from the back of damaged armor.

**Best used for:** Exposed crates behind plates, fragment coverage.

**Flight:** speed multiplier 0.97; mass 1.36; radius 3.8; drag 0.032.

**Phases:** spall (damage: 60, channel: spall, distance: 38, width: 20, label: SCAB LIFT) → fragment (damage: 7, channel: kinetic, rays: 8, spreadDeg: 126, distance: 24, at: 75, label: SCAB FRAGMENTS).

**Visual family:** hesh; good-vs filters: armor, steel, brick.

## Shock (HESH)

**Card:** A concentrated blast bends metal and pushes loose pieces.

**Best used for:** Loose steel, compact plate displacement.

**Flight:** speed multiplier 1; mass 1.45; radius 3.8; drag 0.03.

**Phases:** crush (damage: 24, channel: crush, radius: 25, force: 2.1, label: CONCENTRATED SHOCK; material multipliers: {"steel":1.2}) → shock (damage: 20, channel: shock, radius: 49, at: 40, force: 1.8, label: METAL BENDS).

**Visual family:** shock; good-vs filters: steel, armor, slopes.

## HESH Demolition (HESH)

**Card:** A wide blast breaks brick and damages the surface around armor.

**Best used for:** Brick, surface breakup around plates.

**Flight:** speed multiplier 0.91; mass 1.7; radius 4.5; drag 0.038.

**Phases:** crush (damage: 17, channel: crush, radius: 25, label: FACE CHARGE) → spall (damage: 36, channel: spall, distance: 29, width: 21, at: 55, label: SPALL) → blast (damage: 36, channel: blast, radius: 28, at: 70, label: SURFACE BREAKUP; material multipliers: {"brick":1.4,"wood":1.2,"concrete":0.9}).

**Visual family:** hesh; good-vs filters: brick, armor, concrete.

## Ribbon HESH (HESH)

**Card:** A wide, flat charge breaks fragments from a broad area behind the armor.

**Best used for:** Broad thin metal, rear-face fragment release.

**Flight:** speed multiplier 0.94; mass 1.55; radius 4.4; drag 0.035.

**Phases:** crush (damage: 12, channel: crush, radius: 29, label: RIBBON CHARGE) → spall (damage: 57, channel: spall, distance: 18, width: 38, at: 65, label: BROAD REAR SPALL).

**Visual family:** hesh; good-vs filters: steel, armor, concrete.

## Echo HESH (HESH)

**Card:** Two blasts hit the same patch of armor, one after the other.

**Best used for:** Already stressed plates, layered rear surfaces.

**Flight:** speed multiplier 0.96; mass 1.45; radius 4; drag 0.033.

**Phases:** spall (damage: 33, channel: spall, distance: 26, width: 21, label: FIRST BLOW) → spall (damage: 36, channel: spall, distance: 30, width: 22, at: 175, label: ECHO BLOW) → shock (damage: 8, channel: shock, radius: 20, at: 205).

**Visual family:** hesh; good-vs filters: armor, steel, slopes.

## Quake (HESH)

**Card:** Flattens, then sends a wide shock ring that shakes loose bricks and supports.

**Best used for:** Brick walls and pillars, shaking loose roof supports.

**Flight:** speed multiplier 0.9; mass 1.8; radius 4.6; drag 0.04.

**Phases:** crush (damage: 19, channel: crush, radius: 27, force: 1.6, label: FLATTEN) → shock (damage: 29, channel: shock, radius: 79, at: 90, force: 2.2, label: QUAKE RING) → crush (damage: 13, channel: crush, radius: 37, at: 150, label: LOOSE BRICKS; material multipliers: {"brick":1.4,"wood":1.2,"concrete":0.9}).

**Visual family:** shock; good-vs filters: brick, concrete, wood.

## HE Blast (HE)

**Card:** Explodes on impact, blasting nearby material apart.

**Best used for:** Brick and wood, exposed loose pieces.

**Flight:** speed multiplier 0.98; mass 1.35; radius 4; drag 0.03.

**Phases:** blast (damage: 57, channel: blast, radius: 32, label: HE BLAST; material multipliers: {"brick":1.4,"wood":1.2,"concrete":0.9}).

**Visual family:** he; good-vs filters: brick, wood, concrete.

## HE Demolition (HE)

**Card:** A stronger blast breaks brick and throws nearby debris.

**Best used for:** Brick, loose debris movement.

**Flight:** speed multiplier 0.9; mass 1.65; radius 4.5; drag 0.038.

**Phases:** blast (damage: 71, channel: blast, radius: 40, force: 1.7, label: DEMOLITION CHARGE; material multipliers: {"brick":1.4,"wood":1.2,"concrete":0.9}).

**Visual family:** he; good-vs filters: brick, concrete, wood.

## Fragmentation (HE)

**Card:** A thick shell bursts into a wide spray of fragments.

**Best used for:** Exposed wood and glass, broad fragment coverage.

**Flight:** speed multiplier 1.01; mass 1.4; radius 3.7; drag 0.03.

**Phases:** blast (damage: 29, channel: blast, radius: 21, label: BURST CASING; material multipliers: {"wood":1.2}) → fragment (damage: 16, channel: kinetic, rays: 14, spreadDeg: 162, distance: 28, at: 40, label: FRAGMENT SPRAY).

**Visual family:** he; good-vs filters: wood, brick, steel.

## Thermal (HE)

**Card:** A hot blast leaves the struck material glowing longer.

**Best used for:** Repeated hits on the same patch, exposed thin surfaces.

**Flight:** speed multiplier 0.98; mass 1.35; radius 3.9; drag 0.029.

**Phases:** blast (damage: 34, channel: blast, radius: 23, label: HOT BLAST) → burn (damage: 4, channel: heat, radius: 18, durationMs: 1400, at: 30, label: GLOWING PATCH).

**Visual family:** burn; good-vs filters: steel, wood, concrete.

## Rainmaker (HE)

**Card:** Bursts near a defense, spraying five glowing copper streams forward and downward.

**Best used for:** Open roofs and exposed sides, thin metal and light cover.

**Flight:** speed multiplier 0.94; mass 1.45; radius 4; drag 0.032; separation streams; standoff 25.

**Phases:** blast (damage: 17, channel: blast, radius: 15, label: AIR BURST) → rain (damage: 15, channel: jet, at: 25, rays: 5, spreadDeg: 64, distance: 40, angleOffset: 30, width: 4, label: FIVE COPPER STREAMS) → blast (damage: 11, channel: blast, radius: 19, at: 80, label: RAIN PATTERN).

**Visual family:** rain; good-vs filters: steel, brick, wood.

## Crownburst (HE)

**Card:** Bursts just before contact, sending blast pressure and fragments into the target.

**Best used for:** Fragile exposed cover, thin spaced layers.

**Flight:** speed multiplier 1; mass 1.3; radius 3.8; drag 0.028; standoff 12.

**Phases:** blast (damage: 43, channel: blast, radius: 28, label: PRE-CONTACT BURST) → fragment (damage: 13, channel: kinetic, rays: 9, spreadDeg: 76, distance: 26, at: 20, label: CROWN FRAGMENTS).

**Visual family:** he; good-vs filters: wood, steel, brick.

## Obstacle Reducer (HE)

**Card:** A strong blast breaks wood supports and brick obstacles.

**Best used for:** Brick obstacles, wood supports.

**Flight:** speed multiplier 0.92; mass 1.55; radius 4.2; drag 0.034.

**Phases:** blast (damage: 41, channel: blast, radius: 33, force: 1.4, label: OBSTACLE BLAST; material multipliers: {"wood":1.45,"brick":1.05}) → crush (damage: 16, channel: crush, radius: 29, at: 45, label: SUPPORT SHOVE; material multipliers: {"wood":1.5,"brick":1.35}).

**Visual family:** he; good-vs filters: brick, wood, concrete.

## Foundation Breaker (HE)

**Card:** Explodes shortly after impact to break nearby supports.

**Best used for:** Lower joints, brittle foundations.

**Flight:** speed multiplier 0.94; mass 1.5; radius 4.2; drag 0.033.

**Phases:** blast (damage: 23, channel: blast, radius: 18, label: DELAY FUSE) → blast (damage: 53, channel: blast, radius: 31, at: 280, dir: down, label: FOUNDATION BLAST) → shock (damage: 13, channel: shock, radius: 44, at: 315, force: 1.5, label: SUPPORT SHOCK).

**Visual family:** he; good-vs filters: concrete, brick, wood.

## Pressure Hammer (HE)

**Card:** A wide blast pushes nearby cover and bends thin plates.

**Best used for:** Nearby light cover, thin unsupported plates.

**Flight:** speed multiplier 0.96; mass 1.6; radius 4.4; drag 0.034.

**Phases:** blast (damage: 22, channel: blast, radius: 31, force: 1.6, label: PRESSURE WAVE) → shock (damage: 21, channel: shock, radius: 61, at: 50, force: 2.4, label: WIDE PRESSURE) → crush (damage: 11, channel: crush, radius: 33, at: 95, label: THIN PLATE BEND).

**Visual family:** shock; good-vs filters: steel, wood, slopes.

## Popcorn Burst (HE)

**Card:** Splits before impact into four pop pods that scatter and pop one after another.

**Best used for:** Wide brick and wood cover, clearing several spots at once.

**Flight:** speed multiplier 1; mass 1.35; radius 3.8; drag 0.03; separation pods; standoff 23.

**Phases:** blast (damage: 27, channel: blast, radius: 19, at: 30, angleOffset: -55, label: POP POD 1; material multipliers: {"brick":1.4,"wood":1.2,"concrete":0.9}) → blast (damage: 27, channel: blast, radius: 19, at: 165, angleOffset: -20, label: POP POD 2; material multipliers: {"brick":1.4,"wood":1.2,"concrete":0.9}) → blast (damage: 27, channel: blast, radius: 19, at: 300, angleOffset: 15, label: POP POD 3; material multipliers: {"brick":1.4,"wood":1.2,"concrete":0.9}) → blast (damage: 27, channel: blast, radius: 19, at: 435, angleOffset: 50, label: POP POD 4; material multipliers: {"brick":1.4,"wood":1.2,"concrete":0.9}).

**Visual family:** popcorn; good-vs filters: brick, wood, concrete.

## Meltdown (HE)

**Card:** Bursts on contact and leaves a white-hot patch that melts into steel for two seconds.

**Best used for:** Steel plates, opening a hole in one spot.

**Flight:** speed multiplier 1; mass 1.4; radius 4; drag 0.03.

**Phases:** blast (damage: 28, channel: blast, radius: 19, label: CONTACT BURST) → burn (damage: 9, channel: heat, radius: 17, durationMs: 2000, at: 0, label: WHITE-HOT PATCH / 2.0 s; material multipliers: {"steel":1.8,"armor":1.05}).

**Visual family:** burn; good-vs filters: steel, armor, concrete.

## APHE Hybrid (APHE)

**Card:** A steel nose pierces the surface before a delayed charge explodes.

**Best used for:** Thin barriers, light enclosed targets.

**Flight:** speed multiplier 1.07; mass 1.2; radius 3; drag 0.022.

**Phases:** pierce (damage: 35, channel: kinetic, distance: 26, width: 6, angleTolerance: 0.4, label: NOSE PIERCE) → blast (damage: 43, channel: blast, radius: 23, at: 190, label: DELAYED CHARGE).

**Visual family:** aphe; good-vs filters: steel, brick, wood.

## Capped APHE (APHE)

**Card:** A soft cap helps the steel nose strike angled armor before the charge explodes.

**Best used for:** Oblique thin steel, light backing.

**Flight:** speed multiplier 1.05; mass 1.22; radius 3.1; drag 0.024.

**Phases:** pierce (damage: 41, channel: kinetic, distance: 29, width: 6, angleTolerance: 0.82, label: CAPPED NOSE) → blast (damage: 39, channel: blast, radius: 22, at: 180, label: DELAYED BURST).

**Visual family:** aphe; good-vs filters: steel, slopes, armor.

## Bunkerbreaker (APHE)

**Card:** A short steel nose breaks into light cover before a quick blast.

**Best used for:** Brick, thin enclosures.

**Flight:** speed multiplier 1; mass 1.35; radius 3.4; drag 0.027.

**Phases:** pierce (damage: 33, channel: kinetic, distance: 23, width: 8, label: SHORT STEEL NOSE; material multipliers: {"brick":1.4,"wood":1.2,"concrete":0.9}) → blast (damage: 51, channel: blast, radius: 27, at: 105, label: QUICK INTERNAL BLAST; material multipliers: {"brick":1.4,"wood":1.2,"concrete":0.9}).

**Visual family:** aphe; good-vs filters: brick, concrete, wood.

## Emberpiercer (APHE)

**Card:** Pierces light cover, then bursts inside and leaves a longer-lasting glow.

**Best used for:** Thin enclosed targets, visible heat marking.

**Flight:** speed multiplier 1.06; mass 1.2; radius 3.1; drag 0.024.

**Phases:** pierce (damage: 39, channel: kinetic, distance: 27, width: 5, label: PIERCE) → blast (damage: 34, channel: blast, radius: 20, at: 150, label: INTERNAL BURST) → burn (damage: 3, channel: heat, radius: 15, durationMs: 2200, at: 170, label: LONG-LASTING EMBER).

**Visual family:** burn; good-vs filters: steel, brick, wood.

## Switchfuse (APHE)

**Card:** Choose a quick burst at the surface or a delayed burst inside the target.

**Best used for:** Mixed thin cover, choosing where the charge bursts.

**Flight:** speed multiplier 1.05; mass 1.22; radius 3.1; drag 0.024.

**FUSE / QUICK:** blast (damage: 55, channel: blast, radius: 25, label: QUICK SURFACE BURST).

**FUSE / DELAYED:** pierce (damage: 30, channel: kinetic, distance: 25, width: 5, label: DELAYED PIERCE) → blast (damage: 51, channel: blast, radius: 23, at: 190, label: DELAYED INTERNAL BURST).

**Visual family:** aphe; good-vs filters: steel, brick, concrete.

## Sideburst (APHE)

**Card:** Pierces light cover, then sends fragments sideways from its shell.

**Best used for:** Interior side walls, nearby parallel supports.

**Flight:** speed multiplier 1.04; mass 1.24; radius 3.2; drag 0.025.

**Phases:** pierce (damage: 30, channel: kinetic, distance: 27, width: 5, label: PIERCE SHELL) → fragment (damage: 18, channel: kinetic, at: 140, rays: 2, spreadDeg: 160, distance: 32, dir: sideL, label: SIDEWAYS BURST) → blast (damage: 18, channel: blast, radius: 17, at: 155).

**Visual family:** aphe; good-vs filters: brick, steel, wood.

## Latchburst (APHE)

**Card:** A hooked jacket grips the surface before the charge explodes.

**Best used for:** Thin oblique cover, keeping a burst near the strike.

**Flight:** speed multiplier 1.04; mass 1.25; radius 3.2; drag 0.025.

**Phases:** crush (damage: 12, channel: crush, radius: 18, force: 0.4, label: HOOKED JACKET GRIP) → blast (damage: 56, channel: blast, radius: 25, at: 150, label: LATCHED BURST).

**Visual family:** aphe; good-vs filters: steel, slopes, brick.

## Adaptive Shell (APHE)

**Card:** Choose a delayed blast for armor or a quicker, wider blast for buildings.

**Best used for:** Mixed defense types, choosing the blast timing.

**Flight:** speed multiplier 1.05; mass 1.3; radius 3.3; drag 0.025.

**CHARGE / ARMOR:** pierce (damage: 34, channel: kinetic, distance: 25, width: 5, angleTolerance: 0.6, label: ARMOR PIERCE) → jet (damage: 44, channel: jet, distance: 31, width: 7, at: 150, label: ADAPTED JET).

**CHARGE / BUILDING:** blast (damage: 57, channel: blast, radius: 34, at: 80, label: WIDE BUILDING BLAST; material multipliers: {"brick":1.4,"wood":1.2,"concrete":0.9}).

**Visual family:** aphe; good-vs filters: armor, brick, steel.

## Chain Blast (APHE)

**Card:** Pokes through the surface, then sets off three blasts that step deeper inside.

**Best used for:** Thick layered cover, reaching a core behind armor.

**Flight:** speed multiplier 1.02; mass 1.35; radius 3.4; drag 0.026.

**Phases:** pierce (damage: 24, channel: kinetic, distance: 16, width: 5, label: POKE THROUGH) → blast (damage: 28, channel: blast, radius: 14, at: 90, label: STEP ONE) → blast (damage: 32, channel: blast, radius: 14, at: 260, label: STEP TWO) → blast (damage: 36, channel: blast, radius: 15, at: 430, label: STEP THREE).

**Visual family:** chain; good-vs filters: armor, steel, concrete.

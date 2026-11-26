import { buildStage } from '../src/game/stages/generator';
import { ALL_STAGES } from '../src/game/stages/campaign';
import { cloneSnapshot, type StageDefinition, type StageSnapshot } from '../src/game/stages/types';
import { simulateShotWalls } from '../src/game/sim/wall-simulator';
import { getAmmo } from '../src/game/ammo/catalogue';
import { coreCoverFraction } from '../src/game/sim/walls';

/**
 * Balance sweep: how many shots each battery actually needs now that the round
 * bores with its own energy.
 *
 * Greedy, one shot at a time: from the current structure, try a grid of angles
 * and powers for every round, take the shot that advances the objective most,
 * apply it, repeat. That is enough to answer "can this fall in one shot?"
 * without running the campaign validator's full search.
 *
 * Run: npm run balance
 */

const AMMOS = ['ap-solid-shot', 'aphe-hybrid', 'apds-sabot', 'drillhead', 'he-blast', 'he-shaping'];
const ANGLES = [6, 10, 14, 18, 22, 26, 30, 34, 40, 46, 54, 62];
const POWERS = [200, 260, 320, 380, 441];

function coverOf(snapshot: StageSnapshot): number {
  return coreCoverFraction(snapshot.wallState!, snapshot.core);
}

function cleared(def: StageDefinition, snapshot: StageSnapshot): boolean {
  if (def.objective.kind === 'destroy-core') return snapshot.core.destroyed || snapshot.core.hp <= 0;
  if (def.objective.kind === 'expose-core') {
    if (snapshot.core.destroyed) return false;
    return coverOf(snapshot) <= (def.objective.threshold ?? 0.3);
  }
  return snapshot.relays.length > 0 && snapshot.relays.every((relay) => !relay.alive);
}

/** How much a shot advanced the objective (higher is better). */
function progress(def: StageDefinition, snapshot: StageSnapshot): number {
  if (def.objective.kind === 'destroy-core') {
    return (snapshot.core.maxHp - snapshot.core.hp) / Math.max(1, snapshot.core.maxHp);
  }
  if (def.objective.kind === 'expose-core') {
    if (snapshot.core.destroyed) return -1;
    return 1 - coverOf(snapshot);
  }
  const total = snapshot.relays.length || 1;
  return snapshot.relays.filter((relay) => !relay.alive).length / total;
}

let totalShots = 0;
let oneShot = 0;
let coreOneShot = 0;
let uncleared = 0;
const rows: string[] = [];

for (const stage of ALL_STAGES) {
  const built = buildStage(stage);
  let snapshot = cloneSnapshot({ grid: built.grid, wallState: built.wallState, core: built.core, relays: built.relays });
  let shots = 0;
  let done = cleared(built.def, snapshot);
  const path: string[] = [];
  while (shots < 6 && !done) {
    let best: { score: number; after: StageSnapshot; label: string; ammo: string; angle: number; power: number } | null = null;
    for (const ammoId of AMMOS) {
      if (!getAmmo(ammoId)) continue;
      for (const mode of ['arc', 'straight'] as const) {
        for (const angle of ANGLES) {
          for (const power of POWERS) {
            if (mode === 'straight' && angle > 24) continue;
            const out = simulateShotWalls(built.def, snapshot, { angleDeg: angle, power, mode, ammoId });
            totalShots += 1;
            const after = out.result.final;
            if (built.def.objective.kind === 'expose-core' && after.core.destroyed) continue;
            const score = progress(built.def, after);
            if (!best || score > best.score) {
              best = { score, after, label: `${ammoId}@${angle}/${power}${mode === 'straight' ? 's' : ''}`, ammo: ammoId, angle, power };
            }
          }
        }
      }
    }
    if (!best) break;
    snapshot = cloneSnapshot(best.after);
    shots += 1;
    path.push(best.label);
    done = cleared(built.def, snapshot);
  }
  if (shots === 1 && done) {
    oneShot += 1;
    if (stage.objective.kind === 'destroy-core') coreOneShot += 1;
  }
  if (!done) uncleared += 1;
  rows.push(`${stage.id.padEnd(15)} ${String(stage.objective.kind).padEnd(14)} shots=${shots}${done ? '' : ' UNCLEARED'}  ${path.join(' > ')}`);
  console.log(rows[rows.length - 1]);
}

console.log(`\n${oneShot}/${ALL_STAGES.length} batteries fall in one shot (${coreOneShot} of them destroy-core); ${uncleared} uncleared; ${totalShots} shots simulated`);
// A relay or an exposed core can legitimately be taken out by one good shot --
// that is the puzzle. A hardened core cannot: it takes more than one round's
// worth of energy, so a destroy-core battery must always cost at least two.
if (coreOneShot > 0) {
  console.error('a destroy-core battery still falls in one shot: raise its core health');
  process.exit(1);
}

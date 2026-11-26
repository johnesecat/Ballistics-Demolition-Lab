/**
 * Developer validation harness.
 *
 * Builds every campaign stage from its seed, checks initial stability and
 * objective geometry, then runs objective-specific shot searches to prove that
 * a clear is possible inside the shot budget.
 *
 * The searches deliberately use different strategies from the in-game HUD:
 * - destroy-core: scan for actual core impacts and compare penetration.
 * - expose-core: minimize shield coverage without killing the core.
 * - destroy-relay: concentrate damage on the relay pod.
 *
 * Run all: npm run validate
 * One stage: STAGE_FILTER=ash-harbor-01 npm run validate
 */
import { ALL_STAGES } from '../src/game/stages/campaign';
import { buildStage, snapshotCoreCoverFraction } from '../src/game/stages/generator';
import { detachUnsupported } from '../src/game/sim/walls';
import type { BuiltStage, StageSnapshot } from '../src/game/stages/types';
import { cloneSnapshot } from '../src/game/stages/types';
import { simulateShot } from '../src/game/sim/simulator';
import type { FireMode, ShotInput, ShotResult } from '../src/game/sim/types';
import { AMMO_BY_ID } from '../src/game/ammo/catalogue';
import { probeAim } from '../src/game/sim/preview';
import { getWallState } from '../src/game/sim/wall-simulator';

const CORE_AMMO = [
  'heat-round',
  'double-strike',
  'sabot-heat',
  'wide-jet',
  'needle-jet',
  'chain-blast',
  'adaptive-shell',
  'switchfuse',
  'aphe-hybrid',
  'capped-aphe',
  'apds-sabot',
  'finned-dart',
  'drillhead',
  'apcbc-combined-caps',
];

const BLAST_AMMO = [
  'he-blast',
  'he-demolition',
  'quake',
  'popcorn-burst',
  'rainmaker',
  'crownburst',
  'obstacle-reducer',
  'pressure-hammer',
  'fragmentation',
  'broadhead',
  'ribbon-hesh',
  'wide-jet',
  'crossfire',
];

const RELAY_AMMO = [
  'wide-jet',
  'heat-round',
  'double-strike',
  'he-blast',
  'he-demolition',
  'quake',
  'aphe-hybrid',
  'sabot-heat',
  'needle-jet',
  'crownburst',
  'popcorn-burst',
];

function snapshotOf(stage: BuiltStage): StageSnapshot {
  return { grid: stage.grid, wallState: stage.wallState, core: stage.core, relays: stage.relays };
}

function objectiveComplete(stage: BuiltStage, snapshot: StageSnapshot): boolean {
  const kind = stage.def.objective.kind;
  if (kind === 'destroy-core') return snapshot.core.destroyed || snapshot.core.hp <= 0;
  if (kind === 'destroy-relay') return snapshot.relays.length > 0 && snapshot.relays.every((relay) => !relay.alive);
  const threshold = stage.def.objective.threshold ?? 0.3;
  return !snapshot.core.destroyed && snapshotCoreCoverFraction(snapshot) <= threshold;
}

interface SolveStep {
  input: ShotInput;
  result: ShotResult;
}

interface SolveResult {
  success: boolean;
  shots: number;
  used: SolveStep[];
  remainingCore: number;
  cover: number;
  relaysAlive: number;
}

function scanCore(stage: BuiltStage, current: StageSnapshot): { input: ShotInput; result: ShotResult } | null {
  let best: { input: ShotInput; result: ShotResult } | null = null;
  // The aim preview now runs the real body solver, which is far too expensive
  // for a 70k-point feasibility sweep. Filter with the cheap flight-only probe:
  // keep shots that would reach the core on the pre-contact line and shots that
  // first touch a wall close enough for the round to bore on into it. Every
  // survivor is still decided by the authoritative shot simulation below.
  const walls = current.wallState?.walls ?? getWallState(current).walls;
  const modes: FireMode[] = ['straight', 'arc'];
  // A full body solve is ~18 ms. A bunker can put thousands of probes on the
  // core line, so simulate the closest lines first and cap the spend per shell.
  const SIM_CAP = 80;
  for (const ammoId of CORE_AMMO) {
    const ammo = AMMO_BY_ID.get(ammoId);
    if (!ammo) continue;
    const choice = ammo.choice?.defaultOption;
    for (const mode of modes) {
      const candidates: Array<{ input: ShotInput; rank: number }> = [];
      for (let angle = 4; angle <= 84; angle += 1) {
        for (let power = 120; power <= 441; power += 10) {
          const input: ShotInput = { angleDeg: angle, power, mode, ammoId, choiceId: choice };
          const preview = probeAim(stage.def, current, input, { walls, relays: false });
          const contact = preview.firstContact;
          const nearCore = contact
            ? Math.hypot(contact.x - current.core.x, contact.y - current.core.y) < 130
            : false;
          if (!preview.willHitCore && !nearCore) continue;
          // Free core lines first, then the contacts closest to the core.
          const rank = (preview.willHitCore ? 0 : 10000) + (contact ? Math.hypot(contact.x - current.core.x, contact.y - current.core.y) : 0);
          candidates.push({ input, rank });
        }
      }
      candidates.sort((a, b) => a.rank - b.rank);
      for (const candidate of candidates.slice(0, SIM_CAP)) {
        const result = simulateShot(stage.def, current, candidate.input);
        if (result.coreDamage < 1) continue;
        if (!best || result.coreDamage > best.result.coreDamage) best = { input: candidate.input, result };
      }
    }
  }
  return best;
}

function scanExpose(stage: BuiltStage, current: StageSnapshot): { input: ShotInput; result: ShotResult } | null {
  let best: { input: ShotInput; result: ShotResult; after: number } | null = null;
  const coverBefore = snapshotCoreCoverFraction(current);
  const walls = current.wallState?.walls ?? getWallState(current).walls;
  for (const ammoId of BLAST_AMMO) {
    const ammo = AMMO_BY_ID.get(ammoId);
    if (!ammo) continue;
    const choice = ammo.choice?.defaultOption;
    for (const mode of ['straight', 'arc'] as FireMode[]) {
      for (let angle = 4; angle <= 55; angle += 2) {
        for (const power of [180, 240, 300, 350, 400, 430]) {
          const input: ShotInput = { angleDeg: angle, power, mode, ammoId, choiceId: choice };
          // Only a shot that reaches the cover around the core can expose it.
          const probe = probeAim(stage.def, current, input, { walls, relays: false });
          if (!probe.firstContact) continue;
          if (Math.hypot(probe.firstContact.x - current.core.x, probe.firstContact.y - current.core.y) > 260) continue;
          const result = simulateShot(stage.def, current, input);
          if (result.final.core.destroyed) continue;
          const after = snapshotCoreCoverFraction(result.final);
          if (!best || after < best.after) best = { input, result, after };
        }
      }
    }
  }
  if (!best) return null;
  if (best.after >= coverBefore) return null;
  return { input: best.input, result: best.result };
}

function scanRelay(stage: BuiltStage, current: StageSnapshot): { input: ShotInput; result: ShotResult } | null {
  let best: { input: ShotInput; result: ShotResult; remaining: number } | null = null;
  const walls = current.wallState?.walls ?? getWallState(current).walls;
  const target = current.relays.find((relay) => relay.alive);
  const targetX = target ? target.cells.reduce((sum, cell) => sum + current.grid.originX + (cell.col + 0.5) * current.grid.tile, 0) / Math.max(1, target.cells.length) : null;
  const targetY = target ? target.cells.reduce((sum, cell) => sum + current.grid.originY + (cell.row + 0.5) * current.grid.tile, 0) / Math.max(1, target.cells.length) : null;
  for (const ammoId of RELAY_AMMO) {
    const ammo = AMMO_BY_ID.get(ammoId);
    if (!ammo) continue;
    const choice = ammo.choice?.defaultOption;
    for (const mode of ['straight', 'arc'] as FireMode[]) {
      for (let angle = 4; angle <= 70; angle += 2) {
        for (const power of [180, 240, 300, 350, 400, 430]) {
          const input: ShotInput = { angleDeg: angle, power, mode, ammoId, choiceId: choice };
          // A shot that first touches far from the pod cannot reach it.
          const probe = probeAim(stage.def, current, input, { walls, relays: false });
          const nearRelay = probe.firstContact && targetX !== null && targetY !== null
            ? Math.hypot(probe.firstContact.x - targetX, probe.firstContact.y - targetY) < 260
            : false;
          if (!nearRelay && !probe.willHitRelay) continue;
          const result = simulateShot(stage.def, current, input);
          const remaining = result.final.relays[0]?.alive ? 1 : 0;
          if (!best || remaining < best.remaining) best = { input, result, remaining };
        }
      }
    }
  }
  return best;
}

function solve(stage: BuiltStage): SolveResult {
  let current = cloneSnapshot(snapshotOf(stage));
  const used: SolveStep[] = [];
  for (let shot = 0; shot < stage.def.shots; shot += 1) {
    if (objectiveComplete(stage, current)) break;
    let step: { input: ShotInput; result: ShotResult } | null;
    if (stage.def.objective.kind === 'destroy-core') step = scanCore(stage, current);
    else if (stage.def.objective.kind === 'expose-core') step = scanExpose(stage, current);
    else step = scanRelay(stage, current);
    if (!step) break;
    current = step.result.final;
    used.push(step);
  }
  return {
    success: objectiveComplete(stage, current),
    shots: used.length,
    used,
    remainingCore: current.core.hp,
    cover: snapshotCoreCoverFraction(current),
    relaysAlive: current.relays.filter((relay) => relay.alive).length,
  };
}

let failed = 0;
const filter = process.env.STAGE_FILTER;
const stagesToCheck = filter ? ALL_STAGES.filter((stage) => stage.id.includes(filter)) : ALL_STAGES;
for (const def of stagesToCheck) {
  const built = buildStage(def);
  const unsupported = built.wallState ? detachUnsupported(built.wallState.walls, built.groundY).detached.length : 0;
  const initial = snapshotOf(built);
  console.error(`… solving ${def.id}`);
  const result = solve(built);
  const status = result.success ? 'OK' : 'FAIL';
  if (!result.success) failed += 1;
  console.log(
    `${status} ${def.id.padEnd(14)} ${def.name.padEnd(18)} ${def.objective.kind.padEnd(13)} ${def.generator.padEnd(8)} seed=${String(built.diagnostics.generatedSeed).padStart(10)} cells=${String(built.diagnostics.cellCount).padStart(4)} unsupported=${unsupported} core=${Math.round(initial.core.hp)} cover=${result.cover.toFixed(2)} shots=${result.shots}/${def.shots} ${result.used.map((s) => s.input.ammoId).join(',')}`,
  );
}
console.log(`\n${stagesToCheck.length - failed}/${stagesToCheck.length} stages validated as solvable`);
console.log('NOTE: This is a feasibility harness, not a guarantee that a human finds the shortest solution.');
if (failed > 0) process.exitCode = 1;

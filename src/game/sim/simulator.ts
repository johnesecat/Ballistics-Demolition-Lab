import type { StageDefinition, StageSnapshot } from '../stages/types';
import type { ShotInput, ShotResult } from './types';
import { simulateShotWalls } from './wall-simulator';

/**
 * Compatibility shim (P0-12). The grid simulator is deleted; all shots go
 * through the wall-object simulator. This export exists so validation
 * tooling and older callers keep working without a grid code path.
 */
export function simulateShot(def: StageDefinition, snapshot: StageSnapshot, input: ShotInput): ShotResult {
  return simulateShotWalls(def, snapshot, input).result;
}

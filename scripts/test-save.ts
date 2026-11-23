import assert from 'node:assert/strict';
import { SaveStore } from '../src/game/save';
import { SAVE } from '../src/game/config';

class StorageStub implements Storage {
  data = new Map<string, string>();
  failBackup = true;
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) {
    if (this.failBackup && key.startsWith(SAVE.backupPrefix)) throw new Error('quota');
    this.data.set(key, value);
  }
}
const storage = new StorageStub();
const raw = JSON.stringify({version: SAVE.version + 1, settings: {}, results: {}});
storage.data.set(SAVE.key, raw);
const save = new SaveStore(storage);
save.setPreferredAmmo('heat-round');
assert.equal(storage.getItem(SAVE.key), raw, 'future save must survive when backup fails');
console.log('Save recovery preserves original on backup failure');

// A mission checkpoint survives a reload, including older unmerged wall geometry.
const missionStorage = new StorageStub();
const missionStore = new SaveStore(missionStorage);
const { buildStage } = await import('../src/game/stages/generator');
const { ALL_STAGES } = await import('../src/game/stages/campaign');
const stage = buildStage(ALL_STAGES[0]!);
const snapshot = { grid: stage.grid, wallState: { version: 1 as const, groundY: stage.groundY, heat: [], walls: [
  { id: 'a', material: 'wood' as const, polygons: [[{x: 10, y: 20}, {x: 20, y: 20}, {x: 20, y: 30}, {x: 10, y: 30}]] },
  { id: 'b', material: 'wood' as const, polygons: [[{x: 20, y: 20}, {x: 30, y: 20}, {x: 30, y: 30}, {x: 20, y: 30}]] },
] }, core: { ...stage.core, hp: 31 }, relays: stage.relays.map(r => ({...r, alive: false})) };
missionStore.setMission({ stageId: stage.def.id, snapshot, shotsUsed: 2, aim: { angleDeg: 31, power: 300, mode: 'arc', ammoId: 'aphe-hybrid' }, pending: {coreDamage: 4, cellDamage: 8} });
const legacy = JSON.parse(missionStorage.getItem(SAVE.key)!);
legacy.version = SAVE.version - 1;
missionStorage.setItem(SAVE.key, JSON.stringify(legacy));
const loadedMission = new SaveStore(missionStorage).data.mission;
assert.ok(loadedMission);
assert.equal(loadedMission.shotsUsed, 2);
assert.equal(loadedMission.snapshot.core.hp, 31);
assert.deepEqual(loadedMission.snapshot.relays, snapshot.relays);
assert.equal(loadedMission.snapshot.wallState?.walls.length, 1, 'older adjacent wall pieces are merged on resume');
assert.deepEqual(loadedMission.pending, {coreDamage: 4, cellDamage: 8});
missionStore.clearMission();
assert.equal(new SaveStore(missionStorage).data.mission, null);
const { simulateShotWalls } = await import('../src/game/sim/wall-simulator');
const input = { angleDeg: 26, power: 260, mode: 'arc' as const, ammoId: 'aphe-hybrid' };
const first = simulateShotWalls(stage.def, {grid: stage.grid, wallState: stage.wallState, core: stage.core, relays: stage.relays}, input).result;
missionStore.setMission({stageId: stage.def.id, snapshot: first.final, shotsUsed: 1, aim: input, pending: null});
const resumed = new SaveStore(missionStorage).data.mission!;
const uninterruptedNext = simulateShotWalls(stage.def, first.final, input).result;
const resumedNext = simulateShotWalls(stage.def, resumed.snapshot, input).result;
assert.deepEqual(resumedNext.final, uninterruptedNext.final, 'subsequent shots match the uninterrupted damaged mission');
missionStore.clearMission();
console.log('Mission checkpoint round-trip, migration and continued simulation passed');

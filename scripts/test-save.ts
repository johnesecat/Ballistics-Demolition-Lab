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

// test/memory_pins.test.mjs
//
// Tests for persistent per-thread pinning. Covers:
//   - isolated pins per thread
//   - round-trip through the settings store
//   - toggle semantics
//   - interaction with backup export/import (automatic since we live in
//     the settings subtree)

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.store = new Map(); }
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
  clear() { this.store.clear(); }
}
globalThis.localStorage = new MemoryStorage();

const {
  loadPins, savePins, togglePin, getPinnedIds,
  clearPinsForThread, getThreadsWithPins,
} = await import('../src/memory/pins.js');
const { loadSettings } = await import('../src/profile/settings_store.js');
const { exportSettingsAsJson, importSettingsFromJson } =
  await import('../src/profile/backup.js');

beforeEach(() => { globalThis.localStorage.clear(); });

// ---- load / save ----

test('loadPins: empty map when no pins exist', () => {
  assert.deepEqual(loadPins('thread-a'), {});
});

test('savePins + loadPins round-trip', () => {
  savePins('thread-a', { 'e_aaaa1111': { label: 'hi', createdAt: 1, policy: 'protect' } });
  const pins = loadPins('thread-a');
  assert.equal(pins['e_aaaa1111'].label, 'hi');
});

test('loadPins defensive against invalid stored state', async () => {
  // If somehow the settings had a non-object in the thread slot
  const { updateField } = await import('../src/profile/settings_store.js');
  updateField('memory.pinsByThread', { 'thread-a': 'not-an-object' });
  assert.deepEqual(loadPins('thread-a'), {});
});

test('loadPins: missing threadId returns empty', () => {
  assert.deepEqual(loadPins(null), {});
  assert.deepEqual(loadPins(''), {});
  assert.deepEqual(loadPins(undefined), {});
});

// ---- togglePin ----

test('togglePin: pins if not present', () => {
  const result = togglePin('thread-a', 'e_test', 'test label');
  assert.equal(result, true);
  const pins = loadPins('thread-a');
  assert.ok(pins['e_test']);
  assert.equal(pins['e_test'].label, 'test label');
  assert.equal(pins['e_test'].policy, 'protect');
});

test('togglePin: unpins if present', () => {
  togglePin('thread-a', 'e_test');
  const result = togglePin('thread-a', 'e_test');
  assert.equal(result, false);
  assert.deepEqual(loadPins('thread-a'), {});
});

test('togglePin: stamps createdAt', () => {
  const before = Date.now();
  togglePin('thread-a', 'e_test');
  const after = Date.now();
  const pin = loadPins('thread-a')['e_test'];
  assert.ok(pin.createdAt >= before);
  assert.ok(pin.createdAt <= after);
});

// ---- getPinnedIds — the Set shape trim.js expects ----

test('getPinnedIds: returns Set of IDs', () => {
  togglePin('thread-a', 'e_one');
  togglePin('thread-a', 'e_two');
  const ids = getPinnedIds('thread-a');
  assert.ok(ids instanceof Set);
  assert.equal(ids.size, 2);
  assert.ok(ids.has('e_one'));
  assert.ok(ids.has('e_two'));
});

test('getPinnedIds: empty Set when no pins', () => {
  const ids = getPinnedIds('thread-fresh');
  assert.equal(ids.size, 0);
});

// ---- per-thread isolation ----

test('pins are scoped per thread', () => {
  togglePin('thread-a', 'e_one');
  togglePin('thread-b', 'e_two');
  assert.ok(loadPins('thread-a')['e_one']);
  assert.ok(!loadPins('thread-a')['e_two']);
  assert.ok(loadPins('thread-b')['e_two']);
  assert.ok(!loadPins('thread-b')['e_one']);
});

test('pinning in thread-a does not affect thread-b', () => {
  togglePin('thread-a', 'e_shared-id');
  assert.ok(!loadPins('thread-b')['e_shared-id']);
  // And the reverse
  togglePin('thread-b', 'e_shared-id');
  togglePin('thread-a', 'e_shared-id'); // unpin from A
  assert.ok(loadPins('thread-b')['e_shared-id']); // still pinned in B
});

// ---- clearPinsForThread ----

test('clearPinsForThread removes all pins for that thread only', () => {
  togglePin('thread-a', 'e_one');
  togglePin('thread-a', 'e_two');
  togglePin('thread-b', 'e_three');
  clearPinsForThread('thread-a');
  assert.deepEqual(loadPins('thread-a'), {});
  assert.ok(loadPins('thread-b')['e_three']);
});

test('clearPinsForThread: missing threadId is a no-op', () => {
  togglePin('thread-a', 'e_one');
  clearPinsForThread(null);
  clearPinsForThread('');
  assert.ok(loadPins('thread-a')['e_one']);
});

// ---- getThreadsWithPins ----

test('getThreadsWithPins: lists non-empty thread IDs', () => {
  togglePin('thread-a', 'e_one');
  togglePin('thread-b', 'e_two');
  togglePin('thread-c', 'e_three');
  togglePin('thread-c', 'e_three'); // unpin — now empty
  const threads = getThreadsWithPins();
  assert.ok(threads.includes('thread-a'));
  assert.ok(threads.includes('thread-b'));
  assert.ok(!threads.includes('thread-c'));
});

test('getThreadsWithPins: empty when no thread has pins', () => {
  assert.deepEqual(getThreadsWithPins(), []);
});

// ---- backup round-trip ----

test('pins survive export/import round-trip', () => {
  togglePin('thread-a', 'e_important', 'keep forever');
  togglePin('thread-b', 'e_other');

  const json = exportSettingsAsJson();
  globalThis.localStorage.clear();
  const result = importSettingsFromJson(json);
  assert.equal(result.success, true);

  assert.ok(loadPins('thread-a')['e_important']);
  assert.equal(loadPins('thread-a')['e_important'].label, 'keep forever');
  assert.ok(loadPins('thread-b')['e_other']);
});

test('restoring a backup without memory.pinsByThread still works', () => {
  const backupWithoutMemory = JSON.stringify({
    schema: 1,
    exportedAt: '2020-01-01T00:00:00.000Z',
    settings: {
      profile: { displayName: 'Old User' },
      // No memory subtree — older backup before pinning existed
    },
  });
  const result = importSettingsFromJson(backupWithoutMemory);
  assert.equal(result.success, true);

  // loadPins works against defaults
  assert.deepEqual(loadPins('thread-a'), {});
});

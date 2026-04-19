// test/snapshots.test.mjs
//
// Tests for the snapshot/restore module. Focused on the pure functions:
// - captureSnapshot / loadSnapshots / deleteSnapshot / findSnapshot ring
//   buffer behavior against a mocked settings_store
// - buildRestoreDiff multiset matching logic
// - formatSnapshotSummary edge cases

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---- mock settings_store ----
// We mock @/profile/settings_store by intercepting the module before
// snapshots.js loads. Simplest approach: store state in a plain var
// and swap using a module cache bust via the `?t=` query trick doesn't
// work reliably across Node versions, so we just reset between tests
// by clearing the mock state.

let mockSettings = {};
const mockModuleUrl = new URL('../src/profile/settings_store.js', import.meta.url);

// Swap the real settings_store with a mock by re-registering in Node's
// loader cache. In practice the simpler/cleaner path is: ensure we
// import snapshots AFTER setting up mock globals the real module reads.
// But settings_store reads/writes localStorage under the hood. So we
// mock THAT.

function resetMockStorage() {
  mockSettings = {};
  globalThis.localStorage = {
    _store: {},
    getItem(k) { return this._store[k] ?? null; },
    setItem(k, v) { this._store[k] = String(v); },
    removeItem(k) { delete this._store[k]; },
    clear() { this._store = {}; },
  };
}

beforeEach(() => {
  resetMockStorage();
});

async function loadSnapshotsModule() {
  // Re-import with cache bust so settings_store picks up a fresh
  // localStorage each test
  const url = new URL('../src/memory/snapshots.js', import.meta.url);
  url.searchParams.set('t', String(Math.random()));
  return import(url.href);
}

// ---- captureSnapshot / loadSnapshots / deleteSnapshot ----

test('loadSnapshots: returns empty array when nothing persisted', async () => {
  const { loadSnapshots } = await loadSnapshotsModule();
  const list = loadSnapshots('thread-1');
  assert.deepEqual(list, []);
});

test('loadSnapshots: returns empty for null threadId', async () => {
  const { loadSnapshots } = await loadSnapshotsModule();
  assert.deepEqual(loadSnapshots(null), []);
});

test('captureSnapshot: stores a record and returns its id', async () => {
  const { captureSnapshot, loadSnapshots } = await loadSnapshotsModule();
  const items = [
    { id: 'a', scope: 'memory', text: 'hi' },
    { id: 'b', scope: 'lore',   text: 'hello' },
  ];
  const id = captureSnapshot('thread-1', items);
  assert.ok(typeof id === 'string' && id.length > 0);
  const list = loadSnapshots('thread-1');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, id);
  assert.equal(list[0].memoryCount, 1);
  assert.equal(list[0].loreCount, 1);
  assert.equal(list[0].items.length, 2);
});

test('captureSnapshot: newest first order', async () => {
  const { captureSnapshot, loadSnapshots } = await loadSnapshotsModule();
  const id1 = captureSnapshot('thread-1', [{ id: '1', scope: 'memory', text: 'first' }]);
  const id2 = captureSnapshot('thread-1', [{ id: '2', scope: 'memory', text: 'second' }]);
  const list = loadSnapshots('thread-1');
  assert.equal(list.length, 2);
  assert.equal(list[0].id, id2); // newest first
  assert.equal(list[1].id, id1);
});

test('captureSnapshot: ring buffer caps at MAX_SNAPSHOTS', async () => {
  const { captureSnapshot, loadSnapshots } = await loadSnapshotsModule();
  // MAX is 10 per module source
  for (let i = 0; i < 15; i++) {
    captureSnapshot('thread-1', [{ id: `${i}`, scope: 'memory', text: `item-${i}` }]);
  }
  const list = loadSnapshots('thread-1');
  assert.equal(list.length, 10);
  // newest (index 14) should still be there, label-ish check via items
  assert.equal(list[0].items[0].text, 'item-14');
  // oldest surviving should be index 5 (items 0-4 got pushed out)
  assert.equal(list[9].items[0].text, 'item-5');
});

test('captureSnapshot: deep-copies items (mutating source does not affect snapshot)', async () => {
  const { captureSnapshot, loadSnapshots } = await loadSnapshotsModule();
  const item = { id: 'a', scope: 'memory', text: 'original' };
  captureSnapshot('thread-1', [item]);
  item.text = 'mutated';
  const list = loadSnapshots('thread-1');
  assert.equal(list[0].items[0].text, 'original');
});

test('captureSnapshot: preserves __-prefixed passthrough fields', async () => {
  const { captureSnapshot, loadSnapshots } = await loadSnapshotsModule();
  const items = [
    { id: 'a', scope: 'memory', text: 'x', __messageId: 42, __level: '1', __indexInLevel: 3 },
  ];
  captureSnapshot('thread-1', items);
  const list = loadSnapshots('thread-1');
  assert.equal(list[0].items[0].__messageId, 42);
  assert.equal(list[0].items[0].__level, '1');
  assert.equal(list[0].items[0].__indexInLevel, 3);
});

test('deleteSnapshot: removes one by id, leaves others', async () => {
  const { captureSnapshot, loadSnapshots, deleteSnapshot } = await loadSnapshotsModule();
  const id1 = captureSnapshot('thread-1', [{ id: '1', scope: 'memory', text: 'a' }]);
  const id2 = captureSnapshot('thread-1', [{ id: '2', scope: 'memory', text: 'b' }]);
  deleteSnapshot('thread-1', id1);
  const list = loadSnapshots('thread-1');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, id2);
});

test('findSnapshot: returns null for missing id', async () => {
  const { captureSnapshot, findSnapshot } = await loadSnapshotsModule();
  captureSnapshot('thread-1', [{ id: '1', scope: 'memory', text: 'x' }]);
  assert.equal(findSnapshot('thread-1', 'nonexistent'), null);
  assert.equal(findSnapshot(null, 'anything'), null);
});

test('clearSnapshots: removes all for a thread', async () => {
  const { captureSnapshot, loadSnapshots, clearSnapshots } = await loadSnapshotsModule();
  captureSnapshot('thread-1', [{ id: '1', scope: 'memory', text: 'a' }]);
  captureSnapshot('thread-1', [{ id: '2', scope: 'memory', text: 'b' }]);
  clearSnapshots('thread-1');
  assert.deepEqual(loadSnapshots('thread-1'), []);
});

// ---- buildRestoreDiff ----

test('buildRestoreDiff: identical states → zero changes', async () => {
  const { buildRestoreDiff } = await loadSnapshotsModule();
  const items = [
    { id: 'a', scope: 'memory', text: 'x' },
    { id: 'b', scope: 'lore',   text: 'y' },
  ];
  const diff = buildRestoreDiff(items, items);
  assert.equal(diff.totalChanges, 0);
  assert.equal(diff.added.length, 0);
  assert.equal(diff.deleted.length, 0);
});

test('buildRestoreDiff: snapshot-only items → added', async () => {
  const { buildRestoreDiff } = await loadSnapshotsModule();
  const current = [{ id: 'a', scope: 'memory', text: 'exists' }];
  const snap = [
    { id: 'a', scope: 'memory', text: 'exists' },
    { id: 'b', scope: 'memory', text: 'missing' },
  ];
  const diff = buildRestoreDiff(current, snap);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0].text, 'missing');
  assert.equal(diff.deleted.length, 0);
});

test('buildRestoreDiff: current-only items → deleted', async () => {
  const { buildRestoreDiff } = await loadSnapshotsModule();
  const current = [
    { id: 'a', scope: 'memory', text: 'keep' },
    { id: 'b', scope: 'memory', text: 'remove' },
  ];
  const snap = [{ id: 'a', scope: 'memory', text: 'keep' }];
  const diff = buildRestoreDiff(current, snap);
  assert.equal(diff.deleted.length, 1);
  assert.equal(diff.deleted[0].text, 'remove');
  assert.equal(diff.added.length, 0);
});

test('buildRestoreDiff: text edits show as delete+add (no edited slot)', async () => {
  const { buildRestoreDiff } = await loadSnapshotsModule();
  const current = [{ id: 'a', scope: 'memory', text: 'before' }];
  const snap = [{ id: 'a_snap', scope: 'memory', text: 'after' }];
  const diff = buildRestoreDiff(current, snap);
  assert.equal(diff.deleted.length, 1);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.edited.length, 0);
});

test('buildRestoreDiff: scope changes (promote) → delete + add', async () => {
  const { buildRestoreDiff } = await loadSnapshotsModule();
  // Current: "x" is memory. Snapshot: "x" was lore. So restore demotes.
  const current = [{ id: 'mem1', scope: 'memory', text: 'x' }];
  const snap = [{ id: 'lore1', scope: 'lore', text: 'x' }];
  const diff = buildRestoreDiff(current, snap);
  assert.equal(diff.deleted.length, 1);
  assert.equal(diff.deleted[0].scope, 'memory');
  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0].scope, 'lore');
});

test('buildRestoreDiff: multiset matching handles duplicate texts', async () => {
  // Current has "hi" twice, snapshot has "hi" three times → add one
  const { buildRestoreDiff } = await loadSnapshotsModule();
  const current = [
    { id: 'a', scope: 'memory', text: 'hi' },
    { id: 'b', scope: 'memory', text: 'hi' },
  ];
  const snap = [
    { id: 'a', scope: 'memory', text: 'hi' },
    { id: 'b', scope: 'memory', text: 'hi' },
    { id: 'c', scope: 'memory', text: 'hi' },
  ];
  const diff = buildRestoreDiff(current, snap);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.deleted.length, 0);
});

test('buildRestoreDiff: handles null/undefined inputs gracefully', async () => {
  const { buildRestoreDiff } = await loadSnapshotsModule();
  assert.equal(buildRestoreDiff(null, null).totalChanges, 0);
  assert.equal(buildRestoreDiff(undefined, [{ id: 'a', scope: 'memory', text: 'x' }]).added.length, 1);
  assert.equal(buildRestoreDiff([{ id: 'a', scope: 'memory', text: 'x' }], null).deleted.length, 1);
});

// ---- formatSnapshotSummary ----

test('formatSnapshotSummary: formats "just now" for recent snapshot', async () => {
  const { formatSnapshotSummary } = await loadSnapshotsModule();
  const s = formatSnapshotSummary({
    createdAt: Date.now() - 1000,
    memoryCount: 3,
    loreCount: 1,
    label: null,
  });
  assert.match(s, /Just now/);
  assert.match(s, /3 memories/);
  assert.match(s, /1 lore/);
});

test('formatSnapshotSummary: formats minutes', async () => {
  const { formatSnapshotSummary } = await loadSnapshotsModule();
  const s = formatSnapshotSummary({
    createdAt: Date.now() - 5 * 60 * 1000,
    memoryCount: 1,
    loreCount: 0,
  });
  assert.match(s, /5 minutes ago/);
  assert.match(s, /1 memory/);
});

test('formatSnapshotSummary: includes label when present', async () => {
  const { formatSnapshotSummary } = await loadSnapshotsModule();
  const s = formatSnapshotSummary({
    createdAt: Date.now(),
    memoryCount: 0,
    loreCount: 0,
    label: 'Before save',
  });
  assert.match(s, /Before save/);
});

test('formatSnapshotSummary: handles missing/invalid snapshot', async () => {
  const { formatSnapshotSummary } = await loadSnapshotsModule();
  assert.equal(formatSnapshotSummary(null), 'Invalid snapshot');
  assert.equal(formatSnapshotSummary({}), 'Invalid snapshot');
});

// ---------------------------------------------------------------
// User-tunable snapshot cap (#5)
// ---------------------------------------------------------------

test('captureSnapshot: respects user-set memory.tool.maxSnapshots (lower than default)', async () => {
  const { captureSnapshot, loadSnapshots } = await loadSnapshotsModule();
  // Set the cap to 5
  localStorage.setItem('pf:settings', JSON.stringify({
    memory: { tool: { maxSnapshots: 5 } },
  }));
  for (let i = 0; i < 12; i++) {
    captureSnapshot('thread-cap-test', [{ id: `${i}`, scope: 'memory', text: `n-${i}` }]);
  }
  const list = loadSnapshots('thread-cap-test');
  assert.equal(list.length, 5);
  assert.equal(list[0].items[0].text, 'n-11', 'newest at index 0');
  assert.equal(list[4].items[0].text, 'n-7',  'oldest surviving at index 4');
});

test('captureSnapshot: respects user-set memory.tool.maxSnapshots (higher than default)', async () => {
  const { captureSnapshot, loadSnapshots } = await loadSnapshotsModule();
  localStorage.setItem('pf:settings', JSON.stringify({
    memory: { tool: { maxSnapshots: 25 } },
  }));
  for (let i = 0; i < 30; i++) {
    captureSnapshot('thread-big-cap', [{ id: `${i}`, scope: 'memory', text: `n-${i}` }]);
  }
  const list = loadSnapshots('thread-big-cap');
  assert.equal(list.length, 25);
});

test('captureSnapshot: clamps invalid maxSnapshots to default', async () => {
  const { captureSnapshot, loadSnapshots } = await loadSnapshotsModule();
  // Garbage value → default (10)
  localStorage.setItem('pf:settings', JSON.stringify({
    memory: { tool: { maxSnapshots: 'banana' } },
  }));
  for (let i = 0; i < 15; i++) {
    captureSnapshot('thread-garbage', [{ id: `${i}`, scope: 'memory', text: `n-${i}` }]);
  }
  assert.equal(loadSnapshots('thread-garbage').length, 10);
});

test('captureSnapshot: clamps below-min maxSnapshots up to MIN', async () => {
  const { captureSnapshot, loadSnapshots, SNAPSHOT_CAP_BOUNDS } = await loadSnapshotsModule();
  // Asking for 1 → clamped to 5 (MIN)
  localStorage.setItem('pf:settings', JSON.stringify({
    memory: { tool: { maxSnapshots: 1 } },
  }));
  for (let i = 0; i < 12; i++) {
    captureSnapshot('thread-tiny', [{ id: `${i}`, scope: 'memory', text: `n-${i}` }]);
  }
  assert.equal(loadSnapshots('thread-tiny').length, SNAPSHOT_CAP_BOUNDS.min);
});

test('captureSnapshot: clamps above-max maxSnapshots down to MAX', async () => {
  const { captureSnapshot, loadSnapshots, SNAPSHOT_CAP_BOUNDS } = await loadSnapshotsModule();
  // Asking for 1000 → clamped to 25 (MAX)
  localStorage.setItem('pf:settings', JSON.stringify({
    memory: { tool: { maxSnapshots: 1000 } },
  }));
  for (let i = 0; i < 50; i++) {
    captureSnapshot('thread-huge', [{ id: `${i}`, scope: 'memory', text: `n-${i}` }]);
  }
  assert.equal(loadSnapshots('thread-huge').length, SNAPSHOT_CAP_BOUNDS.max);
});

test('SNAPSHOT_CAP_BOUNDS: exposes min/max/default', async () => {
  const { SNAPSHOT_CAP_BOUNDS } = await loadSnapshotsModule();
  assert.equal(typeof SNAPSHOT_CAP_BOUNDS.min, 'number');
  assert.equal(typeof SNAPSHOT_CAP_BOUNDS.max, 'number');
  assert.equal(typeof SNAPSHOT_CAP_BOUNDS.default, 'number');
  assert.ok(SNAPSHOT_CAP_BOUNDS.min < SNAPSHOT_CAP_BOUNDS.default);
  assert.ok(SNAPSHOT_CAP_BOUNDS.default < SNAPSHOT_CAP_BOUNDS.max);
});

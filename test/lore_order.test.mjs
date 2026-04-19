// test/lore_order.test.mjs
//
// Unit tests for src/memory/lore_order.js — the OUR-tool-only
// per-book lore ordering. Storage round-trips through a mock
// localStorage so the test runner's environment isn't polluted.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage (same shape as test/counters.test.mjs).
const STORE = new Map();
globalThis.localStorage = {
  getItem(k) { return STORE.has(k) ? STORE.get(k) : null; },
  setItem(k, v) { STORE.set(k, String(v)); },
  removeItem(k) { STORE.delete(k); },
  clear() { STORE.clear(); },
  key(i) { return [...STORE.keys()][i] || null; },
  get length() { return STORE.size; },
};
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, opts = {}) { this.type = type; this.detail = opts.detail; }
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
}

async function loadModule() {
  return await import('../src/memory/lore_order.js');
}

beforeEach(() => {
  STORE.clear();
});

test('loadLoreOrder: returns empty array when nothing persisted', async () => {
  const { loadLoreOrder } = await loadModule();
  assert.deepEqual(loadLoreOrder(42), []);
});

test('loadLoreOrder: returns empty array for null/undefined bookId', async () => {
  const { loadLoreOrder } = await loadModule();
  assert.deepEqual(loadLoreOrder(null), []);
  assert.deepEqual(loadLoreOrder(undefined), []);
});

test('persistLoreOrder + loadLoreOrder: roundtrip', async () => {
  const { persistLoreOrder, loadLoreOrder } = await loadModule();
  persistLoreOrder(42, [3, 1, 4, 1, 5]); // (yes, dupes are kept; that's the user's order)
  assert.deepEqual(loadLoreOrder(42), ['3', '1', '4', '1', '5']);
});

test('persistLoreOrder: empty array deletes the entry', async () => {
  const { persistLoreOrder, loadLoreOrder } = await loadModule();
  persistLoreOrder(42, [1, 2, 3]);
  assert.deepEqual(loadLoreOrder(42), ['1', '2', '3']);
  persistLoreOrder(42, []);
  assert.deepEqual(loadLoreOrder(42), []);
  // Verify storage actually cleaned up — settings.loreOrderByBookId[42]
  // should be gone, not present-as-empty.
  const settings = JSON.parse(localStorage.getItem('pf:settings') || '{}');
  assert.ok(
    !settings.loreOrderByBookId || !('42' in settings.loreOrderByBookId),
    'empty persist should delete the key'
  );
});

test('persistLoreOrder: ignores non-array input', async () => {
  const { persistLoreOrder, loadLoreOrder } = await loadModule();
  persistLoreOrder(42, [1, 2]);
  persistLoreOrder(42, null);     // ignored
  persistLoreOrder(42, 'abc');    // ignored
  persistLoreOrder(42, { 0: 1 }); // ignored
  assert.deepEqual(loadLoreOrder(42), ['1', '2']);
});

test('persistLoreOrder: ignores null bookId', async () => {
  const { persistLoreOrder, loadLoreOrder } = await loadModule();
  persistLoreOrder(null, [1, 2, 3]);
  // No book to load against
  assert.deepEqual(loadLoreOrder(42), []);
});

test('persistLoreOrder: per-book isolation', async () => {
  const { persistLoreOrder, loadLoreOrder } = await loadModule();
  persistLoreOrder(42, [1, 2, 3]);
  persistLoreOrder(99, [10, 20]);
  assert.deepEqual(loadLoreOrder(42), ['1', '2', '3']);
  assert.deepEqual(loadLoreOrder(99), ['10', '20']);
});

test('sortLoreByPersistedOrder: in-list first sorted by rank, not-in-list at end stable', async () => {
  const { persistLoreOrder, sortLoreByPersistedOrder } = await loadModule();
  persistLoreOrder(42, [3, 1]); // 3 first, then 1
  const items = [
    { id: 1, text: 'one' },
    { id: 2, text: 'two' },     // not in list
    { id: 3, text: 'three' },
    { id: 4, text: 'four' },    // not in list
  ];
  const sorted = sortLoreByPersistedOrder(items, 42);
  // In-list (rank order): 3, 1. Not-in-list (input order): 2, 4.
  assert.deepEqual(sorted.map(x => x.id), [3, 1, 2, 4]);
});

test('sortLoreByPersistedOrder: empty input returns empty array', async () => {
  const { sortLoreByPersistedOrder } = await loadModule();
  assert.deepEqual(sortLoreByPersistedOrder([], 42), []);
  assert.deepEqual(sortLoreByPersistedOrder(null, 42), []);
});

test('sortLoreByPersistedOrder: no persisted order returns input as-is (copied)', async () => {
  const { sortLoreByPersistedOrder } = await loadModule();
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const sorted = sortLoreByPersistedOrder(items, 42);
  assert.deepEqual(sorted, items);
  assert.notEqual(sorted, items, 'should return a new array, not the same reference');
});

test('sortLoreByPersistedOrder: skips items with null id', async () => {
  const { persistLoreOrder, sortLoreByPersistedOrder } = await loadModule();
  persistLoreOrder(42, [1, 2]);
  const items = [
    { id: 1 },
    { id: null }, // skipped
    null,         // skipped (no item)
    { id: 2 },
  ];
  const sorted = sortLoreByPersistedOrder(items, 42);
  assert.deepEqual(sorted.map(x => x.id), [1, 2]);
});

test('forgetLoreFromOrder: removes the id from the persisted order', async () => {
  const { persistLoreOrder, loadLoreOrder, forgetLoreFromOrder } = await loadModule();
  persistLoreOrder(42, [1, 2, 3, 4]);
  forgetLoreFromOrder(42, 2);
  assert.deepEqual(loadLoreOrder(42), ['1', '3', '4']);
});

test('forgetLoreFromOrder: removing the last id deletes the book entry', async () => {
  const { persistLoreOrder, forgetLoreFromOrder } = await loadModule();
  persistLoreOrder(42, [7]);
  forgetLoreFromOrder(42, 7);
  const settings = JSON.parse(localStorage.getItem('pf:settings') || '{}');
  assert.ok(
    !settings.loreOrderByBookId || !('42' in settings.loreOrderByBookId),
    'last-removal should delete the key'
  );
});

test('forgetLoreFromOrder: missing id is a no-op', async () => {
  const { persistLoreOrder, loadLoreOrder, forgetLoreFromOrder } = await loadModule();
  persistLoreOrder(42, [1, 2, 3]);
  forgetLoreFromOrder(42, 999);
  assert.deepEqual(loadLoreOrder(42), ['1', '2', '3']);
});

test('forgetLoreFromOrder: null inputs are no-ops', async () => {
  const { persistLoreOrder, loadLoreOrder, forgetLoreFromOrder } = await loadModule();
  persistLoreOrder(42, [1, 2, 3]);
  forgetLoreFromOrder(null, 1);
  forgetLoreFromOrder(42, null);
  assert.deepEqual(loadLoreOrder(42), ['1', '2', '3']);
});

test('id coercion: number and string ids treated identically for storage', async () => {
  const { persistLoreOrder, loadLoreOrder, forgetLoreFromOrder } = await loadModule();
  persistLoreOrder('42', [1, '2', 3]); // mixed input
  // Stored as all strings
  assert.deepEqual(loadLoreOrder(42), ['1', '2', '3']);
  // Forget by number against string-stored id works
  forgetLoreFromOrder('42', 2);
  assert.deepEqual(loadLoreOrder('42'), ['1', '3']);
});

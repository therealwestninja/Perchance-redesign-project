// test/stats_db.test.mjs — validates the window.db (Dexie) integration layer.
//
// The real Perchance environment provides window.db as a Dexie instance.
// These tests mock it with a minimal stand-in that exposes the same
// .toArray() shape on each table. We verify:
//   - Graceful behavior when window is missing (Node without shim)
//   - Graceful behavior when window.db is missing or not yet ready
//   - Correct fan-out read across all configured stores
//   - Per-table fault isolation (one table throwing doesn't kill the others)
//   - waitForUpstreamDb resolves once window.db.characters.toArray exists
//   - waitForUpstreamDb times out cleanly if upstream never appears

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Install a fake window on globalThis so the module-under-test's
// `typeof window !== 'undefined'` guard sees it.
const originalWindow = globalThis.window;
beforeEach(() => { globalThis.window = {}; });
afterEach(() => { globalThis.window = originalWindow; });

const { readAllStores, waitForUpstreamDb } = await import('../src/stats/db.js');

// ---- helpers ----

function fakeTable(rows) {
  return { toArray: async () => rows };
}
function throwingTable() {
  return { toArray: async () => { throw new Error('simulated IDB failure'); } };
}

// ---- readAllStores ----

test('readAllStores returns empty shape when window is undefined', async () => {
  delete globalThis.window;
  const out = await readAllStores();
  assert.deepEqual(out, {
    characters: [], threads: [], messages: [], lore: [], misc: [],
  });
});

test('readAllStores returns empty shape when window.db is not set', async () => {
  globalThis.window = {};
  const out = await readAllStores();
  assert.deepEqual(out, {
    characters: [], threads: [], messages: [], lore: [], misc: [],
  });
});

test('readAllStores reads all configured stores via Dexie .toArray()', async () => {
  globalThis.window.db = {
    characters: fakeTable([{ id: 1, name: 'Aria' }]),
    threads:    fakeTable([{ id: 10, name: 'first' }, { id: 11, name: 'second' }]),
    messages:   fakeTable([{ id: 100 }, { id: 101 }, { id: 102 }]),
    lore:       fakeTable([{ id: 'a' }]),
    misc:       fakeTable([]),
  };

  const out = await readAllStores();
  assert.equal(out.characters.length, 1);
  assert.equal(out.characters[0].name, 'Aria');
  assert.equal(out.threads.length, 2);
  assert.equal(out.messages.length, 3);
  assert.equal(out.lore.length, 1);
  assert.equal(out.misc.length, 0);
});

test('readAllStores returns [] for missing tables, not undefined', async () => {
  globalThis.window.db = {
    characters: fakeTable([{ id: 1 }]),
    // threads / messages / lore / misc absent — simulates an upstream
    // schema version that doesn't include them yet
  };

  const out = await readAllStores();
  assert.equal(out.characters.length, 1);
  assert.deepEqual(out.threads, []);
  assert.deepEqual(out.messages, []);
  assert.deepEqual(out.lore, []);
  assert.deepEqual(out.misc, []);
});

test('readAllStores isolates failures — one throwing table does not kill others', async () => {
  globalThis.window.db = {
    characters: fakeTable([{ id: 1 }]),
    threads:    throwingTable(),          // simulated error
    messages:   fakeTable([{ id: 100 }]),
    lore:       fakeTable([]),
    misc:       fakeTable([]),
  };

  const out = await readAllStores();
  assert.equal(out.characters.length, 1);
  assert.deepEqual(out.threads, []);      // failure became []
  assert.equal(out.messages.length, 1);
});

test('readAllStores normalizes non-array responses to []', async () => {
  globalThis.window.db = {
    // Shouldn't happen in the real world, but defensively coerce
    characters: { toArray: async () => null },
    threads:    { toArray: async () => 'not an array' },
    messages:   fakeTable([{ id: 1 }]),
  };

  const out = await readAllStores();
  assert.deepEqual(out.characters, []);
  assert.deepEqual(out.threads, []);
  assert.equal(out.messages.length, 1);
});

// ---- waitForUpstreamDb ----

test('waitForUpstreamDb resolves immediately when db already present', async () => {
  globalThis.window.db = {
    characters: fakeTable([]),
  };
  const start = Date.now();
  const got = await waitForUpstreamDb(1000);
  assert.ok(got);
  assert.ok(Date.now() - start < 150, 'should resolve fast when already ready');
});

test('waitForUpstreamDb waits and resolves when db becomes ready', async () => {
  // Start with no db, then set it after ~200ms
  globalThis.window = {};
  setTimeout(() => {
    globalThis.window.db = { characters: fakeTable([]) };
  }, 200);

  const start = Date.now();
  const got = await waitForUpstreamDb(2000);
  const elapsed = Date.now() - start;

  assert.ok(got, 'should have returned the db');
  assert.ok(elapsed >= 150, 'should have actually waited for db');
  assert.ok(elapsed < 1000, 'should have resolved soon after db became ready');
});

test('waitForUpstreamDb returns null on timeout', async () => {
  globalThis.window = {};       // never set window.db

  const start = Date.now();
  const got = await waitForUpstreamDb(300);    // short timeout
  const elapsed = Date.now() - start;

  assert.equal(got, null);
  assert.ok(elapsed >= 250, 'should have waited for full timeout window');
});

test('waitForUpstreamDb rejects partial readiness (db without characters table)', async () => {
  globalThis.window.db = { /* no characters table */ };
  const got = await waitForUpstreamDb(200);
  assert.equal(got, null, 'should not accept an incomplete db instance');
});

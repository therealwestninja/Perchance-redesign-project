// test/personal_bests.test.mjs
//
// Unit tests for src/profile/personal_bests.js. Validates:
//   - First observation at/above threshold records the baseline
//   - First observation below threshold is noise (no record, no improvement event)
//   - Subsequent improvements over existing records fire events
//   - Equal or lower values don't fire
//   - Persistence across calls via the mock localStorage
//   - Multiple metrics checked independently

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

const {
  checkAndUpdateBests,
  getPersonalBests,
} = await import('../src/profile/personal_bests.js');

beforeEach(() => { globalThis.localStorage.clear(); });

test('checkAndUpdateBests: first call with values below threshold records nothing', () => {
  // wordsWritten minFirstRun is 100; give 50 → shouldn't record
  const imps = checkAndUpdateBests({ wordsWritten: 50 });
  assert.deepEqual(imps, []);
  const stored = getPersonalBests();
  assert.equal(stored.wordsWritten, undefined);
});

test('checkAndUpdateBests: first call above threshold records silently (no event)', () => {
  // Values crossing minFirstRun should record but NOT fire events;
  // the first-ever observation isn't celebrated because we don't
  // have a prior record to compare against.
  const imps = checkAndUpdateBests({ wordsWritten: 500 });
  assert.deepEqual(imps, []);
  const stored = getPersonalBests();
  assert.ok(stored.wordsWritten);
  assert.equal(stored.wordsWritten.value, 500);
});

test('checkAndUpdateBests: second improvement fires event', () => {
  checkAndUpdateBests({ wordsWritten: 500 });
  const imps = checkAndUpdateBests({ wordsWritten: 1200 });
  assert.equal(imps.length, 1);
  assert.equal(imps[0].key, 'wordsWritten');
  assert.equal(imps[0].previous, 500);
  assert.equal(imps[0].current, 1200);
  const stored = getPersonalBests();
  assert.equal(stored.wordsWritten.value, 1200);
});

test('checkAndUpdateBests: equal value does not fire or change stored', () => {
  checkAndUpdateBests({ wordsWritten: 500 });
  const stored1 = getPersonalBests().wordsWritten;
  const imps = checkAndUpdateBests({ wordsWritten: 500 });
  assert.equal(imps.length, 0);
  const stored2 = getPersonalBests().wordsWritten;
  assert.equal(stored1.value, stored2.value);
  assert.equal(stored1.achievedAt, stored2.achievedAt);
});

test('checkAndUpdateBests: lower value does not fire or degrade stored', () => {
  checkAndUpdateBests({ wordsWritten: 1000 });
  const imps = checkAndUpdateBests({ wordsWritten: 500 });
  assert.equal(imps.length, 0);
  assert.equal(getPersonalBests().wordsWritten.value, 1000);
});

test('checkAndUpdateBests: counters metric works', () => {
  // memorySaves minFirstRun is 2; give 5 first, then 10
  checkAndUpdateBests({ counters: { memorySaves: 5 } });
  const imps = checkAndUpdateBests({ counters: { memorySaves: 10 } });
  assert.equal(imps.length, 1);
  assert.equal(imps[0].key, 'memorySaves');
  assert.equal(imps[0].previous, 5);
  assert.equal(imps[0].current, 10);
});

test('checkAndUpdateBests: streaks.longest metric works', () => {
  checkAndUpdateBests({ streaks: { longest: 3 } });
  const imps = checkAndUpdateBests({ streaks: { longest: 7 } });
  assert.equal(imps.length, 1);
  assert.equal(imps[0].key, 'streakLongest');
});

test('checkAndUpdateBests: multiple metrics improve simultaneously', () => {
  checkAndUpdateBests({
    wordsWritten: 500,
    counters: { memorySaves: 5 },
    streaks: { longest: 3 },
  });
  const imps = checkAndUpdateBests({
    wordsWritten: 1000,
    counters: { memorySaves: 15 },
    streaks: { longest: 10 },
  });
  // All three should fire
  const keys = imps.map(i => i.key).sort();
  assert.deepEqual(keys, ['memorySaves', 'streakLongest', 'wordsWritten']);
});

test('checkAndUpdateBests: unaffected metrics unchanged', () => {
  checkAndUpdateBests({
    wordsWritten: 500,
    counters: { memorySaves: 5 },
  });
  const imps = checkAndUpdateBests({
    wordsWritten: 1000,
    counters: { memorySaves: 5 }, // unchanged
  });
  assert.equal(imps.length, 1);
  assert.equal(imps[0].key, 'wordsWritten');
});

test('getPersonalBests: returns empty object when none recorded', () => {
  assert.deepEqual(getPersonalBests(), {});
});

test('getPersonalBests: preserves achievedAt timestamp', () => {
  const before = Date.now();
  checkAndUpdateBests({ wordsWritten: 500 });
  const rec = getPersonalBests().wordsWritten;
  assert.ok(rec.achievedAt);
  assert.ok(Date.parse(rec.achievedAt) >= before);
});

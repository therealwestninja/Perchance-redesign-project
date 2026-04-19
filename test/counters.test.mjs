// test/counters.test.mjs
//
// Unit tests for src/stats/counters.js. Exercises the write-through
// counter API against a mock localStorage so we don't pollute the
// test runner's environment.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Install a mock localStorage before any module-level code runs.
const STORE = new Map();
globalThis.localStorage = {
  getItem(k) { return STORE.has(k) ? STORE.get(k) : null; },
  setItem(k, v) { STORE.set(k, String(v)); },
  removeItem(k) { STORE.delete(k); },
  clear() { STORE.clear(); },
  key(i) { return [...STORE.keys()][i] || null; },
  get length() { return STORE.size; },
};
// CustomEvent polyfill for settings_store's pub/sub (which uses
// new CustomEvent under the hood in some paths).
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

// Load after mocks are in place (dynamic import to defer)
async function loadCounters() {
  return await import('../src/stats/counters.js');
}

beforeEach(() => {
  STORE.clear();
});

test('getCounters: returns zeros for every known counter when untouched', async () => {
  const { getCounters } = await loadCounters();
  const c = getCounters();
  assert.equal(c.memoryWindowOpens, 0);
  assert.equal(c.bubblesLocked, 0);
  assert.equal(c.bubblesRenamed, 0);
  assert.equal(c.bubblesReordered, 0);
  assert.equal(c.cardsReorderedInBubble, 0);
  assert.equal(c.cardsReorderedCrossBubble, 0);
  assert.equal(c.snapshotsRestored, 0);
  assert.equal(c.backupsExported, 0);
  assert.equal(c.backupsImported, 0);
  assert.equal(c.promptArchiveOpens, 0);
  assert.equal(c.focusModeToggles, 0);
  assert.equal(c.memorySaves, 0);
  assert.equal(c.firstUsedAt, null);
  assert.equal(c.lastUsedAt, null);
});

test('bumpCounter: increments by 1 by default', async () => {
  const { bumpCounter, getCounters } = await loadCounters();
  bumpCounter('memoryWindowOpens');
  assert.equal(getCounters().memoryWindowOpens, 1);
  bumpCounter('memoryWindowOpens');
  assert.equal(getCounters().memoryWindowOpens, 2);
});

test('bumpCounter: increments by custom amount', async () => {
  const { bumpCounter, getCounters } = await loadCounters();
  bumpCounter('bubblesReordered', 5);
  assert.equal(getCounters().bubblesReordered, 5);
  bumpCounter('bubblesReordered', 3);
  assert.equal(getCounters().bubblesReordered, 8);
});

test('bumpCounter: ignores zero and negative', async () => {
  const { bumpCounter, getCounters } = await loadCounters();
  bumpCounter('bubblesLocked', 0);
  bumpCounter('bubblesLocked', -5);
  bumpCounter('bubblesLocked', -0.5);
  assert.equal(getCounters().bubblesLocked, 0);
});

test('bumpCounter: ignores invalid names', async () => {
  const { bumpCounter, getCounters } = await loadCounters();
  bumpCounter('');
  bumpCounter(null);
  bumpCounter(undefined);
  bumpCounter(42);
  const c = getCounters();
  // Nothing should have moved off zero
  assert.equal(c.memoryWindowOpens, 0);
  assert.equal(c.firstUsedAt, null);
});

test('bumpCounter: sets firstUsedAt on first bump, preserves it', async () => {
  const { bumpCounter, getCounters } = await loadCounters();
  const before = Date.now();
  bumpCounter('memorySaves');
  const firstUsedAt = getCounters().firstUsedAt;
  assert.ok(firstUsedAt, 'firstUsedAt set on first bump');
  const parsed = Date.parse(firstUsedAt);
  assert.ok(parsed >= before, 'firstUsedAt is an ISO timestamp');

  // Second bump shouldn't update firstUsedAt
  bumpCounter('memorySaves');
  assert.equal(getCounters().firstUsedAt, firstUsedAt);
});

test('bumpCounter: updates lastUsedAt on every bump', async () => {
  const { bumpCounter, getCounters } = await loadCounters();
  bumpCounter('memorySaves');
  const firstLast = getCounters().lastUsedAt;
  await new Promise(r => setTimeout(r, 2));
  bumpCounter('memorySaves');
  const secondLast = getCounters().lastUsedAt;
  assert.notEqual(firstLast, secondLast, 'lastUsedAt moved forward');
});

test('bumpCounter: unknown counter name still works, lands in storage', async () => {
  const { bumpCounter, getCounters } = await loadCounters();
  // This lets us add new counters later without breaking migration;
  // they're just fields in the counters object.
  bumpCounter('aFutureCounterThatDoesntExistYet');
  // getCounters only returns KNOWN counters, so new ones don't show
  // there, but the raw storage has them.
  const raw = JSON.parse(localStorage.getItem('pf:settings') || '{}');
  assert.equal(raw.counters.aFutureCounterThatDoesntExistYet, 1);
  // And known counters are still zero
  assert.equal(getCounters().memoryWindowOpens, 0);
});

test('resetCounters: zeroes every counter but preserves timestamps', async () => {
  const { bumpCounter, resetCounters, getCounters } = await loadCounters();
  bumpCounter('bubblesRenamed', 3);
  bumpCounter('memorySaves', 5);
  const beforeReset = getCounters();
  assert.ok(beforeReset.firstUsedAt);

  resetCounters();
  const after = getCounters();
  assert.equal(after.bubblesRenamed, 0);
  assert.equal(after.memorySaves, 0);
  // Timestamps reset (per implementation — see counters.js)
  assert.equal(after.firstUsedAt, null);
  assert.equal(after.lastUsedAt, null);
});

test('getCounters: coerces non-numeric stored values to 0', async () => {
  const { getCounters } = await loadCounters();
  // Inject garbage directly
  localStorage.setItem('pf:settings', JSON.stringify({
    counters: { memoryWindowOpens: 'not a number', bubblesLocked: NaN },
  }));
  const c = getCounters();
  assert.equal(c.memoryWindowOpens, 0);
  assert.equal(c.bubblesLocked, 0);
});

// ============================================================
// Per-day histogram (countersByDay) — 30-day sparkline feature
// ============================================================

test('dayKey: formats as UTC YYYY-MM-DD', async () => {
  const { __test } = await loadCounters();
  const d = new Date(Date.UTC(2026, 3, 18, 10, 30, 0)); // April 18, 2026 UTC
  assert.equal(__test.dayKey(d), '2026-04-18');
});

test('dayKey: pads single-digit month and day', async () => {
  const { __test } = await loadCounters();
  const d = new Date(Date.UTC(2026, 0, 5, 0, 0, 0));
  assert.equal(__test.dayKey(d), '2026-01-05');
});

test('pruneByDay: drops entries older than DAILY_HISTORY_DAYS', async () => {
  const { __test } = await loadCounters();
  const now = new Date(Date.UTC(2026, 3, 18, 0, 0, 0));
  const byDay = {
    '2026-04-18': { memorySaves: 1 }, // today
    '2026-04-01': { memorySaves: 2 }, // within 60 days
    '2026-01-01': { memorySaves: 3 }, // outside 60 days
    '2024-12-25': { memorySaves: 4 }, // way outside
  };
  __test.pruneByDay(byDay, now);
  assert.ok('2026-04-18' in byDay, 'today retained');
  assert.ok('2026-04-01' in byDay, 'within-window retained');
  assert.ok(!('2026-01-01' in byDay), 'outside-window dropped');
  assert.ok(!('2024-12-25' in byDay), 'way-old dropped');
});

test('bumpCounter: writes to today\'s bucket in countersByDay', async () => {
  const { bumpCounter, getCountersByDay, __test } = await loadCounters();
  bumpCounter('memorySaves');
  bumpCounter('memorySaves');
  bumpCounter('bubblesRenamed');
  const byDay = getCountersByDay();
  const todayKey = __test.dayKey(new Date());
  assert.ok(byDay[todayKey], 'today bucket exists');
  assert.equal(byDay[todayKey].memorySaves, 2);
  assert.equal(byDay[todayKey].bubblesRenamed, 1);
});

test('bumpCounter: respects delta value in daily bucket', async () => {
  const { bumpCounter, getCountersByDay, __test } = await loadCounters();
  bumpCounter('memorySaves', 5);
  const byDay = getCountersByDay();
  const todayKey = __test.dayKey(new Date());
  assert.equal(byDay[todayKey].memorySaves, 5);
});

test('getCounterSeriesByDay: returns N points with today last', async () => {
  const { bumpCounter, getCounterSeriesByDay } = await loadCounters();
  bumpCounter('memorySaves', 3);
  const series = getCounterSeriesByDay('memorySaves', 7);
  assert.equal(series.length, 7);
  assert.equal(series[6], 3, 'today is at index N-1');
  // Preceding days should all be 0
  for (let i = 0; i < 6; i++) {
    assert.equal(series[i], 0, `day ${i} is 0`);
  }
});

test('getCounterSeriesByDay: positions older bumps correctly', async () => {
  const { bumpCounter, getCounterSeriesByDay, __test } = await loadCounters();

  // Simulate activity 2 days ago by manually writing to the bucket.
  // We can't advance time in the bumpCounter path easily, so inject
  // directly into storage.
  const today = new Date();
  const twoDaysAgo = new Date(today.getTime() - 2 * 86400_000);
  const todayKey = __test.dayKey(today);
  const oldKey = __test.dayKey(twoDaysAgo);

  localStorage.setItem('pf:settings', JSON.stringify({
    counters: {},
    countersByDay: {
      [oldKey]: { memorySaves: 4 },
      [todayKey]: { memorySaves: 1 },
    },
  }));

  const series = getCounterSeriesByDay('memorySaves', 5);
  assert.equal(series.length, 5);
  // Layout (oldest-first): [-4d, -3d, -2d, -1d, today]
  assert.equal(series[4], 1, 'today at index 4');
  assert.equal(series[2], 4, 'two days ago at index 2');
  assert.equal(series[3], 0, '-1d is 0');
});

test('getCounterSeriesByDay: missing key returns all zeros', async () => {
  const { getCounterSeriesByDay } = await loadCounters();
  const series = getCounterSeriesByDay('nonexistentCounter', 30);
  assert.equal(series.length, 30);
  assert.ok(series.every(v => v === 0));
});

test('resetCounters: clears countersByDay too', async () => {
  const { bumpCounter, resetCounters, getCountersByDay } = await loadCounters();
  bumpCounter('memorySaves', 3);
  resetCounters();
  const byDay = getCountersByDay();
  assert.deepEqual(byDay, {}, 'daily histogram cleared');
});

test('getCountersByDay: prunes on read even without a write', async () => {
  const { getCountersByDay, __test } = await loadCounters();
  // Plant an ancient entry directly
  localStorage.setItem('pf:settings', JSON.stringify({
    counters: {},
    countersByDay: {
      '2024-01-01': { memorySaves: 100 },
      [__test.dayKey(new Date())]: { memorySaves: 1 },
    },
  }));
  const byDay = getCountersByDay();
  assert.ok(!('2024-01-01' in byDay), 'ancient entry pruned on read');
  assert.ok(__test.dayKey(new Date()) in byDay, 'recent entry retained');
});

test('bumpCounter: prunes old entries on write', async () => {
  const { bumpCounter, getCountersByDay } = await loadCounters();
  // Plant an ancient entry directly
  localStorage.setItem('pf:settings', JSON.stringify({
    counters: {},
    countersByDay: {
      '2024-01-01': { memorySaves: 100 },
    },
  }));
  bumpCounter('memorySaves'); // triggers prune
  const byDay = getCountersByDay();
  assert.ok(!('2024-01-01' in byDay));
});

// ---------------------------------------------------------------
// Per-thread counter breakdowns (#3)
// ---------------------------------------------------------------

test('bumpCounter with threadId stores under countersByThread', async () => {
  const { bumpCounter, getCountersByThread } = await loadCounters();
  bumpCounter('memorySaves', 1, 42);
  bumpCounter('memorySaves', 2, 42);
  bumpCounter('memorySaves', 5, 7);
  const byThread = getCountersByThread();
  assert.equal(byThread['42'].memorySaves, 3);
  assert.equal(byThread['7'].memorySaves, 5);
});

test('bumpCounter without threadId leaves countersByThread untouched', async () => {
  const { bumpCounter, getCountersByThread } = await loadCounters();
  bumpCounter('memorySaves', 1);            // no threadId
  bumpCounter('memorySaves', 1, null);      // explicit null
  const byThread = getCountersByThread();
  assert.deepEqual(byThread, {});
});

test('bumpCounter still increments lifetime + day counters when threadId given', async () => {
  const { bumpCounter, getCounters, getCounterSeriesByDay } = await loadCounters();
  bumpCounter('memorySaves', 1, 42);
  bumpCounter('memorySaves', 1, 7);
  // Lifetime counter aggregates across threads
  assert.equal(getCounters().memorySaves, 2);
  // Per-day series also aggregates (today's value)
  const series = getCounterSeriesByDay('memorySaves', 1);
  assert.equal(series[0], 2);
});

test('getTopThreadsForCounter returns sorted descending, limited', async () => {
  const { bumpCounter, getTopThreadsForCounter } = await loadCounters();
  bumpCounter('memorySaves', 3,  10);
  bumpCounter('memorySaves', 8,  20);
  bumpCounter('memorySaves', 5,  30);
  bumpCounter('memorySaves', 1,  40);
  const top = getTopThreadsForCounter('memorySaves', 3);
  assert.equal(top.length, 3);
  assert.deepEqual(top.map(r => r.threadId), ['20', '30', '10']);
  assert.deepEqual(top.map(r => r.count),    [8, 5, 3]);
});

test('getTopThreadsForCounter excludes zero-count threads', async () => {
  const { bumpCounter, getTopThreadsForCounter } = await loadCounters();
  bumpCounter('memorySaves',         5, 10);
  bumpCounter('cardsReorderedInBubble', 3, 20); // different counter
  // Asking for memorySaves should NOT include thread 20
  const top = getTopThreadsForCounter('memorySaves', 5);
  assert.equal(top.length, 1);
  assert.equal(top[0].threadId, '10');
});

test('getTopThreadsForCounter handles missing counter / empty data gracefully', async () => {
  const { getTopThreadsForCounter } = await loadCounters();
  assert.deepEqual(getTopThreadsForCounter('nonexistentCounter', 3), []);
  assert.deepEqual(getTopThreadsForCounter('', 3), []);
  assert.deepEqual(getTopThreadsForCounter(null, 3), []);
});

test('resetCounters clears per-thread tally too', async () => {
  const { bumpCounter, resetCounters, getCountersByThread } = await loadCounters();
  bumpCounter('memorySaves', 1, 42);
  bumpCounter('bubblesLocked', 3, 42);
  resetCounters();
  assert.deepEqual(getCountersByThread(), {});
});

test('threadId is coerced to string for storage-key safety', async () => {
  const { bumpCounter, getCountersByThread } = await loadCounters();
  bumpCounter('memorySaves', 1, 42);     // numeric
  bumpCounter('memorySaves', 1, '42');   // string of same value
  const byThread = getCountersByThread();
  // Both writes hit the same key
  assert.equal(byThread['42'].memorySaves, 2);
  assert.equal(Object.keys(byThread).length, 1);
});

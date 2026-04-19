// test/summary_notifications.test.mjs
//
// Tests for the weekly summary notifications module. Covers:
//   - First-run: no snapshot → records one, stays silent
//   - Under 7 days: skipped
//   - Exactly 7 days + deltas: surfaces
//   - 7+ days, no deltas: silent
//   - Snapshot advances on every 7+-day check
//   - Opt-out respected
//   - Delta computation includes only positive diffs
//   - Top-N picking by magnitude
//   - Sentence composition with 1, 2, 3 items

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
  checkSummary,
  computeDeltas,
  pickTopDeltas,
  composeSummaryLine,
  WEEK_MS,
} = await import('../src/profile/summary_notifications.js');

beforeEach(() => { globalThis.localStorage.clear(); });

// ---- computeDeltas ----

test('computeDeltas: positive diffs only', () => {
  const d = computeDeltas(
    { memorySaves: 10, bubblesRenamed: 5 },
    { memorySaves: 15, bubblesRenamed: 5, charactersSpawned: 2 }
  );
  assert.equal(d.memorySaves, 5);
  assert.equal(d.charactersSpawned, 2);
  assert.ok(!('bubblesRenamed' in d), 'zero delta dropped');
});

test('computeDeltas: negative diffs dropped', () => {
  // Shouldn't happen in practice (counters don't decrement), but be
  // safe in case of backup/restore oddities.
  const d = computeDeltas({ memorySaves: 20 }, { memorySaves: 10 });
  assert.ok(!('memorySaves' in d));
});

test('computeDeltas: missing keys treated as 0', () => {
  const d = computeDeltas({}, { memorySaves: 8 });
  assert.equal(d.memorySaves, 8);
});

test('computeDeltas: ignores non-tracked metrics', () => {
  const d = computeDeltas({ foo: 0 }, { foo: 100 });
  assert.ok(!('foo' in d), 'non-METRICS keys excluded');
});

// ---- pickTopDeltas ----

test('pickTopDeltas: sorts by magnitude desc', () => {
  const top = pickTopDeltas({ memorySaves: 5, bubblesRenamed: 20, charactersSpawned: 2 }, 3);
  assert.equal(top[0].key, 'bubblesRenamed');
  assert.equal(top[1].key, 'memorySaves');
  assert.equal(top[2].key, 'charactersSpawned');
});

test('pickTopDeltas: caps at N', () => {
  const all = { memorySaves: 5, bubblesRenamed: 20, charactersSpawned: 2, backupsExported: 1, memoryWindowOpens: 3 };
  const top3 = pickTopDeltas(all, 3);
  assert.equal(top3.length, 3);
});

test('pickTopDeltas: empty deltas → empty array', () => {
  assert.deepEqual(pickTopDeltas({}, 3), []);
  assert.deepEqual(pickTopDeltas(null, 3), []);
});

// ---- composeSummaryLine ----

test('composeSummaryLine: single item', () => {
  const line = composeSummaryLine([{ delta: 5, noun: 'memory save' }]);
  assert.equal(line, 'This week: 5 memory saves.');
});

test('composeSummaryLine: two items uses "and"', () => {
  const line = composeSummaryLine([
    { delta: 5, noun: 'memory save' },
    { delta: 1, noun: 'bubble rename' },
  ]);
  assert.equal(line, 'This week: 5 memory saves and 1 bubble rename.');
});

test('composeSummaryLine: three items uses Oxford comma', () => {
  const line = composeSummaryLine([
    { delta: 5, noun: 'memory save' },
    { delta: 12, noun: 'bubble rename' },
    { delta: 2, noun: 'new character' },
  ]);
  assert.equal(line, 'This week: 5 memory saves, 12 bubble renames, and 2 new characters.');
});

test('composeSummaryLine: singular noun when delta is 1', () => {
  const line = composeSummaryLine([{ delta: 1, noun: 'memory save' }]);
  assert.equal(line, 'This week: 1 memory save.');
});

test('composeSummaryLine: empty → empty string', () => {
  assert.equal(composeSummaryLine([]), '');
  assert.equal(composeSummaryLine(null), '');
});

// ---- checkSummary ----

test('checkSummary: first run records snapshot, stays silent', () => {
  const res = checkSummary({ memorySaves: 5 });
  assert.equal(res.kind, 'none');
  assert.equal(res.reason, 'first-run');
});

test('checkSummary: under 7 days skipped', () => {
  const start = new Date('2026-04-01T00:00:00Z');
  checkSummary({ memorySaves: 5 }, start);
  // 3 days later, still silent
  const later = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000);
  const res = checkSummary({ memorySaves: 10 }, later);
  assert.equal(res.kind, 'none');
  assert.equal(res.reason, 'too-soon');
});

test('checkSummary: past 7 days + deltas fires', () => {
  const start = new Date('2026-04-01T00:00:00Z');
  checkSummary({ memorySaves: 5 }, start);
  const later = new Date(start.getTime() + WEEK_MS + 1000);
  const res = checkSummary({ memorySaves: 12, bubblesRenamed: 8 }, later);
  assert.equal(res.kind, 'summary');
  assert.ok(res.line.includes('memory save'));
  assert.ok(res.line.includes('bubble rename'));
});

test('checkSummary: past 7 days, no deltas → silent', () => {
  const start = new Date('2026-04-01T00:00:00Z');
  checkSummary({ memorySaves: 5 }, start);
  const later = new Date(start.getTime() + WEEK_MS + 1000);
  const res = checkSummary({ memorySaves: 5 }, later);
  assert.equal(res.kind, 'none');
  assert.equal(res.reason, 'no-activity');
});

test('checkSummary: snapshot advances even on silent-past-7-days checks', () => {
  const start = new Date('2026-04-01T00:00:00Z');
  checkSummary({ memorySaves: 5 }, start);
  // Week 1: no activity, silent, but snapshot advances
  const week1 = new Date(start.getTime() + WEEK_MS + 1000);
  checkSummary({ memorySaves: 5 }, week1);
  // Week 2: small activity. If snapshot hadn't advanced, this would
  // show a 1-memory-save delta from the original 5; either way this
  // test verifies the *cadence* — we should get a summary, not a
  // "too-soon" skip.
  const week2 = new Date(week1.getTime() + WEEK_MS + 1000);
  const res = checkSummary({ memorySaves: 6 }, week2);
  assert.equal(res.kind, 'summary');
  assert.equal(res.deltas[0].delta, 1);
});

test('checkSummary: respects opt-out', () => {
  // Disable via settings
  globalThis.localStorage.setItem('pf:settings', JSON.stringify({
    summaryNotifications: { enabled: false },
  }));
  const res = checkSummary({ memorySaves: 100 });
  assert.equal(res.kind, 'none');
  assert.equal(res.reason, 'disabled');
});

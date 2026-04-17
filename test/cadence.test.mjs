// test/cadence.test.mjs
//
// Covers the day-based scheduler helpers (getCurrentDayKey, getDayPrompt)
// and the parallel day-based pulse-pending tracking (hasNewDayPending,
// markDaySeen) that supports daily cadence.

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

const { getCurrentDayKey, getDayPrompt } = await import('../src/prompts/scheduler.js');
const {
  hasNewDayPending,
  markDaySeen,
  initPromptsOnFirstRun,
} = await import('../src/prompts/completion.js');
const { loadSettings, updateField } = await import('../src/profile/settings_store.js');

beforeEach(() => { globalThis.localStorage.clear(); });

// ---- getCurrentDayKey ----

test('getCurrentDayKey: returns YYYY-MM-DD for a given date', () => {
  const d = new Date(Date.UTC(2026, 3, 17)); // April 17, 2026
  assert.equal(getCurrentDayKey(d), '2026-04-17');
});

test('getCurrentDayKey: pads single-digit months and days', () => {
  const d = new Date(Date.UTC(2026, 0, 5)); // January 5
  assert.equal(getCurrentDayKey(d), '2026-01-05');
});

test('getCurrentDayKey: uses UTC (consistent across timezones)', () => {
  // Two Date objects representing the same UTC instant
  const d1 = new Date('2026-04-17T23:59:59Z');
  const d2 = new Date('2026-04-17T00:00:01Z');
  assert.equal(getCurrentDayKey(d1), '2026-04-17');
  assert.equal(getCurrentDayKey(d2), '2026-04-17');
});

// ---- getDayPrompt ----

test('getDayPrompt: returns one prompt with id and text', () => {
  const p = getDayPrompt('2026-04-17');
  assert.ok(p);
  assert.equal(typeof p.id, 'string');
  assert.equal(typeof p.text, 'string');
});

test('getDayPrompt: same day key always returns the same prompt', () => {
  const a = getDayPrompt('2026-04-17');
  const b = getDayPrompt('2026-04-17');
  assert.equal(a.id, b.id);
  assert.equal(a.text, b.text);
});

test('getDayPrompt: different day keys usually return different prompts', () => {
  // Can't hard-assert difference (seeded shuffle could collide on small pools),
  // but with 40 prompts and a good hash the rate of 2-in-a-row collisions is low.
  // Sample a week — at least one pair should differ.
  const prompts = [
    getDayPrompt('2026-04-13'),
    getDayPrompt('2026-04-14'),
    getDayPrompt('2026-04-15'),
    getDayPrompt('2026-04-16'),
    getDayPrompt('2026-04-17'),
    getDayPrompt('2026-04-18'),
    getDayPrompt('2026-04-19'),
  ];
  const uniqueIds = new Set(prompts.map(p => p.id));
  assert.ok(uniqueIds.size >= 3,
    'a full week of prompts should yield at least 3 distinct ids');
});

test('getDayPrompt: with empty pool returns null', () => {
  const p = getDayPrompt('2026-04-17', { pool: [] });
  assert.equal(p, null);
});

test('getDayPrompt: with custom pool selects from that pool', () => {
  const pool = [{ id: 'c-1', text: 'Custom 1' }, { id: 'c-2', text: 'Custom 2' }];
  const p = getDayPrompt('2026-04-17', { pool });
  assert.ok(['c-1', 'c-2'].includes(p.id));
});

// ---- hasNewDayPending / markDaySeen ----

test('hasNewDayPending: true on first ever call (nothing seen yet)', () => {
  assert.equal(hasNewDayPending('2026-04-17'), true);
});

test('hasNewDayPending: false immediately after markDaySeen for same day', () => {
  markDaySeen('2026-04-17');
  assert.equal(hasNewDayPending('2026-04-17'), false);
});

test('hasNewDayPending: true again when the day has rolled over', () => {
  markDaySeen('2026-04-17');
  assert.equal(hasNewDayPending('2026-04-18'), true);
});

test('markDaySeen: ignores non-string input', () => {
  markDaySeen('2026-04-17');
  markDaySeen(null);      // should not clobber
  markDaySeen(42);
  markDaySeen(undefined);
  // Still marked from the valid call above
  assert.equal(hasNewDayPending('2026-04-17'), false);
});

test('markDaySeen: persists via settings store', () => {
  markDaySeen('2026-04-17');
  const s = loadSettings();
  assert.equal(s.prompts.lastSeenDay, '2026-04-17');
});

// ---- initPromptsOnFirstRun covers both week and day ----

test('initPromptsOnFirstRun: initializes lastSeenDay alongside lastSeenWeek', () => {
  const didInit = initPromptsOnFirstRun();
  assert.equal(didInit, true);

  const s = loadSettings();
  assert.ok(s.prompts.lastSeenDay,
    'lastSeenDay should be populated so first-run users do not pulse');
  assert.ok(s.prompts.lastSeenWeek,
    'lastSeenWeek should be populated — unchanged behavior');
  assert.equal(s.prompts.hasInitialized, true);
});

test('initPromptsOnFirstRun: second call is a no-op', () => {
  initPromptsOnFirstRun();
  const first = loadSettings().prompts.lastSeenDay;
  // Manually change lastSeenDay; initPromptsOnFirstRun should not clobber it
  updateField('prompts.lastSeenDay', '1999-12-31');
  const didInit = initPromptsOnFirstRun();
  assert.equal(didInit, false);
  assert.equal(loadSettings().prompts.lastSeenDay, '1999-12-31');
  assert.notEqual(first, '1999-12-31'); // sanity: first value was actually today
});

test('initPromptsOnFirstRun: preserves existing completedByWeek', () => {
  updateField('prompts.completedByWeek', { '2026-W05': ['p-mentor'] });
  initPromptsOnFirstRun();
  const s = loadSettings();
  assert.deepEqual(s.prompts.completedByWeek['2026-W05'], ['p-mentor']);
});

// ---- cadence default ----

test('loadSettings: cadence defaults to "weekly"', () => {
  const s = loadSettings();
  assert.equal(s.prompts.cadence, 'weekly');
});

test('cadence persists across reads', () => {
  updateField('prompts.cadence', 'daily');
  const s = loadSettings();
  assert.equal(s.prompts.cadence, 'daily');
});

// ---- end-to-end: cadence toggle → pulse behavior ----

test('end-to-end: user on daily cadence, day rolls over → pulse pending', () => {
  updateField('prompts.cadence', 'daily');
  markDaySeen('2026-04-17');  // user opened profile yesterday

  // Next day arrives — pulse should fire
  assert.equal(hasNewDayPending('2026-04-18'), true);

  // User opens profile on the new day
  markDaySeen('2026-04-18');
  assert.equal(hasNewDayPending('2026-04-18'), false);
});

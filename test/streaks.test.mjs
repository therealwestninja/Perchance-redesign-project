// test/streaks.test.mjs
//
// Tests for stats/streaks.js. Drives the clock via injected `now`
// arguments to exercise the same-day / consecutive / gap branches
// deterministically.

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
  recordActivityForStreak,
  getStreaks,
  streakStatus,
  isConsecutiveDay,
} = await import('../src/stats/streaks.js');

beforeEach(() => { globalThis.localStorage.clear(); });

// ---- isConsecutiveDay helper ----

test('isConsecutiveDay: true for exact next day', () => {
  assert.equal(isConsecutiveDay('2026-04-17', '2026-04-18'), true);
});

test('isConsecutiveDay: false for same day', () => {
  assert.equal(isConsecutiveDay('2026-04-18', '2026-04-18'), false);
});

test('isConsecutiveDay: false for 2+ day gap', () => {
  assert.equal(isConsecutiveDay('2026-04-15', '2026-04-18'), false);
});

test('isConsecutiveDay: handles month boundary', () => {
  assert.equal(isConsecutiveDay('2026-04-30', '2026-05-01'), true);
});

test('isConsecutiveDay: handles year boundary', () => {
  assert.equal(isConsecutiveDay('2025-12-31', '2026-01-01'), true);
});

test('isConsecutiveDay: false for non-string input', () => {
  assert.equal(isConsecutiveDay(null, '2026-04-18'), false);
  assert.equal(isConsecutiveDay('2026-04-18', null), false);
  assert.equal(isConsecutiveDay(123, 456), false);
});

// ---- recordActivityForStreak ----

test('recordActivityForStreak: first activity starts streak at 1', () => {
  const day1 = new Date('2026-04-18T10:00:00Z');
  const result = recordActivityForStreak(day1);
  assert.equal(result.current, 1);
  assert.equal(result.longest, 1);
  assert.equal(result.lastActiveDay, '2026-04-18');
});

test('recordActivityForStreak: same-day call is idempotent', () => {
  const day1 = new Date('2026-04-18T10:00:00Z');
  recordActivityForStreak(day1);
  const second = recordActivityForStreak(new Date('2026-04-18T23:59:00Z'));
  assert.equal(second.current, 1, 'streak not inflated by second same-day call');
  assert.equal(second.longest, 1);
});

test('recordActivityForStreak: consecutive day advances streak', () => {
  recordActivityForStreak(new Date('2026-04-18T10:00:00Z'));
  const next = recordActivityForStreak(new Date('2026-04-19T10:00:00Z'));
  assert.equal(next.current, 2);
  assert.equal(next.longest, 2);
  assert.equal(next.lastActiveDay, '2026-04-19');
});

test('recordActivityForStreak: gap of 2+ days resets to 1', () => {
  recordActivityForStreak(new Date('2026-04-18T10:00:00Z'));
  recordActivityForStreak(new Date('2026-04-19T10:00:00Z'));
  recordActivityForStreak(new Date('2026-04-20T10:00:00Z'));
  const afterGap = recordActivityForStreak(new Date('2026-04-25T10:00:00Z'));
  assert.equal(afterGap.current, 1, 'current resets to 1');
  assert.equal(afterGap.longest, 3, 'longest preserved (was 3)');
  assert.equal(afterGap.lastActiveDay, '2026-04-25');
});

test('recordActivityForStreak: longest grows past previous best', () => {
  // Build a 5-day streak
  for (let d = 18; d <= 22; d++) {
    recordActivityForStreak(new Date(`2026-04-${String(d).padStart(2, '0')}T10:00:00Z`));
  }
  // Break it
  recordActivityForStreak(new Date('2026-04-25T10:00:00Z'));
  // Build a 6-day streak
  for (let d = 26; d <= 30; d++) {
    recordActivityForStreak(new Date(`2026-04-${String(d).padStart(2, '0')}T10:00:00Z`));
  }
  const final = recordActivityForStreak(new Date('2026-05-01T10:00:00Z'));
  assert.equal(final.current, 7);
  assert.equal(final.longest, 7);
});

test('recordActivityForStreak: UTC boundary consistency', () => {
  // Two activities separated by local midnight but SAME UTC day
  // should count as same day (no streak advance).
  const firstUtc = new Date('2026-04-18T22:00:00Z');
  const secondUtc = new Date('2026-04-18T23:30:00Z');
  recordActivityForStreak(firstUtc);
  const second = recordActivityForStreak(secondUtc);
  assert.equal(second.current, 1, 'same UTC day is idempotent regardless of local time');
});

// ---- getStreaks ----

test('getStreaks: returns zeros when untouched', () => {
  const s = getStreaks();
  assert.equal(s.current, 0);
  assert.equal(s.longest, 0);
  assert.equal(s.lastActiveDay, null);
});

test('getStreaks: reads persisted state', () => {
  recordActivityForStreak(new Date('2026-04-18T10:00:00Z'));
  recordActivityForStreak(new Date('2026-04-19T10:00:00Z'));
  const s = getStreaks();
  assert.equal(s.current, 2);
  assert.equal(s.longest, 2);
  assert.equal(s.lastActiveDay, '2026-04-19');
});

// ---- streakStatus ----

test('streakStatus: broken when no activity yet', () => {
  assert.equal(streakStatus(new Date('2026-04-18T10:00:00Z')), 'broken');
});

test('streakStatus: active when lastActiveDay is today', () => {
  recordActivityForStreak(new Date('2026-04-18T10:00:00Z'));
  assert.equal(streakStatus(new Date('2026-04-18T20:00:00Z')), 'active');
});

test('streakStatus: at-risk when lastActiveDay is yesterday', () => {
  recordActivityForStreak(new Date('2026-04-17T10:00:00Z'));
  assert.equal(streakStatus(new Date('2026-04-18T15:00:00Z')), 'at-risk');
});

test('streakStatus: broken when gap > 1 day', () => {
  recordActivityForStreak(new Date('2026-04-15T10:00:00Z'));
  assert.equal(streakStatus(new Date('2026-04-18T15:00:00Z')), 'broken');
});

// ---- streak-based achievements ----

test('achievements: streak_3day unlocks at current=3', async () => {
  const { computeUnlockedIds } = await import('../src/achievements/unlocks.js');
  const unlocked = computeUnlockedIds({ streaks: { current: 3, longest: 3 } });
  assert.ok(unlocked.includes('streak_3day'));
  assert.ok(!unlocked.includes('streak_7day'));
});

test('achievements: streak survives break (via longest)', async () => {
  const { computeUnlockedIds } = await import('../src/achievements/unlocks.js');
  // User hit 30-day peak, then broke it back to 1
  const unlocked = computeUnlockedIds({ streaks: { current: 1, longest: 30 } });
  assert.ok(unlocked.includes('streak_3day'));
  assert.ok(unlocked.includes('streak_7day'));
  assert.ok(unlocked.includes('streak_14day'));
  assert.ok(unlocked.includes('streak_30day'));
  assert.ok(!unlocked.includes('streak_100day'));
});

test('achievements: streak_100day for centurions', async () => {
  const { computeUnlockedIds } = await import('../src/achievements/unlocks.js');
  const unlocked = computeUnlockedIds({ streaks: { current: 100, longest: 100 } });
  assert.ok(unlocked.includes('streak_100day'));
});

test('achievements: no streak data means no streak achievements', async () => {
  const { computeUnlockedIds } = await import('../src/achievements/unlocks.js');
  const unlocked = computeUnlockedIds({ wordsWritten: 5000 });
  assert.ok(!unlocked.some(id => id.startsWith('streak_')));
});

// test/prompts_completion.test.mjs

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
  getCompletedIds,
  setCompleted,
  hasNewWeekPending,
  markWeekSeen,
  initPromptsOnFirstRun,
} = await import('../src/prompts/completion.js');

const { getCurrentWeekKey } = await import('../src/prompts/scheduler.js');

beforeEach(() => { globalThis.localStorage.clear(); });

// ---------- completion get/set ----------

test('getCompletedIds returns empty Set when nothing stored', () => {
  const set = getCompletedIds('2026-W16');
  assert.ok(set instanceof Set);
  assert.equal(set.size, 0);
});

test('setCompleted adds, getCompletedIds reflects it', () => {
  setCompleted('2026-W16', 'p-quiet-moment', true);
  const set = getCompletedIds('2026-W16');
  assert.ok(set.has('p-quiet-moment'));
});

test('setCompleted with completed=false removes the ID', () => {
  setCompleted('2026-W16', 'p-quiet-moment', true);
  setCompleted('2026-W16', 'p-quiet-moment', false);
  const set = getCompletedIds('2026-W16');
  assert.equal(set.has('p-quiet-moment'), false);
});

test('setCompleted is idempotent when already in desired state', () => {
  setCompleted('2026-W16', 'p-a', true);
  setCompleted('2026-W16', 'p-a', true); // noop
  assert.equal(getCompletedIds('2026-W16').size, 1);

  setCompleted('2026-W16', 'p-a', false);
  setCompleted('2026-W16', 'p-a', false); // noop
  assert.equal(getCompletedIds('2026-W16').size, 0);
});

test('setCompleted isolates weeks — W16 done does not show as done in W17', () => {
  setCompleted('2026-W16', 'p-quiet-moment', true);
  assert.ok(getCompletedIds('2026-W16').has('p-quiet-moment'));
  assert.equal(getCompletedIds('2026-W17').has('p-quiet-moment'), false);
});

test('setCompleted: multiple IDs in same week', () => {
  setCompleted('2026-W16', 'p-a', true);
  setCompleted('2026-W16', 'p-b', true);
  setCompleted('2026-W16', 'p-c', true);
  const set = getCompletedIds('2026-W16');
  assert.equal(set.size, 3);
});

test('setCompleted ignores non-string args defensively', () => {
  setCompleted(null, 'p-a', true);
  setCompleted('2026-W16', null, true);
  setCompleted(123, 'p-a', true);
  assert.equal(getCompletedIds('2026-W16').size, 0);
});

// ---------- hasNewWeekPending / markWeekSeen ----------

test('hasNewWeekPending: true before initialization', () => {
  assert.equal(hasNewWeekPending('2026-W16'), true);
});

test('markWeekSeen sets the acknowledgment', () => {
  markWeekSeen('2026-W16');
  assert.equal(hasNewWeekPending('2026-W16'), false);
});

test('hasNewWeekPending detects week rollover', () => {
  markWeekSeen('2026-W16');
  // Next week, same user returns
  assert.equal(hasNewWeekPending('2026-W17'), true);
});

test('markWeekSeen ignores non-string', () => {
  markWeekSeen('2026-W16');
  markWeekSeen(null);   // should not clobber
  markWeekSeen(42);
  assert.equal(hasNewWeekPending('2026-W16'), false,
    'non-string arg should not reset state');
});

// ---------- initPromptsOnFirstRun ----------

test('initPromptsOnFirstRun: first call marks current week seen (no pulse for new users)', () => {
  const did = initPromptsOnFirstRun();
  assert.equal(did, true);
  // hasNewWeekPending for current week should be false after init
  assert.equal(hasNewWeekPending(getCurrentWeekKey()), false);
});

test('initPromptsOnFirstRun: second call is a no-op', () => {
  initPromptsOnFirstRun();
  const did = initPromptsOnFirstRun();
  assert.equal(did, false);
});

test('initPromptsOnFirstRun: preserves any existing completedByWeek', () => {
  // Arrange: pretend user completed something before init ever ran
  // (would only happen through a weird upgrade path — defensive check)
  setCompleted('2026-W10', 'p-a', true);
  initPromptsOnFirstRun();
  assert.ok(getCompletedIds('2026-W10').has('p-a'),
    'completion data should survive first-run init');
});

// ---------- end-to-end flow ----------

test('full flow: user first load → next week → open profile → acknowledged', () => {
  // Day 1: first ever load with the feature
  initPromptsOnFirstRun();
  const thisWeek = getCurrentWeekKey();
  assert.equal(hasNewWeekPending(thisWeek), false,
    'freshly-initialized — no pulse');

  // Day 8 (different week): user returns
  const nextWeek = '2099-W99'; // just needs to differ from thisWeek
  assert.equal(hasNewWeekPending(nextWeek), true,
    'new week → should pulse');

  // User opens profile — mark acknowledged
  markWeekSeen(nextWeek);
  assert.equal(hasNewWeekPending(nextWeek), false,
    'after acknowledgment — no more pulse');
});

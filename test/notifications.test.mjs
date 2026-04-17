// test/notifications.test.mjs
//
// Tests for the seen-state tracking used by the mini-card pulse.
// Mocks localStorage so we can test persistence, first-run init, and
// the acknowledgment flow end-to-end.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Install localStorage shim before importing modules under test.
class MemoryStorage {
  constructor() { this.store = new Map(); }
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
  clear() { this.store.clear(); }
}
globalThis.localStorage = new MemoryStorage();

const {
  getSeenAchievementIds,
  markAchievementsSeen,
  computePendingAchievements,
  initSeenOnFirstRun,
} = await import('../src/profile/notifications.js');

const { loadSettings } = await import('../src/profile/settings_store.js');

beforeEach(() => { globalThis.localStorage.clear(); });

// ---------- initSeenOnFirstRun ----------

test('initSeenOnFirstRun: first call marks all current unlocks as seen', () => {
  const did = initSeenOnFirstRun(['first_word', 'first_character']);
  assert.equal(did, true);

  const seen = getSeenAchievementIds();
  assert.ok(seen.has('first_word'));
  assert.ok(seen.has('first_character'));

  const s = loadSettings();
  assert.equal(s.notifications.hasInitialized, true);
});

test('initSeenOnFirstRun: second call is a no-op', () => {
  initSeenOnFirstRun(['first_word']);

  // Simulate user unlocking a new one between calls
  const did = initSeenOnFirstRun(['first_word', 'hundred_words']);
  assert.equal(did, false, 'should not re-initialize');

  const seen = getSeenAchievementIds();
  assert.ok(seen.has('first_word'));
  assert.equal(seen.has('hundred_words'), false,
    'second-call unlock should NOT have been silently swallowed into seen set');
});

test('initSeenOnFirstRun: empty unlock list still initializes', () => {
  const did = initSeenOnFirstRun([]);
  assert.equal(did, true);
  const s = loadSettings();
  assert.equal(s.notifications.hasInitialized, true);
  assert.deepEqual([...getSeenAchievementIds()], []);
});

test('initSeenOnFirstRun: non-array input treated as empty', () => {
  const did = initSeenOnFirstRun(null);
  assert.equal(did, true);
  assert.deepEqual([...getSeenAchievementIds()], []);
});

// ---------- markAchievementsSeen ----------

test('markAchievementsSeen adds new IDs to the seen set', () => {
  initSeenOnFirstRun([]);
  markAchievementsSeen(['first_word']);
  assert.ok(getSeenAchievementIds().has('first_word'));
});

test('markAchievementsSeen is idempotent for already-seen IDs', () => {
  initSeenOnFirstRun([]);
  markAchievementsSeen(['first_word']);
  const before = [...getSeenAchievementIds()].sort();
  markAchievementsSeen(['first_word']);
  const after = [...getSeenAchievementIds()].sort();
  assert.deepEqual(before, after);
});

test('markAchievementsSeen accepts multiple IDs, some new some old', () => {
  initSeenOnFirstRun(['first_word']);
  markAchievementsSeen(['first_word', 'first_character', 'hundred_words']);
  const seen = getSeenAchievementIds();
  assert.equal(seen.size, 3);
  for (const id of ['first_word', 'first_character', 'hundred_words']) {
    assert.ok(seen.has(id), `missing ${id}`);
  }
});

test('markAchievementsSeen with empty array is a no-op', () => {
  initSeenOnFirstRun(['first_word']);
  const before = [...getSeenAchievementIds()].sort();
  markAchievementsSeen([]);
  const after = [...getSeenAchievementIds()].sort();
  assert.deepEqual(before, after);
});

test('markAchievementsSeen with non-array is a no-op', () => {
  initSeenOnFirstRun(['first_word']);
  const before = [...getSeenAchievementIds()].sort();
  markAchievementsSeen('not an array');
  markAchievementsSeen(null);
  markAchievementsSeen(undefined);
  const after = [...getSeenAchievementIds()].sort();
  assert.deepEqual(before, after);
});

test('markAchievementsSeen filters non-string entries', () => {
  initSeenOnFirstRun([]);
  markAchievementsSeen(['valid', null, undefined, 42, {}, 'another_valid']);
  const seen = getSeenAchievementIds();
  assert.equal(seen.size, 2);
  assert.ok(seen.has('valid'));
  assert.ok(seen.has('another_valid'));
});

// ---------- computePendingAchievements ----------

test('computePendingAchievements returns unlocked-minus-seen', () => {
  initSeenOnFirstRun(['first_word']);
  const pending = computePendingAchievements(['first_word', 'first_character', 'hundred_words']);
  // first_word was seen during init, other two are new
  assert.deepEqual(pending.sort(), ['first_character', 'hundred_words']);
});

test('computePendingAchievements returns [] when nothing unlocked', () => {
  initSeenOnFirstRun([]);
  assert.deepEqual(computePendingAchievements([]), []);
});

test('computePendingAchievements returns [] when all seen', () => {
  initSeenOnFirstRun(['first_word', 'first_character']);
  assert.deepEqual(computePendingAchievements(['first_word', 'first_character']), []);
});

test('computePendingAchievements handles non-array input defensively', () => {
  initSeenOnFirstRun([]);
  assert.deepEqual(computePendingAchievements(null), []);
  assert.deepEqual(computePendingAchievements('string'), []);
  assert.deepEqual(computePendingAchievements(undefined), []);
});

// ---------- end-to-end flow ----------

test('full flow: first deploy → new unlock → open profile → no more pending', () => {
  // Scenario: user already had 'first_word' unlocked when they installed this commit
  initSeenOnFirstRun(['first_word']);
  assert.equal(computePendingAchievements(['first_word']).length, 0,
    'existing unlocks should not pulse after first-run init');

  // Time passes, user unlocks 'first_character'
  const pending = computePendingAchievements(['first_word', 'first_character']);
  assert.deepEqual(pending, ['first_character'],
    'newly-unlocked achievement should pulse');

  // User opens the profile — mark-seen-on-open
  markAchievementsSeen(['first_word', 'first_character']);

  // No more pending
  assert.deepEqual(
    computePendingAchievements(['first_word', 'first_character']),
    [],
    'after opening profile, nothing should pulse'
  );
});

test('getSeenAchievementIds returns empty Set on fresh storage', () => {
  const seen = getSeenAchievementIds();
  assert.ok(seen instanceof Set);
  assert.equal(seen.size, 0);
});

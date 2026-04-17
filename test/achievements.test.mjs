// test/achievements.test.mjs — level math + achievement registry + unlock logic

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  xpFromStats,
  levelFromXP,
  xpRequiredForLevel,
  XP_WEIGHTS,
} from '../src/achievements/tiers.js';
import { ACHIEVEMENTS, getAchievementById } from '../src/achievements/registry.js';
import { computeUnlockedIds, diffNewUnlocks } from '../src/achievements/unlocks.js';
import { emptyStats } from '../src/stats/queries.js';

// ---------- tiers ----------

test('xpFromStats is zero for empty / null', () => {
  assert.equal(xpFromStats(emptyStats()), 0);
  assert.equal(xpFromStats(null), 0);
  assert.equal(xpFromStats(undefined), 0);
});

test('xpFromStats sums weighted components', () => {
  const stats = { wordsWritten: 100, characterCount: 2, threadCount: 3, loreCount: 4 };
  const expected =
    Math.floor(100 / XP_WEIGHTS.wordsPer) +
    2 * XP_WEIGHTS.perCharacter +
    3 * XP_WEIGHTS.perThread +
    4 * XP_WEIGHTS.perLore;
  assert.equal(xpFromStats(stats), expected);
});

test('xpRequiredForLevel matches quadratic curve', () => {
  assert.equal(xpRequiredForLevel(1), 0);
  assert.equal(xpRequiredForLevel(2), 100);
  assert.equal(xpRequiredForLevel(3), 400);
  assert.equal(xpRequiredForLevel(5), 1600);
  assert.equal(xpRequiredForLevel(10), 8100);
});

test('levelFromXP returns level 1 for 0 XP', () => {
  const r = levelFromXP(0);
  assert.equal(r.level, 1);
  assert.equal(r.totalXP, 0);
  assert.equal(r.xpIntoLevel, 0);
  assert.equal(r.progress01, 0);
});

test('levelFromXP monotonically increases with XP', () => {
  let lastLevel = 0;
  for (let xp = 0; xp <= 100_000; xp += 500) {
    const r = levelFromXP(xp);
    assert.ok(r.level >= lastLevel, `level went backwards at xp=${xp}`);
    lastLevel = r.level;
  }
});

test('levelFromXP progress01 stays in [0, 1)', () => {
  for (let xp = 0; xp <= 100_000; xp += 777) {
    const r = levelFromXP(xp);
    assert.ok(r.progress01 >= 0, `progress < 0 at xp=${xp}`);
    assert.ok(r.progress01 < 1, `progress >= 1 at xp=${xp}`);
  }
});

test('levelFromXP hits exact level boundaries', () => {
  // At exactly 100 XP, should be level 2 with 0 progress
  const r = levelFromXP(100);
  assert.equal(r.level, 2);
  assert.equal(r.xpIntoLevel, 0);
});

// ---------- registry ----------

test('ACHIEVEMENTS has no duplicate IDs', () => {
  const ids = ACHIEVEMENTS.map(a => a.id);
  assert.equal(ids.length, new Set(ids).size, 'achievement IDs must be unique');
});

test('ACHIEVEMENTS entries all have required fields', () => {
  const tiers = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.id && typeof a.id === 'string', `id missing for ${JSON.stringify(a)}`);
    assert.ok(a.name, `name missing for ${a.id}`);
    assert.ok(a.description, `description missing for ${a.id}`);
    assert.ok(tiers.includes(a.tier), `bad tier for ${a.id}: ${a.tier}`);
    assert.equal(typeof a.criteria, 'function', `criteria not a function for ${a.id}`);
  }
});

test('getAchievementById returns entry or null', () => {
  assert.equal(getAchievementById('nope_not_real'), null);
  assert.ok(getAchievementById('first_word'));
});

// ---------- unlocks ----------

test('computeUnlockedIds returns empty for empty stats', () => {
  assert.deepEqual(computeUnlockedIds(emptyStats()), []);
  assert.deepEqual(computeUnlockedIds(null), []);
});

test('computeUnlockedIds unlocks first_word after any user message', () => {
  const stats = { ...emptyStats(), userMessageCount: 1 };
  assert.ok(computeUnlockedIds(stats).includes('first_word'));
});

test('computeUnlockedIds unlocks tiers cumulatively', () => {
  const stats = { ...emptyStats(), wordsWritten: 5500 };
  const unlocked = computeUnlockedIds(stats);
  assert.ok(unlocked.includes('hundred_words'));
  assert.ok(unlocked.includes('thousand_words'));
  assert.ok(!unlocked.includes('ten_thousand_words'));
  assert.ok(!unlocked.includes('fifty_thousand_words'));
});

test('computeUnlockedIds result is sorted', () => {
  const stats = {
    ...emptyStats(),
    userMessageCount: 10,
    characterCount: 10,
    wordsWritten: 15_000,
    daysActive: 50,
  };
  const unlocked = computeUnlockedIds(stats);
  const sorted = [...unlocked].sort();
  assert.deepEqual(unlocked, sorted);
});

test('computeUnlockedIds swallows criteria errors', () => {
  // Can't inject a bad criteria into the frozen registry, but we can verify
  // the function still returns (doesn't throw) on any reasonable input.
  assert.doesNotThrow(() => computeUnlockedIds({}));
  assert.doesNotThrow(() => computeUnlockedIds({ weird: 'shape' }));
});

test('diffNewUnlocks returns only new ids', () => {
  assert.deepEqual(diffNewUnlocks(['a', 'b', 'c'], ['b', 'c', 'd', 'e']), ['d', 'e']);
});

test('diffNewUnlocks handles null / empty previous', () => {
  assert.deepEqual(diffNewUnlocks(null, ['a', 'b']), ['a', 'b']);
  assert.deepEqual(diffNewUnlocks([], ['a']), ['a']);
  assert.deepEqual(diffNewUnlocks(['a'], null), []);
});

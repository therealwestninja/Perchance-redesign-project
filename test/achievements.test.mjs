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

// ---- tiered counter achievements (curator, namer, organizer, etc.) ----

test('curator bronze unlocks at 3 memory saves', () => {
  const unlocked = computeUnlockedIds({ counters: { memorySaves: 3 } });
  assert.ok(unlocked.includes('curator_bronze'));
  assert.ok(!unlocked.includes('curator_silver'));
});

test('curator silver unlocks at 15; bronze stays unlocked', () => {
  const unlocked = computeUnlockedIds({ counters: { memorySaves: 15 } });
  assert.ok(unlocked.includes('curator_bronze'));
  assert.ok(unlocked.includes('curator_silver'));
  assert.ok(!unlocked.includes('curator_gold'));
});

test('curator gold unlocks at 50; bronze+silver stay unlocked', () => {
  const unlocked = computeUnlockedIds({ counters: { memorySaves: 50 } });
  assert.ok(unlocked.includes('curator_bronze'));
  assert.ok(unlocked.includes('curator_silver'));
  assert.ok(unlocked.includes('curator_gold'));
});

test('counter-backed achievements do not unlock when counters field absent', () => {
  const unlocked = computeUnlockedIds({ userMessageCount: 100 });
  assert.ok(!unlocked.some(id => id.startsWith('curator_')));
  assert.ok(!unlocked.some(id => id.startsWith('namer_')));
});

test('counter-backed achievements: namer has three tiers', () => {
  const one = computeUnlockedIds({ counters: { bubblesRenamed: 1 } });
  const ten = computeUnlockedIds({ counters: { bubblesRenamed: 10 } });
  const fifty = computeUnlockedIds({ counters: { bubblesRenamed: 50 } });
  assert.ok(one.includes('namer_bronze'));
  assert.ok(!one.includes('namer_silver'));
  assert.ok(ten.includes('namer_silver'));
  assert.ok(!ten.includes('namer_gold'));
  assert.ok(fifty.includes('namer_gold'));
});

test('counter-backed achievements: organizer', () => {
  const unlocked = computeUnlockedIds({ counters: { bubblesReordered: 50 } });
  assert.ok(unlocked.includes('organizer_bronze'));
  assert.ok(unlocked.includes('organizer_silver'));
  assert.ok(unlocked.includes('organizer_gold'));
});

test('counter-backed achievements: shuffler has higher thresholds', () => {
  // Shuffler needs 5/25/100 (card reorders are cheap, so higher bar)
  const four = computeUnlockedIds({ counters: { cardsReorderedInBubble: 4 } });
  const five = computeUnlockedIds({ counters: { cardsReorderedInBubble: 5 } });
  assert.ok(!four.includes('shuffler_bronze'));
  assert.ok(five.includes('shuffler_bronze'));
});

test('counter-backed achievements: preservationist rewards locks', () => {
  const unlocked = computeUnlockedIds({ counters: { bubblesLocked: 20 } });
  assert.ok(unlocked.includes('preservationist_bronze'));
  assert.ok(unlocked.includes('preservationist_silver'));
  assert.ok(unlocked.includes('preservationist_gold'));
});

test('counter-backed achievements: restorer rewards snapshot usage', () => {
  const unlocked = computeUnlockedIds({ counters: { snapshotsRestored: 10 } });
  assert.ok(unlocked.includes('restorer_gold'));
});

test('counter-backed achievements: archivist rewards exports', () => {
  const unlocked = computeUnlockedIds({ counters: { backupsExported: 20 } });
  assert.ok(unlocked.includes('archivist_gold'));
});

test('counter-backed achievements: regular rewards repeated tool opens', () => {
  const unlocked = computeUnlockedIds({ counters: { memoryWindowOpens: 100 } });
  assert.ok(unlocked.includes('regular_bronze'));
  assert.ok(unlocked.includes('regular_silver'));
  assert.ok(unlocked.includes('regular_gold'));
});

test('stats without counters field: existing non-counter achievements still work', () => {
  // User with upstream usage but no counter data should still get the
  // flat achievements like first_word, hundred_words, etc.
  const unlocked = computeUnlockedIds({
    userMessageCount: 5,
    wordsWritten: 500,
    characterCount: 1,
  });
  assert.ok(unlocked.includes('first_word'));
  assert.ok(unlocked.includes('first_character'));
  assert.ok(unlocked.includes('hundred_words'));
});

test('mixed stats + counters: both kinds of achievements unlock together', () => {
  const unlocked = computeUnlockedIds({
    userMessageCount: 5,
    wordsWritten: 1500,
    counters: { memorySaves: 15, bubblesRenamed: 10 },
  });
  assert.ok(unlocked.includes('first_word'));
  assert.ok(unlocked.includes('thousand_words'));
  assert.ok(unlocked.includes('curator_silver'));
  assert.ok(unlocked.includes('namer_silver'));
});

// ---- spin-off character achievement (Demiurge) ----

test('achievements: demiurge_bronze unlocks at 1 spawned character', () => {
  const unlocked = computeUnlockedIds({ counters: { charactersSpawned: 1 } });
  assert.ok(unlocked.includes('demiurge_bronze'));
  assert.ok(!unlocked.includes('demiurge_silver'));
});

test('achievements: demiurge_gold at 20 characters', () => {
  const unlocked = computeUnlockedIds({ counters: { charactersSpawned: 20 } });
  assert.ok(unlocked.includes('demiurge_bronze'));
  assert.ok(unlocked.includes('demiurge_silver'));
  assert.ok(unlocked.includes('demiurge_gold'));
});

test('achievements: no demiurge without spawns', () => {
  const unlocked = computeUnlockedIds({ counters: { memorySaves: 100 } });
  assert.ok(!unlocked.some(id => id.startsWith('demiurge_')));
});

// ---- Celebrant (event participation) ----

test('achievements: celebrant_bronze at 1 event responded', () => {
  const unlocked = computeUnlockedIds({ eventsResponded: 1 });
  assert.ok(unlocked.includes('celebrant_bronze'));
  assert.ok(!unlocked.includes('celebrant_silver'));
});

test('achievements: celebrant_silver at 5 events', () => {
  const unlocked = computeUnlockedIds({ eventsResponded: 5 });
  assert.ok(unlocked.includes('celebrant_bronze'));
  assert.ok(unlocked.includes('celebrant_silver'));
  assert.ok(!unlocked.includes('celebrant_gold'));
});

test('achievements: celebrant_gold at 15 events', () => {
  const unlocked = computeUnlockedIds({ eventsResponded: 15 });
  assert.ok(unlocked.includes('celebrant_bronze'));
  assert.ok(unlocked.includes('celebrant_silver'));
  assert.ok(unlocked.includes('celebrant_gold'));
});

test('achievements: no celebrant without any event responses', () => {
  const unlocked = computeUnlockedIds({ counters: { memorySaves: 100 } });
  assert.ok(!unlocked.some(id => id.startsWith('celebrant_')));
});

// ---- Legendary capstones (added with the accent-palette endgame) ----

test('achievements: novelist at 250k words written', () => {
  assert.ok(!computeUnlockedIds({ wordsWritten: 249_999 }).includes('novelist'));
  const u = computeUnlockedIds({ wordsWritten: 250_000 });
  assert.ok(u.includes('novelist'));
  assert.ok(u.includes('fifty_thousand_words')); // includes its prerequisites
});

test('achievements: saga at 1000-message single thread', () => {
  assert.ok(!computeUnlockedIds({ longestThread: 999  }).includes('saga'));
  assert.ok( computeUnlockedIds({ longestThread: 1000 }).includes('saga'));
});

test('achievements: director at 50 characters', () => {
  assert.ok(!computeUnlockedIds({ characterCount: 49 }).includes('director'));
  assert.ok( computeUnlockedIds({ characterCount: 50 }).includes('director'));
});

test('achievements: cosmologist at 200 lore entries', () => {
  assert.ok(!computeUnlockedIds({ loreCount: 199 }).includes('cosmologist'));
  assert.ok( computeUnlockedIds({ loreCount: 200 }).includes('cosmologist'));
});

test('achievements: annual_voyager at 365 days active', () => {
  assert.ok(!computeUnlockedIds({ daysActive: 364 }).includes('annual_voyager'));
  assert.ok( computeUnlockedIds({ daysActive: 365 }).includes('annual_voyager'));
});

test('achievements: prompt_maven at 200 prompts completed', () => {
  assert.ok(!computeUnlockedIds({ promptsCompletedTotal: 199 }).includes('prompt_maven'));
  assert.ok( computeUnlockedIds({ promptsCompletedTotal: 200 }).includes('prompt_maven'));
});

test('achievements: year_round_reveler at 30 distinct events', () => {
  assert.ok(!computeUnlockedIds({ eventsResponded: 29 }).includes('year_round_reveler'));
  assert.ok( computeUnlockedIds({ eventsResponded: 30 }).includes('year_round_reveler'));
});

test('achievements: master at 150 prompts in a single category', () => {
  // peakCategoryCount reads stats.promptsByCategory; supply directly.
  assert.ok(!computeUnlockedIds({
    promptsByCategory: { character: 149, dialogue: 30 },
  }).includes('master'));
  assert.ok( computeUnlockedIds({
    promptsByCategory: { character: 150, dialogue: 30 },
  }).includes('master'));
});

test('achievements: registry now has 9 legendaries (centurion + 8 capstones)', async () => {
  // Sanity gate: if a future change drops one inadvertently, this
  // surfaces it.
  const { ACHIEVEMENTS } = await import('../src/achievements/registry.js');
  const legendaries = ACHIEVEMENTS.filter(a => a.tier === 'legendary');
  assert.equal(legendaries.length, 9);
  const ids = legendaries.map(a => a.id).sort();
  assert.deepEqual(ids, [
    'annual_voyager',
    'cosmologist',
    'director',
    'master',
    'novelist',
    'prompt_maven',
    'saga',
    'streak_100day',
    'year_round_reveler',
  ]);
});

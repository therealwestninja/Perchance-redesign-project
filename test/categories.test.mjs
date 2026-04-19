// test/categories.test.mjs
//
// Tests for src/achievements/categories.js. Covers:
//   - Every achievement in the registry lands in a real category
//     (none fall through to 'other')
//   - Known IDs sort into expected categories
//   - Unknown IDs land in 'other'
//   - groupByCategory returns all CATEGORIES as keys, plus 'other'
//   - computeCategoryProgress counts correctly

import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  CATEGORIES,
  getCategoryFor,
  groupByCategory,
  computeCategoryProgress,
} = await import('../src/achievements/categories.js');
const { ACHIEVEMENTS } = await import('../src/achievements/registry.js');

test('CATEGORIES: expected ids present', () => {
  const ids = CATEGORIES.map(c => c.id);
  assert.deepEqual(ids, [
    'writing', 'stories', 'prompts', 'consistency',
    'curation', 'preservation', 'creation', 'events',
  ]);
});

test('getCategoryFor: known ids map to expected buckets', () => {
  assert.equal(getCategoryFor('first_word'), 'writing');
  assert.equal(getCategoryFor('fifty_thousand_words'), 'writing');
  assert.equal(getCategoryFor('first_character'), 'stories');
  assert.equal(getCategoryFor('worldbuilder'), 'stories');
  assert.equal(getCategoryFor('long_conversation'), 'stories');
  assert.equal(getCategoryFor('first_prompt'), 'prompts');
  assert.equal(getCategoryFor('prompt_seasoned'), 'prompts');
  assert.equal(getCategoryFor('weekly_regular'), 'prompts');
  assert.equal(getCategoryFor('active_week'), 'consistency');
  assert.equal(getCategoryFor('dedicated'), 'consistency');
  assert.equal(getCategoryFor('streak_14day'), 'consistency');
  assert.equal(getCategoryFor('streak_100day'), 'consistency');
  assert.equal(getCategoryFor('curator_bronze'), 'curation');
  assert.equal(getCategoryFor('regular_gold'), 'curation');
  assert.equal(getCategoryFor('sorter_silver'), 'curation');
  assert.equal(getCategoryFor('preservationist_bronze'), 'preservation');
  assert.equal(getCategoryFor('restorer_gold'), 'preservation');
  assert.equal(getCategoryFor('archivist_silver'), 'preservation');
  assert.equal(getCategoryFor('demiurge_bronze'), 'creation');
  assert.equal(getCategoryFor('celebrant_silver'), 'events');
});

test('getCategoryFor: unknown ids fall back to "other"', () => {
  assert.equal(getCategoryFor('unknown_id'), 'other');
  assert.equal(getCategoryFor('totally_fake'), 'other');
});

test('getCategoryFor: non-string input returns "other"', () => {
  assert.equal(getCategoryFor(null), 'other');
  assert.equal(getCategoryFor(undefined), 'other');
  assert.equal(getCategoryFor(42), 'other');
});

test('every shipped achievement sorts into a real category (none in "other")', () => {
  const strays = [];
  for (const a of ACHIEVEMENTS) {
    const cat = getCategoryFor(a.id);
    if (cat === 'other') strays.push(a.id);
  }
  assert.deepEqual(strays, [],
    `${strays.length} achievements fell into "other": ${strays.join(', ')}`);
});

test('groupByCategory: returns every category as a key', () => {
  const byCat = groupByCategory(ACHIEVEMENTS);
  for (const cat of CATEGORIES) {
    assert.ok(cat.id in byCat, `missing category ${cat.id}`);
  }
  assert.ok('other' in byCat);
});

test('groupByCategory: all achievements accounted for', () => {
  const byCat = groupByCategory(ACHIEVEMENTS);
  let total = 0;
  for (const list of Object.values(byCat)) total += list.length;
  assert.equal(total, ACHIEVEMENTS.length);
});

test('groupByCategory: safe on null/undefined input', () => {
  const r1 = groupByCategory(null);
  const r2 = groupByCategory(undefined);
  assert.ok(r1.writing);
  assert.ok(r2.writing);
  assert.equal(r1.writing.length, 0);
});

test('groupByCategory: skips malformed entries', () => {
  const byCat = groupByCategory([null, {}, { id: 'first_word' }]);
  assert.equal(byCat.writing.length, 1);
});

test('computeCategoryProgress: counts unlocked correctly', () => {
  const unlocked = new Set(['first_word', 'hundred_words', 'first_character']);
  const rows = computeCategoryProgress(ACHIEVEMENTS, unlocked);
  const writing = rows.find(r => r.category.id === 'writing');
  const stories = rows.find(r => r.category.id === 'stories');
  assert.equal(writing.unlocked, 2);
  assert.equal(writing.total, 5);
  assert.equal(stories.unlocked, 1);
  assert.equal(stories.total, 7);
});

test('computeCategoryProgress: returns row for every category even with 0 progress', () => {
  const rows = computeCategoryProgress(ACHIEVEMENTS, new Set());
  for (const cat of CATEGORIES) {
    const row = rows.find(r => r.category.id === cat.id);
    assert.ok(row, `missing row for ${cat.id}`);
    assert.equal(row.unlocked, 0);
  }
});

test('computeCategoryProgress: empty achievement list yields zeros', () => {
  const rows = computeCategoryProgress([], new Set());
  for (const row of rows) {
    assert.equal(row.total, 0);
    assert.equal(row.unlocked, 0);
  }
});

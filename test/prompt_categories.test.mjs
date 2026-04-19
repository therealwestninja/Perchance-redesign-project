// test/prompt_categories.test.mjs
//
// Tests for the per-category prompt tracking + Well-Rounded / Specialist
// tier families. Exercises:
//   - Every shipped prompt has a valid category
//   - PROMPT_CATEGORIES distribution matches the advertised shape
//   - computePromptStats returns promptsByCategory + promptCategoriesTouched
//   - Historical byCategory folded into lifetime totals
//   - GC preserves per-category counts in historicalTotals.byCategory
//   - well_rounded_* and specialist_* achievement criteria

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { PROMPTS, PROMPT_CATEGORIES } = await import('../src/prompts/registry.js');
const { computePromptStats } = await import('../src/stats/prompt_stats.js');
const { ACHIEVEMENTS } = await import('../src/achievements/registry.js');
const { getCategoryFor } = await import('../src/achievements/categories.js');

// ---- Registry integrity ----

test('PROMPT_CATEGORIES: expected five ids', () => {
  const ids = PROMPT_CATEGORIES.map(c => c.id);
  assert.deepEqual(ids, ['character', 'dialogue', 'atmosphere', 'craft', 'connection']);
});

test('PROMPTS: every prompt has a valid category', () => {
  const validIds = new Set(PROMPT_CATEGORIES.map(c => c.id));
  const missing = [];
  for (const p of PROMPTS) {
    if (!p.category) missing.push(`${p.id} (no category)`);
    else if (!validIds.has(p.category)) missing.push(`${p.id} (bad category: ${p.category})`);
  }
  assert.deepEqual(missing, [], `${missing.length} prompts with invalid category: ${missing.join(', ')}`);
});

test('PROMPTS: distribution sums to registry size', () => {
  const counts = {};
  for (const cat of PROMPT_CATEGORIES) counts[cat.id] = 0;
  for (const p of PROMPTS) counts[p.category]++;
  let total = 0;
  for (const cat of PROMPT_CATEGORIES) total += counts[cat.id];
  assert.equal(total, PROMPTS.length);
});

// ---- computePromptStats per-category ----

test('computePromptStats: returns promptsByCategory with all categories as keys', () => {
  const stats = computePromptStats({});
  for (const cat of PROMPT_CATEGORIES) {
    assert.ok(cat.id in stats.promptsByCategory, `missing key ${cat.id}`);
    assert.equal(stats.promptsByCategory[cat.id], 0);
  }
  assert.equal(stats.promptCategoriesTouched, 0);
});

test('computePromptStats: counts current-week completions per category', () => {
  // Pick one character prompt and one dialogue prompt from the registry
  const charPrompt = PROMPTS.find(p => p.category === 'character');
  const dialPrompt = PROMPTS.find(p => p.category === 'dialogue');
  const settings = {
    prompts: {
      completedByWeek: {
        '2026-W16': [charPrompt.id, dialPrompt.id, charPrompt.id], // dup illustrates the bucket is a count
      },
    },
  };
  // (In real usage a week's list wouldn't have duplicates since setCompleted
  //  guards on Set membership. This test just confirms the counter arithmetic.)
  const stats = computePromptStats(settings);
  assert.equal(stats.promptsByCategory.character, 2);
  assert.equal(stats.promptsByCategory.dialogue, 1);
  assert.equal(stats.promptCategoriesTouched, 2);
});

test('computePromptStats: folds historicalTotals.byCategory into lifetime per-category', () => {
  const settings = {
    prompts: {
      completedByWeek: {},
      historicalTotals: {
        total: 7,
        weeksActive: 3,
        byCategory: { character: 4, dialogue: 2, atmosphere: 1 },
      },
    },
  };
  const stats = computePromptStats(settings);
  assert.equal(stats.promptsByCategory.character, 4);
  assert.equal(stats.promptsByCategory.dialogue, 2);
  assert.equal(stats.promptsByCategory.atmosphere, 1);
  assert.equal(stats.promptsByCategory.craft, 0);
  assert.equal(stats.promptsByCategory.connection, 0);
  assert.equal(stats.promptCategoriesTouched, 3);
});

test('computePromptStats: sums current + historical per category', () => {
  const charPrompt = PROMPTS.find(p => p.category === 'character');
  const settings = {
    prompts: {
      completedByWeek: { '2026-W16': [charPrompt.id] }, // +1 character
      historicalTotals: {
        total: 5,
        weeksActive: 2,
        byCategory: { character: 5 }, // +5 character
      },
    },
  };
  const stats = computePromptStats(settings);
  assert.equal(stats.promptsByCategory.character, 6);
});

test('computePromptStats: ignores unknown prompt ids gracefully', () => {
  const settings = {
    prompts: {
      completedByWeek: { '2026-W16': ['p-does-not-exist', 'p-another-ghost'] },
    },
  };
  const stats = computePromptStats(settings);
  // Total still goes up (ID count is unaffected), but no category bumps
  assert.equal(stats.promptsCompletedTotal, 2);
  assert.equal(stats.promptCategoriesTouched, 0);
});

// ---- Well-Rounded / Specialist achievement criteria ----

function findAch(id) {
  return ACHIEVEMENTS.find(a => a.id === id);
}

test('well_rounded_bronze: criteria true at 3 categories touched', () => {
  const ach = findAch('well_rounded_bronze');
  assert.ok(ach, 'well_rounded_bronze shipped');
  assert.equal(ach.criteria({ promptCategoriesTouched: 2 }), false);
  assert.equal(ach.criteria({ promptCategoriesTouched: 3 }), true);
  assert.equal(ach.criteria({ promptCategoriesTouched: 5 }), true);
});

test('well_rounded_gold: requires all 5 categories', () => {
  const ach = findAch('well_rounded_gold');
  assert.equal(ach.criteria({ promptCategoriesTouched: 4 }), false);
  assert.equal(ach.criteria({ promptCategoriesTouched: 5 }), true);
});

test('specialist_bronze: criteria true at 10 prompts in one category', () => {
  const ach = findAch('specialist_bronze');
  assert.ok(ach, 'specialist_bronze shipped');
  assert.equal(ach.criteria({ promptsByCategory: { character: 9 } }), false);
  assert.equal(ach.criteria({ promptsByCategory: { character: 10 } }), true);
});

test('specialist_gold: requires 60 in one category', () => {
  const ach = findAch('specialist_gold');
  assert.equal(
    ach.criteria({ promptsByCategory: { character: 59 } }),
    false,
  );
  assert.equal(
    ach.criteria({ promptsByCategory: { character: 60 } }),
    true,
  );
});

test('specialist: peak is taken from the MAX category, not the sum', () => {
  const ach = findAch('specialist_bronze');
  // 9 + 9 = 18 total, but no single category hits 10 — should NOT unlock
  assert.equal(
    ach.criteria({ promptsByCategory: { character: 9, dialogue: 9 } }),
    false,
  );
  // Same 18 total, concentrated in one category — SHOULD unlock
  assert.equal(
    ach.criteria({ promptsByCategory: { character: 18 } }),
    true,
  );
});

test('specialist: missing/malformed promptsByCategory is safe', () => {
  const ach = findAch('specialist_bronze');
  assert.equal(ach.criteria({}), false);
  assert.equal(ach.criteria({ promptsByCategory: null }), false);
  assert.equal(ach.criteria({ promptsByCategory: 'not an object' }), false);
});

// ---- Categorization rule for the new achievement IDs ----

test('new achievement IDs route to prompts category', () => {
  assert.equal(getCategoryFor('well_rounded_bronze'), 'prompts');
  assert.equal(getCategoryFor('well_rounded_silver'), 'prompts');
  assert.equal(getCategoryFor('well_rounded_gold'), 'prompts');
  assert.equal(getCategoryFor('specialist_bronze'), 'prompts');
  assert.equal(getCategoryFor('specialist_silver'), 'prompts');
  assert.equal(getCategoryFor('specialist_gold'), 'prompts');
});

// ---- GC preserves byCategory ----

test('GC: historicalTotals.byCategory accumulates dropped-week per-category counts', async () => {
  // Install mock localStorage before importing the module (module-top
  // loadSettings/saveSettings closes over the runtime localStorage ref)
  const store = new Map();
  globalThis.localStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); },
    key(i) { return [...store.keys()][i] || null; },
    get length() { return store.size; },
  };
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

  const charPrompt = PROMPTS.find(p => p.category === 'character');
  const dialPrompt = PROMPTS.find(p => p.category === 'dialogue');
  const settings = {
    prompts: {
      completedByWeek: {
        '2024-W01': [charPrompt.id, charPrompt.id, dialPrompt.id], // old, to be dropped
        '2026-W16': [charPrompt.id],                                // current week, kept
      },
      historicalTotals: {
        total: 0,
        weeksActive: 0,
        byCategory: { character: 2 }, // prior accumulated
      },
    },
  };
  store.set('pf:settings', JSON.stringify(settings));

  const { clearCompletionHistory } = await import('../src/prompts/gc.js');
  // Use a 'now' inside W16 of 2026 so current week is spared
  const now = new Date(Date.UTC(2026, 3, 13));
  const r = clearCompletionHistory({ now });

  const after = JSON.parse(store.get('pf:settings'));
  assert.ok(r.droppedWeeks >= 1);
  // Character: had 2 prior + 2 dropped = 4
  assert.equal(after.prompts.historicalTotals.byCategory.character, 4);
  // Dialogue: had 0 prior + 1 dropped = 1
  assert.equal(after.prompts.historicalTotals.byCategory.dialogue, 1);
});

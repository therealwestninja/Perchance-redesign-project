// test/prompt_stats.test.mjs
//
// Covers:
//   - computePromptStats shape + edge cases (missing / malformed settings)
//   - Correct totals across single/multiple weeks
//   - weeksActive only counts weeks with ≥1 completion
//   - The five new prompt-engagement achievements unlock at their thresholds
//     (and not before)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computePromptStats } from '../src/stats/prompt_stats.js';
import { ACHIEVEMENTS, getAchievementById } from '../src/achievements/registry.js';
import { computeUnlockedIds } from '../src/achievements/unlocks.js';

// ---------- computePromptStats ----------

test('computePromptStats: empty settings → zeroed', () => {
  assert.deepEqual(computePromptStats({}), {
    promptsCompletedTotal: 0,
    promptsWeeksActive: 0,
    promptsByCategory: { character: 0, dialogue: 0, atmosphere: 0, craft: 0, connection: 0 },
    promptCategoriesTouched: 0,
  });
});

test('computePromptStats: undefined / null / malformed → zeroed (no throw)', () => {
  const zeroCat = { character: 0, dialogue: 0, atmosphere: 0, craft: 0, connection: 0 };
  assert.deepEqual(computePromptStats(undefined), {
    promptsCompletedTotal: 0, promptsWeeksActive: 0,
    promptsByCategory: zeroCat, promptCategoriesTouched: 0,
  });
  assert.deepEqual(computePromptStats(null), {
    promptsCompletedTotal: 0, promptsWeeksActive: 0,
    promptsByCategory: zeroCat, promptCategoriesTouched: 0,
  });
  assert.deepEqual(computePromptStats({ prompts: 'not an object' }), {
    promptsCompletedTotal: 0, promptsWeeksActive: 0,
    promptsByCategory: zeroCat, promptCategoriesTouched: 0,
  });
});

test('computePromptStats: single week with one completion', () => {
  const s = { prompts: { completedByWeek: { '2026-W16': ['p-a'] } } };
  // 'p-a' is not a real ID so it contributes to the total but not to any
  // category bucket — same behavior as the "ignores unknown prompt ids"
  // guarantee in prompt_categories.test.mjs.
  assert.deepEqual(computePromptStats(s), {
    promptsCompletedTotal: 1, promptsWeeksActive: 1,
    promptsByCategory: { character: 0, dialogue: 0, atmosphere: 0, craft: 0, connection: 0 },
    promptCategoriesTouched: 0,
  });
});

test('computePromptStats: multiple weeks', () => {
  const s = {
    prompts: {
      completedByWeek: {
        '2026-W14': ['p-a', 'p-b'],
        '2026-W15': ['p-c'],
        '2026-W16': ['p-d', 'p-e', 'p-f'],
      },
    },
  };
  assert.deepEqual(computePromptStats(s), {
    promptsCompletedTotal: 6, promptsWeeksActive: 3,
    promptsByCategory: { character: 0, dialogue: 0, atmosphere: 0, craft: 0, connection: 0 },
    promptCategoriesTouched: 0,
  });
});

test('computePromptStats: empty-array weeks don\'t count toward weeksActive', () => {
  const s = {
    prompts: {
      completedByWeek: {
        '2026-W14': [],
        '2026-W15': ['p-a'],
        '2026-W16': [],
      },
    },
  };
  assert.deepEqual(computePromptStats(s), {
    promptsCompletedTotal: 1, promptsWeeksActive: 1,
    promptsByCategory: { character: 0, dialogue: 0, atmosphere: 0, craft: 0, connection: 0 },
    promptCategoriesTouched: 0,
  });
});

test('computePromptStats: non-array week values skipped defensively', () => {
  const s = {
    prompts: {
      completedByWeek: {
        '2026-W14': 'corrupted',
        '2026-W15': null,
        '2026-W16': ['p-a', 'p-b'],
      },
    },
  };
  assert.deepEqual(computePromptStats(s), {
    promptsCompletedTotal: 2, promptsWeeksActive: 1,
    promptsByCategory: { character: 0, dialogue: 0, atmosphere: 0, craft: 0, connection: 0 },
    promptCategoriesTouched: 0,
  });
});

// ---------- new achievements exist in registry ----------

test('registry includes the five new prompt achievements', () => {
  const ids = ['first_prompt', 'prompt_curious', 'prompt_seasoned', 'prompt_explorer', 'weekly_regular'];
  for (const id of ids) {
    const a = getAchievementById(id);
    assert.ok(a, `registry missing ${id}`);
    assert.equal(typeof a.name, 'string');
    assert.equal(typeof a.description, 'string');
    assert.ok(['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(a.tier));
    assert.equal(typeof a.criteria, 'function');
  }
});

// ---------- unlock thresholds ----------

test('first_prompt unlocks at 1 completion, not at 0', () => {
  assert.equal(computeUnlockedIds({ promptsCompletedTotal: 0 }).includes('first_prompt'), false);
  assert.ok(computeUnlockedIds({ promptsCompletedTotal: 1 }).includes('first_prompt'));
});

test('prompt_curious unlocks at 5, not at 4', () => {
  assert.equal(computeUnlockedIds({ promptsCompletedTotal: 4 }).includes('prompt_curious'), false);
  assert.ok(computeUnlockedIds({ promptsCompletedTotal: 5 }).includes('prompt_curious'));
});

test('prompt_seasoned unlocks at 25', () => {
  assert.equal(computeUnlockedIds({ promptsCompletedTotal: 24 }).includes('prompt_seasoned'), false);
  assert.ok(computeUnlockedIds({ promptsCompletedTotal: 25 }).includes('prompt_seasoned'));
});

test('prompt_explorer unlocks at 50', () => {
  assert.equal(computeUnlockedIds({ promptsCompletedTotal: 49 }).includes('prompt_explorer'), false);
  assert.ok(computeUnlockedIds({ promptsCompletedTotal: 50 }).includes('prompt_explorer'));
});

test('weekly_regular is driven by weeksActive, not total completions', () => {
  // 50 completions all in one week → not weekly_regular
  assert.equal(
    computeUnlockedIds({ promptsCompletedTotal: 50, promptsWeeksActive: 1 })
      .includes('weekly_regular'),
    false
  );
  // Few completions spread across many weeks → weekly_regular
  assert.ok(
    computeUnlockedIds({ promptsCompletedTotal: 10, promptsWeeksActive: 10 })
      .includes('weekly_regular')
  );
});

test('weekly_regular unlocks at 10 weeks active, not 9', () => {
  assert.equal(computeUnlockedIds({ promptsWeeksActive: 9 }).includes('weekly_regular'), false);
  assert.ok(computeUnlockedIds({ promptsWeeksActive: 10 }).includes('weekly_regular'));
});

// ---------- end-to-end composition ----------

test('dedicated prompt-user unlocks all five prompt achievements', () => {
  const stats = {
    promptsCompletedTotal: 60,
    promptsWeeksActive: 15,
  };
  const unlocked = computeUnlockedIds(stats);
  for (const id of ['first_prompt', 'prompt_curious', 'prompt_seasoned', 'prompt_explorer', 'weekly_regular']) {
    assert.ok(unlocked.includes(id), `expected ${id} unlocked`);
  }
});

test('prompt achievements are independent of non-prompt achievements', () => {
  // User has done prompts but nothing else
  const stats = { promptsCompletedTotal: 5, promptsWeeksActive: 0 };
  const unlocked = computeUnlockedIds(stats);
  // prompt achievements fire
  assert.ok(unlocked.includes('first_prompt'));
  assert.ok(unlocked.includes('prompt_curious'));
  // non-prompt achievements don't
  assert.equal(unlocked.includes('first_word'), false);
  assert.equal(unlocked.includes('first_character'), false);
});

// test/archetypes.test.mjs
//
// Unit tests for src/profile/archetypes.js. Validates:
//   - scoreArchetypes returns all archetypes in [0, 1], sorted desc
//   - getPrimaryArchetype returns Newcomer for low-signal users
//   - each archetype wins on a profile that fits it
//   - pure function: same input -> same output

import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  scoreArchetypes,
  getPrimaryArchetype,
} = await import('../src/profile/archetypes.js');

// ---- basics ----

test('scoreArchetypes: returns 5 archetypes', () => {
  const res = scoreArchetypes({});
  assert.equal(res.length, 5);
});

test('scoreArchetypes: all scores in [0, 1]', () => {
  const res = scoreArchetypes({
    wordsWritten: 10000,
    userMessageCount: 200,
    characterCount: 20,
    threadCount: 30,
    daysActive: 100,
    longestThread: 500,
    counters: { memorySaves: 200, bubblesRenamed: 100, memoryWindowOpens: 200, charactersSpawned: 30 },
    streaks: { current: 100, longest: 100 },
  });
  for (const a of res) {
    assert.ok(a.score >= 0 && a.score <= 1, `${a.id} score ${a.score} out of range`);
  }
});

test('scoreArchetypes: sorted by score descending', () => {
  const res = scoreArchetypes({
    wordsWritten: 10000,
    userMessageCount: 100,
    counters: { memorySaves: 50, bubblesRenamed: 20 },
  });
  for (let i = 1; i < res.length; i++) {
    assert.ok(res[i - 1].score >= res[i].score,
      `result not sorted: ${res[i - 1].score} before ${res[i].score}`);
  }
});

test('scoreArchetypes: shape includes id, label, description, score', () => {
  const res = scoreArchetypes({});
  for (const a of res) {
    assert.ok(typeof a.id === 'string');
    assert.ok(typeof a.label === 'string');
    assert.ok(typeof a.description === 'string');
    assert.ok(typeof a.score === 'number');
  }
});

test('scoreArchetypes: pure — same input gives same output', () => {
  const stats = {
    wordsWritten: 1000,
    userMessageCount: 20,
    counters: { memorySaves: 10 },
    streaks: { current: 3, longest: 5 },
  };
  const a = scoreArchetypes(stats);
  const b = scoreArchetypes(stats);
  assert.deepEqual(a, b);
});

// ---- Newcomer fallback ----

test('getPrimaryArchetype: returns Newcomer for zero stats', () => {
  const primary = getPrimaryArchetype({});
  assert.equal(primary.id, 'newcomer');
  assert.equal(primary.label, 'Newcomer');
});

test('getPrimaryArchetype: returns Newcomer when all scores below 0.15', () => {
  // Zero-engagement user: no messages at all
  const primary = getPrimaryArchetype({
    userMessageCount: 0,
    wordsWritten: 0,
  });
  assert.equal(primary.id, 'newcomer');
});

test('getPrimaryArchetype: crosses Newcomer threshold', () => {
  // Heavy enough to trip ANY archetype past 0.15
  const primary = getPrimaryArchetype({
    userMessageCount: 50,
    wordsWritten: 2500,
    daysActive: 20,
    counters: { memorySaves: 10, memoryWindowOpens: 20 },
    streaks: { current: 5, longest: 10 },
  });
  assert.notEqual(primary.id, 'newcomer');
});

// ---- per-archetype winning profiles ----

test('Storyteller wins for long-form + curation profile', () => {
  const stats = {
    wordsWritten: 10000,
    userMessageCount: 100,  // 100 words per message (huge)
    longestThread: 150,
    characterCount: 3,
    threadCount: 4,
    counters: { memorySaves: 60, bubblesRenamed: 30 },
    streaks: { current: 2, longest: 5 },
    daysActive: 10,
  };
  const primary = getPrimaryArchetype(stats);
  assert.equal(primary.id, 'storyteller');
});

test('Roleplayer wins for many-characters + moderate-wpm profile', () => {
  const stats = {
    wordsWritten: 3000,
    userMessageCount: 150, // ~20 words per reply, RP sweet spot
    characterCount: 12,
    threadCount: 15,
    counters: { memorySaves: 5, bubblesRenamed: 2, charactersSpawned: 8 },
    streaks: { current: 3, longest: 10 },
    daysActive: 15,
    longestThread: 30,
  };
  const primary = getPrimaryArchetype(stats);
  assert.equal(primary.id, 'rp');
});

test('Daily User wins for high-streak + tool-use profile', () => {
  const stats = {
    wordsWritten: 2000,
    userMessageCount: 100,
    characterCount: 3,
    threadCount: 5,
    counters: { memorySaves: 15, bubblesRenamed: 5, memoryWindowOpens: 80 },
    streaks: { current: 20, longest: 40 },
    daysActive: 60,
    longestThread: 50,
  };
  const primary = getPrimaryArchetype(stats);
  assert.equal(primary.id, 'daily');
});

test('Regular wins for moderate-everything profile', () => {
  const stats = {
    wordsWritten: 1500,
    userMessageCount: 80,
    characterCount: 3,
    threadCount: 4,
    counters: { memorySaves: 5, bubblesRenamed: 3, memoryWindowOpens: 20 },
    streaks: { current: 2, longest: 7 },
    daysActive: 25,
    longestThread: 30,
  };
  const primary = getPrimaryArchetype(stats);
  assert.equal(primary.id, 'twice_weekly');
});

test('Casual wins for low-activity profile with at least one message', () => {
  const stats = {
    wordsWritten: 40,
    userMessageCount: 5,
    characterCount: 1,
    threadCount: 1,
    counters: {},
    streaks: { current: 0, longest: 1 },
    daysActive: 3,
    longestThread: 5,
  };
  const primary = getPrimaryArchetype(stats);
  assert.equal(primary.id, 'casual');
});

test('Casual: zero-message user scores 0 (falls back to Newcomer)', () => {
  const primary = getPrimaryArchetype({
    userMessageCount: 0,
    wordsWritten: 0,
  });
  assert.equal(primary.id, 'newcomer');
});

test('handles missing counters/streaks gracefully', () => {
  // Stats without counters or streaks shouldn't throw
  const res = scoreArchetypes({
    wordsWritten: 500,
    userMessageCount: 20,
  });
  assert.equal(res.length, 5);
  for (const a of res) {
    assert.ok(Number.isFinite(a.score));
  }
});

test('handles null stats gracefully', () => {
  const res = scoreArchetypes(null);
  assert.equal(res.length, 5);
  // All scores finite and in [0, 1]. A few archetypes' bell-curve
  // formulas produce small non-zero at null input (mathematically
  // defensible — the tail is still near zero), so we don't assert
  // ===0, just the valid range.
  for (const a of res) {
    assert.ok(Number.isFinite(a.score));
    assert.ok(a.score >= 0 && a.score <= 1);
  }
  const primary = getPrimaryArchetype(null);
  assert.equal(primary.id, 'newcomer');
});

// ---- edge cases ----

test('extreme values don\'t break monotonicity in score bounds', () => {
  // Millions of words / characters shouldn't overshoot or go negative
  const res = scoreArchetypes({
    wordsWritten: 1e9,
    userMessageCount: 1e6,
    characterCount: 1e5,
    threadCount: 1e5,
    counters: { memorySaves: 1e6, bubblesRenamed: 1e6, memoryWindowOpens: 1e6, charactersSpawned: 1e6 },
    streaks: { current: 10000, longest: 10000 },
    daysActive: 10000,
    longestThread: 10000,
  });
  for (const a of res) {
    assert.ok(a.score >= 0 && a.score <= 1,
      `${a.id} score ${a.score} out of bounds at extremes`);
  }
});

test('negative values don\'t produce negative scores', () => {
  const res = scoreArchetypes({
    wordsWritten: -100,
    userMessageCount: -10,
    counters: { memorySaves: -5 },
    streaks: { longest: -3 },
  });
  for (const a of res) {
    assert.ok(a.score >= 0, `${a.id} score ${a.score} went negative`);
  }
});

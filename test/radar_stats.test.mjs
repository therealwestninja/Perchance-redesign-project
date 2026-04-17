// test/radar_stats.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeRadarValues,
  normalizeAgainstTiers,
  AXES,
} from '../src/stats/radar_stats.js';

// ---------- normalizeAgainstTiers ----------

test('normalizeAgainstTiers: zero → 0', () => {
  assert.equal(normalizeAgainstTiers(0, [100, 1000]), 0);
});

test('normalizeAgainstTiers: negative → 0', () => {
  assert.equal(normalizeAgainstTiers(-50, [100, 1000]), 0);
});

test('normalizeAgainstTiers: at each tier threshold returns tier/N', () => {
  const tiers = [100, 1000, 10_000, 50_000, 100_000]; // N=5
  assert.equal(normalizeAgainstTiers(100,     tiers), 1/5);
  assert.equal(normalizeAgainstTiers(1000,    tiers), 2/5);
  assert.equal(normalizeAgainstTiers(10_000,  tiers), 3/5);
  assert.equal(normalizeAgainstTiers(50_000,  tiers), 4/5);
  assert.equal(normalizeAgainstTiers(100_000, tiers), 5/5);
});

test('normalizeAgainstTiers: past last tier clamps to 1', () => {
  const tiers = [100, 1000, 10_000, 50_000, 100_000];
  assert.equal(normalizeAgainstTiers(500_000, tiers), 1);
  assert.equal(normalizeAgainstTiers(Infinity, tiers), 1);
});

test('normalizeAgainstTiers: inside a tier interpolates linearly', () => {
  const tiers = [100, 1000]; // N=2
  // Halfway between 0 and 100 → 0 + (50/100) * (1/2) = 0.25
  assert.equal(normalizeAgainstTiers(50, tiers), 0.25);
  // Halfway between 100 and 1000 → (1 + 0.5) / 2 = 0.75
  assert.equal(normalizeAgainstTiers(550, tiers), 0.75);
});

test('normalizeAgainstTiers: empty tiers → 0', () => {
  assert.equal(normalizeAgainstTiers(100, []), 0);
});

test('normalizeAgainstTiers: non-array tiers → 0', () => {
  assert.equal(normalizeAgainstTiers(100, null), 0);
  assert.equal(normalizeAgainstTiers(100, 'nope'), 0);
});

test('normalizeAgainstTiers: non-number value → 0', () => {
  assert.equal(normalizeAgainstTiers(null, [100, 1000]), 0);
  assert.equal(normalizeAgainstTiers(undefined, [100, 1000]), 0);
  assert.equal(normalizeAgainstTiers('abc', [100, 1000]), 0);
});

// ---------- AXES configuration ----------

test('AXES has exactly 5 entries (pentagon)', () => {
  assert.equal(AXES.length, 5);
});

test('AXES entries have required shape', () => {
  for (const a of AXES) {
    assert.equal(typeof a.key, 'string');
    assert.equal(typeof a.label, 'string');
    assert.ok(Array.isArray(a.tiers));
    assert.ok(a.tiers.length >= 1);
  }
});

test('AXES tiers are monotonically increasing', () => {
  for (const a of AXES) {
    for (let i = 1; i < a.tiers.length; i++) {
      assert.ok(a.tiers[i] > a.tiers[i - 1],
        `${a.key} tier ${i} (${a.tiers[i]}) should be > tier ${i-1} (${a.tiers[i-1]})`);
    }
  }
});

// ---------- computeRadarValues ----------

test('computeRadarValues: empty stats yield all zeros', () => {
  const r = computeRadarValues({});
  assert.equal(r.length, 5);
  for (const v of r) {
    assert.equal(v.raw, 0);
    assert.equal(v.normalized, 0);
  }
});

test('computeRadarValues: fully-maxed user yields all 1.0', () => {
  const maxStats = {
    wordsWritten:   500_000,
    characterCount: 100,
    longestThread:  10_000,
    loreCount:      1_000,
    daysActive:     1_000,
  };
  const r = computeRadarValues(maxStats);
  for (const v of r) {
    assert.equal(v.normalized, 1, `${v.key} should be maxed`);
  }
});

test('computeRadarValues: has label + raw + normalized for each axis', () => {
  const r = computeRadarValues({ wordsWritten: 500 });
  for (const v of r) {
    assert.equal(typeof v.label, 'string');
    assert.equal(typeof v.raw, 'number');
    assert.ok(v.normalized >= 0 && v.normalized <= 1);
  }
  const words = r.find(v => v.key === 'wordsWritten');
  assert.equal(words.raw, 500);
});

test('computeRadarValues: result order is stable (matches AXES)', () => {
  const r1 = computeRadarValues({ wordsWritten: 100 });
  const r2 = computeRadarValues({ wordsWritten: 100 });
  assert.deepEqual(r1.map(v => v.key), r2.map(v => v.key));
  assert.deepEqual(r1.map(v => v.key), AXES.map(a => a.key));
});

test('computeRadarValues: defensive against missing/negative/non-number fields', () => {
  const weird = {
    wordsWritten: 'not a number',
    characterCount: -5,
    longestThread: null,
    // loreCount and daysActive missing entirely
  };
  const r = computeRadarValues(weird);
  for (const v of r) {
    assert.ok(v.raw >= 0);
    assert.ok(v.normalized >= 0 && v.normalized <= 1);
  }
});

// ---------- typical-user shape sanity ----------

test('a dedicated-prompt-explorer shape has high Regularity, moderate Words', () => {
  const stats = {
    wordsWritten: 5_000,    // tier 2 of 5 (1000-10000 range) → ~0.44
    characterCount: 3,
    longestThread: 50,
    loreCount: 0,
    daysActive: 180,         // tier 4 of 4 (365 cap) → ~0.88
  };
  const r = computeRadarValues(stats);
  const byKey = Object.fromEntries(r.map(v => [v.key, v.normalized]));
  assert.ok(byKey.daysActive > byKey.loreCount);
  assert.ok(byKey.daysActive > byKey.longestThread);
  assert.equal(byKey.loreCount, 0);
});

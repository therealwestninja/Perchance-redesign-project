// test/prompts_scheduler.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getCurrentWeekKey,
  getWeekPrompts,
  PROMPTS_PER_WEEK,
} from '../src/prompts/scheduler.js';
import { PROMPTS } from '../src/prompts/registry.js';

// ---------- getCurrentWeekKey ----------

test('getCurrentWeekKey returns YYYY-Www format', () => {
  const key = getCurrentWeekKey(new Date('2026-04-15T12:00:00Z'));
  assert.match(key, /^\d{4}-W\d{2}$/);
});

test('getCurrentWeekKey: two days in the same ISO week produce the same key', () => {
  // Monday and Friday of the same week
  const monday = getCurrentWeekKey(new Date('2026-04-13T00:00:00Z'));
  const friday = getCurrentWeekKey(new Date('2026-04-17T23:59:00Z'));
  assert.equal(monday, friday);
});

test('getCurrentWeekKey: two consecutive weeks produce different keys', () => {
  const thisWeek = getCurrentWeekKey(new Date('2026-04-15T12:00:00Z'));
  const nextWeek = getCurrentWeekKey(new Date('2026-04-22T12:00:00Z'));
  assert.notEqual(thisWeek, nextWeek);
});

test('getCurrentWeekKey: ISO week 1 edge case (Dec 29-31 may be W52/W53 or W01)', () => {
  // Jan 1 2026 was a Thursday → ISO week 1 starts Dec 29 2025
  const dec29 = getCurrentWeekKey(new Date('2025-12-29T12:00:00Z'));
  const jan01 = getCurrentWeekKey(new Date('2026-01-01T12:00:00Z'));
  assert.equal(dec29, jan01, 'Dec 29 2025 and Jan 1 2026 should be same ISO week');
});

// ---------- getWeekPrompts: determinism ----------

test('getWeekPrompts: same weekKey produces same prompts, same order', () => {
  const a = getWeekPrompts('2026-W16');
  const b = getWeekPrompts('2026-W16');
  assert.deepEqual(a.map(p => p.id), b.map(p => p.id));
});

test('getWeekPrompts: different weekKeys produce different selections', () => {
  const a = getWeekPrompts('2026-W16').map(p => p.id).sort().join(',');
  const b = getWeekPrompts('2026-W17').map(p => p.id).sort().join(',');
  assert.notEqual(a, b);
});

// ---------- getWeekPrompts: shape ----------

test('getWeekPrompts returns the configured number of prompts', () => {
  const prompts = getWeekPrompts('2026-W16');
  assert.equal(prompts.length, PROMPTS_PER_WEEK);
});

test('getWeekPrompts returns prompts drawn from the real registry', () => {
  const prompts = getWeekPrompts('2026-W16');
  const allIds = new Set(PROMPTS.map(p => p.id));
  for (const p of prompts) {
    assert.ok(allIds.has(p.id), `prompt ${p.id} not in registry`);
    assert.equal(typeof p.text, 'string');
    assert.ok(p.text.length > 0);
  }
});

test('getWeekPrompts returns unique prompts within a week', () => {
  const prompts = getWeekPrompts('2026-W16');
  const ids = prompts.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('getWeekPrompts honors custom count', () => {
  const prompts = getWeekPrompts('2026-W16', { count: 2 });
  assert.equal(prompts.length, 2);
});

test('getWeekPrompts clamps count to pool size', () => {
  const small = [{ id: 'only-one', text: 'the only prompt' }];
  const prompts = getWeekPrompts('2026-W16', { count: 100, pool: small });
  assert.equal(prompts.length, 1);
});

test('getWeekPrompts clamps count below 1 to 1', () => {
  const prompts = getWeekPrompts('2026-W16', { count: 0 });
  assert.equal(prompts.length, 1);
});

// ---------- fair distribution ----------

test('over many weeks, every prompt in the pool appears at least once', () => {
  // Sanity check: with 40 prompts in the pool and 4 per week, after ~50 weeks
  // all prompts should appear (highly likely via Fisher-Yates shuffle).
  const seen = new Set();
  for (let week = 1; week <= 52; week++) {
    const key = `2026-W${String(week).padStart(2, '0')}`;
    const prompts = getWeekPrompts(key);
    for (const p of prompts) seen.add(p.id);
  }
  const poolSize = PROMPTS.length;
  // Expect to have seen all of them — if this ever flakes, increase loop count.
  assert.equal(seen.size, poolSize,
    `saw ${seen.size}/${poolSize} unique prompts over 52 weeks`);
});

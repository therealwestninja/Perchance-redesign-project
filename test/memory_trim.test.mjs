// test/memory_trim.test.mjs
//
// Tests for runTrim. Adapted from PMT's test/trim.test.js — retains the
// BUG-03a and BUG-03b regression tests that documented ordering subtleties
// PMT discovered during audit rounds. Rewritten for node:test.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runTrim } from '../src/memory/trim.js';
import { getEntryId } from '../src/memory/protection.js';

// ---- dedup ----

test('dedup: removes second occurrence', () => {
  const r = runTrim(['A', 'B', 'A'], { dedup: true });
  assert.equal(r.byDedup.length, 1);
  assert.deepEqual(r.kept, ['A', 'B']);
});

test('dedup off: duplicates pass through', () => {
  const r = runTrim(['A', 'B', 'A'], { dedup: false });
  assert.deepEqual(r.kept, ['A', 'B', 'A']);
  assert.equal(r.byDedup.length, 0);
});

// ---- keep-newest ----

test('keep-newest: drops oldest first', () => {
  const r = runTrim(['old', 'middle', 'new'], { keepN: '2' });
  assert.deepEqual(r.byAge, ['old']);
  assert.deepEqual(r.kept, ['middle', 'new']);
});

test('keep-newest: keepN larger than input is a no-op', () => {
  const r = runTrim(['a', 'b'], { keepN: '10' });
  assert.deepEqual(r.kept, ['a', 'b']);
  assert.equal(r.byAge.length, 0);
});

test('keep-newest: no keepN is a no-op', () => {
  const r = runTrim(['a', 'b', 'c'], {});
  assert.deepEqual(r.kept, ['a', 'b', 'c']);
});

// ---- BUG-03a regression: pinned + keep-newest preserves chronology ----

test('pinned + keep-newest: pinned entry preserved', () => {
  const entries = ['old', 'mid keep', 'late pinned'];
  const pinnedIds = new Set([getEntryId('late pinned')]);
  const r = runTrim(entries, {
    keepN: '2',
    protectedEntryIds: pinnedIds,
    getEntryId,
  });
  assert.ok(r.kept.includes('late pinned'));
});

test('pinned + keep-newest: chronological order preserved (BUG-03a)', () => {
  const entries = ['old', 'mid keep', 'late pinned'];
  const pinnedIds = new Set([getEntryId('late pinned')]);
  const r = runTrim(entries, {
    keepN: '2',
    protectedEntryIds: pinnedIds,
    getEntryId,
  });
  // Original chronology is [old, mid keep, late pinned].
  // Drop oldest ('old'); keep the others in their original order.
  assert.deepEqual(r.kept, ['mid keep', 'late pinned']);
});

test('pinned entries exceeding keepN: all pinned still kept', () => {
  const entries = ['p1', 'p2', 'p3', 'unpinned'];
  const pinnedIds = new Set([getEntryId('p1'), getEntryId('p2'), getEntryId('p3')]);
  const r = runTrim(entries, {
    keepN: '2',
    protectedEntryIds: pinnedIds,
    getEntryId,
  });
  // All 3 pinned must be kept even though keepN=2; unpinned gets dropped
  assert.ok(r.kept.includes('p1'));
  assert.ok(r.kept.includes('p2'));
  assert.ok(r.kept.includes('p3'));
  assert.ok(!r.kept.includes('unpinned'));
});

// ---- BUG-03b regression: token-budget + duplicate entry text ----

test('token-budget: all entries kept when budget generous (BUG-03b)', () => {
  // Fake token counter: char-count heuristic
  const tokenCounter = (s) => Math.ceil(String(s || '').length / 4);
  const entries = ['dup', 'x', 'dup', 'y'];
  const r = runTrim(entries, {
    trimMode: 'token_budget',
    targetTokens: 9999,
    tokenCounter,
    protectedEntryIds: new Set(),
    getEntryId: () => 'same',
  });
  assert.equal(r.kept.length, 4);
  // Order preserved
  assert.deepEqual(r.kept, ['dup', 'x', 'dup', 'y']);
});

// ---- long-entry filter ----

test('trimLong: removes entries longer than charLimit', () => {
  const long = 'x'.repeat(500);
  const r = runTrim([long, 'short'], { trimLong: true, charLimit: 200 });
  assert.ok(r.kept.includes('short'));
  assert.ok(!r.kept.includes(long));
  assert.deepEqual(r.byLong, [long]);
});

test('trimLong: pinned long entry is exempt', () => {
  const long = 'x'.repeat(500);
  const pinnedIds = new Set([getEntryId(long)]);
  const r = runTrim([long, 'short'], {
    trimLong: true,
    charLimit: 200,
    protectedEntryIds: pinnedIds,
    getEntryId,
  });
  assert.ok(r.kept.includes(long), 'pinned long entry should be kept');
});

test('trimLong off: long entries pass through', () => {
  const long = 'x'.repeat(500);
  const r = runTrim([long, 'short'], { trimLong: false, charLimit: 200 });
  assert.ok(r.kept.includes(long));
  assert.equal(r.byLong.length, 0);
});

// ---- reporting ----

test('keptPct calculation', () => {
  const r = runTrim(['A', 'B', 'C', 'D'], { keepN: '2' });
  assert.equal(r.keptPct, 50);
});

test('keptPct is 100 on empty input', () => {
  const r = runTrim([], { keepN: '5' });
  assert.equal(r.keptPct, 100);
});

test('totalRemoved equals byDedup + byLong + byAge length', () => {
  const r = runTrim(['A', 'A', 'B', 'C'], { dedup: true, keepN: '1' });
  assert.equal(r.totalRemoved, r.byDedup.length + r.byLong.length + r.byAge.length);
});

test('trimMode is echoed in result', () => {
  const r1 = runTrim(['a'], {});
  assert.equal(r1.trimMode, 'newest');
  const r2 = runTrim(['a'], { trimMode: 'token_budget', targetTokens: 5 });
  assert.equal(r2.trimMode, 'token_budget');
});

test('token-budget mode returns overBudgetPinWarning field', () => {
  const tokenCounter = (s) => Math.ceil(String(s || '').length / 4);
  const r = runTrim(['a', 'b', 'c'], {
    trimMode: 'token_budget',
    targetTokens: 5,
    tokenCounter,
    protectedEntryIds: new Set(),
    getEntryId: () => 'id',
  });
  assert.equal(typeof r.overBudgetPinWarning, 'boolean');
});

// ---- defensive ----

test('defensive: empty input returns empty result', () => {
  const r = runTrim([], { keepN: '5', dedup: true, trimLong: true });
  assert.deepEqual(r.kept, []);
  assert.deepEqual(r.removed, []);
});

test('defensive: null/undefined input acts like empty', () => {
  const r = runTrim(null, { keepN: '5' });
  assert.deepEqual(r.kept, []);
});

test('token-budget mode without tokenCounter degrades gracefully', () => {
  const r = runTrim(['a', 'b', 'c'], {
    trimMode: 'token_budget',
    targetTokens: 5,
    // tokenCounter intentionally omitted
    protectedEntryIds: new Set(),
    getEntryId: () => 'id',
  });
  // Falls back to keeping everything rather than crashing
  assert.deepEqual(r.kept, ['a', 'b', 'c']);
});

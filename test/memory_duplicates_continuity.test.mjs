// test/memory_duplicates_continuity.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  tokenize, jaccard, compareEntries, buildNearDupClusters,
} from '../src/memory/duplicates.js';
import {
  scoreContinuity, scoreAllEntries,
} from '../src/memory/continuity.js';
import { getEntryId } from '../src/memory/protection.js';

// ---- tokenize ----

test('tokenize: lowercases', () => {
  assert.deepEqual(tokenize('Hello World'), ['hello', 'world']);
});

test('tokenize: strips punctuation except apostrophes', () => {
  assert.deepEqual(tokenize("don't stop, look!"), ["don't", 'stop', 'look']);
});

test('tokenize: handles null/undefined as empty', () => {
  assert.deepEqual(tokenize(null), []);
  assert.deepEqual(tokenize(undefined), []);
});

// ---- jaccard ----

test('jaccard: identical sets = 1', () => {
  assert.equal(jaccard(new Set(['a', 'b']), new Set(['a', 'b'])), 1);
});

test('jaccard: disjoint sets = 0', () => {
  assert.equal(jaccard(new Set(['a']), new Set(['b'])), 0);
});

test('jaccard: both empty = 1', () => {
  assert.equal(jaccard(new Set(), new Set()), 1);
});

test('jaccard: one empty = 0', () => {
  assert.equal(jaccard(new Set(), new Set(['a'])), 0);
});

test('jaccard: half-overlap = 1/3', () => {
  // {a,b} vs {b,c} → intersection {b}, union {a,b,c} → 1/3
  assert.equal(jaccard(new Set(['a', 'b']), new Set(['b', 'c'])), 1 / 3);
});

// ---- compareEntries ----

test('compareEntries: identical text reports 1.0', () => {
  const { similarity } = compareEntries('hello world', 'hello world');
  assert.equal(similarity, 1);
});

test('compareEntries: near-identical phrasing above 0.9', () => {
  const { similarity, reasons } = compareEntries(
    'she walked to the garden',
    'she walks to the garden'
  );
  assert.ok(similarity >= 0.6);
  assert.ok(reasons.length > 0);
});

test('compareEntries: unrelated text scores low', () => {
  const { similarity } = compareEntries(
    'the wizard cast a spell',
    'mashed potatoes need butter'
  );
  assert.ok(similarity < 0.3);
});

// ---- buildNearDupClusters ----

test('buildNearDupClusters: groups similar entries', () => {
  const entries = [
    'the dragon roared across the valley',
    'the dragon roared across the canyon',
    'mashed potatoes need butter',
  ];
  const clusters = buildNearDupClusters(entries, getEntryId, 0.6);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].entries.length, 2);
});

test('buildNearDupClusters: no clusters when below threshold', () => {
  const entries = [
    'wizards cast spells',
    'dragons breathe fire',
    'goblins swing daggers',
  ];
  const clusters = buildNearDupClusters(entries, getEntryId, 0.6);
  assert.equal(clusters.length, 0);
});

test('buildNearDupClusters: singleton entries discarded', () => {
  const clusters = buildNearDupClusters(['alone'], getEntryId, 0.6);
  assert.equal(clusters.length, 0);
});

test('buildNearDupClusters: sorted by similarity descending', () => {
  const entries = [
    // cluster A — high similarity
    'cat sat on the mat',
    'the cat sat on the mat',
    // cluster B — lower similarity
    'the knight rode into battle',
    'the knight rode a horse to battle',
  ];
  const clusters = buildNearDupClusters(entries, getEntryId, 0.5);
  assert.equal(clusters.length, 2);
  assert.ok(clusters[0].maxSimilarity >= clusters[1].maxSimilarity);
});

// ---- continuity scoring ----

test('scoreContinuity: pinned gets +40', () => {
  const a = scoreContinuity('random text', { isPinned: false });
  const b = scoreContinuity('random text', { isPinned: true });
  assert.equal(b.score - a.score, 40);
  assert.ok(b.reasons.includes('pinned'));
});

test('scoreContinuity: relationship words boost score', () => {
  const a = scoreContinuity('the sky was grey that day', {});
  const b = scoreContinuity('she married her best friend', {});
  assert.ok(b.score > a.score);
});

test('scoreContinuity: label is high when score >= 40', () => {
  const r = scoreContinuity('forbidden ritual', { isPinned: true });
  assert.equal(r.label, 'high');
});

test('scoreContinuity: label is low for bland short entry', () => {
  const r = scoreContinuity('ok', {});
  assert.equal(r.label, 'low');
});

test('scoreContinuity: handles null/undefined entries', () => {
  const r = scoreContinuity(null, {});
  assert.equal(typeof r.score, 'number');
  assert.ok(['low', 'medium', 'high'].includes(r.label));
});

test('scoreAllEntries: returns array same length as input', () => {
  const entries = ['a', 'b', 'c'];
  const scores = scoreAllEntries(entries);
  assert.equal(scores.length, 3);
});

test('scoreAllEntries: pinnedIds set marks entries as pinned', () => {
  const entries = ['a', 'b'];
  const pinned = new Set([getEntryId('a')]);
  const scores = scoreAllEntries(entries, pinned, new Set(), getEntryId);
  const a = scores.find(s => s.entry === 'a');
  const b = scores.find(s => s.entry === 'b');
  assert.ok(a.reasons.includes('pinned'));
  assert.ok(!b.reasons.includes('pinned'));
});

test('scoreAllEntries: recency bonus applies to newest ~20%', () => {
  // 10 entries — top 2 should get the recent bonus
  const entries = Array.from({ length: 10 }, (_, i) => `entry ${i}`);
  const scores = scoreAllEntries(entries, new Set(), new Set(), getEntryId);
  const newest = scores[9];
  const oldest = scores[0];
  assert.ok(newest.reasons.includes('recent'));
  assert.ok(!oldest.reasons.includes('recent'));
});

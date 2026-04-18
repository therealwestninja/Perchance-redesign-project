// test/lock_persistence.test.mjs
//
// Tests for lock persistence. Focused on reconcileLocks (pure function —
// no settings_store dependency). persistLock/loadLocks/saveLocks are
// thin wrappers around settings_store which is tested elsewhere.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileLocks } from '../src/memory/lock_persistence.js';

// ---- helpers ----

function bubble(id, entries) {
  return {
    id,
    label: id,
    entries: entries.map(e => (typeof e === 'object' ? e : { id: e })),
    isUngrouped: false,
  };
}

function lock(memberIds) {
  return { memberIds: memberIds.map(String), createdAt: Date.now() };
}

// ---- reconcileLocks ----

test('reconcileLocks: empty persisted locks → no locks transferred', () => {
  const fresh = [bubble('bubble:0', [1, 2, 3])];
  const r = reconcileLocks(fresh, {});
  assert.equal(r.lockedBubbleIds.size, 0);
  assert.deepEqual(r.orphanedStableIds, []);
  assert.deepEqual(r.transferredIds, []);
});

test('reconcileLocks: exact-match members → transfer lock', () => {
  const fresh = [
    bubble('bubble:0', [1, 2, 3]),
    bubble('bubble:1', [4, 5, 6]),
  ];
  const persisted = {
    'userBubble:abc123': lock([1, 2, 3]),
  };
  const r = reconcileLocks(fresh, persisted);
  assert.ok(r.lockedBubbleIds.has('bubble:0'));
  assert.equal(r.lockedBubbleIds.size, 1);
  assert.equal(r.transferredIds.length, 1);
  assert.equal(r.transferredIds[0].newBubbleId, 'bubble:0');
  assert.equal(r.transferredIds[0].jaccard, 1);
  assert.equal(r.orphanedStableIds.length, 0);
});

test('reconcileLocks: partial-match above threshold → transfer to best', () => {
  // Persisted had [1,2,3,4]. Fresh bubble:0 has [1,2,3] (missing 4).
  // Jaccard = 3/4 = 0.75 → transfers.
  const fresh = [
    bubble('bubble:0', [1, 2, 3]),
    bubble('bubble:1', [5, 6]),
  ];
  const persisted = { 'userBubble:a': lock([1, 2, 3, 4]) };
  const r = reconcileLocks(fresh, persisted);
  assert.ok(r.lockedBubbleIds.has('bubble:0'));
  assert.equal(r.transferredIds[0].newBubbleId, 'bubble:0');
  // jaccard 3/4
  assert.ok(r.transferredIds[0].jaccard > 0.7);
  assert.equal(r.orphanedStableIds.length, 0);
});

test('reconcileLocks: match below threshold → orphan', () => {
  // Persisted had [1,2,3]. Fresh has [1] (only 1 of 3 shared).
  // Jaccard = 1/3 ≈ 0.33 < 0.5 → orphaned.
  const fresh = [bubble('bubble:0', [1])];
  const persisted = { 'userBubble:a': lock([1, 2, 3]) };
  const r = reconcileLocks(fresh, persisted);
  assert.equal(r.lockedBubbleIds.size, 0);
  assert.equal(r.orphanedStableIds.length, 1);
  assert.equal(r.orphanedStableIds[0], 'userBubble:a');
});

test('reconcileLocks: two locks compete for same fresh bubble → larger wins', () => {
  // Fresh bubble:0 has [1,2,3,4,5]. Two persisted locks, both match it:
  //   - Lock A had [1,2,3,4,5] (jaccard 1.0)
  //   - Lock B had [1,2] (jaccard 2/5 = 0.4, below threshold)
  // But we also process bigger persisted locks first, so A claims bubble:0.
  const fresh = [
    bubble('bubble:0', [1, 2, 3, 4, 5]),
  ];
  const persisted = {
    'userBubble:small': lock([1, 2]),
    'userBubble:big': lock([1, 2, 3, 4, 5]),
  };
  const r = reconcileLocks(fresh, persisted);
  assert.ok(r.lockedBubbleIds.has('bubble:0'));
  assert.equal(r.lockedBubbleIds.size, 1);
  // big lock should have claimed bubble:0
  const bigTransfer = r.transferredIds.find(t => t.stableId === 'userBubble:big');
  assert.ok(bigTransfer);
  assert.equal(bigTransfer.newBubbleId, 'bubble:0');
  // small was orphaned
  assert.ok(r.orphanedStableIds.includes('userBubble:small'));
});

test('reconcileLocks: multiple locks match multiple fresh bubbles', () => {
  const fresh = [
    bubble('bubble:0', [1, 2, 3]),
    bubble('bubble:1', [4, 5, 6]),
    bubble('bubble:2', [7, 8]),
  ];
  const persisted = {
    'userBubble:a': lock([1, 2, 3]),  // matches bubble:0
    'userBubble:b': lock([7, 8]),     // matches bubble:2
  };
  const r = reconcileLocks(fresh, persisted);
  assert.equal(r.lockedBubbleIds.size, 2);
  assert.ok(r.lockedBubbleIds.has('bubble:0'));
  assert.ok(r.lockedBubbleIds.has('bubble:2'));
  assert.equal(r.orphanedStableIds.length, 0);
});

test('reconcileLocks: each fresh bubble can be claimed by only one lock', () => {
  // Two persisted locks that would BOTH best-match the same fresh bubble.
  // Only the first (processed in size-desc order) should claim it.
  const fresh = [bubble('bubble:0', [1, 2, 3])];
  const persisted = {
    'userBubble:a': lock([1, 2, 3]),        // jaccard 1.0
    'userBubble:b': lock([1, 2]),            // jaccard 2/3 = 0.67
  };
  const r = reconcileLocks(fresh, persisted);
  assert.equal(r.lockedBubbleIds.size, 1);
  // a is larger, processed first, claims bubble:0
  assert.ok(r.transferredIds.some(t => t.stableId === 'userBubble:a' && t.newBubbleId === 'bubble:0'));
  // b couldn't claim anything → orphaned
  assert.ok(r.orphanedStableIds.includes('userBubble:b'));
});

test('reconcileLocks: empty persisted memberIds → orphaned', () => {
  const fresh = [bubble('bubble:0', [1, 2])];
  const persisted = { 'userBubble:broken': { memberIds: [], createdAt: 0 } };
  const r = reconcileLocks(fresh, persisted);
  assert.equal(r.lockedBubbleIds.size, 0);
  assert.ok(r.orphanedStableIds.includes('userBubble:broken'));
});

test('reconcileLocks: no fresh bubbles → all persisted orphaned', () => {
  const persisted = {
    'userBubble:a': lock([1, 2]),
    'userBubble:b': lock([3, 4]),
  };
  const r = reconcileLocks([], persisted);
  assert.equal(r.lockedBubbleIds.size, 0);
  assert.equal(r.orphanedStableIds.length, 2);
});

test('reconcileLocks: custom threshold', () => {
  // With threshold=0.9, a 0.75 Jaccard should orphan
  const fresh = [bubble('bubble:0', [1, 2, 3])];
  const persisted = { 'userBubble:a': lock([1, 2, 3, 4]) }; // jaccard 0.75
  const strict = reconcileLocks(fresh, persisted, { threshold: 0.9 });
  assert.equal(strict.lockedBubbleIds.size, 0);
  assert.equal(strict.orphanedStableIds.length, 1);

  // With default 0.5, it transfers
  const lenient = reconcileLocks(fresh, persisted);
  assert.equal(lenient.lockedBubbleIds.size, 1);
});

test('reconcileLocks: ids compared as strings', () => {
  // Numeric vs string IDs should still match
  const fresh = [bubble('bubble:0', [1, 2, 3])];
  const persisted = { 'userBubble:a': lock(['1', '2', '3']) };
  const r = reconcileLocks(fresh, persisted);
  assert.equal(r.lockedBubbleIds.size, 1);
});

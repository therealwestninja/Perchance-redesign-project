// test/bubble_overrides.test.mjs
//
// Tests for memory/bubble_overrides.js — the user-override state for
// bubble organization.
//
// Covers: membership assignment, card forget-on-delete, bubble order,
// intra-bubble card order, lock state, and the end-to-end applyOverrides
// pipeline that reconciles overrides against fresh clustering output.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createOverrides,
  assignCardToBubble,
  unassignCard,
  forgetCard,
  setBubbleOrder,
  moveBubbleBefore,
  setBubbleCardOrder,
  moveCardBefore,
  toggleLock,
  isLocked,
  applyOverrides,
  stableBubbleId,
  rememberUserBubble,
} from '../src/memory/bubble_overrides.js';

// ---- helpers ----

function bubble(id, entries, extras = {}) {
  return { id, label: extras.label || id, entries, isUngrouped: !!extras.isUngrouped };
}

function entry(id, text = '', embedding = null) {
  return { id, scope: 'memory', text, embedding };
}

// ---- createOverrides ----

test('createOverrides: fresh state is empty', () => {
  const s = createOverrides();
  assert.equal(s.cardToBubbleId.size, 0);
  assert.equal(s.bubbleCardOrder.size, 0);
  assert.deepEqual(s.bubbleOrder, []);
  assert.equal(s.lockedBubbles.size, 0);
  assert.equal(s.userCreatedBubbles.size, 0);
});

// ---- assignCardToBubble / unassignCard ----

test('assignCardToBubble: stores the mapping', () => {
  const s = createOverrides();
  assignCardToBubble(s, 'c1', 'bubble:0');
  assert.equal(s.cardToBubbleId.get('c1'), 'bubble:0');
});

test('assignCardToBubble: idempotent / updates on reassignment', () => {
  const s = createOverrides();
  assignCardToBubble(s, 'c1', 'bubble:0');
  assignCardToBubble(s, 'c1', 'bubble:2');
  assert.equal(s.cardToBubbleId.get('c1'), 'bubble:2');
  assert.equal(s.cardToBubbleId.size, 1);
});

test('unassignCard: removes the mapping', () => {
  const s = createOverrides();
  assignCardToBubble(s, 'c1', 'bubble:0');
  unassignCard(s, 'c1');
  assert.equal(s.cardToBubbleId.has('c1'), false);
});

// ---- forgetCard ----

test('forgetCard: removes membership and intra-bubble order entries', () => {
  const s = createOverrides();
  assignCardToBubble(s, 'c1', 'bubble:0');
  setBubbleCardOrder(s, 'bubble:0', ['c0', 'c1', 'c2']);
  forgetCard(s, 'c1');
  assert.equal(s.cardToBubbleId.has('c1'), false);
  assert.deepEqual(s.bubbleCardOrder.get('bubble:0'), ['c0', 'c2']);
});

test('forgetCard: removes bubble entry from cardOrder if last card', () => {
  const s = createOverrides();
  setBubbleCardOrder(s, 'bubble:0', ['c1']);
  forgetCard(s, 'c1');
  assert.equal(s.bubbleCardOrder.has('bubble:0'), false);
});

// ---- setBubbleOrder / moveBubbleBefore ----

test('setBubbleOrder: stores the order', () => {
  const s = createOverrides();
  setBubbleOrder(s, ['bubble:2', 'bubble:0', 'bubble:1']);
  assert.deepEqual(s.bubbleOrder, ['bubble:2', 'bubble:0', 'bubble:1']);
});

test('moveBubbleBefore: relocates to a specified position', () => {
  const s = createOverrides();
  moveBubbleBefore(s, 'bubble:2', 'bubble:0', ['bubble:0', 'bubble:1', 'bubble:2']);
  assert.deepEqual(s.bubbleOrder, ['bubble:2', 'bubble:0', 'bubble:1']);
});

test('moveBubbleBefore: null beforeBubbleId moves to the end', () => {
  const s = createOverrides();
  moveBubbleBefore(s, 'bubble:0', null, ['bubble:0', 'bubble:1', 'bubble:2']);
  assert.deepEqual(s.bubbleOrder, ['bubble:1', 'bubble:2', 'bubble:0']);
});

test('moveBubbleBefore: works when the bubble is already at its target position', () => {
  const s = createOverrides();
  moveBubbleBefore(s, 'bubble:0', 'bubble:1', ['bubble:0', 'bubble:1', 'bubble:2']);
  assert.deepEqual(s.bubbleOrder, ['bubble:0', 'bubble:1', 'bubble:2']);
});

test('moveBubbleBefore: unknown beforeBubbleId → append', () => {
  const s = createOverrides();
  moveBubbleBefore(s, 'bubble:0', 'bubble:99', ['bubble:0', 'bubble:1']);
  assert.deepEqual(s.bubbleOrder, ['bubble:1', 'bubble:0']);
});

// ---- setBubbleCardOrder / moveCardBefore ----

test('setBubbleCardOrder: stores the per-bubble order', () => {
  const s = createOverrides();
  setBubbleCardOrder(s, 'bubble:0', ['c2', 'c0', 'c1']);
  assert.deepEqual(s.bubbleCardOrder.get('bubble:0'), ['c2', 'c0', 'c1']);
});

test('moveCardBefore: relocates a card within its bubble', () => {
  const s = createOverrides();
  moveCardBefore(s, 'bubble:0', 'c2', 'c0', ['c0', 'c1', 'c2']);
  assert.deepEqual(s.bubbleCardOrder.get('bubble:0'), ['c2', 'c0', 'c1']);
});

test('moveCardBefore: null beforeCardId moves to the end', () => {
  const s = createOverrides();
  moveCardBefore(s, 'bubble:0', 'c0', null, ['c0', 'c1', 'c2']);
  assert.deepEqual(s.bubbleCardOrder.get('bubble:0'), ['c1', 'c2', 'c0']);
});

// ---- lock state ----

test('toggleLock: first toggle locks', () => {
  const s = createOverrides();
  const newState = toggleLock(s, 'bubble:0');
  assert.equal(newState, true);
  assert.equal(isLocked(s, 'bubble:0'), true);
});

test('toggleLock: second toggle unlocks', () => {
  const s = createOverrides();
  toggleLock(s, 'bubble:0');
  const newState = toggleLock(s, 'bubble:0');
  assert.equal(newState, false);
  assert.equal(isLocked(s, 'bubble:0'), false);
});

test('isLocked: unknown bubble is not locked', () => {
  const s = createOverrides();
  assert.equal(isLocked(s, 'bubble:99'), false);
});

// ---- applyOverrides: membership ----

test('applyOverrides: no overrides → returns a copy of fresh layout', () => {
  const s = createOverrides();
  const fresh = [
    bubble('b0', [entry('c0'), entry('c1')]),
    bubble('b1', [entry('c2')]),
  ];
  const result = applyOverrides(s, fresh);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].entries.map(e => e.id), ['c0', 'c1']);
  assert.deepEqual(result[1].entries.map(e => e.id), ['c2']);
});

test('applyOverrides: moves a card from one bubble to another', () => {
  const s = createOverrides();
  assignCardToBubble(s, 'c0', 'b1');
  const fresh = [
    bubble('b0', [entry('c0'), entry('c1')]),
    bubble('b1', [entry('c2')]),
  ];
  const result = applyOverrides(s, fresh);
  const b0 = result.find(b => b.id === 'b0');
  const b1 = result.find(b => b.id === 'b1');
  assert.deepEqual(b0.entries.map(e => e.id), ['c1']);
  // c0 was moved into b1, appended at the end
  assert.ok(b1.entries.map(e => e.id).includes('c0'));
  assert.ok(b1.entries.map(e => e.id).includes('c2'));
});

test('applyOverrides: empty bubbles are dropped (unless locked)', () => {
  const s = createOverrides();
  assignCardToBubble(s, 'c0', 'b1'); // move c0 out of b0, leaving it empty
  const fresh = [
    bubble('b0', [entry('c0')]),
    bubble('b1', [entry('c2')]),
  ];
  const result = applyOverrides(s, fresh);
  // b0 should be dropped
  assert.equal(result.find(b => b.id === 'b0'), undefined);
});

test('applyOverrides: empty locked bubble is preserved', () => {
  const s = createOverrides();
  toggleLock(s, 'b0');
  assignCardToBubble(s, 'c0', 'b1');
  const fresh = [
    bubble('b0', [entry('c0')]),
    bubble('b1', [entry('c2')]),
  ];
  const result = applyOverrides(s, fresh);
  const b0 = result.find(b => b.id === 'b0');
  assert.ok(b0, 'b0 should be preserved because it is locked');
  assert.equal(b0.entries.length, 0);
});

test('applyOverrides: assigning to a non-existent bubble drops the override (unless locked)', () => {
  const s = createOverrides();
  assignCardToBubble(s, 'c0', 'b_ghost');
  const fresh = [bubble('b0', [entry('c0')])];
  const result = applyOverrides(s, fresh);
  // c0 should have fallen back into b0 (since the override's target doesn't exist)
  // The override should have been cleaned up too
  assert.equal(s.cardToBubbleId.has('c0'), false);
  assert.equal(result[0].id, 'b0');
  assert.deepEqual(result[0].entries.map(e => e.id), ['c0']);
});

test('applyOverrides: assigning to a locked non-existent bubble creates a user-kept bubble', () => {
  const s = createOverrides();
  toggleLock(s, 'b_kept');
  rememberUserBubble(s, 'b_kept', 'My Pinned Group');
  assignCardToBubble(s, 'c0', 'b_kept');
  const fresh = [bubble('b0', [entry('c0')])];
  const result = applyOverrides(s, fresh);
  const kept = result.find(b => b.id === 'b_kept');
  assert.ok(kept);
  assert.equal(kept.entries.length, 1);
  assert.equal(kept.entries[0].id, 'c0');
  assert.equal(kept.label, 'My Pinned Group');
  assert.equal(kept.userKept, true);
});

test('applyOverrides: card forgotten if its origin no longer exists', () => {
  const s = createOverrides();
  assignCardToBubble(s, 'c0', 'b1');
  // Fresh clustering doesn't contain c0 anywhere — card was deleted
  const fresh = [bubble('b0', [entry('c1')]), bubble('b1', [entry('c2')])];
  const result = applyOverrides(s, fresh);
  // Override should be cleaned up
  assert.equal(s.cardToBubbleId.has('c0'), false);
  // b1 should NOT have c0 (since it wasn't found)
  assert.deepEqual(result.find(b => b.id === 'b1').entries.map(e => e.id), ['c2']);
});

// ---- applyOverrides: intra-bubble order ----

test('applyOverrides: intra-bubble order is applied', () => {
  const s = createOverrides();
  setBubbleCardOrder(s, 'b0', ['c2', 'c0', 'c1']);
  const fresh = [bubble('b0', [entry('c0'), entry('c1'), entry('c2')])];
  const result = applyOverrides(s, fresh);
  assert.deepEqual(result[0].entries.map(e => e.id), ['c2', 'c0', 'c1']);
});

test('applyOverrides: cards not listed in cardOrder stay at the end', () => {
  const s = createOverrides();
  setBubbleCardOrder(s, 'b0', ['c1']);
  const fresh = [bubble('b0', [entry('c0'), entry('c1'), entry('c2')])];
  const result = applyOverrides(s, fresh);
  // c1 first (user-listed), then c0 and c2 in clustering order
  assert.deepEqual(result[0].entries.map(e => e.id), ['c1', 'c0', 'c2']);
});

test('applyOverrides: cardOrder referencing missing cards gracefully drops them', () => {
  const s = createOverrides();
  setBubbleCardOrder(s, 'b0', ['c_ghost', 'c0']);
  const fresh = [bubble('b0', [entry('c0'), entry('c1')])];
  const result = applyOverrides(s, fresh);
  assert.deepEqual(result[0].entries.map(e => e.id), ['c0', 'c1']);
});

// ---- applyOverrides: bubble-level order ----

test('applyOverrides: bubble order is applied', () => {
  const s = createOverrides();
  setBubbleOrder(s, ['b2', 'b0', 'b1']);
  const fresh = [
    bubble('b0', [entry('c0')]),
    bubble('b1', [entry('c1')]),
    bubble('b2', [entry('c2')]),
  ];
  const result = applyOverrides(s, fresh);
  assert.deepEqual(result.map(b => b.id), ['b2', 'b0', 'b1']);
});

test('applyOverrides: bubbles not listed in bubbleOrder stay at the end', () => {
  const s = createOverrides();
  setBubbleOrder(s, ['b2']);
  const fresh = [
    bubble('b0', [entry('c0')]),
    bubble('b1', [entry('c1')]),
    bubble('b2', [entry('c2')]),
  ];
  const result = applyOverrides(s, fresh);
  // b2 first, then b0 and b1 in clustering order
  assert.deepEqual(result.map(b => b.id), ['b2', 'b0', 'b1']);
});

test('applyOverrides: bubbleOrder referencing deleted bubbles is cleaned up', () => {
  const s = createOverrides();
  setBubbleOrder(s, ['b_ghost', 'b0']);
  const fresh = [bubble('b0', [entry('c0')])];
  applyOverrides(s, fresh);
  assert.deepEqual(s.bubbleOrder, ['b0']);
});

// ---- applyOverrides: does not mutate inputs ----

test('applyOverrides: does not mutate input bubble array or entries', () => {
  const s = createOverrides();
  assignCardToBubble(s, 'c0', 'b1');
  setBubbleCardOrder(s, 'b1', ['c0', 'c2']);
  const fresh = [
    bubble('b0', [entry('c0'), entry('c1')]),
    bubble('b1', [entry('c2')]),
  ];
  const freshCopy = JSON.parse(JSON.stringify(fresh));
  applyOverrides(s, fresh);
  assert.deepEqual(
    JSON.parse(JSON.stringify(fresh)),
    freshCopy,
    'input layout should not be mutated'
  );
});

// ---- stableBubbleId ----

test('stableBubbleId: deterministic', () => {
  const a = stableBubbleId(['c1', 'c2', 'c3']);
  const b = stableBubbleId(['c3', 'c2', 'c1']);
  assert.equal(a, b, 'order of inputs should not matter (sorted internally)');
});

test('stableBubbleId: different inputs → different ids', () => {
  const a = stableBubbleId(['c1', 'c2']);
  const b = stableBubbleId(['c1', 'c3']);
  assert.notEqual(a, b);
});

test('stableBubbleId: has userBubble: prefix', () => {
  const id = stableBubbleId(['c1']);
  assert.ok(id.startsWith('userBubble:'));
});

// ---- end-to-end: the full "user moved c0 to b1, locked b0, reordered bubbles" scenario ----

test('applyOverrides: complex scenario combining all override types', () => {
  const s = createOverrides();
  // User moves c1 from b0 into b1
  assignCardToBubble(s, 'c1', 'b1');
  // User reorders cards within b1
  setBubbleCardOrder(s, 'b1', ['c1', 'c2']);
  // User reorders bubbles: b1 first
  setBubbleOrder(s, ['b1', 'b0']);
  // User locks b0
  toggleLock(s, 'b0');

  const fresh = [
    bubble('b0', [entry('c0'), entry('c1')]),
    bubble('b1', [entry('c2')]),
  ];
  const result = applyOverrides(s, fresh);

  assert.deepEqual(result.map(b => b.id), ['b1', 'b0']);
  const b0 = result.find(b => b.id === 'b0');
  const b1 = result.find(b => b.id === 'b1');
  assert.deepEqual(b0.entries.map(e => e.id), ['c0']);
  assert.deepEqual(b1.entries.map(e => e.id), ['c1', 'c2']);
  assert.equal(isLocked(s, 'b0'), true);
});

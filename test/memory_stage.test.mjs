// test/memory_stage.test.mjs
//
// Tests for the pure staging layer. Covers:
//   - identity preservation across scope flips (promote/demote don't
//     look like delete+add in the diff)
//   - per-scope reorder isolation (moving a memory doesn't mess with lore)
//   - add / edit / remove / bulk variants
//   - computeDiff accuracy across every operation combination
//   - discard restores baseline
//   - baseline snapshot isolation (mutating input after createStage has
//     no effect)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStage } from '../src/memory/stage.js';

// Minimal helpers — keep tests readable.
const mem = (id, text, extra = {}) => ({ id, scope: 'memory', text, ...extra });
const lore = (id, text, extra = {}) => ({ id, scope: 'lore', text, ...extra });

// ---- constructor / snapshot isolation ----

test('createStage: empty baseline produces empty staged state', () => {
  const s = createStage([]);
  assert.deepEqual(s.getStaged(), []);
  assert.equal(s.hasChanges(), false);
});

test('createStage: null/undefined baseline treated as empty', () => {
  assert.doesNotThrow(() => createStage(null));
  assert.doesNotThrow(() => createStage(undefined));
  const s = createStage(null);
  assert.deepEqual(s.getStaged(), []);
});

test('createStage: ignores malformed baseline items (no id, null)', () => {
  const s = createStage([
    { id: 1, scope: 'memory', text: 'ok' },
    { scope: 'memory', text: 'no-id' },
    null,
  ]);
  const staged = s.getStaged();
  assert.equal(staged.length, 1, 'malformed items filtered out');
  assert.equal(staged[0].id, 1);
  const diff = s.computeDiff();
  assert.equal(diff.totalChanges, 0, 'no changes: baseline preserved as-is');
});

test('createStage: baseline is snapshotted — mutating input after does not leak', () => {
  const input = [mem(1, 'original')];
  const s = createStage(input);
  input[0].text = 'mutated after stage creation';
  input.push(mem(2, 'added after'));
  const staged = s.getStaged();
  assert.equal(staged[0].text, 'original');
  assert.equal(staged.length, 1);
});

test('createStage: getStaged returns a safe copy — mutating does not leak back', () => {
  const s = createStage([mem(1, 'hello')]);
  const snapshot = s.getStaged();
  snapshot[0].text = 'tampered';
  assert.equal(s.getStaged()[0].text, 'hello');
});

// ---- scope filtering ----

test('getStagedByScope: returns only items in that scope', () => {
  const s = createStage([mem(1, 'm1'), lore(2, 'l1'), mem(3, 'm2')]);
  const mems = s.getStagedByScope('memory');
  const lrs = s.getStagedByScope('lore');
  assert.equal(mems.length, 2);
  assert.equal(lrs.length, 1);
  assert.ok(mems.every(it => it.scope === 'memory'));
  assert.ok(lrs.every(it => it.scope === 'lore'));
});

// ---- remove ----

test('remove: baseline item → diff.deleted', () => {
  const s = createStage([mem(1, 'bye'), mem(2, 'keep')]);
  s.remove(1);
  const diff = s.computeDiff();
  assert.equal(diff.deleted.length, 1);
  assert.equal(diff.deleted[0].id, 1);
  assert.equal(diff.totalChanges, 1);
});

test('remove: freshly-added item → disappears silently (no diff entry)', () => {
  const s = createStage([mem(1, 'existing')]);
  const newId = s.add({ scope: 'memory', text: 'brand new' });
  s.remove(newId);
  const diff = s.computeDiff();
  assert.equal(diff.added.length, 0);
  assert.equal(diff.totalChanges, 0);
});

test('remove: id that doesn\'t exist is a no-op', () => {
  const s = createStage([mem(1, 'a')]);
  s.remove(999);
  assert.equal(s.getStaged().length, 1);
});

// ---- add ----

test('add: creates item with a synthetic tmp id', () => {
  const s = createStage([]);
  const id = s.add({ scope: 'memory', text: 'fresh' });
  assert.match(String(id), /^tmp:/);
  const diff = s.computeDiff();
  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0].text, 'fresh');
  assert.equal(diff.added[0].scope, 'memory');
});

test('add: defaults scope to memory when invalid', () => {
  const s = createStage([]);
  s.add({ scope: 'gibberish', text: 'x' });
  const diff = s.computeDiff();
  assert.equal(diff.added[0].scope, 'memory');
});

test('add: coerces null/undefined text to empty string', () => {
  const s = createStage([]);
  s.add({ scope: 'lore', text: null });
  const diff = s.computeDiff();
  assert.equal(diff.added[0].text, '');
});

test('add: multiple adds get distinct tmp ids', () => {
  const s = createStage([]);
  const a = s.add({ scope: 'memory', text: 'one' });
  const b = s.add({ scope: 'memory', text: 'two' });
  assert.notEqual(a, b);
});

// ---- edit ----

test('edit: changes text on an existing item → diff.edited', () => {
  const s = createStage([mem(1, 'before')]);
  s.edit(1, 'after');
  const diff = s.computeDiff();
  assert.equal(diff.edited.length, 1);
  assert.equal(diff.edited[0].text, 'after');
});

test('edit: changing text back to baseline value = no change', () => {
  const s = createStage([mem(1, 'same')]);
  s.edit(1, 'different');
  s.edit(1, 'same');
  const diff = s.computeDiff();
  assert.equal(diff.totalChanges, 0, 'round-trip edit should cancel out');
});

test('edit: non-existent id is a no-op', () => {
  const s = createStage([mem(1, 'a')]);
  s.edit(999, 'phantom');
  assert.equal(s.computeDiff().totalChanges, 0);
});

test('edit: can change scope via opts.scope', () => {
  const s = createStage([mem(1, 'hi')]);
  s.edit(1, 'hi', { scope: 'lore' });
  const diff = s.computeDiff();
  assert.equal(diff.edited.length, 1);
  assert.equal(diff.promoted.length, 1, 'memory → lore via edit counts as promoted');
});

// ---- promote / demote: the identity-preservation test ----

test('promote: memory → lore is an edit (scope changed), NOT add+delete', () => {
  const s = createStage([mem(5, 'turn me into lore')]);
  s.promote(5);
  const diff = s.computeDiff();
  assert.equal(diff.added.length, 0, 'promote should not look like an add');
  assert.equal(diff.deleted.length, 0, 'promote should not look like a delete');
  assert.equal(diff.edited.length, 1, 'promote is an edit with scope change');
  assert.equal(diff.promoted.length, 1);
  assert.equal(diff.demoted.length, 0);
  assert.equal(diff.promoted[0].id, 5);
  assert.equal(diff.promoted[0].scope, 'lore');
});

test('demote: lore → memory is an edit (scope changed), NOT add+delete', () => {
  const s = createStage([lore(7, 'goes back to memory')]);
  s.demote(7);
  const diff = s.computeDiff();
  assert.equal(diff.added.length, 0);
  assert.equal(diff.deleted.length, 0);
  assert.equal(diff.edited.length, 1);
  assert.equal(diff.demoted.length, 1);
  assert.equal(diff.promoted.length, 0);
});

test('promote: wrong scope is a no-op', () => {
  const s = createStage([lore(1, 'already lore')]);
  s.promote(1);
  assert.equal(s.computeDiff().totalChanges, 0);
});

test('demote: wrong scope is a no-op', () => {
  const s = createStage([mem(1, 'already memory')]);
  s.demote(1);
  assert.equal(s.computeDiff().totalChanges, 0);
});

test('promote then demote = back to baseline', () => {
  const s = createStage([mem(1, 'round trip')]);
  s.promote(1);
  s.demote(1);
  assert.equal(s.computeDiff().totalChanges, 0);
});

// ---- reorder ----

test('reorder: moving within same scope produces diff.reordered', () => {
  const s = createStage([mem(1, 'a'), mem(2, 'b'), mem(3, 'c')]);
  s.reorder(3, 0); // 'c' to front
  const diff = s.computeDiff();
  assert.ok(diff.reordered.length >= 1);
  assert.ok(diff.reordered.some(it => it.id === 3));
});

test('reorder: order in other scope unaffected', () => {
  const s = createStage([
    mem(1, 'm1'), mem(2, 'm2'),
    lore(10, 'l1'), lore(11, 'l2'),
  ]);
  s.reorder(2, 0); // swap memories
  const loreAfter = s.getStagedByScope('lore');
  assert.deepEqual(loreAfter.map(it => it.id), [10, 11]);
});

test('reorder: clamps out-of-range indices', () => {
  const s = createStage([mem(1, 'a'), mem(2, 'b')]);
  s.reorder(1, 99); // way past end
  const mems = s.getStagedByScope('memory');
  assert.deepEqual(mems.map(it => it.id), [2, 1]);
});

test('reorder: non-existent id is a no-op', () => {
  const s = createStage([mem(1, 'a')]);
  s.reorder(999, 0);
  assert.equal(s.computeDiff().totalChanges, 0);
});

test('reorder: same position is a no-op', () => {
  const s = createStage([mem(1, 'a'), mem(2, 'b')]);
  s.reorder(1, 0);
  assert.equal(s.computeDiff().totalChanges, 0);
});

test('reorder: edited item that also moved = edited only (not counted as reordered)', () => {
  const s = createStage([mem(1, 'a'), mem(2, 'b'), mem(3, 'c')]);
  s.edit(2, 'b-modified');
  s.reorder(2, 0);
  const diff = s.computeDiff();
  // Item 2 was edited AND moved to front — it appears only in edited.
  assert.equal(diff.edited.length, 1);
  assert.ok(!diff.reordered.some(it => it.id === 2), 'edited item should not double-count as reordered');
  // Item 1 had no edit, but moving 2 past it shifted its rank among
  // surviving items (was 0 of [1,2,3], now 1 of [2,1,3]) — that IS a
  // reorder, semantically, because it's a user-driven position swap,
  // not a shift-due-to-deletion.
  assert.ok(diff.reordered.some(it => it.id === 1));
  assert.equal(diff.totalChanges, 2);
});

// ---- bulk operations ----

test('removeMany: deletes multiple baseline items', () => {
  const s = createStage([mem(1, 'a'), mem(2, 'b'), mem(3, 'c')]);
  s.removeMany([1, 3]);
  const diff = s.computeDiff();
  assert.equal(diff.deleted.length, 2);
  assert.equal(s.getStaged().length, 1);
  assert.equal(s.getStaged()[0].id, 2);
});

test('removeMany: ignores non-existent ids quietly', () => {
  const s = createStage([mem(1, 'a')]);
  s.removeMany([1, 999, 'phantom']);
  assert.equal(s.getStaged().length, 0);
});

test('promoteMany: promotes memories in batch', () => {
  const s = createStage([mem(1, 'a'), mem(2, 'b'), lore(3, 'l')]);
  s.promoteMany([1, 2]);
  const diff = s.computeDiff();
  assert.equal(diff.promoted.length, 2);
  assert.equal(s.getStagedByScope('lore').length, 3); // original lore + 2 promoted
});

test('demoteMany: demotes lore in batch', () => {
  const s = createStage([lore(1, 'a'), lore(2, 'b'), mem(3, 'm')]);
  s.demoteMany([1, 2]);
  const diff = s.computeDiff();
  assert.equal(diff.demoted.length, 2);
  assert.equal(s.getStagedByScope('memory').length, 3);
});

// ---- computeDiff: totalChanges accounting ----

test('totalChanges = added + deleted + edited + reordered (no double-count)', () => {
  const s = createStage([mem(1, 'a'), mem(2, 'b'), mem(3, 'c')]);
  s.edit(1, 'A');       // +1 edited
  s.remove(2);          // +1 deleted
  s.reorder(3, 0);      // +1 reordered (no edit on 3)
  s.add({ scope: 'lore', text: 'new' }); // +1 added
  const diff = s.computeDiff();
  assert.equal(diff.totalChanges, 4);
});

test('hasChanges: false on pristine stage', () => {
  const s = createStage([mem(1, 'a')]);
  assert.equal(s.hasChanges(), false);
});

test('hasChanges: true after any edit', () => {
  const s = createStage([mem(1, 'a')]);
  s.edit(1, 'b');
  assert.equal(s.hasChanges(), true);
});

// ---- discard ----

test('discard: reverts all changes to baseline', () => {
  const baseline = [mem(1, 'a'), mem(2, 'b'), lore(3, 'c')];
  const s = createStage(baseline);
  s.edit(1, 'modified');
  s.remove(2);
  s.add({ scope: 'memory', text: 'new' });
  s.promote(3); // wait, 3 is lore — this is a no-op
  s.discard();
  const staged = s.getStaged();
  assert.equal(staged.length, 3);
  assert.equal(s.hasChanges(), false);
});

test('discard: restores baseline order', () => {
  const s = createStage([mem(1, 'a'), mem(2, 'b'), mem(3, 'c')]);
  s.reorder(1, 2); // move first to last
  s.reorder(2, 0); // swap again
  s.discard();
  assert.deepEqual(s.getStaged().map(it => it.id), [1, 2, 3]);
});

// ---- passthrough fields preserved ----

test('passthrough: extra baseline fields survive edits', () => {
  const s = createStage([mem(1, 'original', { threadId: 42, summaryHash: 'abc123' })]);
  s.edit(1, 'modified');
  const staged = s.getStaged();
  assert.equal(staged[0].threadId, 42);
  assert.equal(staged[0].summaryHash, 'abc123');
});

test('passthrough: extra fields survive promote', () => {
  const s = createStage([mem(1, 'text', { characterId: 7, status: 'current' })]);
  s.promote(1);
  const staged = s.getStaged();
  assert.equal(staged[0].characterId, 7);
  assert.equal(staged[0].status, 'current');
  assert.equal(staged[0].scope, 'lore');
});

// ---- edge case: tmp ids ----

test('tmp ids: can be remove-targeted like real ids', () => {
  const s = createStage([]);
  const id1 = s.add({ scope: 'memory', text: 'a' });
  const id2 = s.add({ scope: 'memory', text: 'b' });
  s.remove(id1);
  const diff = s.computeDiff();
  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0].id, id2);
});

test('tmp ids: can be promoted before commit', () => {
  const s = createStage([]);
  const id = s.add({ scope: 'memory', text: 'new memory' });
  s.promote(id);
  const diff = s.computeDiff();
  // Promoting an already-added item: still just one add, but scope flipped
  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0].scope, 'lore');
  assert.equal(diff.promoted.length, 0, 'promoted is for baseline→scope-flipped, not fresh adds');
});

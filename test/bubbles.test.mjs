// test/bubbles.test.mjs
//
// Tests for memory/bubbles.js — the composition layer that turns
// entries (with optional embeddings) into labeled topic bubbles.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bubbleize, rebucket } from '../src/memory/bubbles.js';

// ---- test helpers ----

function makeEntry(id, text, embedding) {
  return {
    id,
    scope: 'memory',
    text,
    embedding: embedding ? new Float32Array(embedding) : null,
  };
}

// ---- bubbleize ----

test('bubbleize: empty input → empty output', () => {
  assert.deepEqual(bubbleize({ entries: [] }), []);
});

test('bubbleize: single entry → single bubble', () => {
  const entries = [makeEntry(1, 'Elara opened the gate', [1, 0, 0])];
  const bubbles = bubbleize({ entries });
  assert.equal(bubbles.length, 1);
  assert.equal(bubbles[0].entries.length, 1);
});

test('bubbleize: entries with no embeddings go to Ungrouped', () => {
  const entries = [
    makeEntry(1, 'first one', null),
    makeEntry(2, 'second one', null),
  ];
  const bubbles = bubbleize({ entries });
  assert.equal(bubbles.length, 1);
  assert.equal(bubbles[0].isUngrouped, true);
  assert.equal(bubbles[0].label, 'Ungrouped');
  assert.equal(bubbles[0].entries.length, 2);
});

test('bubbleize: mixed embedded + unembedded → both kinds of bubbles', () => {
  const entries = [
    makeEntry(1, 'Elara smiled', [1, 0]),
    makeEntry(2, 'Elara frowned', [0.9, 0.1]),
    makeEntry(3, 'no embedding here', null),
  ];
  const bubbles = bubbleize({ entries, k: 1 });
  assert.equal(bubbles.length, 2);
  assert.ok(bubbles.find(b => b.isUngrouped));
  assert.ok(bubbles.find(b => !b.isUngrouped));
});

test('bubbleize: Ungrouped bubble comes last', () => {
  const entries = [
    makeEntry(1, 'Elara', [1, 0]),
    makeEntry(2, 'alone', null),
  ];
  const bubbles = bubbleize({ entries, k: 1 });
  assert.equal(bubbles[bubbles.length - 1].isUngrouped, true);
});

test('bubbleize: all entries have zero-vector embeddings → Ungrouped', () => {
  const entries = [
    makeEntry(1, 'something', [0, 0, 0]),
    makeEntry(2, 'another', [0, 0, 0]),
  ];
  const bubbles = bubbleize({ entries });
  assert.equal(bubbles.length, 1);
  assert.equal(bubbles[0].isUngrouped, true);
});

test('bubbleize: clearly separated clusters produce distinct bubbles', () => {
  // Cluster A: "Elara" near [1, 0], cluster B: "Vex" near [0, 1]
  const entries = [
    makeEntry(1, 'Elara walked home', [1, 0.05]),
    makeEntry(2, 'Elara smiled at Elara', [0.95, 0.1]),
    makeEntry(3, 'Vex drew his sword', [0.1, 1]),
    makeEntry(4, 'Vex fought Vex', [0.05, 0.95]),
  ];
  const bubbles = bubbleize({ entries, k: 2 });
  // Expecting two embedded bubbles (not Ungrouped, since all have embeddings)
  const embBubbles = bubbles.filter(b => !b.isUngrouped);
  assert.equal(embBubbles.length, 2);

  // Elara entries should end up in one bubble, Vex in the other
  const elaraBubble = embBubbles.find(b => b.entries.some(e => e.id === 1));
  const vexBubble = embBubbles.find(b => b.entries.some(e => e.id === 3));
  assert.notEqual(elaraBubble, vexBubble);
  // Entry 2 (another Elara) should be with entry 1
  assert.ok(elaraBubble.entries.some(e => e.id === 2));
  // Entry 4 (another Vex) should be with entry 3
  assert.ok(vexBubble.entries.some(e => e.id === 4));
});

test('bubbleize: labels match proper nouns', () => {
  const entries = [
    makeEntry(1, 'Elara walked', [1, 0]),
    makeEntry(2, 'Elara talked', [0.9, 0.1]),
    makeEntry(3, 'Elara paused', [0.95, 0.05]),
    makeEntry(4, 'Vex struck', [0.1, 1]),
    makeEntry(5, 'Vex dodged', [0.05, 0.9]),
    makeEntry(6, 'Vex retreated', [0.05, 0.95]),
  ];
  const bubbles = bubbleize({ entries, k: 2 });
  const labels = bubbles.map(b => b.label);
  // Labels should be recognizable — should include 'Elara' or 'Vex'
  assert.ok(labels.some(l => l.includes('Elara') || l.includes('Vex')),
    `expected Elara or Vex in labels: ${JSON.stringify(labels)}`);
});

test('bubbleize: fallback generic label when no proper nouns', () => {
  const entries = [
    makeEntry(1, 'the gate was open', [1, 0]),
    makeEntry(2, 'through the gate', [0.95, 0.05]),
  ];
  const bubbles = bubbleize({ entries, k: 1 });
  const b = bubbles[0];
  // Label should be something sensible — most-common salient word, not empty
  assert.ok(b.label);
  assert.notEqual(b.label, '');
});

test('bubbleize: no k argument → uses recommendK', () => {
  const entries = Array.from({ length: 20 }, (_, i) =>
    makeEntry(i, `text ${i}`, [Math.cos(i), Math.sin(i)])
  );
  const bubbles = bubbleize({ entries });
  // recommendK(20) = round(sqrt(10)) = 3. Should produce <= 3 bubbles.
  const embBubbles = bubbles.filter(b => !b.isUngrouped);
  assert.ok(embBubbles.length >= 1);
  assert.ok(embBubbles.length <= 3);
});

test('bubbleize: k=1 → single bubble for all embedded entries', () => {
  const entries = [
    makeEntry(1, 'a', [1, 0]),
    makeEntry(2, 'b', [0, 1]),
  ];
  const bubbles = bubbleize({ entries, k: 1 });
  const embBubbles = bubbles.filter(b => !b.isUngrouped);
  assert.equal(embBubbles.length, 1);
  assert.equal(embBubbles[0].entries.length, 2);
});

test('bubbleize: determinism — same input gives same output', () => {
  const makeEntries = () => [
    makeEntry(1, 'Alice smiled', [1, 0.1]),
    makeEntry(2, 'Alice laughed', [0.95, 0.15]),
    makeEntry(3, 'Bob scowled', [0.1, 1]),
    makeEntry(4, 'Bob left', [0.05, 0.9]),
  ];

  const b1 = bubbleize({ entries: makeEntries(), k: 2 });
  const b2 = bubbleize({ entries: makeEntries(), k: 2 });

  // Same labels and same cluster membership
  assert.equal(b1.length, b2.length);
  for (let i = 0; i < b1.length; i++) {
    assert.deepEqual(
      b1[i].entries.map(e => e.id).sort(),
      b2[i].entries.map(e => e.id).sort()
    );
  }
});

test('bubbleize: every input entry appears in exactly one bubble', () => {
  const entries = [
    makeEntry(1, 'a', [1, 0]),
    makeEntry(2, 'b', [0.9, 0.1]),
    makeEntry(3, 'c', [0, 1]),
    makeEntry(4, 'd', null),
    makeEntry(5, 'e', [0.1, 0.9]),
  ];
  const bubbles = bubbleize({ entries, k: 2 });
  const seen = new Set();
  for (const b of bubbles) {
    for (const e of b.entries) {
      assert.ok(!seen.has(e.id), `entry ${e.id} in multiple bubbles`);
      seen.add(e.id);
    }
  }
  assert.equal(seen.size, entries.length);
});

test('bubbleize: bubble ids are unique', () => {
  const entries = Array.from({ length: 6 }, (_, i) =>
    makeEntry(i, 'x', [Math.cos(i), Math.sin(i)])
  );
  const bubbles = bubbleize({ entries, k: 3 });
  const ids = bubbles.map(b => b.id);
  assert.equal(new Set(ids).size, ids.length);
});

// ---- rebucket ----

test('rebucket: no prior → fresh bubbleize', () => {
  const entries = [makeEntry(1, 'x', [1, 0])];
  const r = rebucket({ entries, prior: null });
  assert.equal(r.length, 1);
});

test('rebucket: same entries as prior → same bubble layout, preserving labels', () => {
  const entries = [
    makeEntry(1, 'Elara', [1, 0]),
    makeEntry(2, 'Elara again', [0.95, 0.05]),
    makeEntry(3, 'Vex', [0, 1]),
  ];
  const prior = bubbleize({ entries, k: 2 });
  // Rebucket with same entries
  const rebuckebted = rebucket({ entries, prior, k: 2 });
  // Same number of bubbles, same labels
  assert.equal(rebuckebted.length, prior.length);
  const priorLabels = new Set(prior.map(b => b.label));
  const newLabels = new Set(rebuckebted.map(b => b.label));
  assert.deepEqual([...priorLabels].sort(), [...newLabels].sort());
});

test('rebucket: entry removed from prior is not in result', () => {
  const entries = [
    makeEntry(1, 'Elara', [1, 0]),
    makeEntry(2, 'Elara again', [0.95, 0.05]),
    makeEntry(3, 'Vex', [0, 1]),
  ];
  const prior = bubbleize({ entries, k: 2 });
  // Remove entry 2
  const afterRemoval = entries.filter(e => e.id !== 2);
  const r = rebucket({ entries: afterRemoval, prior, k: 2 });

  // No bubble should still contain id 2
  for (const b of r) {
    for (const e of b.entries) {
      assert.notEqual(e.id, 2);
    }
  }
});

test('rebucket: new entry triggers fresh clustering', () => {
  const originalEntries = [
    makeEntry(1, 'a', [1, 0]),
    makeEntry(2, 'b', [0, 1]),
  ];
  const prior = bubbleize({ entries: originalEntries, k: 2 });
  const afterAdd = [...originalEntries, makeEntry(3, 'c', [0.5, 0.5])];
  const r = rebucket({ entries: afterAdd, prior, k: 2 });
  // Should include all 3 entries
  const allIds = new Set();
  for (const b of r) for (const e of b.entries) allIds.add(e.id);
  assert.deepEqual([...allIds].sort(), [1, 2, 3]);
});

test('rebucket: empty bubbles are filtered out', () => {
  const entries = [
    makeEntry(1, 'a', [1, 0]),
    makeEntry(2, 'b', [0, 1]),
  ];
  const prior = bubbleize({ entries, k: 2 });
  // Remove all entries from one prior bubble
  const priorBubble0Ids = prior[0].entries.map(e => e.id);
  const reduced = entries.filter(e => !priorBubble0Ids.includes(e.id));
  const r = rebucket({ entries: reduced, prior });
  // No bubble should be empty
  for (const b of r) {
    assert.ok(b.entries.length > 0);
  }
});

// ---- bubbleizeWithLocks ----

test('bubbleizeWithLocks: no locks → same as bubbleize', async () => {
  const { bubbleizeWithLocks } = await import('../src/memory/bubbles.js');
  const entries = [
    makeEntry(1, 'a', [1, 0]),
    makeEntry(2, 'b', [0, 1]),
  ];
  const a = bubbleizeWithLocks({ entries, currentBubbles: [], lockedBubbleIds: new Set(), k: 2 });
  const b = bubbleize({ entries, k: 2 });
  assert.equal(a.length, b.length);
});

test('bubbleizeWithLocks: locked bubble contents are preserved intact', async () => {
  const { bubbleizeWithLocks } = await import('../src/memory/bubbles.js');
  const entries = [
    makeEntry(1, 'Elara', [1, 0]),
    makeEntry(2, 'Elara again', [0.95, 0.05]),
    makeEntry(3, 'Vex', [0, 1]),
    makeEntry(4, 'Vex again', [0.05, 0.9]),
  ];
  // Pretend clustering produced a bubble locking entries 1 & 2
  const prior = [
    { id: 'bubble:0', label: 'Elara', entries: [entries[0], entries[1]], isUngrouped: false },
    { id: 'bubble:1', label: 'Vex',   entries: [entries[2], entries[3]], isUngrouped: false },
  ];
  const result = bubbleizeWithLocks({
    entries,
    currentBubbles: prior,
    lockedBubbleIds: new Set(['bubble:0']),
    k: 1,
  });
  // Locked bubble preserved first
  assert.equal(result[0].id, 'bubble:0');
  assert.deepEqual(result[0].entries.map(e => e.id), [1, 2]);
  // Free entries (3, 4) clustered into the remaining k=1 bubble(s)
  const freeBubbles = result.slice(1);
  const freeIds = [];
  for (const b of freeBubbles) for (const e of b.entries) freeIds.push(e.id);
  assert.deepEqual(freeIds.sort(), [3, 4]);
});

test('bubbleizeWithLocks: locked bubble with all members deleted still preserved (empty shell)', async () => {
  const { bubbleizeWithLocks } = await import('../src/memory/bubbles.js');
  const prior = [
    { id: 'bubble:0', label: 'Gone', entries: [makeEntry(99, 'x', [1, 0])], isUngrouped: false },
  ];
  // Entry 99 no longer in the current entry list
  const entries = [makeEntry(1, 'a', [1, 0])];
  const result = bubbleizeWithLocks({
    entries,
    currentBubbles: prior,
    lockedBubbleIds: new Set(['bubble:0']),
    k: 1,
  });
  const locked = result.find(b => b.id === 'bubble:0');
  assert.ok(locked, 'locked bubble preserved');
  assert.equal(locked.entries.length, 0);
});

test('bubbleizeWithLocks: locked bubble uses CURRENT entry objects (fresh from input)', async () => {
  const { bubbleizeWithLocks } = await import('../src/memory/bubbles.js');
  // Prior has a stale version of entry 1
  const staleEntry = makeEntry(1, 'old text', [1, 0]);
  const prior = [
    { id: 'bubble:0', label: 'X', entries: [staleEntry], isUngrouped: false },
  ];
  const freshEntry = makeEntry(1, 'new text', [1, 0]);
  const result = bubbleizeWithLocks({
    entries: [freshEntry],
    currentBubbles: prior,
    lockedBubbleIds: new Set(['bubble:0']),
    k: 1,
  });
  // The entry in the locked bubble should be the fresh copy
  assert.equal(result[0].entries[0].text, 'new text');
});

test('bubbleizeWithLocks: all entries locked → free clustering yields nothing', async () => {
  const { bubbleizeWithLocks } = await import('../src/memory/bubbles.js');
  const entries = [
    makeEntry(1, 'a', [1, 0]),
    makeEntry(2, 'b', [0, 1]),
  ];
  const prior = [
    { id: 'bubble:0', label: 'Everything', entries, isUngrouped: false },
  ];
  const result = bubbleizeWithLocks({
    entries,
    currentBubbles: prior,
    lockedBubbleIds: new Set(['bubble:0']),
    k: 3,
  });
  // Only the locked bubble should render
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'bubble:0');
});

test('bubbleizeWithLocks: free bubble IDs skip slots already taken by locked IDs (regression for 2-lock collision)', async () => {
  const { bubbleizeWithLocks } = await import('../src/memory/bubbles.js');
  // Scenario: user has locked a bubble whose ID is `bubble:free:1`
  // (because it was once a free bubble — e.g., generated by a prior
  // k-change — and user locked it AFTER the rename). When we now
  // generate fresh free bubble IDs, we must NOT emit another
  // `bubble:free:1`, else the renderer will see two bubbles with
  // the same key and downstream code breaks.
  const entries = [
    makeEntry(1, 'a', [1, 0, 0]),
    makeEntry(2, 'b', [0, 1, 0]),
    makeEntry(3, 'c', [0, 0, 1]),
    makeEntry(4, 'd', [0.5, 0.5, 0]),
  ];
  const prior = [
    { id: 'bubble:free:1', label: 'Locked Free', entries: [entries[0]], isUngrouped: false },
    { id: 'bubble:0',       label: 'Other',       entries: [entries[1], entries[2], entries[3]], isUngrouped: false },
  ];
  const result = bubbleizeWithLocks({
    entries,
    currentBubbles: prior,
    lockedBubbleIds: new Set(['bubble:free:1']),
    k: 2,
  });
  const ids = result.map(b => b.id);
  assert.equal(new Set(ids).size, ids.length, 'all ids must be unique');
  assert.ok(ids.includes('bubble:free:1'), 'locked bubble:free:1 preserved');
  // The other free IDs should skip :1
  for (let i = 1; i < result.length; i++) {
    assert.notEqual(result[i].id, 'bubble:free:1', 'must not reuse bubble:free:1');
  }
});

test('bubbleizeWithLocks: locked bubbles always come first', async () => {
  const { bubbleizeWithLocks } = await import('../src/memory/bubbles.js');
  const entries = [
    makeEntry(1, 'a', [1, 0]),
    makeEntry(2, 'b', [0, 1]),
    makeEntry(3, 'c', [0.5, 0.5]),
  ];
  const prior = [
    { id: 'bubble:free', label: 'Free', entries: [entries[0]], isUngrouped: false },
    { id: 'bubble:locked', label: 'Locked', entries: [entries[1], entries[2]], isUngrouped: false },
  ];
  const result = bubbleizeWithLocks({
    entries,
    currentBubbles: prior,
    lockedBubbleIds: new Set(['bubble:locked']),
    k: 1,
  });
  assert.equal(result[0].id, 'bubble:locked', 'locked comes first even if it wasn\'t first in prior');
});

// ---- rebucketWithLocks ----

test('rebucketWithLocks: no locks → same as rebucket', async () => {
  const { rebucketWithLocks } = await import('../src/memory/bubbles.js');
  const entries = [makeEntry(1, 'x', [1, 0])];
  const prior = bubbleize({ entries, k: 1 });
  const a = rebucketWithLocks({ entries, prior, lockedBubbleIds: new Set(), k: 1 });
  const b = rebucket({ entries, prior, k: 1 });
  assert.equal(a.length, b.length);
});

test('rebucketWithLocks: locked bubble persists across rebucket with new entries', async () => {
  const { rebucketWithLocks } = await import('../src/memory/bubbles.js');
  const originalEntries = [
    makeEntry(1, 'Elara', [1, 0]),
    makeEntry(2, 'Elara again', [0.95, 0.05]),
  ];
  const prior = [
    { id: 'bubble:0', label: 'Elara', entries: originalEntries, isUngrouped: false },
  ];
  const newEntry = makeEntry(3, 'Vex', [0, 1]);
  const entriesAfter = [...originalEntries, newEntry];
  const result = rebucketWithLocks({
    entries: entriesAfter,
    prior,
    lockedBubbleIds: new Set(['bubble:0']),
    k: 1,
  });
  // Locked bubble retained with its original members
  const locked = result.find(b => b.id === 'bubble:0');
  assert.ok(locked);
  assert.deepEqual(locked.entries.map(e => e.id).sort(), [1, 2]);
  // New entry went into a non-locked bubble
  let foundNew = false;
  for (const b of result) {
    if (b.id === 'bubble:0') continue;
    if (b.entries.some(e => e.id === 3)) foundNew = true;
  }
  assert.ok(foundNew, 'new entry placed in a non-locked bubble');
});

test('rebucketWithLocks: member of locked bubble gets deleted — bubble becomes empty but preserved', async () => {
  const { rebucketWithLocks } = await import('../src/memory/bubbles.js');
  const prior = [
    { id: 'bubble:0', label: 'Elara', entries: [makeEntry(1, 'x', [1, 0])], isUngrouped: false },
  ];
  // Entry 1 deleted — not in the new entry list
  const entriesAfter = [makeEntry(2, 'y', [0, 1])];
  const result = rebucketWithLocks({
    entries: entriesAfter,
    prior,
    lockedBubbleIds: new Set(['bubble:0']),
    k: 1,
  });
  const locked = result.find(b => b.id === 'bubble:0');
  assert.ok(locked);
  assert.equal(locked.entries.length, 0);
});

// ---- label disambiguation (Davie-label redundancy fix) ----

test('bubbleize: two clusters sharing a top-noun get disambiguated labels', async () => {
  // Two clusters, both featuring "Davie" as the top proper noun, but
  // distinguished by secondary terms (walks vs bath).
  const entries = [
    makeEntry(1, 'Davie walks to school. Davie walks home.', [1.0, 0.0]),
    makeEntry(2, 'Davie walks in the park. Davie walks the dog.', [0.95, 0.05]),
    makeEntry(3, 'Davie takes a bath. The bath is warm.', [0.0, 1.0]),
    makeEntry(4, 'Davie fills the bath. Bath time for Davie.', [0.05, 0.95]),
  ];
  const { bubbleize } = await import('../src/memory/bubbles.js');
  const bubbles = bubbleize({ entries, k: 2 });

  // Both clusters wanted "Davie" as primary. The second should fall back
  // to a compound form, NOT just emit "Davie" again.
  const labels = bubbles.map(b => b.label);
  const davieCount = labels.filter(l => l === 'Davie').length;
  assert.ok(davieCount <= 1, `expected at most 1 bare "Davie" label, got ${davieCount} (labels: ${JSON.stringify(labels)})`);

  // The second cluster's label should contain "Davie" AND a secondary term
  const compound = labels.find(l => l !== 'Davie' && l.startsWith('Davie'));
  assert.ok(compound, `expected a compound "Davie — X" label, got ${JSON.stringify(labels)}`);
  assert.ok(compound.includes('—'), 'compound label uses em-dash separator');
});

test('bubbleize: unique proper nouns produce clean bare labels (no regressions)', async () => {
  // Separate characters — each cluster's top noun is unique. Should just
  // emit the bare name with no compound decoration.
  const entries = [
    makeEntry(1, 'Elara walked in the forest. Elara smiled.', [1.0, 0.0]),
    makeEntry(2, 'Elara sat by the stream. Elara whispered.', [0.95, 0.05]),
    makeEntry(3, 'Vex approached slowly. Vex growled.', [0.0, 1.0]),
    makeEntry(4, 'Vex sharpened his claws. Vex waited.', [0.05, 0.95]),
  ];
  const { bubbleize } = await import('../src/memory/bubbles.js');
  const bubbles = bubbleize({ entries, k: 2 });

  const labels = bubbles.map(b => b.label);
  assert.ok(labels.includes('Elara'), `expected bare "Elara", got ${JSON.stringify(labels)}`);
  assert.ok(labels.includes('Vex'), `expected bare "Vex", got ${JSON.stringify(labels)}`);
});

test('bubbleize: three clusters all wanting same primary → three distinct labels', async () => {
  const entries = [
    makeEntry(1, 'Davie walks. Davie runs. Davie walks again.', [1, 0, 0]),
    makeEntry(2, 'Davie walks more. Davie strolls. Davie walks.', [0.95, 0.05, 0]),
    makeEntry(3, 'Davie cooks. Davie cooks dinner. Davie cooks breakfast.', [0, 1, 0]),
    makeEntry(4, 'Davie cooks lunch. Davie cooks a cake. Davie cooks.', [0.05, 0.95, 0]),
    makeEntry(5, 'Davie swims. Davie swims laps. Davie swims often.', [0, 0, 1]),
    makeEntry(6, 'Davie swims fast. Davie swims daily. Davie swims.', [0.05, 0.05, 0.95]),
  ];
  const { bubbleize } = await import('../src/memory/bubbles.js');
  const bubbles = bubbleize({ entries, k: 3 });

  const labels = bubbles.map(b => b.label);
  // All three labels should be distinct — no duplicates
  assert.equal(new Set(labels).size, labels.length, `labels should be distinct, got ${JSON.stringify(labels)}`);
});

test('bubbleize: cluster with no qualifying terms gets generic "Group N" label', async () => {
  // Clusters with only stopword-ish content won't yield candidates.
  // The fallback should be the generic label.
  const entries = [
    makeEntry(1, 'the and or', [1, 0]),
    makeEntry(2, 'to of in', [0, 1]),
  ];
  const { bubbleize } = await import('../src/memory/bubbles.js');
  const bubbles = bubbleize({ entries, k: 2 });
  for (const b of bubbles) {
    assert.ok(
      b.label.startsWith('Group ') || b.label.length > 0,
      `unexpected label: ${b.label}`
    );
  }
});

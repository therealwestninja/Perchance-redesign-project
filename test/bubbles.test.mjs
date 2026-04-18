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

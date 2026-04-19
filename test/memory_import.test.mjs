// test/memory_import.test.mjs
//
// Focused tests on the import logic: JSON parsing, schema acceptance
// (v1 wrapped + bare arrays), dedup against existing stage, dedup
// within the incoming batch. The dialog chrome itself is DOM code
// exercised in Perchance integration; these tests cover the pure
// data-transform path.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// The import logic lives inline in window_open.js's onImport closure,
// so we can't import it directly without a DOM stub. To keep this
// isolated, we extract the logic into a self-contained function here
// that mirrors what the handler does. When the logic grows, it can
// move to a pure helper in src/memory/ and these tests will test
// that helper directly.

/**
 * @param {object} parsed       parsed JSON from the user's paste
 * @param {Array}  existingStage   current stage items (subset of shape { scope, text })
 * @returns {{ ok: boolean, memAdded?: number, loreAdded?: number, error?: string, additions?: Array<{scope, text}> }}
 */
function planImport(parsed, existingStage) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Imported data must be an object.' };
  }
  const sourceItems = [];
  if (Array.isArray(parsed.baseline))    sourceItems.push(...parsed.baseline);
  if (Array.isArray(parsed.stagedItems)) sourceItems.push(...parsed.stagedItems);
  if (sourceItems.length === 0) {
    return { ok: false, error: 'No memory or lore entries found in the imported data.' };
  }
  const existing = new Set(
    (existingStage || []).map(it => `${it.scope}|${(it.text || '').trim()}`)
  );
  let memAdded = 0, loreAdded = 0;
  const additions = [];
  for (const it of sourceItems) {
    if (!it || !it.text) continue;
    const scope = it.scope === 'lore' ? 'lore' : 'memory';
    const text = String(it.text).trim();
    if (!text) continue;
    const key = `${scope}|${text}`;
    if (existing.has(key)) continue;
    existing.add(key);
    additions.push({ scope, text });
    if (scope === 'lore') loreAdded++; else memAdded++;
  }
  if (memAdded === 0 && loreAdded === 0) {
    return { ok: false, error: 'Nothing new to import — all entries already in stage.' };
  }
  return { ok: true, memAdded, loreAdded, additions };
}

test('import: rejects non-object input', () => {
  assert.equal(planImport('string', []).ok, false);
  assert.equal(planImport([1, 2, 3], []).ok, false);
  assert.equal(planImport(null, []).ok, false);
  assert.equal(planImport(42, []).ok, false);
});

test('import: rejects object without any entries', () => {
  const r = planImport({ schema: 1, exportedAt: '2026-04-18', threadLabel: 'X' }, []);
  assert.equal(r.ok, false);
  assert.match(r.error, /no memory or lore entries/i);
});

test('import: reads baseline array', () => {
  const r = planImport({
    baseline: [
      { scope: 'memory', text: 'Alice likes cats' },
      { scope: 'lore', text: 'Alice is 30 years old' },
    ],
  }, []);
  assert.equal(r.ok, true);
  assert.equal(r.memAdded, 1);
  assert.equal(r.loreAdded, 1);
});

test('import: reads stagedItems array', () => {
  const r = planImport({
    stagedItems: [
      { scope: 'memory', text: 'Note 1' },
      { scope: 'memory', text: 'Note 2' },
    ],
  }, []);
  assert.equal(r.ok, true);
  assert.equal(r.memAdded, 2);
  assert.equal(r.loreAdded, 0);
});

test('import: merges baseline + stagedItems', () => {
  const r = planImport({
    baseline:    [{ scope: 'memory', text: 'A' }],
    stagedItems: [{ scope: 'memory', text: 'B' }],
  }, []);
  assert.equal(r.ok, true);
  assert.equal(r.memAdded, 2);
});

test('import: dedup within incoming batch', () => {
  const r = planImport({
    baseline:    [{ scope: 'memory', text: 'Shared' }],
    stagedItems: [{ scope: 'memory', text: 'Shared' }],
  }, []);
  assert.equal(r.ok, true);
  assert.equal(r.memAdded, 1, 'duplicate within batch folded');
});

test('import: dedup against existing stage', () => {
  const existing = [
    { scope: 'memory', text: 'Already here' },
    { scope: 'lore', text: 'Lore line' },
  ];
  const r = planImport({
    baseline: [
      { scope: 'memory', text: 'Already here' },
      { scope: 'memory', text: 'New one' },
    ],
  }, existing);
  assert.equal(r.ok, true);
  assert.equal(r.memAdded, 1);
});

test('import: scope defaulted to memory if malformed', () => {
  const r = planImport({
    baseline: [
      { scope: 'banana', text: 'Should default to memory' },
      { text: 'No scope field' },
    ],
  }, []);
  assert.equal(r.ok, true);
  assert.equal(r.memAdded, 2);
  assert.equal(r.loreAdded, 0);
});

test('import: empty/whitespace text ignored', () => {
  const r = planImport({
    baseline: [
      { scope: 'memory', text: '' },
      { scope: 'memory', text: '   ' },
      { scope: 'memory' }, // no text at all
      { scope: 'memory', text: 'Real' },
    ],
  }, []);
  assert.equal(r.ok, true);
  assert.equal(r.memAdded, 1);
});

test('import: all entries already present reports no-op', () => {
  const existing = [{ scope: 'memory', text: 'A' }, { scope: 'memory', text: 'B' }];
  const r = planImport({
    baseline: [{ scope: 'memory', text: 'A' }, { scope: 'memory', text: 'B' }],
  }, existing);
  assert.equal(r.ok, false);
  assert.match(r.error, /nothing new/i);
});

test('import: trim applied when comparing against existing stage', () => {
  const existing = [{ scope: 'memory', text: 'Trimmed' }];
  const r = planImport({
    baseline: [{ scope: 'memory', text: '  Trimmed  ' }],
  }, existing);
  assert.equal(r.ok, false, 'whitespace-only difference is a duplicate');
});

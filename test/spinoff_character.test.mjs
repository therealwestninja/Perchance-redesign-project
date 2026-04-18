// test/spinoff_character.test.mjs
//
// Tests for the character-spinoff backfill helper. The creation path
// itself is DOM-driven (opens a dialog, hits window.db); we test the
// pure helper that heals broken-shape records from earlier builds.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Minimal window.db mock that mimics Dexie's toArray/update surface.
function makeFakeDb(initialRows) {
  const rows = new Map(initialRows.map(r => [r.id, { ...r }]));
  return {
    characters: {
      toArray: async () => [...rows.values()].map(r => ({ ...r })),
      update: async (id, patch) => {
        if (!rows.has(id)) return 0;
        rows.set(id, { ...rows.get(id), ...patch });
        return 1;
      },
      // Expose for test inspection
      _rows: rows,
    },
  };
}

const { backfillSpawnedCharacterFields } = await import('../src/memory/spinoff_character.js');

beforeEach(() => {
  delete globalThis.window;
});

test('backfill: skips characters without pfSpawnedFrom marker', async () => {
  const db = makeFakeDb([
    { id: 1, name: 'Regular', folderPath: undefined }, // missing field, but NOT ours
  ]);
  globalThis.window = { db };
  await backfillSpawnedCharacterFields();
  const after = db.characters._rows.get(1);
  assert.equal(after.folderPath, undefined, 'non-spawned character left alone');
});

test('backfill: heals missing folderPath on spawned characters', async () => {
  const db = makeFakeDb([
    {
      id: 1,
      name: 'Broken Spawn',
      pfSpawnedFrom: { sourceLabel: 'x', entryCount: 3, createdAt: '2026-04-18' },
      // All other fields undefined
    },
  ]);
  globalThis.window = { db };
  await backfillSpawnedCharacterFields();
  const after = db.characters._rows.get(1);
  assert.equal(after.folderPath, '', 'folderPath backfilled');
  assert.equal(after.uuid, null, 'uuid backfilled');
  assert.deepEqual(after.customData, {}, 'customData backfilled');
  assert.deepEqual(after.userCharacter, {}, 'userCharacter backfilled');
  assert.deepEqual(after.systemCharacter, { avatar: {} }, 'systemCharacter backfilled');
  assert.deepEqual(after.scene, { background: {}, music: {} }, 'scene backfilled');
  assert.equal(after.streamingResponse, true);
  assert.equal(after.roleInstruction, '');
  assert.equal(after.autoGenerateMemories, 'none');
  assert.equal(after.maxTokensPerMessage, null);
});

test('backfill: preserves existing field values', async () => {
  const db = makeFakeDb([
    {
      id: 1,
      name: 'Partial Spawn',
      pfSpawnedFrom: { sourceLabel: 'x', entryCount: 3, createdAt: '2026-04-18' },
      folderPath: 'my/custom/path',  // already set
      roleInstruction: 'Already has one',
      // others missing
    },
  ]);
  globalThis.window = { db };
  await backfillSpawnedCharacterFields();
  const after = db.characters._rows.get(1);
  assert.equal(after.folderPath, 'my/custom/path', 'existing folderPath preserved');
  assert.equal(after.roleInstruction, 'Already has one', 'existing roleInstruction preserved');
  assert.equal(after.uuid, null, 'missing uuid backfilled');
});

test('backfill: idempotent — second run is a no-op', async () => {
  const db = makeFakeDb([
    {
      id: 1,
      name: 'Broken Spawn',
      pfSpawnedFrom: { sourceLabel: 'x', entryCount: 1, createdAt: '2026-04-18' },
    },
  ]);
  globalThis.window = { db };
  await backfillSpawnedCharacterFields();
  const afterFirst = { ...db.characters._rows.get(1) };
  await backfillSpawnedCharacterFields();
  const afterSecond = db.characters._rows.get(1);
  assert.deepEqual(afterSecond, afterFirst, 'second run produces same state');
});

test('backfill: handles no window.db gracefully', async () => {
  globalThis.window = {};
  // Should not throw
  await backfillSpawnedCharacterFields();
});

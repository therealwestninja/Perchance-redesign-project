// test/memory_db.test.mjs
//
// Tests for the Dexie adapter. Since we can't run actual Dexie in Node,
// we mock window.db with an in-memory surface that implements just enough
// of the Dexie Table interface: where(index).equals(val).toArray(),
// .get(id), .add(), .put(), .update(), .delete(), .last(), and a
// transaction() shim.
//
// The goal isn't to test Dexie — it's to verify our read/write logic
// correctly navigates the memoriesEndingHere nested structure, handles
// scope-flips (promote/demote), and reports stats accurately.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---- Mock Dexie surface ----

function createMockDb(initialState = {}) {
  const state = {
    threads: [{
      id: 100,
      loreBookId: 200,
      textEmbeddingModelName: 'default',
    }],
    messages: [],
    lore: [],
    ...initialState,
  };

  let nextLoreId = Math.max(0, ...state.lore.map(r => r.id || 0)) + 1;

  function makeTable(rows, { autoId = true } = {}) {
    return {
      rows, // direct access for test inspection
      where(indexName) {
        return {
          equals(val) {
            const results = rows.filter(r => {
              // Simplified: handle both literal field matches and object-form where() calls
              return r && r[indexName] === val;
            });
            return {
              toArray: async () => results,
              last: async () => results[results.length - 1] ?? null,
              count: async () => results.length,
              delete: async () => {
                for (const r of results) {
                  const idx = rows.indexOf(r);
                  if (idx >= 0) rows.splice(idx, 1);
                }
                return results.length;
              },
            };
          },
        };
      },
      get: async (id) => rows.find(r => r && r.id === id) ?? null,
      add: async (row) => {
        const next = autoId ? { ...row, id: nextLoreId++ } : { ...row };
        rows.push(next);
        return next.id;
      },
      put: async (row) => {
        const idx = rows.findIndex(r => r && r.id === row.id);
        if (idx >= 0) rows[idx] = { ...row };
        else rows.push({ ...row });
        return row.id;
      },
      update: async (id, changes) => {
        const row = rows.find(r => r && r.id === id);
        if (row) Object.assign(row, changes);
      },
      delete: async (id) => {
        const idx = rows.findIndex(r => r && r.id === id);
        if (idx >= 0) rows.splice(idx, 1);
      },
      toArray: async () => [...rows],
    };
  }

  return {
    threads: {
      get: async (id) => state.threads.find(t => t.id === id) ?? null,
      toArray: async () => [...state.threads],
    },
    messages: makeTable(state.messages, { autoId: false }),
    lore: makeTable(state.lore, { autoId: true }),
    transaction: async (_mode, ..._tablesAndFn) => {
      // Last arg is the function
      const fn = _tablesAndFn[_tablesAndFn.length - 1];
      // Naive transaction: just run the function. No rollback on error.
      // For our tests this is fine because we're verifying logic, not
      // rollback semantics. Real Dexie gives atomicity; we trust it.
      return await fn();
    },
    _state: state, // for test inspection
  };
}

// ---- install + uninstall mocks in global ----

function installMockWindow({ db, activeThreadId = 100, embedderAvailable = false, embedFn } = {}) {
  globalThis.window = {
    db,
    activeThreadId,
  };
  if (embedderAvailable) {
    globalThis.window.textEmbedderFunction = async () => {};
    globalThis.window.embedTexts = embedFn || (async ({ textArr }) => textArr.map(t => `EMB[${t}]`));
  }
}

function resetWindow() {
  delete globalThis.window;
}

// ---- import module under test (fresh each test so window-capture is re-read) ----

async function loadDbModule() {
  // Avoid ESM caching by using a cache-busting query string trick would require
  // fs writes; simpler to just rely on the module's runtime window lookups,
  // which don't cache. The module reads window.db inside each call.
  const mod = await import('../src/memory/db.js');
  return mod;
}

beforeEach(() => {
  resetWindow();
});

// ---- probeSchema ----

test('probeSchema: fails gracefully when window.db missing', async () => {
  resetWindow();
  globalThis.window = {};
  const { probeSchema } = await loadDbModule();
  const result = probeSchema();
  assert.equal(result.ok, false);
  assert.match(result.reason, /window\.db not available/);
});

test('probeSchema: fails when a required table is missing', async () => {
  installMockWindow({ db: { /* no tables */ } });
  const { probeSchema } = await loadDbModule();
  const result = probeSchema();
  assert.equal(result.ok, false);
});

test('probeSchema: ok when all required tables present', async () => {
  installMockWindow({ db: createMockDb() });
  const { probeSchema } = await loadDbModule();
  assert.deepEqual(probeSchema(), { ok: true });
});

// ---- loadBaseline ----

test('loadBaseline: returns empty when no active thread', async () => {
  installMockWindow({ db: createMockDb(), activeThreadId: null });
  const { loadBaseline } = await loadDbModule();
  const items = await loadBaseline();
  assert.deepEqual(items, []);
});

test('loadBaseline: returns empty for a thread with no messages and no lore', async () => {
  installMockWindow({ db: createMockDb() });
  const { loadBaseline } = await loadDbModule();
  const items = await loadBaseline();
  assert.deepEqual(items, []);
});

test('loadBaseline: flattens memoriesEndingHere across messages', async () => {
  const db = createMockDb({
    messages: [
      {
        id: 1, threadId: 100,
        memoriesEndingHere: { '1': [{ text: 'first memory', embedding: [0.1] }] },
      },
      {
        id: 2, threadId: 100,
        memoriesEndingHere: { '1': [{ text: 'second', embedding: null }, { text: 'third' }] },
      },
      {
        id: 3, threadId: 100,
        memoriesEndingHere: null, // messages with no memories skipped
      },
    ],
  });
  installMockWindow({ db });
  const { loadBaseline } = await loadDbModule();
  const items = await loadBaseline();
  const memoryItems = items.filter(i => i.scope === 'memory');
  assert.equal(memoryItems.length, 3);
  assert.deepEqual(memoryItems.map(i => i.text), ['first memory', 'second', 'third']);
  // Composite IDs carry message+level+index
  assert.equal(memoryItems[0].id, '1|1|0');
  assert.equal(memoryItems[1].id, '2|1|0');
  assert.equal(memoryItems[2].id, '2|1|1');
});

test('loadBaseline: skips null memory slots (tombstones from prior deletes)', async () => {
  const db = createMockDb({
    messages: [{
      id: 1, threadId: 100,
      memoriesEndingHere: { '1': [{ text: 'kept' }, null, { text: 'also kept' }] },
    }],
  });
  installMockWindow({ db });
  const { loadBaseline } = await loadDbModule();
  const items = await loadBaseline();
  const memoryItems = items.filter(i => i.scope === 'memory');
  assert.equal(memoryItems.length, 2);
  assert.deepEqual(memoryItems.map(i => i.text), ['kept', 'also kept']);
  // The IDs preserve the original indices around the tombstone
  assert.equal(memoryItems[0].id, '1|1|0');
  assert.equal(memoryItems[1].id, '1|1|2');
});

test('loadBaseline: reads lore entries for the thread\'s loreBookId', async () => {
  const db = createMockDb({
    lore: [
      { id: 500, bookId: 200, text: 'the realm is ancient', triggers: [] },
      { id: 501, bookId: 200, text: 'magic is rare', triggers: ['magic'] },
      { id: 502, bookId: 999, text: 'different book — should be ignored', triggers: [] },
    ],
  });
  installMockWindow({ db });
  const { loadBaseline } = await loadDbModule();
  const items = await loadBaseline();
  const loreItems = items.filter(i => i.scope === 'lore');
  assert.equal(loreItems.length, 2);
  assert.deepEqual(loreItems.map(i => i.text), ['the realm is ancient', 'magic is rare']);
});

test('loadBaseline: passthrough fields preserved for both scopes', async () => {
  const db = createMockDb({
    messages: [{
      id: 7, threadId: 100,
      memoriesEndingHere: { '1': [{ text: 'm', embedding: [0.5, 0.6] }] },
    }],
    lore: [{ id: 500, bookId: 200, text: 'l', triggers: ['kw'] }],
  });
  installMockWindow({ db });
  const { loadBaseline } = await loadDbModule();
  const items = await loadBaseline();
  const mem = items.find(i => i.scope === 'memory');
  const lore = items.find(i => i.scope === 'lore');
  assert.equal(mem.__messageId, 7);
  assert.equal(mem.__level, '1');
  assert.equal(mem.__indexInLevel, 0);
  assert.deepEqual(mem.__embedding, [0.5, 0.6]);
  assert.ok(lore.__loreRow);
  assert.deepEqual(lore.__loreRow.triggers, ['kw']);
});

// ---- commitDiff ----

test('commitDiff: deleting a memory nulls the slot (preserves indices)', async () => {
  const db = createMockDb({
    messages: [{
      id: 1, threadId: 100,
      memoriesEndingHere: { '1': [{ text: 'a' }, { text: 'b' }] },
    }],
  });
  installMockWindow({ db });
  const { loadBaseline, commitDiff } = await loadDbModule();

  const baseline = await loadBaseline();
  const diff = {
    added: [], edited: [], promoted: [], demoted: [], reordered: [],
    deleted: [baseline[0]], // delete "a"
    totalChanges: 1,
  };
  const result = await commitDiff({ baselineItems: baseline, diff });
  assert.equal(result.ok, true);
  assert.equal(result.stats.deletedMemory, 1);
  // Check mock db state
  const m = db._state.messages[0];
  assert.equal(m.memoriesEndingHere['1'][0], null, 'slot tombstoned');
  assert.equal(m.memoriesEndingHere['1'][1].text, 'b', 'other entries untouched');
});

test('commitDiff: deleting a lore entry removes the row', async () => {
  const db = createMockDb({
    lore: [{ id: 500, bookId: 200, text: 'l', triggers: [] }],
  });
  installMockWindow({ db });
  const { loadBaseline, commitDiff } = await loadDbModule();

  const baseline = await loadBaseline();
  const diff = {
    added: [], edited: [], promoted: [], demoted: [], reordered: [],
    deleted: [baseline[0]],
    totalChanges: 1,
  };
  const result = await commitDiff({ baselineItems: baseline, diff });
  assert.equal(result.ok, true);
  assert.equal(result.stats.deletedLore, 1);
  assert.equal(db._state.lore.length, 0);
});

test('commitDiff: editing memory text rewrites the slot (without embedder)', async () => {
  const db = createMockDb({
    messages: [{
      id: 1, threadId: 100,
      memoriesEndingHere: { '1': [{ text: 'original', embedding: null }] },
    }],
  });
  installMockWindow({ db }); // no embedder
  const { loadBaseline, commitDiff } = await loadDbModule();

  const baseline = await loadBaseline();
  const edited = { ...baseline[0], text: 'edited' };
  const diff = {
    added: [], deleted: [], promoted: [], demoted: [], reordered: [],
    edited: [edited],
    totalChanges: 1,
  };
  const result = await commitDiff({ baselineItems: baseline, diff });
  assert.equal(result.ok, true);
  assert.equal(result.stats.editedMemoryText, 1);
  const slot = db._state.messages[0].memoriesEndingHere['1'][0];
  assert.equal(slot.text, 'edited');
  assert.equal(slot.embedding, null, 'embedding null without embedder');
});

test('commitDiff: editing memory text computes embedding WHEN embedder loaded', async () => {
  const db = createMockDb({
    messages: [{
      id: 1, threadId: 100,
      memoriesEndingHere: { '1': [{ text: 'original', embedding: null }] },
    }],
  });
  installMockWindow({ db, embedderAvailable: true });
  const { loadBaseline, commitDiff } = await loadDbModule();

  const baseline = await loadBaseline();
  const edited = { ...baseline[0], text: 'edited text' };
  const diff = {
    added: [], deleted: [], promoted: [], demoted: [], reordered: [],
    edited: [edited],
    totalChanges: 1,
  };
  const result = await commitDiff({ baselineItems: baseline, diff });
  assert.equal(result.ok, true);
  const slot = db._state.messages[0].memoriesEndingHere['1'][0];
  assert.equal(slot.text, 'edited text');
  assert.equal(slot.embedding, 'EMB[edited text]');
});

test('commitDiff: editing lore text rewrites the row, preserving triggers', async () => {
  const db = createMockDb({
    lore: [{ id: 500, bookId: 200, text: 'before', triggers: ['kw'] }],
  });
  installMockWindow({ db });
  const { loadBaseline, commitDiff } = await loadDbModule();

  const baseline = await loadBaseline();
  const edited = { ...baseline[0], text: 'after' };
  const diff = {
    added: [], deleted: [], promoted: [], demoted: [], reordered: [],
    edited: [edited],
    totalChanges: 1,
  };
  const result = await commitDiff({ baselineItems: baseline, diff });
  assert.equal(result.ok, true);
  assert.equal(result.stats.editedLoreText, 1);
  const row = db._state.lore[0];
  assert.equal(row.text, 'after');
  assert.deepEqual(row.triggers, ['kw'], 'triggers preserved');
  assert.equal(row.bookId, 200, 'bookId preserved');
});

test('commitDiff: promote (memory → lore) deletes slot and adds lore entry', async () => {
  const db = createMockDb({
    messages: [{
      id: 1, threadId: 100,
      memoriesEndingHere: { '1': [{ text: 'promote me' }] },
    }],
  });
  installMockWindow({ db });
  const { loadBaseline, commitDiff } = await loadDbModule();

  const baseline = await loadBaseline();
  const promoted = { ...baseline[0], scope: 'lore' };
  const diff = {
    added: [], deleted: [], demoted: [], reordered: [],
    edited: [promoted],
    promoted: [promoted],
    totalChanges: 1,
  };
  const result = await commitDiff({ baselineItems: baseline, diff });
  assert.equal(result.ok, true);
  assert.equal(result.stats.promoted, 1);
  // Memory slot tombstoned
  assert.equal(db._state.messages[0].memoriesEndingHere['1'][0], null);
  // Lore entry created
  assert.equal(db._state.lore.length, 1);
  assert.equal(db._state.lore[0].text, 'promote me');
  assert.equal(db._state.lore[0].bookId, 200);
});

test('commitDiff: demote (lore → memory) deletes row and attaches to last message', async () => {
  const db = createMockDb({
    messages: [
      { id: 1, threadId: 100, memoriesEndingHere: {} },
      { id: 2, threadId: 100, memoriesEndingHere: {} },
    ],
    lore: [{ id: 500, bookId: 200, text: 'demote me', triggers: [] }],
  });
  installMockWindow({ db });
  const { loadBaseline, commitDiff } = await loadDbModule();

  const baseline = await loadBaseline();
  const demoted = { ...baseline[0], scope: 'memory' };
  const diff = {
    added: [], deleted: [], promoted: [], reordered: [],
    edited: [demoted],
    demoted: [demoted],
    totalChanges: 1,
  };
  const result = await commitDiff({ baselineItems: baseline, diff });
  assert.equal(result.ok, true);
  assert.equal(result.stats.demoted, 1);
  // Lore row deleted
  assert.equal(db._state.lore.length, 0);
  // Memory added to last message (id:2)
  assert.equal(db._state.messages[1].memoriesEndingHere['1'].length, 1);
  assert.equal(db._state.messages[1].memoriesEndingHere['1'][0].text, 'demote me');
});

test('commitDiff: adding a fresh lore entry', async () => {
  const db = createMockDb();
  installMockWindow({ db });
  const { commitDiff } = await loadDbModule();

  const diff = {
    deleted: [], edited: [], promoted: [], demoted: [], reordered: [],
    added: [{ id: 'tmp:1', scope: 'lore', text: 'brand new' }],
    totalChanges: 1,
  };
  const result = await commitDiff({ baselineItems: [], diff });
  assert.equal(result.ok, true);
  assert.equal(result.stats.addedLore, 1);
  assert.equal(db._state.lore[0].text, 'brand new');
  assert.equal(db._state.lore[0].bookId, 200);
});

test('commitDiff: adding a fresh memory attaches to last message', async () => {
  const db = createMockDb({
    messages: [
      { id: 1, threadId: 100, memoriesEndingHere: {} },
      { id: 2, threadId: 100, memoriesEndingHere: {} },
    ],
  });
  installMockWindow({ db });
  const { commitDiff } = await loadDbModule();

  const diff = {
    deleted: [], edited: [], promoted: [], demoted: [], reordered: [],
    added: [{ id: 'tmp:1', scope: 'memory', text: 'new memory' }],
    totalChanges: 1,
  };
  const result = await commitDiff({ baselineItems: [], diff });
  assert.equal(result.ok, true);
  assert.equal(result.stats.addedMemory, 1);
  // Attached to last message
  assert.equal(db._state.messages[1].memoriesEndingHere['1'].length, 1);
  assert.equal(db._state.messages[1].memoriesEndingHere['1'][0].text, 'new memory');
});

test('commitDiff: skips memory add when thread has zero messages', async () => {
  const db = createMockDb({ messages: [] });
  installMockWindow({ db });
  const { commitDiff } = await loadDbModule();

  const diff = {
    deleted: [], edited: [], promoted: [], demoted: [], reordered: [],
    added: [{ id: 'tmp:1', scope: 'memory', text: 'orphan' }],
    totalChanges: 1,
  };
  const result = await commitDiff({ baselineItems: [], diff });
  // Returns ok even though addedMemory is 0 — UI can show "1 not added" from diff.added vs stats.addedMemory
  assert.equal(result.ok, true);
  assert.equal(result.stats.addedMemory, 0);
});

test('commitDiff: memory reorders counted but skipped (no cross-message rewrite)', async () => {
  const db = createMockDb({
    messages: [{
      id: 1, threadId: 100,
      memoriesEndingHere: { '1': [{ text: 'a' }, { text: 'b' }] },
    }],
  });
  installMockWindow({ db });
  const { loadBaseline, commitDiff } = await loadDbModule();

  const baseline = await loadBaseline();
  const diff = {
    added: [], deleted: [], edited: [], promoted: [], demoted: [],
    reordered: baseline, // all reordered
    totalChanges: baseline.length,
  };
  const result = await commitDiff({ baselineItems: baseline, diff });
  assert.equal(result.ok, true);
  assert.equal(result.stats.skippedMemoryReorder, baseline.length);
});

test('commitDiff: fails cleanly with no active thread', async () => {
  installMockWindow({ db: createMockDb(), activeThreadId: null });
  const { commitDiff } = await loadDbModule();
  const diff = { added: [], deleted: [], edited: [], promoted: [], demoted: [], reordered: [], totalChanges: 0 };
  const result = await commitDiff({ baselineItems: [], diff });
  assert.equal(result.ok, false);
  assert.match(result.error, /no active thread/);
});

test('commitDiff: fails cleanly when db.threads.get returns null', async () => {
  const db = createMockDb();
  db.threads.get = async () => null;
  installMockWindow({ db });
  const { commitDiff } = await loadDbModule();
  const diff = { added: [], deleted: [], edited: [], promoted: [], demoted: [], reordered: [], totalChanges: 0 };
  const result = await commitDiff({ baselineItems: [], diff });
  assert.equal(result.ok, false);
});

// ---- formatDiffSummary ----

test('formatDiffSummary: zero changes', async () => {
  const { formatDiffSummary } = await loadDbModule();
  const r = formatDiffSummary({ totalChanges: 0, added: [], deleted: [], edited: [], promoted: [], demoted: [], reordered: [] });
  assert.match(r, /No changes/i);
});

test('formatDiffSummary: single change', async () => {
  const { formatDiffSummary } = await loadDbModule();
  const r = formatDiffSummary({
    totalChanges: 1,
    added: [], promoted: [], demoted: [], reordered: [],
    deleted: [{ scope: 'memory' }],
    edited: [],
  });
  assert.match(r, /1 memory deletion/);
  assert.match(r, /Continue/);
});

test('formatDiffSummary: promote is distinct from pure edit', async () => {
  const { formatDiffSummary } = await loadDbModule();
  const promoteItem = { id: 5, scope: 'lore' };
  const r = formatDiffSummary({
    totalChanges: 1,
    added: [], deleted: [], demoted: [], reordered: [],
    edited: [promoteItem],
    promoted: [promoteItem],
  });
  assert.match(r, /promote/i);
  // Should NOT say "edit" on top of "promote" — the scope change IS the edit
  assert.doesNotMatch(r, /\d+ edit/);
});

test('formatDiffSummary: multiple changes joined cleanly', async () => {
  const { formatDiffSummary } = await loadDbModule();
  const r = formatDiffSummary({
    totalChanges: 3,
    added: [{ scope: 'lore' }, { scope: 'memory' }],
    deleted: [{ scope: 'memory' }],
    edited: [], promoted: [], demoted: [], reordered: [],
  });
  // Three non-zero categories: added-memory, added-lore, deleted-memory
  assert.match(r, /new memory/);
  assert.match(r, /new lore/);
  assert.match(r, /memory deletion/);
});

// ---- loadUsageHistogram ----

test('loadUsageHistogram: returns empty maps when window.db missing', async () => {
  resetWindow();
  globalThis.window = {};
  const { loadUsageHistogram } = await loadDbModule();
  const r = await loadUsageHistogram();
  assert.equal(r.memoryCounts.size, 0);
  assert.equal(r.loreCounts.size, 0);
  assert.equal(r.messagesScanned, 0);
});

test('loadUsageHistogram: counts composite-id memories across messages', async () => {
  resetWindow();
  const db = createMockDb({
    messages: [
      {
        id: 1, threadId: 100,
        memoryIdBatchesUsed: [['1|1|0', '1|1|1']],
        loreIdsUsed: [],
      },
      {
        id: 2, threadId: 100,
        memoryIdBatchesUsed: [['1|1|0'], ['3|1|0']],
        loreIdsUsed: [],
      },
    ],
  });
  installMockWindow({ db, activeThreadId: 100 });
  const { loadUsageHistogram } = await loadDbModule();
  const r = await loadUsageHistogram({ threadId: 100, lastN: 10 });
  assert.equal(r.memoryCounts.get('1|1|0'), 2);
  assert.equal(r.memoryCounts.get('1|1|1'), 1);
  assert.equal(r.memoryCounts.get('3|1|0'), 1);
  assert.equal(r.messagesScanned, 2);
});

test('loadUsageHistogram: counts lore ids', async () => {
  resetWindow();
  const db = createMockDb({
    messages: [
      { id: 1, threadId: 100, memoryIdBatchesUsed: [], loreIdsUsed: [42, 43] },
      { id: 2, threadId: 100, memoryIdBatchesUsed: [], loreIdsUsed: [42, 44] },
    ],
  });
  installMockWindow({ db, activeThreadId: 100 });
  const { loadUsageHistogram } = await loadDbModule();
  const r = await loadUsageHistogram({ threadId: 100 });
  assert.equal(r.loreCounts.get(42), 2);
  assert.equal(r.loreCounts.get(43), 1);
  assert.equal(r.loreCounts.get(44), 1);
});

test('loadUsageHistogram: ignores old-model numeric memory ids', async () => {
  // Old storage format used numeric IDs pointing into db.memories. Our tool
  // doesn't read db.memories, so these should be silently dropped.
  resetWindow();
  const db = createMockDb({
    messages: [
      { id: 1, threadId: 100, memoryIdBatchesUsed: [[99, 100, 101]], loreIdsUsed: [] },
    ],
  });
  installMockWindow({ db, activeThreadId: 100 });
  const { loadUsageHistogram } = await loadDbModule();
  const r = await loadUsageHistogram({ threadId: 100 });
  assert.equal(r.memoryCounts.size, 0);
});

test('loadUsageHistogram: respects lastN window', async () => {
  resetWindow();
  const messages = [];
  for (let i = 1; i <= 20; i++) {
    messages.push({
      id: i, threadId: 100,
      memoryIdBatchesUsed: [[`${i}|1|0`]],
      loreIdsUsed: [],
    });
  }
  const db = createMockDb({ messages });
  installMockWindow({ db, activeThreadId: 100 });
  const { loadUsageHistogram } = await loadDbModule();
  const r = await loadUsageHistogram({ threadId: 100, lastN: 5 });
  assert.equal(r.messagesScanned, 5);
  assert.ok(!r.memoryCounts.has('10|1|0'));
  assert.ok(r.memoryCounts.has('16|1|0'));
  assert.ok(r.memoryCounts.has('20|1|0'));
});

test('loadUsageHistogram: malformed data does not throw', async () => {
  resetWindow();
  const db = createMockDb({
    messages: [
      { id: 1, threadId: 100, memoryIdBatchesUsed: null, loreIdsUsed: undefined },
      { id: 2, threadId: 100, memoryIdBatchesUsed: [null, 'not-an-array'], loreIdsUsed: [] },
      { id: 3, threadId: 100, memoryIdBatchesUsed: [['valid|1|0', null, undefined]], loreIdsUsed: [] },
    ],
  });
  installMockWindow({ db, activeThreadId: 100 });
  const { loadUsageHistogram } = await loadDbModule();
  const r = await loadUsageHistogram({ threadId: 100 });
  assert.equal(r.memoryCounts.get('valid|1|0'), 1);
});

// ---- stale-baseline bug reproducer ----
//
// Scenario: user opens our tool (baseline snapshotted), user edits a
// memory via /mem or brain-icon OUTSIDE our tool, then user triggers
// a Save in our tool that involves reorder. Without the fix, our
// proportional remap would write the STALE baseline text back to
// Dexie, silently overwriting the external edit.
//
// Fix (in db.js commitDiff reorder block): when tombstoning each
// entry's current slot, capture the current text/embedding and use
// it for the rewrite instead of the baseline text. This handles both
// external edits (the case below) and internal edits where our tool
// edited a memory AND reordered it in the same save.

test('commitDiff reorder: external edit is preserved through reorder', async () => {
  // Initial state: one message with one memory, text = "original"
  const db = createMockDb({
    messages: [
      {
        id: 1, threadId: 100,
        memoriesEndingHere: { '1': [{ text: 'original', embedding: null }] },
      },
    ],
  });
  // Shim .sortBy since the mock doesn't have it by default and commitDiff
  // calls it for the remap-messages list.
  const origMessages = db.messages;
  db.messages = {
    ...origMessages,
    where(idx) {
      const orig = origMessages.where(idx);
      return {
        ...orig,
        equals(val) {
          const chain = orig.equals(val);
          return {
            ...chain,
            sortBy: async (key) => {
              const all = await chain.toArray();
              return [...all].sort((a, b) => (a[key] || 0) - (b[key] || 0));
            },
          };
        },
      };
    },
  };

  installMockWindow({ db, activeThreadId: 100 });
  const { loadBaseline, commitDiff } = await loadDbModule();

  // Step 1: our tool opens, loads baseline
  const baseline = await loadBaseline({ threadId: 100 });
  assert.equal(baseline.length, 1);
  assert.equal(baseline[0].text, 'original');
  const memId = baseline[0].id; // "1|1|0"

  // Step 2: external edit via /mem — text is now "edited externally"
  origMessages.rows[0].memoriesEndingHere['1'][0].text = 'edited externally';

  // Step 3: user clicks Save in our tool with a non-empty memoryOrder,
  // triggering proportional remap.
  const diff = {
    added: [], deleted: [], edited: [], reordered: [],
    totalChanges: 0,
  };
  const memoryOrder = [{ id: memId, locked: false, userMoved: true }];

  await commitDiff({
    baselineItems: baseline,
    diff,
    threadId: 100,
    memoryOrder,
  });

  // Step 4: check final DB state — the fix captures the current
  // on-disk text during tombstone, so the external edit survives.
  const current = origMessages.rows[0].memoriesEndingHere['1'];
  const texts = current.filter(e => e && e.text).map(e => e.text);

  assert.ok(
    texts.includes('edited externally'),
    `stale-baseline bug: external edit was overwritten. Final texts: ${JSON.stringify(texts)}`
  );
});

test('commitDiff reorder: internal edit + reorder on same memory preserves edit', async () => {
  // Scenario variant: user edits a memory INSIDE our tool AND reorders
  // it in the same save. Without the fix, the reorder block uses
  // baseline text and overwrites the in-flight edit. With the fix,
  // reorder captures the current on-disk text AFTER diff.edited was
  // applied, so the edit survives.

  const db = createMockDb({
    messages: [
      {
        id: 1, threadId: 100,
        memoriesEndingHere: { '1': [{ text: 'before edit', embedding: null }] },
      },
    ],
  });
  const origMessages = db.messages;
  db.messages = {
    ...origMessages,
    where(idx) {
      const orig = origMessages.where(idx);
      return {
        ...orig,
        equals(val) {
          const chain = orig.equals(val);
          return {
            ...chain,
            sortBy: async (key) => {
              const all = await chain.toArray();
              return [...all].sort((a, b) => (a[key] || 0) - (b[key] || 0));
            },
          };
        },
      };
    },
  };

  installMockWindow({ db, activeThreadId: 100 });
  const { loadBaseline, commitDiff } = await loadDbModule();

  const baseline = await loadBaseline({ threadId: 100 });
  const memId = baseline[0].id;

  // User edits the memory in our tool, then reorders it. Both changes
  // flow into commitDiff: one in diff.edited, both in memoryOrder.
  const editedItem = { ...baseline[0], text: 'after edit by our tool' };
  const diff = {
    added: [],
    deleted: [],
    edited: [editedItem],
    reordered: [{ id: memId, scope: 'memory' }],
    totalChanges: 2,
  };
  const memoryOrder = [{ id: memId, locked: false, userMoved: true }];

  await commitDiff({
    baselineItems: baseline,
    diff,
    threadId: 100,
    memoryOrder,
  });

  const current = origMessages.rows[0].memoriesEndingHere['1'];
  const texts = current.filter(e => e && e.text).map(e => e.text);

  assert.ok(
    texts.includes('after edit by our tool'),
    `internal edit clobbered by reorder. Final texts: ${JSON.stringify(texts)}`
  );
  assert.ok(
    !texts.includes('before edit'),
    `baseline text leaked through. Final texts: ${JSON.stringify(texts)}`
  );
});

// ---- formatSaveStatsSummary ----

test('formatSaveStatsSummary: null for empty stats', async () => {
  const { formatSaveStatsSummary } = await loadDbModule();
  assert.equal(formatSaveStatsSummary(null), null);
  assert.equal(formatSaveStatsSummary({}), null);
  assert.equal(formatSaveStatsSummary({
    addedMemory: 0, addedLore: 0, deletedMemory: 0, deletedLore: 0,
    editedMemoryText: 0, editedLoreText: 0, promoted: 0, demoted: 0,
    reorderedMemory: 0, reorderedLore: 0,
  }), null);
});

test('formatSaveStatsSummary: single counter singular', async () => {
  const { formatSaveStatsSummary } = await loadDbModule();
  assert.equal(
    formatSaveStatsSummary({ editedMemoryText: 1 }),
    'Saved: 1 memory edit.'
  );
});

test('formatSaveStatsSummary: single counter plural', async () => {
  const { formatSaveStatsSummary } = await loadDbModule();
  assert.equal(
    formatSaveStatsSummary({ editedMemoryText: 3 }),
    'Saved: 3 memory edits.'
  );
});

test('formatSaveStatsSummary: two counters with "and"', async () => {
  const { formatSaveStatsSummary } = await loadDbModule();
  assert.equal(
    formatSaveStatsSummary({ editedMemoryText: 2, deletedMemory: 1 }),
    'Saved: 2 memory edits and 1 memory deletion.'
  );
});

test('formatSaveStatsSummary: three+ counters with commas', async () => {
  const { formatSaveStatsSummary } = await loadDbModule();
  assert.equal(
    formatSaveStatsSummary({
      addedMemory: 1, editedMemoryText: 2, reorderedMemory: 15,
    }),
    'Saved: 1 new memory, 2 memory edits, and 15 memories reordered.'
  );
});

test('formatSaveStatsSummary: reorder-only save', async () => {
  const { formatSaveStatsSummary } = await loadDbModule();
  assert.equal(
    formatSaveStatsSummary({ reorderedMemory: 10 }),
    'Saved: 10 memories reordered.'
  );
});

test('formatSaveStatsSummary: promotes and demotes', async () => {
  const { formatSaveStatsSummary } = await loadDbModule();
  assert.equal(
    formatSaveStatsSummary({ promoted: 2, demoted: 1 }),
    'Saved: 2 promotes and 1 demote.'
  );
});

// ============================================================
// Targeted persistence tests (#2)
// ============================================================
//
// Verifies the three-bucket partition that commitDiff now applies
// to memoryOrder entries:
//   locked    → keep in place
//   userMoved → proportional remap by FULL-ORDER rank
//   untouched → keep in place (NEW: no longer rewritten)

test('targeted reorder: untouched cards keep their (messageId, level, indexInLevel)', async () => {
  // Three memories spread across three messages. User reorders nothing,
  // calls Save with a memoryOrder that lists all three but flags none
  // as userMoved. Expected: each entry stays in its original message
  // slot; nothing rewrites.

  const origMessages = [
    { id: 1, threadId: 100, memoriesEndingHere: { '1': [{ text: 'A', embedding: [0.1] }] } },
    { id: 2, threadId: 100, memoriesEndingHere: { '1': [{ text: 'B', embedding: [0.2] }] } },
    { id: 3, threadId: 100, memoriesEndingHere: { '1': [{ text: 'C', embedding: [0.3] }] } },
  ];
  const db = createMockDb({ messages: origMessages });
  // Shim sortBy on the messages mock — same trick as the stale-baseline tests.
  db.messages.where = (idx) => ({
    equals: (val) => ({
      sortBy: async () => origMessages.filter(m => m[idx] === val).sort((a, b) => a.id - b.id),
      toArray: async () => origMessages.filter(m => m[idx] === val),
    }),
  });

  installMockWindow({ db, activeThreadId: 100 });
  const { loadBaseline, commitDiff } = await loadDbModule();

  const baseline = await loadBaseline({ threadId: 100 });
  assert.equal(baseline.length, 3);

  const result = await commitDiff({
    baselineItems: baseline,
    diff: { added: [], deleted: [], edited: [], reordered: [], totalChanges: 0 },
    threadId: 100,
    memoryOrder: baseline.map(b => ({ id: b.id, locked: false /* userMoved omitted = untouched */ })),
  });

  assert.equal(result.ok, true);
  assert.equal(result.stats.reorderedMemory, 0, 'untouched entries should not count as reordered');
  assert.equal(result.stats.preservedMemory, 3, 'all three should be preserved');
  // On-disk state: each message still has its original entry.
  assert.equal(origMessages[0].memoriesEndingHere['1'][0].text, 'A');
  assert.equal(origMessages[1].memoriesEndingHere['1'][0].text, 'B');
  assert.equal(origMessages[2].memoriesEndingHere['1'][0].text, 'C');
});

test('targeted reorder: a single userMoved card lands at full-order proportional position', async () => {
  // Three memories spread across three messages. User drags A from
  // position 0 to position 2 (last). Save with memoryOrder reflecting
  // [B, C, A] and userMoved=true on A only.
  // Expected:
  //   - B stays at message 1, C stays at message 2 (untouched)
  //   - A's old slot at message 1 gets tombstoned (null)
  //   - A re-lands at floor(rank * M / N) where rank=2, M=3, N=3
  //     → targetMsgIdx = floor(6/3) = 2 → message 3

  const origMessages = [
    { id: 1, threadId: 100, memoriesEndingHere: { '1': [{ text: 'A', embedding: [0.1] }] } },
    { id: 2, threadId: 100, memoriesEndingHere: { '1': [{ text: 'B', embedding: [0.2] }] } },
    { id: 3, threadId: 100, memoriesEndingHere: { '1': [{ text: 'C', embedding: [0.3] }] } },
  ];
  const db = createMockDb({ messages: origMessages });
  db.messages.where = (idx) => ({
    equals: (val) => ({
      sortBy: async () => origMessages.filter(m => m[idx] === val).sort((a, b) => a.id - b.id),
      toArray: async () => origMessages.filter(m => m[idx] === val),
    }),
  });

  installMockWindow({ db, activeThreadId: 100 });
  const { loadBaseline, commitDiff } = await loadDbModule();

  const baseline = await loadBaseline({ threadId: 100 });
  const aId = baseline.find(b => b.text === 'A').id;
  const bId = baseline.find(b => b.text === 'B').id;
  const cId = baseline.find(b => b.text === 'C').id;

  const result = await commitDiff({
    baselineItems: baseline,
    diff: { added: [], deleted: [], edited: [], reordered: [], totalChanges: 0 },
    threadId: 100,
    memoryOrder: [
      { id: bId, locked: false }, // rank 0, untouched
      { id: cId, locked: false }, // rank 1, untouched
      { id: aId, locked: false, userMoved: true }, // rank 2, moved → message floor(6/3) = 2 (i.e. message id 3)
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.stats.reorderedMemory, 1, 'only A counts as reordered');
  assert.equal(result.stats.preservedMemory, 2, 'B and C preserved');

  // Message 1 (where A was): tombstoned slot
  const msg1Texts = (origMessages[0].memoriesEndingHere['1'] || [])
    .filter(e => e && e.text).map(e => e.text);
  assert.ok(!msg1Texts.includes('A'), `A should not still be at message 1 — got ${JSON.stringify(msg1Texts)}`);

  // Message 2: B untouched
  const msg2Texts = (origMessages[1].memoriesEndingHere['1'] || [])
    .filter(e => e && e.text).map(e => e.text);
  assert.deepEqual(msg2Texts, ['B'], 'B should be alone at message 2');

  // Message 3: C untouched + A re-added
  const msg3Texts = (origMessages[2].memoriesEndingHere['1'] || [])
    .filter(e => e && e.text).map(e => e.text);
  assert.ok(msg3Texts.includes('A'), `A should land at message 3 — got ${JSON.stringify(msg3Texts)}`);
  assert.ok(msg3Texts.includes('C'), `C should still be at message 3 — got ${JSON.stringify(msg3Texts)}`);
});

test('targeted reorder: locked + userMoved + untouched mix behaves correctly', async () => {
  // Five memories. Memory L is locked. Memory M is userMoved. Three
  // others (X, Y, Z) are untouched. Save the mix.
  // Expected:
  //   - L stays at its original message slot (locked)
  //   - X, Y, Z stay at their slots (untouched)
  //   - M's old slot tombstoned, M lands at proportional rank position

  const origMessages = [
    { id: 1, threadId: 100, memoriesEndingHere: { '1': [{ text: 'L', embedding: [0.0] }] } },
    { id: 2, threadId: 100, memoriesEndingHere: { '1': [{ text: 'M', embedding: [0.1] }] } },
    { id: 3, threadId: 100, memoriesEndingHere: { '1': [{ text: 'X', embedding: [0.2] }] } },
    { id: 4, threadId: 100, memoriesEndingHere: { '1': [{ text: 'Y', embedding: [0.3] }] } },
    { id: 5, threadId: 100, memoriesEndingHere: { '1': [{ text: 'Z', embedding: [0.4] }] } },
  ];
  const db = createMockDb({ messages: origMessages });
  db.messages.where = (idx) => ({
    equals: (val) => ({
      sortBy: async () => origMessages.filter(m => m[idx] === val).sort((a, b) => a.id - b.id),
      toArray: async () => origMessages.filter(m => m[idx] === val),
    }),
  });

  installMockWindow({ db, activeThreadId: 100 });
  const { loadBaseline, commitDiff } = await loadDbModule();

  const baseline = await loadBaseline({ threadId: 100 });
  const byText = (t) => baseline.find(b => b.text === t).id;

  const result = await commitDiff({
    baselineItems: baseline,
    diff: { added: [], deleted: [], edited: [], reordered: [], totalChanges: 0 },
    threadId: 100,
    memoryOrder: [
      { id: byText('L'), locked: true },                       // rank 0, locked
      { id: byText('X'), locked: false },                      // rank 1, untouched
      { id: byText('Y'), locked: false },                      // rank 2, untouched
      { id: byText('M'), locked: false, userMoved: true },     // rank 3, moved
      { id: byText('Z'), locked: false },                      // rank 4, untouched
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.stats.reorderedMemory, 1, 'only M reorders');
  assert.equal(result.stats.preservedMemory, 3, 'X/Y/Z preserved (locked L not in this tally)');

  // L still at message 1 (locked-stays-put)
  const msg1Texts = origMessages[0].memoriesEndingHere['1'].filter(e => e && e.text).map(e => e.text);
  assert.deepEqual(msg1Texts, ['L']);
  // X still at message 3 (untouched)
  const msg3Texts = origMessages[2].memoriesEndingHere['1'].filter(e => e && e.text).map(e => e.text);
  assert.deepEqual(msg3Texts, ['X']);
  // Y still at message 4 (untouched) — M ALSO lands here per algorithm
  // (rank 3 of 5, M=5 messages → floor(15/5) = 3 → message idx 3 = id 4),
  // so the slot ends up holding both. That's correct: targeted persistence
  // doesn't disturb untouched cards, and the moved card joins them.
  const msg4Texts = origMessages[3].memoriesEndingHere['1'].filter(e => e && e.text).map(e => e.text);
  assert.deepEqual(msg4Texts.sort(), ['M', 'Y']);
  // Z still at message 5 (untouched)
  const msg5Texts = origMessages[4].memoriesEndingHere['1'].filter(e => e && e.text).map(e => e.text);
  assert.deepEqual(msg5Texts, ['Z']);
  // M's original message 2 is now tombstoned (no live entries)
  const msg2Texts = (origMessages[1].memoriesEndingHere['1'] || []).filter(e => e && e.text).map(e => e.text);
  assert.ok(!msg2Texts.includes('M'), `M should not still be at message 2 — got ${JSON.stringify(msg2Texts)}`);
});

test('targeted reorder: zero userMoved entries means zero on-disk writes for memories', async () => {
  // Edge case: caller passes a full memoryOrder but no entries are
  // userMoved. commitDiff should be a memory-reorder no-op. The diff
  // itself has no edits/adds/deletes either, so this is essentially
  // "user clicked Save without doing anything" — which the UI guards
  // anyway, but commitDiff should also handle it cleanly.

  const origMessages = [
    { id: 1, threadId: 100, memoriesEndingHere: { '1': [{ text: 'A', embedding: [0.1] }] } },
    { id: 2, threadId: 100, memoriesEndingHere: { '1': [{ text: 'B', embedding: [0.2] }] } },
  ];
  const beforeSnapshot = JSON.stringify(origMessages);

  const db = createMockDb({ messages: origMessages });
  db.messages.where = (idx) => ({
    equals: (val) => ({
      sortBy: async () => origMessages.filter(m => m[idx] === val).sort((a, b) => a.id - b.id),
      toArray: async () => origMessages.filter(m => m[idx] === val),
    }),
  });

  installMockWindow({ db, activeThreadId: 100 });
  const { loadBaseline, commitDiff } = await loadDbModule();

  const baseline = await loadBaseline({ threadId: 100 });
  const result = await commitDiff({
    baselineItems: baseline,
    diff: { added: [], deleted: [], edited: [], reordered: [], totalChanges: 0 },
    threadId: 100,
    memoryOrder: baseline.map(b => ({ id: b.id, locked: false })), // none userMoved
  });

  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(origMessages), beforeSnapshot, 'on-disk state should be byte-identical');
});

// memory/db.js
//
// Dexie adapter for the Memory/Lore window. Two scope-shaped sub-adapters
// behind one facade so the UI and stage layer don't have to know about
// the underlying storage differences:
//
//   Memory — lives nested inside message.memoriesEndingHere[level][index]
//            as {text, embedding} objects. Accessed via db.messages.
//   Lore   — first-class rows in db.lore with {id, bookId, bookUrl, text,
//            triggers, ...}.
//
// Composite memory IDs: "${messageId}|${level}|${indexInLevel}" — these
// are addressing schemes, not database primary keys. The stage layer
// treats them as strings, which is fine because it only compares equality.
//
// Write model: commit() takes a stage diff and replays it in a SINGLE
// Dexie rw transaction spanning both tables. Either all writes succeed
// or none do. On any throw, Dexie aborts and the DB stays untouched.
//
// Embedding handling: new or edited memory text gets an embedding computed
// via window.embedTexts IF the embedder is loaded (check window.textEmbedder
// Function). If not loaded, we write with embedding: null — upstream
// computes them lazily when needed. This is the standard upstream pattern
// per the skill doc, so no user-facing loading UI is required on our end.

const MEM_ID_SEP = '|';

/**
 * @typedef {Object} StageItem  — matches src/memory/stage.js
 * @property {number|string} id        Composite string for memory, number for lore
 * @property {'memory' | 'lore'} scope
 * @property {string} text
 * @property {Object} [passthrough]    Any other fields preserved through edits
 */

// ---- helpers ----

function parseMemId(id) {
  const parts = String(id).split(MEM_ID_SEP);
  if (parts.length !== 3) return null;
  const [messageId, level, indexInLevel] = parts.map(p => Number(p));
  if (!Number.isFinite(messageId) || !Number.isFinite(level) || !Number.isFinite(indexInLevel)) {
    return null;
  }
  return { messageId, level, indexInLevel };
}

function makeMemId(messageId, level, indexInLevel) {
  return `${messageId}${MEM_ID_SEP}${level}${MEM_ID_SEP}${indexInLevel}`;
}

function safeDb() {
  return (typeof window !== 'undefined' && window.db && typeof window.db === 'object')
    ? window.db
    : null;
}

function activeThreadId() {
  return (typeof window !== 'undefined' && window.activeThreadId != null)
    ? window.activeThreadId
    : null;
}

/**
 * Probe the Dexie schema. Returns an object summarizing what's available.
 * If critical tables are missing or the DB is unready, returns { ok: false }
 * with a reason. The caller should render the Memory/Lore window inert
 * rather than crashing if probing fails.
 *
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function probeSchema() {
  const db = safeDb();
  if (!db) return { ok: false, reason: 'window.db not available' };
  if (!db.messages || typeof db.messages.toArray !== 'function') {
    return { ok: false, reason: 'db.messages missing or non-Dexie' };
  }
  if (!db.lore || typeof db.lore.toArray !== 'function') {
    return { ok: false, reason: 'db.lore missing or non-Dexie' };
  }
  if (!db.threads || typeof db.threads.get !== 'function') {
    return { ok: false, reason: 'db.threads missing' };
  }
  return { ok: true };
}

/**
 * Compute an embedding for a single text, if the embedder is loaded.
 * Returns null if the embedder isn't ready (standard upstream fallback —
 * upstream fills in lazily when the embedder boots).
 *
 * @param {string} text
 * @param {string} modelName
 * @returns {Promise<any|null>}
 */
async function maybeEmbed(text, modelName) {
  if (typeof window === 'undefined') return null;
  if (!window.textEmbedderFunction) return null;
  if (typeof window.embedTexts !== 'function') return null;
  try {
    const out = await window.embedTexts({ textArr: [text], modelName });
    return (Array.isArray(out) && out.length > 0 && out[0] != null) ? out[0] : null;
  } catch {
    // If embedding fails (e.g. model crash), fall back to null so the
    // edit still saves. Upstream retries lazily.
    return null;
  }
}

/**
 * Compute embeddings for an array of texts in a single batched call if
 * possible. Returns an array the same length as input; null entries
 * mean "embedder unavailable or failed."
 *
 * @param {string[]} texts
 * @param {string} modelName
 * @returns {Promise<Array<any|null>>}
 */
async function maybeEmbedBatch(texts, modelName) {
  if (!texts || texts.length === 0) return [];
  if (typeof window === 'undefined') return texts.map(() => null);
  if (!window.textEmbedderFunction) return texts.map(() => null);
  if (typeof window.embedTexts !== 'function') return texts.map(() => null);
  try {
    const out = await window.embedTexts({ textArr: texts, modelName });
    return Array.isArray(out) ? out : texts.map(() => null);
  } catch {
    return texts.map(() => null);
  }
}

// ---- read path ----

/**
 * Read the complete memory + lore set for the currently-active thread.
 *
 * Memories are flattened from message.memoriesEndingHere[level][*] across
 * all thread messages, chronologically ordered by message creation (via
 * the messages table's natural id ordering, which matches message.order).
 * Lore entries are read from db.lore for this thread's loreBookId.
 *
 * Returns an array of StageItems suitable for passing to createStage().
 * Each item has passthrough fields preserved so commit() can merge them
 * back without losing upstream metadata.
 *
 * @param {{ threadId?: number }} [opts]
 * @returns {Promise<StageItem[]>}
 */
export async function loadBaseline({ threadId = activeThreadId() } = {}) {
  const db = safeDb();
  if (!db || threadId == null) return [];

  const thread = await db.threads.get(threadId).catch(() => null);
  if (!thread) return [];

  // ---- memories (nested in messages) ----
  const messages = await db.messages
    .where('threadId').equals(threadId)
    .toArray()
    .catch(() => []);
  // Sort by id so chronology is stable regardless of index arrival order.
  messages.sort((a, b) => (a.id || 0) - (b.id || 0));

  const memoryItems = [];
  for (const message of messages) {
    const meh = message && message.memoriesEndingHere;
    if (!meh || typeof meh !== 'object') continue;
    // Levels are typically numeric string keys ("1"); preserve any shape.
    const levelKeys = Object.keys(meh).sort((a, b) => Number(a) - Number(b));
    for (const levelKey of levelKeys) {
      const arr = meh[levelKey];
      if (!Array.isArray(arr)) continue;
      for (let i = 0; i < arr.length; i++) {
        const mem = arr[i];
        if (!mem) continue; // skip null slots (these are "tombstones" from prior deletes)
        if (typeof mem.text !== 'string') continue;
        memoryItems.push({
          id: makeMemId(message.id, levelKey, i),
          scope: 'memory',
          text: mem.text,
          // Passthrough — used by commit to reconstruct {text, embedding}
          // when writing back to the message.
          __messageId: message.id,
          __level: String(levelKey),
          __indexInLevel: i,
          __embedding: mem.embedding ?? null,
        });
      }
    }
  }

  // ---- lore (first-class rows) ----
  const loreItems = [];
  if (thread.loreBookId != null) {
    const loreRows = await db.lore
      .where('bookId').equals(thread.loreBookId)
      .toArray()
      .catch(() => []);
    for (const row of loreRows) {
      if (!row || typeof row.text !== 'string') continue;
      loreItems.push({
        id: row.id,
        scope: 'lore',
        text: row.text,
        // Passthrough — triggers/bookUrl/embedding/etc. preserved on edit.
        __loreRow: row,
      });
    }
  }

  return [...memoryItems, ...loreItems];
}

// ---- commit path ----

/**
 * Apply a stage diff to Dexie. Runs in a single rw transaction over
 * messages + lore tables — either all writes succeed or none do.
 *
 * The diff shape matches what src/memory/stage.js computeDiff() returns.
 * Passthrough fields on each item (__messageId, __level, __indexInLevel,
 * __embedding, __loreRow) are used to reconstruct upstream records.
 *
 * Promote (memory → lore): delete-from-memory + add-to-lore.
 * Demote (lore → memory): delete-from-lore + add-to-memory (attached to
 *   the most recent thread message, level 1).
 * Reorder within memory: non-trivial because memory position is derived
 *   from message ordering + indexInLevel. We do NOT attempt to persist
 *   cross-message reorders — the UI will degrade reorders to no-ops for
 *   memories and only honor them for lore (which is a flat table).
 *   This limitation is flagged in the diff summary the user sees.
 * Reorder within lore: similar — lore has no explicit order field in
 *   upstream's schema, so UI-order is cosmetic until upstream adds one.
 *
 * @param {{
 *   baselineItems: StageItem[],
 *   diff: import('./stage.js').StageDiff,
 *   threadId?: number,
 *   memoryOrder?: Array<{id: string|number, locked: boolean}>,
 * }} params
 * @returns {Promise<{ ok: true, stats: object } | { ok: false, error: string }>}
 */
export async function commitDiff({ baselineItems, diff, threadId = activeThreadId(), memoryOrder = null } = {}) {
  const db = safeDb();
  if (!db) return { ok: false, error: 'window.db not available' };
  if (threadId == null) return { ok: false, error: 'no active thread' };

  const thread = await db.threads.get(threadId).catch(() => null);
  if (!thread) return { ok: false, error: 'active thread not found in db' };

  const loreBookId = thread.loreBookId;
  if (loreBookId == null) return { ok: false, error: 'thread has no loreBookId' };

  const modelName = thread.textEmbeddingModelName || 'default';

  // Build lookup: baseline-by-id, for fetching passthrough fields when
  // diff entries are missing them (defensive — stage.js should pass them
  // through but the adapter shouldn't crash if it doesn't).
  const baselineById = new Map();
  for (const item of baselineItems || []) {
    if (item && item.id != null) baselineById.set(String(item.id), item);
  }

  // Precompute embeddings for all new/edited memory texts in one batched
  // call. Lore doesn't need embeddings in basic upstream usage.
  const textsToEmbed = [];
  const textEmbedTargets = []; // parallel to textsToEmbed: indices into the combined write list
  const collectIfMemoryTextChange = (item) => {
    const isMem = item.scope === 'memory';
    if (!isMem) return;
    textsToEmbed.push(item.text);
    textEmbedTargets.push(item);
  };
  for (const it of (diff.added || []))    collectIfMemoryTextChange(it);
  for (const it of (diff.edited || []))   {
    // For promoted items (scope flipped memory→lore), don't embed — target is lore.
    if (it.scope === 'memory') collectIfMemoryTextChange(it);
  }
  for (const it of (diff.demoted || []))  {
    // Demoted: lore → memory. The new memory location needs an embedding.
    collectIfMemoryTextChange(it);
  }

  const embeddings = await maybeEmbedBatch(textsToEmbed, modelName);
  const embedByText = new Map();
  textEmbedTargets.forEach((it, i) => embedByText.set(it.text, embeddings[i] ?? null));

  // ---- stats, for UI reporting ----
  const stats = {
    addedMemory: 0, addedLore: 0,
    deletedMemory: 0, deletedLore: 0,
    editedMemoryText: 0, editedLoreText: 0,
    promoted: 0, demoted: 0,
    reorderedMemory: 0,
    reorderedLore: 0,
    skippedMemoryReorder: 0,
  };

  try {
    await db.transaction('rw', db.messages, db.lore, async () => {
      // Cache messages we've touched so we can read-modify-write without
      // stomping each other's changes within this transaction.
      const touchedMessages = new Map(); // id → message

      async function getMessage(messageId) {
        if (touchedMessages.has(messageId)) return touchedMessages.get(messageId);
        const m = await db.messages.get(messageId);
        if (m) touchedMessages.set(messageId, m);
        return m;
      }

      async function flushMessage(messageId) {
        const m = touchedMessages.get(messageId);
        if (m) {
          await db.messages.update(messageId, { memoriesEndingHere: m.memoriesEndingHere });
        }
      }

      // ---- deletions first ----
      // Delete from memory tables / lore table according to baseline scope.
      // (Promoted/demoted items appear as edited in diff, NOT as deleted — stage.js
      //  computes those correctly.)
      for (const item of (diff.deleted || [])) {
        const base = baselineById.get(String(item.id)) || item;
        if (base.scope === 'memory') {
          const coord = parseMemId(base.id);
          if (!coord) continue;
          const m = await getMessage(coord.messageId);
          if (!m || !m.memoriesEndingHere || !m.memoriesEndingHere[coord.level]) continue;
          // Tombstone the slot with null rather than splicing — upstream tolerates
          // nulls and this preserves indexInLevel stability for any other entries
          // that might reference this message's memory array.
          m.memoriesEndingHere[coord.level][coord.indexInLevel] = null;
          stats.deletedMemory++;
        } else if (base.scope === 'lore') {
          const loreId = Number(base.id);
          if (Number.isFinite(loreId)) {
            await db.lore.delete(loreId);
            stats.deletedLore++;
          }
        }
      }

      // ---- edits (includes promotes and demotes; detected via scope change) ----
      for (const item of (diff.edited || [])) {
        const base = baselineById.get(String(item.id)) || item;
        const wasMem = base.scope === 'memory';
        const wasLore = base.scope === 'lore';
        const nowMem = item.scope === 'memory';
        const nowLore = item.scope === 'lore';

        if (wasMem && nowMem) {
          // Pure memory text edit
          const coord = parseMemId(base.id);
          if (!coord) continue;
          const m = await getMessage(coord.messageId);
          if (!m || !m.memoriesEndingHere || !m.memoriesEndingHere[coord.level]) continue;
          m.memoriesEndingHere[coord.level][coord.indexInLevel] = {
            text: item.text,
            embedding: embedByText.get(item.text) ?? null,
          };
          stats.editedMemoryText++;
        } else if (wasLore && nowLore) {
          // Pure lore text edit
          const loreId = Number(base.id);
          if (!Number.isFinite(loreId)) continue;
          const existing = (base.__loreRow && typeof base.__loreRow === 'object') ? base.__loreRow : {};
          await db.lore.put({
            ...existing,
            id: loreId,
            bookId: existing.bookId ?? loreBookId,
            text: item.text,
            triggers: Array.isArray(existing.triggers) ? existing.triggers : [],
          });
          stats.editedLoreText++;
        } else if (wasMem && nowLore) {
          // PROMOTE — delete from memory slot, add to lore
          const coord = parseMemId(base.id);
          if (coord) {
            const m = await getMessage(coord.messageId);
            if (m && m.memoriesEndingHere && m.memoriesEndingHere[coord.level]) {
              m.memoriesEndingHere[coord.level][coord.indexInLevel] = null;
            }
          }
          await db.lore.add({
            bookId: loreBookId,
            bookUrl: undefined,
            text: item.text,
            triggers: [],
          });
          stats.promoted++;
        } else if (wasLore && nowMem) {
          // DEMOTE — delete from lore, add to the last message's memoriesEndingHere
          const loreId = Number(base.id);
          if (Number.isFinite(loreId)) await db.lore.delete(loreId);
          // Find the newest message to attach this memory to.
          const lastMsg = await db.messages
            .where('threadId').equals(threadId)
            .last()
            .catch(() => null);
          if (lastMsg) {
            const m = await getMessage(lastMsg.id);
            if (!m.memoriesEndingHere) m.memoriesEndingHere = {};
            if (!Array.isArray(m.memoriesEndingHere['1'])) m.memoriesEndingHere['1'] = [];
            m.memoriesEndingHere['1'].push({
              text: item.text,
              embedding: embedByText.get(item.text) ?? null,
            });
          }
          stats.demoted++;
        }
      }

      // ---- adds ----
      for (const item of (diff.added || [])) {
        if (item.scope === 'lore') {
          await db.lore.add({
            bookId: loreBookId,
            bookUrl: undefined,
            text: item.text,
            triggers: [],
          });
          stats.addedLore++;
        } else if (item.scope === 'memory') {
          // Attach to the most recent message, level 1 (default level for
          // user-added memories per upstream convention).
          const lastMsg = await db.messages
            .where('threadId').equals(threadId)
            .last()
            .catch(() => null);
          if (!lastMsg) {
            // No messages in thread — can't attach a memory. Skip silently;
            // user gets a count of "1 memory not added" in stats for UI to show.
            continue;
          }
          const m = await getMessage(lastMsg.id);
          if (!m.memoriesEndingHere) m.memoriesEndingHere = {};
          if (!Array.isArray(m.memoriesEndingHere['1'])) m.memoriesEndingHere['1'] = [];
          m.memoriesEndingHere['1'].push({
            text: item.text,
            embedding: embedByText.get(item.text) ?? null,
          });
          stats.addedMemory++;
        }
      }

      // ---- reorders ----
      // Memory: proportional message-id remap (7e).
      //   See ROADMAP.md "Memory reorder: targeted persistence" for the
      //   follow-up that does this surgically rather than nuke-and-pave.
      //
      // Algorithm:
      //   1. Walk `memoryOrder` (user's final rendered sequence) and
      //      partition: locked entries keep their current messageId;
      //      unlocked entries get remapped.
      //   2. Clear unlocked entries from ALL messages' memoriesEndingHere
      //      (so we don't duplicate). Locked entries stay put.
      //   3. Re-assign each unlocked entry to message at position
      //      floor(i * M / N) where i is its rank among unlocked, N is
      //      count of unlocked, M is message count.
      //   4. Append re-assigned entries to their target message's
      //      memoriesEndingHere[1].
      //
      // If memoryOrder is not provided (legacy callers) OR there's nothing
      // to remap, skip this block.
      if (Array.isArray(memoryOrder) && memoryOrder.length > 0) {
        // Gather baseline memory items keyed by id, only those that
        // still exist (weren't deleted in this diff).
        const deletedIds = new Set((diff.deleted || []).map(d => String(d.id)));
        const baseMemById = new Map();
        for (const it of baselineItems || []) {
          if (it && it.scope === 'memory' && !deletedIds.has(String(it.id))) {
            baseMemById.set(String(it.id), it);
          }
        }

        // Partition: unlocked (to remap) vs locked (keep in place)
        const toRemap = [];
        const frozen = new Set();
        for (const entry of memoryOrder) {
          const base = baseMemById.get(String(entry.id));
          if (!base) continue; // edited-to-different-id or newly-added; skip
          if (entry.locked) {
            frozen.add(String(entry.id));
          } else {
            toRemap.push(base);
          }
        }

        if (toRemap.length > 0) {
          // Load thread messages in chronological order.
          const messages = await db.messages
            .where('threadId').equals(threadId)
            .sortBy('id')
            .catch(() => []);

          if (messages.length > 0) {
            // Prefetch any messages that toRemap items CURRENTLY live in,
            // plus all messages in the thread (since we'll write to
            // potentially any of them).
            for (const m of messages) {
              if (!touchedMessages.has(m.id)) touchedMessages.set(m.id, m);
            }

            // Remove every toRemap entry from its current home.
            // Preserve frozen entries in place.
            for (const item of toRemap) {
              const coord = parseMemId(item.id);
              if (!coord) continue;
              const m = touchedMessages.get(coord.messageId);
              if (!m || !m.memoriesEndingHere) continue;
              const lvlArr = m.memoriesEndingHere[coord.level];
              if (!Array.isArray(lvlArr)) continue;
              // Tombstone the slot; we rebuild messages below so indices
              // don't actually matter, but this keeps the semantics clean.
              lvlArr[coord.indexInLevel] = null;
            }

            // Assign each toRemap entry to a target message by proportional rank.
            const N = toRemap.length;
            const M = messages.length;
            for (let i = 0; i < N; i++) {
              const targetMsgIdx = Math.min(M - 1, Math.floor(i * M / N));
              const targetMsg = touchedMessages.get(messages[targetMsgIdx].id);
              if (!targetMsg.memoriesEndingHere) targetMsg.memoriesEndingHere = {};
              if (!Array.isArray(targetMsg.memoriesEndingHere['1'])) {
                targetMsg.memoriesEndingHere['1'] = [];
              }
              const item = toRemap[i];
              targetMsg.memoriesEndingHere['1'].push({
                text: item.text,
                embedding: item.__embedding ?? null,
              });
              stats.skippedMemoryReorder = 0; // replaces the old "skipped" tally
            }

            stats.reorderedMemory = N;
          }
        }
      } else {
        // No memoryOrder provided — fall back to the old behavior of
        // counting reorder entries as "skipped".
        for (const item of (diff.reordered || [])) {
          if (item.scope === 'memory') stats.skippedMemoryReorder++;
          else if (item.scope === 'lore') stats.reorderedLore++;
        }
      }

      // Lore reorder: upstream has no order field, still a no-op.
      for (const item of (diff.reordered || [])) {
        if (item.scope === 'lore') stats.reorderedLore++;
      }

      // Flush every touched message in one pass at the end of the tx.
      for (const [messageId] of touchedMessages) {
        await flushMessage(messageId);
      }
    });

    return { ok: true, stats };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

/**
 * Format a stage diff into a concrete user-facing confirmation sentence.
 * Used by the Save button's two-step confirm so the user sees exactly
 * what's about to happen.
 *
 * @param {import('./stage.js').StageDiff} diff
 * @returns {string}
 */
export function formatDiffSummary(diff) {
  if (!diff || diff.totalChanges === 0) return 'No changes to save.';
  const parts = [];
  const add = (n, singular, plural) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? singular : plural}`);
  };

  // Count by target scope (so "delete 17" is clear about what kind)
  const deletedMem = (diff.deleted || []).filter(i => i.scope === 'memory').length;
  const deletedLore = (diff.deleted || []).filter(i => i.scope === 'lore').length;
  const addedMem = (diff.added || []).filter(i => i.scope === 'memory').length;
  const addedLore = (diff.added || []).filter(i => i.scope === 'lore').length;
  // Edited counts exclude scope-changes (those appear as promoted/demoted)
  const editedPure = (diff.edited || []).filter(i => {
    // Heuristic: edited with no corresponding promoted/demoted entry → pure text edit
    return !(diff.promoted || []).some(p => String(p.id) === String(i.id))
        && !(diff.demoted || []).some(p => String(p.id) === String(i.id));
  }).length;

  add(addedMem,    'new memory', 'new memories');
  add(addedLore,   'new lore entry', 'new lore entries');
  add(editedPure,  'edit', 'edits');
  add(diff.promoted?.length || 0, 'promote (memory → lore)', 'promotes (memory → lore)');
  add(diff.demoted?.length || 0,  'demote (lore → memory)', 'demotes (lore → memory)');
  add(deletedMem,  'memory deletion', 'memory deletions');
  add(deletedLore, 'lore deletion', 'lore deletions');
  add((diff.reordered || []).length, 'reorder', 'reorders');

  if (parts.length === 0) return 'No changes to save.';
  if (parts.length === 1) return `Save: ${parts[0]}. Continue?`;
  if (parts.length === 2) return `Save: ${parts.join(' and ')}. Continue?`;
  return `Save: ${parts.slice(0, -1).join(', ')}, and ${parts.slice(-1)}. Continue?`;
}

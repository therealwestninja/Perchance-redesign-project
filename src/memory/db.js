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

import { sortLoreByPersistedOrder, persistLoreOrder, forgetLoreFromOrder } from './lore_order.js';

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
 * Read how often each memory/lore entry was referenced by the AI across
 * the last N messages in the thread. Upstream stores this as
 * `message.memoryIdBatchesUsed` (composite ID arrays) and
 * `message.loreIdsUsed` (numeric lore IDs).
 *
 * Supports both upstream memory-storage models:
 *   - "Old" model: `memoryIdBatchesUsed[i]` is an array of numeric ids
 *     referring to rows in `db.memories` (legacy).
 *   - "New" model: `memoryIdBatchesUsed[i]` is an array of strings like
 *     `${messageId}|${level}|${indexInLevel}` — matches our composite
 *     IDs directly. All current threads use this.
 *
 * Returns histograms: Map<compositeId, count> for memory, Map<loreId, count>
 * for lore. Entries not referenced in the window are absent from the map.
 *
 * @param {{ threadId?: number, lastN?: number }} [opts]
 * @returns {Promise<{
 *   memoryCounts: Map<string, number>,
 *   loreCounts: Map<number, number>,
 *   messagesScanned: number,
 * }>}
 */
export async function loadUsageHistogram({ threadId = activeThreadId(), lastN = 10 } = {}) {
  const db = safeDb();
  const empty = { memoryCounts: new Map(), loreCounts: new Map(), messagesScanned: 0 };
  if (!db || threadId == null) return empty;

  const messages = await db.messages
    .where('threadId').equals(threadId)
    .toArray()
    .catch(() => []);
  if (messages.length === 0) return empty;

  // Last N by id (chronological). Messages without retrieval data (e.g.,
  // user inputs) contribute nothing — the relevant field is only populated
  // on AI-generated messages.
  messages.sort((a, b) => (a.id || 0) - (b.id || 0));
  const recent = messages.slice(Math.max(0, messages.length - lastN));

  const memoryCounts = new Map();
  const loreCounts = new Map();

  for (const m of recent) {
    const batches = Array.isArray(m.memoryIdBatchesUsed) ? m.memoryIdBatchesUsed : [];
    for (const batch of batches) {
      if (!Array.isArray(batch)) continue;
      for (const id of batch) {
        // New-model composite IDs: "3|1|2". Only these apply to our tool
        // (we exclusively use the new model for reads/writes).
        if (typeof id === 'string' && id.split('|').length === 3) {
          memoryCounts.set(id, (memoryCounts.get(id) || 0) + 1);
        }
        // Old-model numeric ids are silently ignored — legacy data predates
        // our tool's applicability and the UI can't map them back anyway.
      }
    }

    const loreIds = Array.isArray(m.loreIdsUsed) ? m.loreIdsUsed : [];
    for (const id of loreIds) {
      if (typeof id === 'number') {
        loreCounts.set(id, (loreCounts.get(id) || 0) + 1);
      }
    }
  }

  return { memoryCounts, loreCounts, messagesScanned: recent.length };
}

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

  // Apply the persisted lore order (#4). Lore is unordered in upstream;
  // we keep our display-only order in settings.loreOrderByBookId rather
  // than polluting upstream's lore table. Items not in the persisted
  // list land at the end (preserves the experience for newly-added
  // lore that hasn't been positioned yet).
  const sortedLoreItems = thread.loreBookId != null
    ? sortLoreByPersistedOrder(loreItems, thread.loreBookId)
    : loreItems;

  return [...memoryItems, ...sortedLoreItems];
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
 *   memoryOrder?: Array<{
 *     id: string|number,
 *     locked: boolean,
 *     userMoved?: boolean,
 *   }>,
 *   loreOrder?: Array<{ id: string|number }>,
 *     User's final rendered sequence of lore ids. When supplied,
 *     persisted to settings.loreOrderByBookId (#4) so the order
 *     survives across sessions. Upstream's lore table is NOT
 *     modified — order lives only in our settings.
 * }} params
 * @returns {Promise<{ ok: true, stats: object } | { ok: false, error: string }>}
 */
export async function commitDiff({ baselineItems, diff, threadId = activeThreadId(), memoryOrder = null, loreOrder = null } = {}) {
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
      // Memory: TARGETED message-id remap (#2).
      //   Previous behavior (7e): proportional remap of EVERY unlocked
      //   entry whenever the user reordered anything. That meant moving
      //   one card silently shifted every other unlocked memory's
      //   message assignment, even cards the user never touched.
      //
      //   Current behavior (#2): three buckets, distinguished by per-
      //   entry flags supplied in memoryOrder:
      //     locked     → keep current (messageId, level, indexInLevel) tuple
      //     userMoved  → proportional remap to floor(rank * M / N)
      //                  where rank is the entry's index in the FULL
      //                  user-rendered sequence (NOT among only the moved
      //                  ones — preserves the user's expectation of "where
      //                  I dropped it lands at THAT position in the thread")
      //     untouched  → keep current tuple, same as locked. The user
      //                  didn't move this card; commitDiff doesn't
      //                  silently rewrite its position
      //
      // memoryOrder entries default userMoved=false if not specified
      // (legacy callers, defensive). That means a memoryOrder without
      // any userMoved flags now yields a no-op for unlocked entries —
      // significantly safer than the old "rewrite everything" default.
      // Window UI sites that call commitDiff already supply userMoved
      // via memoryOverrides.userMovedCardIds.has(...).
      //
      // If memoryOrder is not provided (legacy callers) OR there's nothing
      // to remap, skip this block entirely.
      if (Array.isArray(memoryOrder) && memoryOrder.length > 0) {
        // Compute preservedMemory once, regardless of whether anything
        // userMoved exists. This visibility tally fires even on a
        // pure no-op save (memoryOrder full but no userMoved entries),
        // so the formatSaveStatsSummary surface can describe what
        // commitDiff DECIDED not to do as well as what it did.
        stats.preservedMemory = memoryOrder.filter(e =>
          !e.locked && e.userMoved !== true).length;

        // Gather baseline memory items keyed by id, only those that
        // still exist (weren't deleted in this diff).
        const deletedIds = new Set((diff.deleted || []).map(d => String(d.id)));
        const baseMemById = new Map();
        for (const it of baselineItems || []) {
          if (it && it.scope === 'memory' && !deletedIds.has(String(it.id))) {
            baseMemById.set(String(it.id), it);
          }
        }

        // Partition: userMoved (to remap) vs locked/untouched (keep in place).
        // We still walk the full memoryOrder so 'rank' for userMoved entries
        // reflects their position in the full user-rendered sequence — that's
        // what makes the remap target match the user's drag intent.
        const toRemap = [];      // entries the user explicitly dragged
        const fullOrderRank = new Map();  // baseMemId → rank in user's full sequence
        let rank = 0;
        for (const entry of memoryOrder) {
          const base = baseMemById.get(String(entry.id));
          if (!base) continue; // edited-to-different-id or newly-added; skip
          fullOrderRank.set(String(entry.id), rank);
          rank++;
          if (entry.locked) {
            // Locked-stays-put: no work needed for remap (its message
            // tuple is already correct on disk).
            continue;
          }
          if (entry.userMoved === true) {
            toRemap.push(base);
          }
          // else: untouched — leave its (messageId, level, indexInLevel)
          // tuple alone. commitDiff does NOT touch this entry's slot.
        }

        if (toRemap.length > 0) {
          // Load thread messages in chronological order.
          const messages = await db.messages
            .where('threadId').equals(threadId)
            .sortBy('id')
            .catch(() => []);

          if (messages.length > 0) {
            // Capture each userMoved entry's current text + embedding
            // BEFORE tombstoning its slot. Same stale-baseline guard as
            // the previous algorithm — see the long comment in the
            // pre-#2 code below for the why.
            for (const item of toRemap) {
              const coord = parseMemId(item.id);
              if (!coord) continue;
              let m = touchedMessages.get(coord.messageId);
              if (!m) {
                // Lazy-load: targeted save means we may not have prefetched
                // every message. Pull it now.
                m = messages.find(mm => mm.id === coord.messageId);
                if (!m) continue;
                touchedMessages.set(m.id, m);
              }
              if (!m.memoriesEndingHere) continue;
              const lvlArr = m.memoriesEndingHere[coord.level];
              if (!Array.isArray(lvlArr)) continue;

              const currentEntry = lvlArr[coord.indexInLevel];
              if (currentEntry && typeof currentEntry === 'object') {
                if (typeof currentEntry.text === 'string') {
                  item.__currentText = currentEntry.text;
                }
                if (currentEntry.embedding != null) {
                  item.__currentEmbedding = currentEntry.embedding;
                }
              }
              // Tombstone the slot — we'll re-add the entry to its
              // target message below.
              lvlArr[coord.indexInLevel] = null;
            }

            // Assign each userMoved entry to a target message by its
            // FULL-ORDER rank (not its rank-among-moved). This is what
            // makes "I dragged this to the middle of my list" land in
            // the middle of the thread, not at position 0 just because
            // it happened to be the only thing the user moved.
            //
            // Edge case: rank could be 0 → targetMsgIdx = 0 → first
            // message receives the entry. That's correct — the user
            // moved it to the top of their list.
            const M = messages.length;
            const N = memoryOrder.length;
            for (const item of toRemap) {
              const itemRank = fullOrderRank.get(String(item.id)) ?? 0;
              const targetMsgIdx = Math.min(M - 1, Math.floor(itemRank * M / N));
              let targetMsg = touchedMessages.get(messages[targetMsgIdx].id);
              if (!targetMsg) {
                // Lazy-load destination too (targeted save).
                targetMsg = messages[targetMsgIdx];
                touchedMessages.set(targetMsg.id, targetMsg);
              }
              if (!targetMsg.memoriesEndingHere) targetMsg.memoriesEndingHere = {};
              if (!Array.isArray(targetMsg.memoriesEndingHere['1'])) {
                targetMsg.memoriesEndingHere['1'] = [];
              }
              const freshText = item.__currentText != null
                ? item.__currentText
                : item.text;
              const freshEmbedding = item.__currentEmbedding != null
                ? item.__currentEmbedding
                : (item.__embedding ?? null);
              targetMsg.memoriesEndingHere['1'].push({
                text: freshText,
                embedding: freshEmbedding,
              });
              stats.skippedMemoryReorder = 0;
            }

            stats.reorderedMemory = toRemap.length;
            // preservedMemory already set above (hoisted); no-op here.
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

      // Lore reorder (#4): upstream has no order field. We persist the
      // user's final lore order in OUR settings (loreOrderByBookId) so
      // it survives across sessions WITHOUT touching upstream's lore
      // table. The diff.reordered entries still bump stats.reorderedLore
      // for the save-summary line; the actual persistence happens via
      // persistLoreOrder() AFTER the Dexie tx, since settings live in
      // localStorage and aren't part of the tx.
      for (const item of (diff.reordered || [])) {
        if (item.scope === 'lore') stats.reorderedLore++;
      }

      // Flush every touched message in one pass at the end of the tx.
      for (const [messageId] of touchedMessages) {
        await flushMessage(messageId);
      }
    });

    // Post-tx settings writes (NOT inside the Dexie tx — settings live
    // in localStorage, not Dexie). Best-effort: settings write failures
    // shouldn't fail the Dexie commit that just succeeded.
    if (Array.isArray(loreOrder) && loreOrder.length > 0 && loreBookId != null) {
      try {
        const orderedIds = loreOrder.map(e => (e && e.id != null) ? e.id : null).filter(x => x != null);
        persistLoreOrder(loreBookId, orderedIds);
      } catch { /* best-effort */ }
    }
    // When lore is deleted, prune deleted ids from the persisted order
    // so the list doesn't accumulate dead references over time. Cheap
    // (single localStorage round-trip per deleted id) and bounded by
    // diff size.
    if (loreBookId != null) {
      for (const item of (diff.deleted || [])) {
        if (item && item.scope === 'lore' && item.id != null) {
          try { forgetLoreFromOrder(loreBookId, item.id); } catch { /* best-effort */ }
        }
      }
    }

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

/**
 * Human-readable summary of a stats object returned by commitDiff.
 * Used to show a post-save confirmation banner so the user can see
 * what their save actually did.
 *
 * Unlike formatDiffSummary (which summarizes the INTENTION — what will
 * be saved), this summarizes the RESULT — what landed on disk.
 *
 * Returns null when there's nothing meaningful to report (stats all
 * zero or missing).
 *
 * @param {object} stats
 * @returns {string | null}
 */
export function formatSaveStatsSummary(stats) {
  if (!stats || typeof stats !== 'object') return null;
  const parts = [];
  const add = (n, singular, plural) => {
    const v = Number(n) || 0;
    if (v > 0) parts.push(`${v} ${v === 1 ? singular : plural}`);
  };

  add(stats.addedMemory,       'new memory',         'new memories');
  add(stats.addedLore,         'new lore entry',     'new lore entries');
  add(stats.editedMemoryText,  'memory edit',        'memory edits');
  add(stats.editedLoreText,    'lore edit',          'lore edits');
  add(stats.promoted,          'promote',            'promotes');
  add(stats.demoted,           'demote',             'demotes');
  add(stats.deletedMemory,     'memory deletion',    'memory deletions');
  add(stats.deletedLore,       'lore deletion',      'lore deletions');
  add(stats.reorderedMemory,   'memory reorder',     'memories reordered');
  add(stats.reorderedLore,     'lore reorder',       'lore entries reordered');

  if (parts.length === 0) return null;
  if (parts.length === 1) return `Saved: ${parts[0]}.`;
  if (parts.length === 2) return `Saved: ${parts.join(' and ')}.`;
  return `Saved: ${parts.slice(0, -1).join(', ')}, and ${parts.slice(-1)}.`;
}

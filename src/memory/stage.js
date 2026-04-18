// memory/stage.js
//
// Pure staging area for Memory/Lore edits. Accumulates user actions
// (reorder, promote, demote, delete, add, edit) against a baseline of
// loaded items. At commit time, produces a concrete diff that a db-
// adapter layer can translate into Dexie writes.
//
// The module is deliberately decoupled from upstream schema: it operates
// on generic { id, scope, text, ...passthrough } records. An "id" is the
// upstream primary key (number for Perchance's ++id tables); "scope" is
// 'memory' | 'lore'; "text" is the human-readable content; every other
// field passes through unchanged so we preserve upstream metadata
// (threadId, summaryHash, status, bookId, etc.).
//
// Why staged, not write-through?
//   The user needs a review-before-commit moment. Staged means they can
//   queue up several changes, see "you'll delete 17 memories and
//   promote 3 to lore," confirm once, and commit atomically. It also
//   means a mistake before save costs nothing — just close the window.
//
// Why track a baseline?
//   The diff is computed at commit time by comparing the staged state
//   against the baseline snapshot captured at stage creation. We don't
//   need per-edit history — we just need the final state to diff against
//   what was originally loaded.

/**
 * @typedef {Object} StageItem
 * @property {number|string} id         Upstream primary key
 * @property {'memory' | 'lore'} scope  Which table it lives in
 * @property {string} text              The human-readable content
 * @property {Object} [passthrough]     Any other upstream fields, preserved on commit
 */

/**
 * @typedef {Object} StageDiff
 * @property {StageItem[]} added        New items the user created (no id from baseline)
 * @property {StageItem[]} deleted      Items in baseline but not in staged
 * @property {StageItem[]} edited       Same id, different text or scope
 * @property {StageItem[]} promoted     edited subset where scope went memory → lore
 * @property {StageItem[]} demoted      edited subset where scope went lore → memory
 * @property {StageItem[]} reordered    Same id, text and scope unchanged, but different order
 *                                       within its scope (index changed)
 * @property {number} totalChanges      added + deleted + edited + reordered (no double-count)
 */

/**
 * Create a new staging area from a baseline.
 *
 * The baseline is snapshotted — subsequent mutations to `baseline` won't
 * affect the stage. Items should be in the order they currently appear
 * to the user (memory: thread order, lore: book order).
 *
 * @param {StageItem[]} baseline
 */
export function createStage(baseline) {
  const baselineById = new Map();
  for (const item of baseline || []) {
    if (!item || item.id == null) continue;
    baselineById.set(keyOf(item), deepClone(item));
  }

  // Staged items — an ordered list that starts as a copy of baseline
  // and accumulates user edits. Order within a scope = user's intended
  // display/persistence order. We filter malformed entries (null or
  // missing id) here too, not just from baselineById, so computeDiff
  // and other callers never encounter them.
  let staged = (baseline || [])
    .filter(it => it && it.id != null)
    .map(it => deepClone(it));

  // Synthetic IDs for newly-added items (not yet persisted). Prefixed
  // so the db adapter can tell them apart from real upstream ids.
  let nextTempId = 1;
  function freshTempId() {
    return `tmp:${nextTempId++}`;
  }

  return {
    /**
     * @returns {StageItem[]} Current staged state (safe copy).
     */
    getStaged() {
      return staged.map(it => deepClone(it));
    },

    /**
     * @param {'memory' | 'lore'} scope
     * @returns {StageItem[]} Just the items in that scope, in staged order.
     */
    getStagedByScope(scope) {
      return staged.filter(it => it.scope === scope).map(it => deepClone(it));
    },

    /**
     * Reorder: move the item with the given id to a new index within its scope.
     * Other scopes are untouched. Newer index is 0-based within that scope's slice.
     *
     * @param {number|string} id
     * @param {number} newIndexInScope
     */
    reorder(id, newIndexInScope) {
      const item = staged.find(it => sameId(it, id));
      if (!item) return;
      const sameScope = staged.filter(it => it.scope === item.scope);
      const clampedIdx = Math.max(0, Math.min(sameIndex(newIndexInScope), sameScope.length - 1));
      const currentIdxInScope = sameScope.findIndex(it => sameId(it, id));
      if (currentIdxInScope === clampedIdx) return;
      // Rebuild staged: splice within the scope slice, keep other-scope order intact
      sameScope.splice(currentIdxInScope, 1);
      sameScope.splice(clampedIdx, 0, item);
      staged = interleave(staged, item.scope, sameScope);
    },

    /**
     * Promote a memory to lore. Keeps text and other fields; flips scope.
     * New placement is at the end of lore's current stage order.
     *
     * @param {number|string} id
     */
    promote(id) {
      const item = staged.find(it => sameId(it, id));
      if (!item || item.scope !== 'memory') return;
      item.scope = 'lore';
      // Move to end of lore section
      staged = [...staged.filter(it => !sameId(it, id)), item];
      // Reorder so all lore items come after all memory items naturally —
      // UI computes per-scope order via filter; no cross-scope ordering
      // contract to maintain.
    },

    /**
     * Demote a lore entry to memory. Flips scope; appends to memory section.
     *
     * @param {number|string} id
     */
    demote(id) {
      const item = staged.find(it => sameId(it, id));
      if (!item || item.scope !== 'lore') return;
      item.scope = 'memory';
      staged = [...staged.filter(it => !sameId(it, id)), item];
    },

    /**
     * Remove an item from stage. If it was in baseline, it shows up in
     * diff.deleted; if it was a freshly-added item, it just disappears.
     *
     * @param {number|string} id
     */
    remove(id) {
      staged = staged.filter(it => !sameId(it, id));
    },

    /**
     * Replace an item's text (and optionally other fields). Preserves id
     * and scope unless opts.scope supplied.
     *
     * @param {number|string} id
     * @param {string} text
     * @param {{ scope?: 'memory' | 'lore' }} [opts]
     */
    edit(id, text, opts = {}) {
      const item = staged.find(it => sameId(it, id));
      if (!item) return;
      item.text = String(text == null ? '' : text);
      if (opts.scope === 'memory' || opts.scope === 'lore') item.scope = opts.scope;
    },

    /**
     * Add a new item. Gets a synthetic tmp id until commit.
     *
     * @param {{ scope: 'memory' | 'lore', text: string, [field: string]: any }} item
     * @returns {string} The synthetic id
     */
    add(item) {
      const id = freshTempId();
      const entry = {
        ...item,
        id,
        scope: item.scope === 'lore' ? 'lore' : 'memory',
        text: String(item.text == null ? '' : item.text),
      };
      staged.push(entry);
      return id;
    },

    /**
     * Bulk delete a set of ids.
     * @param {Array<number|string>} ids
     */
    removeMany(ids) {
      const set = new Set((ids || []).map(String));
      staged = staged.filter(it => !set.has(String(it.id)));
    },

    /**
     * Bulk promote memories.
     * @param {Array<number|string>} ids
     */
    promoteMany(ids) {
      for (const id of ids || []) this.promote(id);
    },

    /**
     * Bulk demote lore.
     * @param {Array<number|string>} ids
     */
    demoteMany(ids) {
      for (const id of ids || []) this.demote(id);
    },

    /**
     * Produce the commit-time diff between baseline and staged.
     * This is pure — does not mutate anything.
     *
     * @returns {StageDiff}
     */
    computeDiff() {
      const added = [];
      const deleted = [];
      const edited = [];
      const promoted = [];
      const demoted = [];
      const reordered = [];

      const stagedById = new Map();
      for (const item of staged) stagedById.set(keyOf(item), item);

      // For reorder detection, we only compare items present in BOTH
      // baseline and staged — an item's position shifting because other
      // items were deleted is not a reorder. We compute rank among the
      // surviving items, per scope, independently.
      function rankMap(items, scope, survivorKeys) {
        const rank = new Map();
        let r = 0;
        for (const item of items) {
          if (item.scope !== scope) continue;
          const k = keyOf(item);
          if (!survivorKeys.has(k)) continue;
          rank.set(k, r++);
        }
        return rank;
      }

      const survivingKeys = new Set();
      for (const item of staged) {
        const k = keyOf(item);
        if (baselineById.has(k)) survivingKeys.add(k);
      }

      const baselineArray = [...baselineById.values()];
      const memRankBase = rankMap(baselineArray, 'memory', survivingKeys);
      const loreRankBase = rankMap(baselineArray, 'lore', survivingKeys);
      const memRankStage = rankMap(staged, 'memory', survivingKeys);
      const loreRankStage = rankMap(staged, 'lore', survivingKeys);

      for (const item of staged) {
        const k = keyOf(item);
        const base = baselineById.get(k);
        if (!base) {
          // No baseline → it's new. (Synthetic tmp ids all land here.)
          added.push(deepClone(item));
          continue;
        }
        const textChanged = base.text !== item.text;
        const scopeChanged = base.scope !== item.scope;
        if (textChanged || scopeChanged) {
          edited.push(deepClone(item));
          if (scopeChanged && base.scope === 'memory' && item.scope === 'lore') {
            promoted.push(deepClone(item));
          } else if (scopeChanged && base.scope === 'lore' && item.scope === 'memory') {
            demoted.push(deepClone(item));
          }
          continue;
        }
        // Same text, same scope — but maybe different order among survivors?
        // Only compare rank within the appropriate scope's surviving set.
        const rankBase = item.scope === 'memory' ? memRankBase : loreRankBase;
        const rankStage = item.scope === 'memory' ? memRankStage : loreRankStage;
        if (rankBase.get(k) !== rankStage.get(k)) {
          reordered.push(deepClone(item));
        }
      }

      // Pass 2: deletions — baseline entries no longer in staged
      for (const [k, item] of baselineById.entries()) {
        if (!stagedById.has(k)) deleted.push(deepClone(item));
      }

      // An edited item that's also reordered counts as edited, not reordered
      // (the edit implicitly handles the order via the write). Deduplicate.
      const editedKeys = new Set(edited.map(keyOf));
      const netReordered = reordered.filter(it => !editedKeys.has(keyOf(it)));

      return {
        added,
        deleted,
        edited,
        promoted,
        demoted,
        reordered: netReordered,
        totalChanges: added.length + deleted.length + edited.length + netReordered.length,
      };
    },

    /**
     * @returns {boolean} True iff there are any pending changes.
     */
    hasChanges() {
      return this.computeDiff().totalChanges > 0;
    },

    /**
     * Discard all staged changes; reset to baseline.
     */
    discard() {
      staged = [...baselineById.values()].map(it => deepClone(it));
      // Restore baseline order
      staged.sort((a, b) => baselineRank(baselineById, a) - baselineRank(baselineById, b));
    },
  };
}

// ---- helpers ----

function keyOf(item) {
  // Identity is the upstream id alone. Scope is a mutable attribute that
  // flips on promote/demote — if we keyed by scope:id, a promotion would
  // register as (add new lore:5) + (delete memory:5) instead of a single
  // edit with scopeChanged=true. Always compare as strings because a
  // freshly-added item has a synthetic "tmp:N" string id while upstream
  // items have numeric ids.
  return String(item.id);
}

function sameId(item, id) {
  return String(item.id) === String(id);
}

function sameIndex(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.floor(x) : 0;
}

function deepClone(obj) {
  // JSON clone is adequate for our flat shape; no Date/Map/Set values.
  try { return JSON.parse(JSON.stringify(obj)); }
  catch { return { ...obj }; }
}

/**
 * Rewrite `arr` so that items in the given `scope` appear in the order
 * specified by `scopeOrder`, preserving items in other scopes in their
 * existing relative positions.
 */
function interleave(arr, scope, scopeOrder) {
  const result = [];
  let scopeIdx = 0;
  for (const item of arr) {
    if (item.scope === scope) {
      result.push(scopeOrder[scopeIdx++]);
    } else {
      result.push(item);
    }
  }
  return result;
}

/**
 * Used for discard(): determine an item's original position in the baseline
 * so we can re-sort to match it.
 */
function baselineRank(baselineById, item) {
  const keys = [...baselineById.keys()];
  return keys.indexOf(keyOf(item));
}

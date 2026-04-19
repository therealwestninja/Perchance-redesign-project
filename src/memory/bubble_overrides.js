// memory/bubble_overrides.js
//
// User-override state for bubble organization.
//
// The Bubble tool lets users assert structure that overrides k-means
// output: "this card belongs in that bubble," "these bubbles go in this
// order," "within this bubble, the cards go in this order." Once
// asserted, these overrides must survive:
//   - Re-clustering triggered by k-slider changes
//   - Re-clustering triggered by stage mutations (add/promote/etc.)
//   - Adding or removing other cards
//
// Overrides are SESSION-SCOPED. They're discarded when the Memory/Lore
// window closes. Persistence across sessions is out of scope for v1.
//
// This module is pure logic. It owns no DOM, no Dexie, no window state.
// The window owns an instance and feeds it bubble layouts + user actions.

/**
 * @typedef {Object} UserOverrideState
 * @property {Map<string, string>} cardToBubbleId
 *   Override: card id → bubble id it belongs to. Set when a card is
 *   cross-dragged into a bubble. Cleared when the card is deleted or
 *   the target bubble ceases to exist.
 *
 * @property {Map<string, string[]>} bubbleCardOrder
 *   Override: bubble id → ordered card ids within it. Set when a card
 *   is dragged to a new position inside its bubble. Missing entries
 *   default to clustering-driven order.
 *
 * @property {string[]} bubbleOrder
 *   Override: ordered bubble ids. Empty means "use clustering order".
 *   Set when a bubble is dragged among its siblings. New or deleted
 *   bubbles are reconciled on update.
 *
 * @property {Set<string>} lockedBubbles
 *   Set of bubble ids the user has locked. Locked bubbles resist
 *   reorder, cross-drag, re-clustering assignment changes.
 *
 * @property {Map<string, string>} userCreatedBubbles
 *   bubble id → label string. Used specifically for LOCKED bubbles
 *   that lost their cluster seat during re-clustering — preserves
 *   their label while they're kept alive as user-kept empty-shell
 *   bubbles. Keyed by transient bubble id. See note in applyOverrides
 *   on how this differs from bubbleLabelsByStableId.
 *
 * @property {Map<string, string>} bubbleLabelsByStableId
 *   Override: stableBubbleId(members) → user-chosen label. Set when
 *   the user renames a bubble. Applied to whichever bubble in the
 *   current clustering has that stable-id, so the rename survives
 *   re-clusterings. Pruning happens lazily — entries that no longer
 *   match any current bubble are kept in case membership shifts back.
 *
 * @property {Set<string>} userMovedCardIds
 *   Set of card ids the user has EXPLICITLY moved this session
 *   (via cross-bubble drop OR within-bubble reorder). Used at save
 *   time to do TARGETED persistence — only re-assign message slots
 *   for cards the user actually touched. Untouched cards keep
 *   their original (messageId, level, indexInLevel) tuple, which
 *   avoids the "I moved one card and every memory's position
 *   silently shifted" problem under the previous proportional-
 *   remap-everything algorithm.
 *
 *   Cleared with the rest of state when the Memory window closes
 *   (overrides are session-scoped). Pruned by forgetCard() when
 *   a card is deleted.
 */

/**
 * Create a fresh override state.
 * @returns {UserOverrideState}
 */
export function createOverrides() {
  return {
    cardToBubbleId: new Map(),
    bubbleCardOrder: new Map(),
    bubbleOrder: [],
    lockedBubbles: new Set(),
    userCreatedBubbles: new Map(),
    bubbleLabelsByStableId: new Map(),
    userMovedCardIds: new Set(),
  };
}

// ---- membership overrides ----

/**
 * Record that the user moved card `cardId` into `bubbleId`. Overrides
 * the clustering-assigned bubble for this card. Idempotent.
 *
 * @param {UserOverrideState} state
 * @param {string} cardId
 * @param {string} bubbleId
 */
export function assignCardToBubble(state, cardId, bubbleId) {
  state.cardToBubbleId.set(String(cardId), String(bubbleId));
  // Cross-bubble drop is the unambiguous "user moved this" signal —
  // record it so commitDiff can give targeted (not nuke-and-pave)
  // persistence at save time.
  state.userMovedCardIds.add(String(cardId));
}

/**
 * Remove a card's user-asserted membership. The card will fall back
 * to clustering assignment on next bubbleize pass.
 *
 * @param {UserOverrideState} state
 * @param {string} cardId
 */
export function unassignCard(state, cardId) {
  state.cardToBubbleId.delete(String(cardId));
}

/**
 * Called when a card is deleted or its scope changes. Cleans up any
 * user-assignment referencing it, plus removes it from intra-bubble
 * order lists.
 *
 * @param {UserOverrideState} state
 * @param {string} cardId
 */
export function forgetCard(state, cardId) {
  const id = String(cardId);
  state.cardToBubbleId.delete(id);
  state.userMovedCardIds.delete(id);
  for (const [bId, order] of state.bubbleCardOrder) {
    const idx = order.indexOf(id);
    if (idx >= 0) {
      const next = order.slice();
      next.splice(idx, 1);
      if (next.length === 0) state.bubbleCardOrder.delete(bId);
      else state.bubbleCardOrder.set(bId, next);
    }
  }
}

// ---- bubble order overrides ----

/**
 * Set the user-asserted ordering of bubble ids. The caller supplies
 * the full new order; any bubbles missing from the list will fall
 * back to clustering order when resolved.
 *
 * @param {UserOverrideState} state
 * @param {string[]} bubbleIds
 */
export function setBubbleOrder(state, bubbleIds) {
  state.bubbleOrder = bubbleIds.map(String);
}

/**
 * Move bubble `bubbleId` to the position of `beforeBubbleId` (or end
 * if beforeBubbleId is null/undefined). Leaves other bubbles in their
 * current order.
 *
 * @param {UserOverrideState} state
 * @param {string} bubbleId
 * @param {string|null} beforeBubbleId
 * @param {string[]} currentOrder  The ordering the user sees right now
 *   (for resolving "before X" into an index). Pass in the visible
 *   bubble order from the last render.
 */
export function moveBubbleBefore(state, bubbleId, beforeBubbleId, currentOrder) {
  const id = String(bubbleId);
  const order = (currentOrder || []).map(String);
  // Remove if present
  const currentIdx = order.indexOf(id);
  if (currentIdx >= 0) order.splice(currentIdx, 1);
  // Insert
  if (beforeBubbleId == null) {
    order.push(id);
  } else {
    const targetIdx = order.indexOf(String(beforeBubbleId));
    if (targetIdx < 0) order.push(id);
    else order.splice(targetIdx, 0, id);
  }
  state.bubbleOrder = order;
}

// ---- intra-bubble order overrides ----

/**
 * Set the user-asserted ordering of cards within a specific bubble.
 *
 * @param {UserOverrideState} state
 * @param {string} bubbleId
 * @param {string[]} cardIds
 */
export function setBubbleCardOrder(state, bubbleId, cardIds) {
  state.bubbleCardOrder.set(String(bubbleId), cardIds.map(String));
}

/**
 * Move `cardId` to the position of `beforeCardId` (or end if null)
 * within `bubbleId`. Other cards stay in their current order.
 *
 * @param {UserOverrideState} state
 * @param {string} bubbleId
 * @param {string} cardId
 * @param {string|null} beforeCardId
 * @param {string[]} currentCardOrder  The ordering the user sees right now
 *   within this bubble (for resolving "before X" into an index).
 */
export function moveCardBefore(state, bubbleId, cardId, beforeCardId, currentCardOrder) {
  const bId = String(bubbleId);
  const cId = String(cardId);
  const order = (currentCardOrder || []).map(String);
  const currentIdx = order.indexOf(cId);
  if (currentIdx >= 0) order.splice(currentIdx, 1);
  if (beforeCardId == null) {
    order.push(cId);
  } else {
    const targetIdx = order.indexOf(String(beforeCardId));
    if (targetIdx < 0) order.push(cId);
    else order.splice(targetIdx, 0, cId);
  }
  state.bubbleCardOrder.set(bId, order);
  // Within-bubble reorder is also an unambiguous "user moved this"
  // signal — only the dragged card gets tagged, the others in the
  // bubble that just shifted to accommodate stay UNTOUCHED for the
  // purpose of targeted persistence at save time.
  state.userMovedCardIds.add(cId);
}

// ---- lock state ----

/**
 * Toggle lock state for a bubble.
 * @param {UserOverrideState} state
 * @param {string} bubbleId
 * @returns {boolean} the new locked state (true=locked)
 */
export function toggleLock(state, bubbleId) {
  const id = String(bubbleId);
  if (state.lockedBubbles.has(id)) {
    state.lockedBubbles.delete(id);
    return false;
  }
  state.lockedBubbles.add(id);
  return true;
}

/**
 * Is a given bubble locked?
 */
export function isLocked(state, bubbleId) {
  return state.lockedBubbles.has(String(bubbleId));
}

// ---- apply overrides to a bubble layout ----

/**
 * Given a freshly-clustered bubble layout and the current override
 * state, produce the bubble layout the user should see.
 *
 * Steps:
 *   1. Move cards to their user-asserted bubble (or keep clustering).
 *   2. If a card is user-assigned to a bubble id that doesn't exist in
 *      the fresh clustering, create a "user-kept" bubble for it.
 *   3. Sort cards within each bubble according to bubbleCardOrder
 *      (cards missing from the override order keep clustering order
 *      after the ones that are listed).
 *   4. Sort bubbles according to bubbleOrder (missing bubbles tucked
 *      at the end in clustering order).
 *   5. Remove empty bubbles (except user-kept if locked).
 *
 * Return value: a new Bubble[] — does not mutate inputs.
 *
 * Side effects: **may update state** to forget overrides that no
 * longer apply (e.g., user-assigned to a non-existent bubble with
 * no lock). This keeps state clean across recluster cycles.
 *
 * @param {UserOverrideState} state
 * @param {import('./bubbles.js').Bubble[]} freshBubbles
 * @returns {import('./bubbles.js').Bubble[]}
 */
export function applyOverrides(state, freshBubbles, { renameThreshold = 0.5 } = {}) {
  // Index of the fresh clustering: bubble id → bubble object
  const freshByBubbleId = new Map();
  for (const b of freshBubbles || []) {
    freshByBubbleId.set(String(b.id), { ...b, entries: b.entries.slice() });
  }

  // Strip user-assigned cards from their clustering-home, pool them.
  // We'll re-insert them to their asserted bubble below.
  // Track where each card CAME FROM so we can restore it if its override
  // target doesn't exist and isn't locked.
  const userAssignedCards = new Map(); // cardId → { card, targetBubbleId, sourceBubbleId }
  for (const [cardId, targetBubbleId] of state.cardToBubbleId) {
    // Find the card in fresh output
    let found = null;
    let sourceBubbleId = null;
    for (const [bId, bubble] of freshByBubbleId) {
      const idx = bubble.entries.findIndex(e => String(e.id) === cardId);
      if (idx >= 0) {
        found = bubble.entries.splice(idx, 1)[0];
        sourceBubbleId = bId;
        break;
      }
    }
    if (found) {
      userAssignedCards.set(cardId, { card: found, targetBubbleId, sourceBubbleId });
    } else {
      // Card is gone (deleted, scope-changed) — forget the override.
      state.cardToBubbleId.delete(cardId);
    }
  }

  // Inject user-assigned cards into their target bubbles. If the
  // target doesn't exist in fresh output:
  //   - Locked → preserve as a user-kept bubble
  //   - Unlocked → drop the override, restore the card to its source bubble
  for (const [cardId, { card, targetBubbleId, sourceBubbleId }] of userAssignedCards) {
    let target = freshByBubbleId.get(String(targetBubbleId));
    if (!target) {
      if (state.lockedBubbles.has(String(targetBubbleId))) {
        const label = state.userCreatedBubbles.get(String(targetBubbleId)) || 'Group';
        target = {
          id: String(targetBubbleId),
          label,
          entries: [],
          isUngrouped: false,
          userKept: true,
        };
        freshByBubbleId.set(String(targetBubbleId), target);
      } else {
        // Override no longer valid — drop it, put card back where it came from.
        state.cardToBubbleId.delete(String(cardId));
        const source = freshByBubbleId.get(String(sourceBubbleId));
        if (source) source.entries.push(card);
        continue;
      }
    }
    target.entries.push(card);
  }

  // Resolve intra-bubble card orders.
  for (const [bId, bubble] of freshByBubbleId) {
    const userOrder = state.bubbleCardOrder.get(bId);
    if (!userOrder || userOrder.length === 0) continue;
    const byId = new Map();
    for (const e of bubble.entries) byId.set(String(e.id), e);
    const ordered = [];
    for (const cardId of userOrder) {
      const card = byId.get(cardId);
      if (card) {
        ordered.push(card);
        byId.delete(cardId);
      }
    }
    // Cards that weren't in the user-order list come at the end,
    // preserving their clustering order.
    for (const e of bubble.entries) {
      if (byId.has(String(e.id))) ordered.push(e);
    }
    bubble.entries = ordered;
  }

  // Drop bubbles that are empty AND not user-kept locked.
  for (const [bId, bubble] of freshByBubbleId) {
    if (bubble.entries.length === 0 && !state.lockedBubbles.has(bId)) {
      freshByBubbleId.delete(bId);
    }
  }

  // Resolve bubble-level order.
  const freshIds = [...freshByBubbleId.keys()];
  let orderedIds;
  if (state.bubbleOrder.length === 0) {
    orderedIds = freshIds;
  } else {
    const claimed = new Set();
    orderedIds = [];
    for (const id of state.bubbleOrder) {
      if (freshByBubbleId.has(id) && !claimed.has(id)) {
        orderedIds.push(id);
        claimed.add(id);
      }
    }
    // Append any bubbles the user hasn't positioned yet.
    for (const id of freshIds) {
      if (!claimed.has(id)) orderedIds.push(id);
    }
  }

  // Prune any bubbleOrder entries that no longer exist (keeps state
  // clean without affecting user-asserted order).
  state.bubbleOrder = state.bubbleOrder.filter(id => freshByBubbleId.has(id));

  // Apply user-chosen labels (from rename operations). Uses Jaccard-
  // tolerant matching so a rename survives small membership changes
  // (single deletes, promotes, cross-drags in/out). Each stored rename
  // can be claimed by AT MOST ONE current bubble to avoid two different
  // bubbles drifting to look similar to the same rename.
  //
  // Order of resolution: iterate current bubbles largest-first so big
  // bubbles get first pick of fuzzy matches. Small ones fall back to
  // auto-derived label if the nearest rename is already claimed.
  if (state.bubbleLabelsByStableId && state.bubbleLabelsByStableId.size > 0) {
    const claimed = new Set();
    const orderedForResolution = orderedIds
      .map(id => freshByBubbleId.get(id))
      .filter(b => b && !b.isUngrouped && Array.isArray(b.entries) && b.entries.length > 0)
      .sort((a, b) => (b.entries.length - a.entries.length));

    for (const bubble of orderedForResolution) {
      const memberIds = bubble.entries.map(e => String(e.id));
      const match = findLabelOverride(state, memberIds, { threshold: renameThreshold, claimed });
      if (match) {
        bubble.label = match.label;
        bubble.userRenamed = true;
        claimed.add(match.stableId);
      }
    }
  }

  // Drop rename entries whose members have fully left the Memory scope
  // (e.g., whole bubble was promoted to Lore). Entries with any overlap
  // are kept — user may reassemble the original members via undo/drag.
  pruneOrphanedRenames(state, orderedIds.map(id => freshByBubbleId.get(id)));

  return orderedIds.map(id => freshByBubbleId.get(id));
}

// ---- stable-identity bubble IDs ----

/**
 * Derive a stable identity for a bubble from its member card ids.
 * Used when we want to preserve user modifications to a bubble
 * across re-clusterings: the bubble's identity follows its
 * members, not its cluster index.
 *
 * DJB2 hash of sorted member ids, as 'userBubble:' + 8 hex chars.
 *
 * @param {string[]} memberCardIds
 * @returns {string}
 */
export function stableBubbleId(memberCardIds) {
  const sorted = memberCardIds.map(String).sort();
  let hash = 5381 | 0;
  for (const id of sorted) {
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) + hash) + id.charCodeAt(i);
      hash |= 0;
    }
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `userBubble:${hex}`;
}

/**
 * Record a stable id for a user-modified bubble so we can preserve
 * its label across re-clusterings.
 *
 * @param {UserOverrideState} state
 * @param {string} bubbleId
 * @param {string} label
 */
export function rememberUserBubble(state, bubbleId, label) {
  state.userCreatedBubbles.set(String(bubbleId), String(label));
}

/**
 * Rename a bubble. The rename is keyed by the bubble's STABLE identity
 * (hash of sorted member card ids) AND stores the original member list
 * so we can do tolerant matching when membership shifts later.
 *
 * Empty-string label clears the rename (falls back to auto-derived).
 *
 * @param {UserOverrideState} state
 * @param {string[]} memberCardIds
 * @param {string} label
 */
export function renameBubble(state, memberCardIds, label) {
  const stableId = stableBubbleId(memberCardIds);
  const trimmed = String(label || '').trim();
  if (!trimmed) {
    state.bubbleLabelsByStableId.delete(stableId);
  } else {
    state.bubbleLabelsByStableId.set(stableId, {
      label: trimmed,
      memberIds: memberCardIds.map(String),
    });
  }
}

/**
 * Look up the user-chosen label for a bubble by its CURRENT members.
 *
 * Matching strategy:
 *   1. Exact match on stable-id hash (fast path).
 *   2. If no exact match, walk every stored entry and compute Jaccard
 *      similarity between its original member set and the candidate
 *      member set. Pick the best match above `threshold`.
 *
 * Caller is responsible for calling this once per bubble in the render
 * pass and tracking which stored entries have been claimed (to avoid
 * two current bubbles both matching the same stored rename).
 *
 * @param {UserOverrideState} state
 * @param {string[]} memberCardIds
 * @param {{ threshold?: number, claimed?: Set<string> }} [opts]
 * @returns {{ label: string, stableId: string, jaccard: number } | null}
 */
export function findLabelOverride(state, memberCardIds, { threshold = 0.5, claimed } = {}) {
  if (!state.bubbleLabelsByStableId || state.bubbleLabelsByStableId.size === 0) return null;
  if (!Array.isArray(memberCardIds) || memberCardIds.length === 0) return null;

  // Fast path: exact stable-id match.
  const exactId = stableBubbleId(memberCardIds);
  const exactEntry = state.bubbleLabelsByStableId.get(exactId);
  if (exactEntry && (!claimed || !claimed.has(exactId))) {
    return { label: exactEntry.label, stableId: exactId, jaccard: 1 };
  }

  // Slow path: Jaccard search.
  const candidateSet = new Set(memberCardIds.map(String));
  let best = null;
  let bestJaccard = 0;

  for (const [storedId, entry] of state.bubbleLabelsByStableId) {
    if (claimed && claimed.has(storedId)) continue;
    if (!entry || !Array.isArray(entry.memberIds)) continue;

    const storedSet = new Set(entry.memberIds.map(String));
    let intersection = 0;
    const smaller = candidateSet.size <= storedSet.size ? candidateSet : storedSet;
    const larger  = candidateSet.size <= storedSet.size ? storedSet : candidateSet;
    for (const x of smaller) if (larger.has(x)) intersection++;
    const unionSize = candidateSet.size + storedSet.size - intersection;
    const j = unionSize === 0 ? 0 : intersection / unionSize;

    if (j >= threshold && j > bestJaccard) {
      bestJaccard = j;
      best = { label: entry.label, stableId: storedId, jaccard: j };
    }
  }
  return best;
}

/**
 * Remove rename entries that have zero overlap with any provided current
 * bubble's members. Call after applyOverrides when we want to reclaim
 * space from renames whose cards have entirely left the Memory scope
 * (typically via batch-promote-to-lore or batch-delete).
 *
 * Entries with ANY overlap (even below threshold) are preserved — the
 * user may yet reassemble the original membership via drag or undo.
 *
 * @param {UserOverrideState} state
 * @param {import('./bubbles.js').Bubble[]} currentBubbles
 */
export function pruneOrphanedRenames(state, currentBubbles) {
  if (!state.bubbleLabelsByStableId || state.bubbleLabelsByStableId.size === 0) return;
  const allCurrentIds = new Set();
  for (const b of currentBubbles || []) {
    for (const e of (b.entries || [])) allCurrentIds.add(String(e.id));
  }
  for (const [stableId, entry] of [...state.bubbleLabelsByStableId]) {
    if (!entry || !Array.isArray(entry.memberIds)) {
      state.bubbleLabelsByStableId.delete(stableId);
      continue;
    }
    const hasAny = entry.memberIds.some(id => allCurrentIds.has(String(id)));
    if (!hasAny) {
      state.bubbleLabelsByStableId.delete(stableId);
    }
  }
}

/**
 * Look up the user-chosen label for a bubble by its members (exact only).
 * Kept for backward compatibility with tests. Prefer findLabelOverride
 * for new code.
 *
 * @param {UserOverrideState} state
 * @param {string[]} memberCardIds
 * @returns {string | null}
 */
export function getBubbleLabelOverride(state, memberCardIds) {
  const stableId = stableBubbleId(memberCardIds);
  const entry = state.bubbleLabelsByStableId.get(stableId);
  return entry ? entry.label : null;
}

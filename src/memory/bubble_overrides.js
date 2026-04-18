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
 *   bubble id → stable identity hash. Bubble ids from pure clustering
 *   are `bubble:N` (cluster index) and change meaning when k changes.
 *   User-modified bubbles get stable ids derived from their members
 *   so they can be tracked across re-clusterings.
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
export function applyOverrides(state, freshBubbles) {
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

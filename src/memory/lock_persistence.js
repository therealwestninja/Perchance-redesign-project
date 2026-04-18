// memory/lock_persistence.js
//
// Persistent per-thread bubble-lock storage.
//
// Bubble IDs from clustering (`bubble:0`, `bubble:1`, ...) are NOT stable
// across sessions: re-clustering generates fresh IDs. To persist locks,
// we store each locked bubble's STABLE identity — a hash of its member
// card IDs (see `stableBubbleId` in bubble_overrides.js). On the next
// open, we match persisted stable IDs against current clustering output
// and transfer the lock to whichever current bubble best matches.
//
// Storage shape:
//   settings.memory.lockedBubblesByThread: {
//     [threadId]: {
//       [stableBubbleId]: {
//         memberIds: string[],   // card ids that were locked together
//         createdAt: number,
//       }
//     }
//   }
//
// We store the ORIGINAL member IDs (not just the hash) so reconciliation
// can compute Jaccard similarity against current bubbles. This costs a
// bit of storage per lock but makes reconciliation deterministic.

import { loadSettings, updateField } from '../profile/settings_store.js';
import { stableBubbleId } from './bubble_overrides.js';

/**
 * Load persisted locks for a thread.
 *
 * @param {string|number} threadId
 * @returns {Record<string, {memberIds: string[], createdAt: number}>}
 */
export function loadLocks(threadId) {
  if (threadId == null) return {};
  try {
    const s = loadSettings();
    const all = (s && s.memory && s.memory.lockedBubblesByThread) || {};
    const forThread = all[String(threadId)];
    return (forThread && typeof forThread === 'object') ? forThread : {};
  } catch {
    return {};
  }
}

/**
 * Replace the persisted lock map for a thread.
 *
 * @param {string|number} threadId
 * @param {Record<string, {memberIds: string[], createdAt: number}>} locks
 */
export function saveLocks(threadId, locks) {
  if (threadId == null) return;
  try {
    const s = loadSettings();
    const all = (s && s.memory && s.memory.lockedBubblesByThread) || {};
    all[String(threadId)] = locks || {};
    updateField('memory.lockedBubblesByThread', all);
  } catch { /* persist best-effort */ }
}

/**
 * Record a lock for a bubble. Uses its current member IDs to derive
 * the stable identity, then stores member IDs so reconciliation can
 * fuzzy-match across sessions.
 *
 * @param {string|number} threadId
 * @param {string[]} memberIds
 * @returns {string} stable ID of the newly-persisted lock
 */
export function persistLock(threadId, memberIds) {
  const stableId = stableBubbleId(memberIds);
  const locks = loadLocks(threadId);
  locks[stableId] = {
    memberIds: memberIds.map(String),
    createdAt: Date.now(),
  };
  saveLocks(threadId, locks);
  return stableId;
}

/**
 * Remove a lock by its stable ID.
 *
 * @param {string|number} threadId
 * @param {string} stableId
 */
export function forgetLock(threadId, stableId) {
  const locks = loadLocks(threadId);
  if (stableId in locks) {
    delete locks[stableId];
    saveLocks(threadId, locks);
  }
}

/**
 * Remove all locks for a thread. Useful for debugging or when the user
 * wants to reset.
 *
 * @param {string|number} threadId
 */
export function clearLocks(threadId) {
  saveLocks(threadId, {});
}

/**
 * Given a set of bubbles from fresh clustering and a map of persisted
 * locks (stableId → {memberIds, createdAt}), reconcile: for each
 * persisted lock, find the CURRENT bubble whose members best overlap
 * with the persisted memberIds, and mark it as locked.
 *
 * Match quality: Jaccard similarity (|intersection| / |union|). We
 * require similarity ≥ threshold (default 0.5) to avoid transferring
 * a lock to a bubble that barely resembles the original. Below the
 * threshold, the lock is dropped silently — user can re-lock manually.
 *
 * Each current bubble can receive at most ONE lock (the best match).
 * Each persisted lock can land on at most ONE current bubble.
 *
 * @param {import('./bubbles.js').Bubble[]} freshBubbles
 * @param {Record<string, {memberIds: string[]}>} persistedLocks
 * @param {{ threshold?: number }} [opts]
 * @returns {{
 *   lockedBubbleIds: Set<string>,   // current bubble IDs to lock
 *   orphanedStableIds: string[],    // persisted locks that couldn't be matched
 *   transferredIds: Array<{stableId: string, newBubbleId: string, jaccard: number}>
 * }}
 */
export function reconcileLocks(freshBubbles, persistedLocks, { threshold = 0.5 } = {}) {
  const bubbleList = Array.isArray(freshBubbles) ? freshBubbles : [];
  const persisted = persistedLocks || {};

  const lockedBubbleIds = new Set();
  const orphanedStableIds = [];
  const transferredIds = [];

  // Pre-compute member-ID sets per fresh bubble for faster Jaccard
  const freshSets = bubbleList.map(b => ({
    id: b.id,
    ids: new Set(b.entries.map(e => String(e.id))),
  }));

  // Track which fresh bubbles have already been claimed by a lock so
  // we don't double-assign.
  const claimed = new Set();

  // Process persisted locks in ORDER that prefers larger original
  // bubbles first (so a big "Alice/Bob" lock gets first pick against
  // a small "Alice" lock).
  const persistedEntries = Object.entries(persisted).sort((a, b) => {
    return (b[1].memberIds?.length || 0) - (a[1].memberIds?.length || 0);
  });

  for (const [stableId, lockData] of persistedEntries) {
    const persistedSet = new Set((lockData.memberIds || []).map(String));
    if (persistedSet.size === 0) {
      orphanedStableIds.push(stableId);
      continue;
    }

    // Find best-match fresh bubble by Jaccard
    let bestMatch = null;
    let bestJaccard = 0;
    for (const fresh of freshSets) {
      if (claimed.has(fresh.id)) continue;
      const j = jaccard(persistedSet, fresh.ids);
      if (j > bestJaccard) {
        bestJaccard = j;
        bestMatch = fresh;
      }
    }

    if (bestMatch && bestJaccard >= threshold) {
      lockedBubbleIds.add(bestMatch.id);
      claimed.add(bestMatch.id);
      transferredIds.push({
        stableId,
        newBubbleId: bestMatch.id,
        jaccard: bestJaccard,
      });
    } else {
      orphanedStableIds.push(stableId);
    }
  }

  return { lockedBubbleIds, orphanedStableIds, transferredIds };
}

/**
 * Jaccard similarity between two sets: |A ∩ B| / |A ∪ B|.
 *
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number} in [0, 1]
 */
function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  const smaller = a.size <= b.size ? a : b;
  const larger  = a.size <= b.size ? b : a;
  for (const x of smaller) {
    if (larger.has(x)) intersection++;
  }
  const unionSize = a.size + b.size - intersection;
  return unionSize === 0 ? 0 : intersection / unionSize;
}

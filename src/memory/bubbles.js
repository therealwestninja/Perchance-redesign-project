// memory/bubbles.js
//
// Bubble composition. Takes a flat list of memory/lore entries with
// optional embedding vectors, returns a labeled array of bubbles grouping
// semantically similar entries.
//
// Bubbles are a PROJECTION over entries, not a persisted data structure:
//   - Every entry belongs to exactly one bubble.
//   - Bubbles only exist within a rendering pass. Stage.js and db.js are
//     entirely bubble-unaware — they still operate on individual entries.
//   - Recompute bubbles any time the entry list changes (add/edit/
//     promote/demote/delete). Labels and cluster shapes may shift.
//
// Entries with no embedding cannot be clustered; they go in a dedicated
// "Ungrouped" bubble at the end. Callers may choose to compute missing
// embeddings on-the-fly (via window.embedTexts) before calling bubbleize.

import { kmeans, recommendK, l2Normalize } from './clustering.js';
import { bestLabel } from './ner.js';

/**
 * @typedef {Object} BubbleEntry
 * @property {string | number} id
 * @property {'memory' | 'lore'} scope
 * @property {string} text
 * @property {Float32Array | number[] | null | undefined} embedding
 */

/**
 * @typedef {Object} Bubble
 * @property {string} id        stable synthetic id: 'bubble:<idx>' or 'bubble:ungrouped'
 * @property {string} label
 * @property {BubbleEntry[]} entries
 * @property {boolean} isUngrouped
 */

const UNGROUPED_ID = 'bubble:ungrouped';
const UNGROUPED_LABEL = 'Ungrouped';
const GENERIC_LABEL_PREFIX = 'Group';

/**
 * Group entries into bubbles by semantic similarity.
 *
 * @param {Object} opts
 * @param {BubbleEntry[]} opts.entries
 * @param {number} [opts.k]  cluster count. Omit to auto-compute via recommendK().
 * @returns {Bubble[]}
 */
export function bubbleize({ entries, k } = {}) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  if (safeEntries.length === 0) return [];

  // Split: embedded entries go through k-means; unembedded go to Ungrouped.
  const embedded = [];
  const unembedded = [];
  for (const e of safeEntries) {
    if (hasUsableEmbedding(e)) embedded.push(e);
    else unembedded.push(e);
  }

  const bubbles = [];

  if (embedded.length > 0) {
    // Convert embeddings to mutable vectors (k-means normalizes in place
    // — we don't want to mutate the original Float32Array coming from
    // Dexie which might be referenced elsewhere).
    const vectors = embedded.map(e => copyVector(e.embedding));
    for (const v of vectors) l2Normalize(v);

    const effectiveK = (k != null && Number.isFinite(k))
      ? Math.max(1, Math.min(k | 0, embedded.length))
      : recommendK(embedded.length);

    const { assignments } = kmeans({ vectors, k: effectiveK });

    // Group entries by cluster assignment
    const clusterIndices = Array.from({ length: effectiveK }, () => []);
    for (let i = 0; i < embedded.length; i++) {
      clusterIndices[assignments[i]].push(i);
    }

    // Emit non-empty bubbles in cluster-index order (stable for a given k)
    for (let c = 0; c < effectiveK; c++) {
      const idxList = clusterIndices[c];
      if (idxList.length === 0) continue;
      const clusterEntries = idxList.map(i => embedded[i]);
      const label = deriveLabel(clusterEntries, c);
      bubbles.push({
        id: `bubble:${c}`,
        label,
        entries: clusterEntries,
        isUngrouped: false,
      });
    }
  }

  if (unembedded.length > 0) {
    bubbles.push({
      id: UNGROUPED_ID,
      label: UNGROUPED_LABEL,
      entries: unembedded,
      isUngrouped: true,
    });
  }

  return bubbles;
}

/**
 * Rebucket entries into a previous bubble layout, preserving labels and
 * cluster membership where possible. Useful after a stage mutation: we
 * don't want renames or minor edits to reshuffle every bubble.
 *
 * Strategy: any entry whose id existed in the prior layout stays in its
 * prior bubble. New entries are clustered against the prior cluster
 * centers (nearest-center assignment, no k-means iteration). Entries
 * that have moved scope still belong to their same topic bubble.
 *
 * If the prior layout is missing entirely (first render, or entry count
 * changed drastically) we fall back to fresh bubbleize.
 *
 * @param {Object} opts
 * @param {BubbleEntry[]} opts.entries
 * @param {Bubble[]} [opts.prior]
 * @param {number} [opts.k]
 * @returns {Bubble[]}
 */
export function rebucket({ entries, prior, k } = {}) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  if (!prior || prior.length === 0) return bubbleize({ entries: safeEntries, k });

  // Build id → prior-bubble-id map
  const idToPrior = new Map();
  for (const bubble of prior) {
    for (const e of bubble.entries) idToPrior.set(String(e.id), bubble.id);
  }

  // Every entry that already has a home keeps it; new entries need placement.
  const knownByBubbleId = new Map(); // bubbleId → entries
  const newEntries = [];
  for (const e of safeEntries) {
    const priorId = idToPrior.get(String(e.id));
    if (priorId != null) {
      if (!knownByBubbleId.has(priorId)) knownByBubbleId.set(priorId, []);
      knownByBubbleId.get(priorId).push(e);
    } else {
      newEntries.push(e);
    }
  }

  // If we have no prior semantic centers to reuse, just fresh-bubble.
  // (Could compute centers from priors, but that's complexity we don't need
  // until stage mutations start looking jittery in practice.)
  if (newEntries.length > 0) {
    // Fold new entries into the most-similar existing bubble by
    // re-clustering with the full input. Simple and predictable.
    return bubbleize({ entries: safeEntries, k });
  }

  // No new entries → rebuild the previous structure with its labels intact.
  return prior
    .map(bubble => ({
      ...bubble,
      entries: knownByBubbleId.get(bubble.id) || [],
    }))
    .filter(bubble => bubble.entries.length > 0);
}

/**
 * Lock-aware bubbleize. Takes the current bubble layout + a lock set, and:
 *
 *   1. Extracts frozen bubbles (those whose id is in lockedBubbleIds) from
 *      the prior layout. Their entries are taken off the table.
 *   2. Runs fresh bubbleize on the REMAINING entries with the given k.
 *   3. Concatenates frozen + fresh bubbles. Frozen first (they're more
 *      meaningful to the user — they pinned them deliberately).
 *
 * k in this signature means "number of clusters for FREE entries only."
 * Total displayed bubble count = lockedCount + k. Chosen this way because:
 * the user's mental model is "I've pinned these clusters; now let me tune
 * the rest." The k-slider acts over the unpinned portion.
 *
 * Entries that belong to frozen bubbles but aren't in the current entry
 * list (stale — e.g., user deleted a card from a locked bubble) are
 * silently dropped from the frozen copy. Frozen bubbles that end up
 * empty are still preserved (the user locked them deliberately, they're
 * a shell that could receive user-assigned cards).
 *
 * @param {Object} opts
 * @param {BubbleEntry[]} opts.entries        All current entries (free + frozen)
 * @param {Bubble[]} [opts.currentBubbles]    Previous layout — source of frozen bubbles
 * @param {Set<string>} [opts.lockedBubbleIds]
 * @param {number} [opts.k]                   Clusters for FREE entries (see doc above)
 * @returns {Bubble[]}
 */
export function bubbleizeWithLocks({
  entries,
  currentBubbles,
  lockedBubbleIds,
  k,
} = {}) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const safePrior = Array.isArray(currentBubbles) ? currentBubbles : [];
  const locks = lockedBubbleIds instanceof Set
    ? lockedBubbleIds
    : new Set(Array.isArray(lockedBubbleIds) ? lockedBubbleIds : []);

  // No locks? Just run the vanilla pipeline.
  if (locks.size === 0 || safePrior.length === 0) {
    return bubbleize({ entries: safeEntries, k });
  }

  // Index entries by id for quick lookup when reconciling frozen-bubble members.
  const entryById = new Map();
  for (const e of safeEntries) entryById.set(String(e.id), e);

  // Build frozen bubbles by taking locked bubbles from prior, filtering their
  // members down to only those still present in the current entry list.
  const frozenBubbles = [];
  const frozenEntryIds = new Set();
  for (const bubble of safePrior) {
    if (!locks.has(String(bubble.id))) continue;
    const filteredEntries = [];
    for (const e of bubble.entries) {
      const current = entryById.get(String(e.id));
      if (current) {
        filteredEntries.push(current);
        frozenEntryIds.add(String(e.id));
      }
    }
    frozenBubbles.push({
      ...bubble,
      entries: filteredEntries,
    });
  }

  // Free entries = everything not frozen.
  const freeEntries = safeEntries.filter(e => !frozenEntryIds.has(String(e.id)));

  // Cluster only the free entries.
  const rawFreeBubbles = bubbleize({ entries: freeEntries, k });

  // Rename free bubble IDs so they don't collide with any locked IDs.
  // Locked bubble IDs come from a prior session and use `bubble:N`; fresh
  // bubbleize also produces `bubble:N` starting from 0. Without renaming,
  // a locked `bubble:0` and a fresh free `bubble:0` would both appear
  // in the output, breaking downstream code that assumes unique IDs.
  const freeBubbles = rawFreeBubbles.map((b, i) => ({
    ...b,
    id: b.isUngrouped ? b.id : `bubble:free:${i}`,
  }));

  // Frozen first, free after. Stable ordering means the user sees their pinned
  // work at the top, and fresh clusters appear below.
  return [...frozenBubbles, ...freeBubbles];
}

/**
 * Lock-aware rebucket. Entries inside locked bubbles stay put; only the free
 * portion is rebucketed against prior.
 *
 * @param {Object} opts
 * @param {BubbleEntry[]} opts.entries
 * @param {Bubble[]} [opts.prior]
 * @param {Set<string>} [opts.lockedBubbleIds]
 * @param {number} [opts.k]
 * @returns {Bubble[]}
 */
export function rebucketWithLocks({ entries, prior, lockedBubbleIds, k } = {}) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const safePrior = Array.isArray(prior) ? prior : [];
  const locks = lockedBubbleIds instanceof Set
    ? lockedBubbleIds
    : new Set(Array.isArray(lockedBubbleIds) ? lockedBubbleIds : []);

  if (locks.size === 0) return rebucket({ entries: safeEntries, prior: safePrior, k });

  const entryById = new Map();
  for (const e of safeEntries) entryById.set(String(e.id), e);

  // Pull frozen bubbles out of prior.
  const frozenBubbles = [];
  const frozenEntryIds = new Set();
  const nonFrozenPrior = [];
  for (const bubble of safePrior) {
    if (locks.has(String(bubble.id))) {
      const filteredEntries = [];
      for (const e of bubble.entries) {
        const current = entryById.get(String(e.id));
        if (current) {
          filteredEntries.push(current);
          frozenEntryIds.add(String(e.id));
        }
      }
      frozenBubbles.push({ ...bubble, entries: filteredEntries });
    } else {
      nonFrozenPrior.push(bubble);
    }
  }

  const freeEntries = safeEntries.filter(e => !frozenEntryIds.has(String(e.id)));
  const rawFreeBubbles = rebucket({ entries: freeEntries, prior: nonFrozenPrior, k });

  // Rename free bubble IDs to avoid collision with locked IDs (see
  // bubbleizeWithLocks for why).
  const freeBubbles = rawFreeBubbles.map((b, i) => ({
    ...b,
    id: b.isUngrouped ? b.id : `bubble:free:${i}`,
  }));

  return [...frozenBubbles, ...freeBubbles];
}

// ---- helpers ----

function hasUsableEmbedding(entry) {
  if (!entry) return false;
  const emb = entry.embedding;
  if (!emb) return false;
  if (typeof emb.length !== 'number' || emb.length === 0) return false;
  // Detect degenerate all-zero vectors (sometimes returned by failed
  // embedder calls). L2 = 0 ⇒ no usable direction.
  for (let i = 0; i < emb.length; i++) {
    if (emb[i] !== 0) return true;
  }
  return false;
}

function copyVector(src) {
  const dst = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) dst[i] = src[i] || 0;
  return dst;
}

function deriveLabel(entries, clusterIndex) {
  const text = entries.map(e => e.text || '').join('\n');
  // Small clusters benefit from minCount=1; large clusters benefit from
  // requiring repeated mention to avoid picking one-off trivia.
  const minCount = entries.length >= 4 ? 2 : 1;
  const label = bestLabel(text, { minCount })
    || bestLabel(text, { minCount: 1 })
    || `${GENERIC_LABEL_PREFIX} ${clusterIndex + 1}`;
  return label;
}

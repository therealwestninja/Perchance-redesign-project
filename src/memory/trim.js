// memory/trim.js
//
// Pure prune/dedup logic. Given an array of entry strings and an options
// bundle, returns { kept, removed, byDedup, byLong, byAge, ... }.
//
// Adapted from PMT (Perchance Memory Trimmer Tool) src/core/trim.js —
// MIT licensed. The logic is preserved; style reformatted for our conventions
// (ESM, idiomatic nullish coalescing) and the token-budget path's
// getNativeTokenCount dependency is lifted up into the caller so this module
// stays fully pure (no host probing).
//
// Modes:
//   trimMode === 'newest'       (default) — drop the oldest entries until
//                                            length ≤ keepN. Pinned entries
//                                            always kept, counted against
//                                            the keepN quota.
//   trimMode === 'token_budget' — keep newest-first until adding the next
//                                  would exceed targetTokens, with optional
//                                  continuity scoring to prefer higher-value
//                                  entries when trimming. Requires caller
//                                  to supply tokenCounter: (text) => number.
//
// Order preservation: kept entries are returned in their original index
// order regardless of how they were selected. PMT's BUG-03a/b fixes are
// preserved — pinned entries respect chronology, not a bolt-on-at-the-top
// placement.

/**
 * @param {string[]} entries  Input entries, order is chronology (oldest → newest)
 * @param {{
 *   keepN?: number | string,
 *   charLimit?: number | string,
 *   trimLong?: boolean,
 *   dedup?: boolean,
 *   trimMode?: 'newest' | 'token_budget',
 *   targetTokens?: number,
 *   tokenCounter?: (text: string) => number,
 *   protectedEntryIds?: Set<string>,
 *   getEntryId?: (entry: string) => string,
 *   continuityScores?: Array<{ entryId: string, score: number }>,
 * }} opts
 * @returns {{
 *   kept: string[],
 *   removed: string[],
 *   byDedup: string[],
 *   byLong: string[],
 *   byAge: string[],
 *   originalCount: number,
 *   finalCount: number,
 *   totalRemoved: number,
 *   keptPct: number,
 *   overBudgetPinWarning: boolean,
 *   trimMode: string,
 * }}
 */
export function runTrim(entries, opts = {}) {
  const {
    charLimit,
    keepN,
    trimLong = false,
    dedup = false,
    trimMode = 'newest',
    targetTokens = 0,
    tokenCounter = null,
    protectedEntryIds = new Set(),
    getEntryId = null,
    continuityScores = null,
  } = opts;

  // We work on { text, origIdx } records so we can re-sort by chronology
  // at the end regardless of intermediate reorderings.
  let work = (entries || []).map((text, origIdx) => ({ text, origIdx }));

  // ---- stage 1: exact dedup ----
  const byDedup = [];
  if (dedup) {
    const seen = new Set();
    const next = [];
    for (const rec of work) {
      if (seen.has(rec.text)) byDedup.push(rec.text);
      else { seen.add(rec.text); next.push(rec); }
    }
    work = next;
  }

  // ---- stage 2: length-based trim ----
  const byLong = [];
  if (trimLong) {
    const limit = Math.max(1, parseInt(charLimit, 10) || 200);
    const next = [];
    for (const rec of work) {
      const id = getEntryId ? getEntryId(rec.text) : null;
      const isProtected = id && protectedEntryIds.has(id);
      if (!isProtected && rec.text.length > limit) byLong.push(rec.text);
      else next.push(rec);
    }
    work = next;
  }

  // ---- stage 3: age-based or token-budget trim ----
  const byAge = [];
  if (trimMode === 'token_budget' && targetTokens > 0) {
    const result = tokenBudgetTrim(work, {
      targetTokens,
      tokenCounter,
      protectedEntryIds,
      getEntryId,
      continuityScores,
    });
    byAge.push(...result.removed.map(r => r.text));
    work = result.kept;
  } else {
    const n = parseInt(keepN, 10);
    if (!isNaN(n) && n > 0 && work.length > n) {
      if (getEntryId && protectedEntryIds.size > 0) {
        // Pinned entries always kept; they count against the keepN quota.
        // Unpinned are pruned oldest-first. Order is restored to chronological
        // after selection so UI sees a coherent timeline.
        const pinned = work.filter(r => protectedEntryIds.has(getEntryId(r.text)));
        const unpinned = work.filter(r => !protectedEntryIds.has(getEntryId(r.text)));
        const keepFromUnpinned = Math.max(0, n - pinned.length);
        const droppedUnpinned = unpinned.slice(0, unpinned.length - keepFromUnpinned);
        byAge.push(...droppedUnpinned.map(r => r.text));
        const kept = [...pinned, ...unpinned.slice(unpinned.length - keepFromUnpinned)];
        kept.sort((a, b) => a.origIdx - b.origIdx);
        work = kept;
      } else {
        const dropped = work.splice(0, work.length - n);
        byAge.push(...dropped.map(r => r.text));
      }
    }
  }

  // ---- stage 4: package results ----
  const kept = work.map(r => r.text);
  const removed = [...byDedup, ...byLong, ...byAge];
  const originalCount = (entries || []).length;
  const finalCount = kept.length;

  // Token-budget mode can produce a state where pinned entries alone exceed
  // the target. We flag this for the UI to warn rather than silently
  // returning an over-budget result.
  let overBudgetPinWarning = false;
  if (trimMode === 'token_budget' && targetTokens > 0 && getEntryId && typeof tokenCounter === 'function') {
    const pinnedKept = kept.filter(e => protectedEntryIds.has(getEntryId(e)));
    if (pinnedKept.length > 0) {
      const pinnedTokens = tokenCounter(pinnedKept.join('\n\n'));
      overBudgetPinWarning = pinnedTokens > targetTokens;
    }
  }

  return {
    kept,
    removed,
    byDedup,
    byLong,
    byAge,
    originalCount,
    finalCount,
    totalRemoved: removed.length,
    keptPct: originalCount > 0 ? Math.round((finalCount / originalCount) * 100) : 100,
    overBudgetPinWarning,
    trimMode,
  };
}

/**
 * Internal: token-budget path. Keeps newest-first, optionally biasing
 * which entries to drop by a continuity score (higher = keep, lower = drop).
 * Falls back to pure newest-first if no scores supplied.
 */
function tokenBudgetTrim(records, { targetTokens, tokenCounter, protectedEntryIds, getEntryId, continuityScores }) {
  if (typeof tokenCounter !== 'function') {
    // Degrade gracefully — behave like no-op if caller forgot to supply a counter
    return { kept: [...records], removed: [] };
  }

  const scoreMap = new Map();
  if (continuityScores) {
    for (const { entryId, score } of continuityScores) scoreMap.set(entryId, score);
  }

  const pinned = records.filter(r => getEntryId && protectedEntryIds.has(getEntryId(r.text)));
  const unpinned = records.filter(r => !getEntryId || !protectedEntryIds.has(getEntryId(r.text)));

  // If we have scores, sort unpinned lowest-first — those are the first to
  // be considered for dropping when we hit budget.
  if (continuityScores && getEntryId) {
    unpinned.sort((a, b) => {
      const sa = scoreMap.get(getEntryId(a.text)) ?? 0;
      const sb = scoreMap.get(getEntryId(b.text)) ?? 0;
      return sa - sb;
    });
  }

  // Start with pinned; greedily add unpinned newest-first until budget is hit.
  const kept = [...pinned];
  const removed = [];
  const reviewOrder = [...unpinned].reverse(); // newest-first consideration
  for (const rec of reviewOrder) {
    const candidate = [...kept, rec];
    const tokens = tokenCounter(candidate.map(r => r.text).join('\n\n'));
    if (tokens <= targetTokens) kept.push(rec);
    else removed.unshift(rec);
  }

  kept.sort((a, b) => a.origIdx - b.origIdx);
  removed.sort((a, b) => a.origIdx - b.origIdx);
  return { kept, removed };
}

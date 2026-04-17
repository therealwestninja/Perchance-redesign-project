// memory/duplicates.js
//
// Near-duplicate clustering via Jaccard similarity on token sets.
// Used to surface "these entries overlap heavily — merge or drop one?"
// suggestions to the user.
//
// Adapted from PMT (Perchance Memory Trimmer Tool) src/core/duplicates.js —
// MIT licensed. Logic preserved verbatim; reformatted for ESM and our
// conventions.
//
// Jaccard similarity: intersection(A, B) / union(A, B). Tokens are
// lowercased a-z0-9 sequences. Threshold defaults to 0.6 — moderate
// overlap. PMT found this produced clusters that users recognized
// as "these are basically saying the same thing" without being so
// strict that paraphrases got missed.
//
// This is O(N²) in the number of entries. For a typical chat thread
// that stays well under a few hundred memories, that's fine. For
// pathological sizes the UI should consider chunking or a cheaper
// pre-filter.

/**
 * Tokenize: lowercase a-z0-9' runs, space-split, non-empty only.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  return String(text != null ? text : '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Jaccard similarity of two token sets.
 * Empty-both returns 1 (identical emptiness), empty-one returns 0.
 * @param {Set<string>} setA
 * @param {Set<string>} setB
 * @returns {number} in [0, 1]
 */
export function jaccard(setA, setB) {
  if (!setA.size && !setB.size) return 1;
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

/**
 * Compare two entries — similarity + human-readable reasons.
 * @param {string} a
 * @param {string} b
 * @returns {{ similarity: number, reasons: string[] }}
 */
export function compareEntries(a, b) {
  const tokA = new Set(tokenize(a));
  const tokB = new Set(tokenize(b));
  const sim = jaccard(tokA, tokB);
  const reasons = [];
  if      (sim >= 0.9) reasons.push('near-identical phrasing');
  else if (sim >= 0.7) reasons.push('high token overlap');
  else if (sim >= 0.5) reasons.push('moderate token overlap');

  const lenA = a.length || 1;
  const lenB = b.length || 1;
  const ratio = Math.min(lenA, lenB) / Math.max(lenA, lenB);
  if (ratio < 0.5) reasons.push('length mismatch (possible paraphrase)');

  return { similarity: sim, reasons };
}

/**
 * Build clusters of near-duplicate entries. Greedy single-pass: for each
 * unassigned entry, scan forward and absorb anything above `threshold`.
 * Clusters with < 2 entries are discarded (not useful to surface).
 *
 * @param {string[]} entries
 * @param {(entry: string) => string} getEntryId
 * @param {number} [threshold=0.6]
 * @returns {Array<{
 *   ids: string[],
 *   entries: string[],
 *   maxSimilarity: number,
 *   reasons: string[],
 * }>}
 */
export function buildNearDupClusters(entries, getEntryId, threshold = 0.6) {
  const clusters = [];
  const assigned = new Set();

  for (let i = 0; i < entries.length; i++) {
    if (assigned.has(i)) continue;
    const cluster = { indices: [i], maxSimilarity: 0, reasons: new Set() };
    for (let j = i + 1; j < entries.length; j++) {
      if (assigned.has(j)) continue;
      const { similarity, reasons } = compareEntries(entries[i], entries[j]);
      if (similarity >= threshold) {
        cluster.indices.push(j);
        cluster.maxSimilarity = Math.max(cluster.maxSimilarity, similarity);
        reasons.forEach(r => cluster.reasons.add(r));
        assigned.add(j);
      }
    }
    if (cluster.indices.length > 1) {
      assigned.add(i);
      clusters.push({
        ids: cluster.indices.map(idx => getEntryId(entries[idx])),
        entries: cluster.indices.map(idx => entries[idx]),
        maxSimilarity: cluster.maxSimilarity,
        reasons: [...cluster.reasons],
      });
    }
  }

  return clusters.sort((a, b) => b.maxSimilarity - a.maxSimilarity);
}

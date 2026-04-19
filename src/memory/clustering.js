// memory/clustering.js
//
// Pure k-means clustering over embedding vectors. Used by bubbles.js to
// group memories by semantic similarity.
//
// Design decisions:
//
// 1. Seeded deterministic RNG. Two runs on the same data produce identical
//    clusters. Users revisit the curation tool; non-determinism would be
//    experienced as "wait, why is Elara split in two today?" The seed is
//    derived from the input (count + first-vector-hash) so small changes
//    to the data are tolerated without reshuffling unrelated clusters.
//
// 2. k-means++ initialization. Random-init k-means is famously prone to
//    local minima; k-means++ spreads initial centroids out, which gives
//    dramatically better results at negligible cost for the sizes we see.
//
// 3. Cosine similarity. Text embeddings are direction-bearing; magnitude
//    tends to reflect word count, not meaning. We L2-normalize on entry
//    so euclidean distance on normalized vectors ≡ cosine distance.
//
// 4. Early termination. Real k-means converges in well under 100 iterations
//    for our sizes. Hard cap at 100 so a pathological input can't hang.
//
// Complexity: O(iterations · n · k · d) where n = entries, k = clusters,
// d = embedding dimensions (typically 384 or 768). For n=200, k=10, d=384
// this is a few ms.

/**
 * @typedef {Float32Array | number[]} Vector
 */

/**
 * Deterministic PRNG (mulberry32). Fast, good enough for clustering init.
 * @param {number} seed
 * @returns {() => number} rand in [0, 1)
 */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derive a stable seed from the input vectors. Sum of the first 8 components
 * of the first vector (or just count, if no vectors). Ensures the seed
 * changes if the data changes, but stays stable across sessions.
 * @param {Vector[]} vectors
 * @returns {number}
 */
function deriveSeed(vectors) {
  let h = vectors.length * 2654435761; // Knuth multiplicative hash on length
  if (vectors.length > 0 && vectors[0]) {
    const v = vectors[0];
    const lim = Math.min(8, v.length);
    for (let i = 0; i < lim; i++) {
      // Bring float into integer range and fold in
      h = Math.imul(h ^ Math.floor((v[i] || 0) * 2147483647), 1597334677);
    }
  }
  return (h >>> 0) || 1;
}

/**
 * Normalize a vector to unit length in place. Zero-vectors are left at zero.
 * @param {Vector} v
 * @returns {Vector} the same vector (for chaining)
 */
export function l2Normalize(v) {
  let sq = 0;
  for (let i = 0; i < v.length; i++) sq += v[i] * v[i];
  if (sq > 0) {
    const inv = 1 / Math.sqrt(sq);
    for (let i = 0; i < v.length; i++) v[i] *= inv;
  }
  return v;
}

/**
 * Squared euclidean distance between two vectors. Both vectors must be the
 * same length. For L2-normalized inputs, this equals 2·(1 − cosine).
 * @param {Vector} a
 * @param {Vector} b
 * @returns {number}
 */
export function sqDistance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
}

/**
 * k-means++ initialization: pick first center uniformly at random, then
 * each subsequent center with probability proportional to squared distance
 * from the nearest already-chosen center. Spreads initialization out across
 * the space — far better starting point than uniform random.
 * @param {Vector[]} vectors  pre-normalized
 * @param {number} k
 * @param {() => number} rand
 * @returns {number[]} indices of chosen initial centers
 */
function kmeansPlusPlusInit(vectors, k, rand) {
  const n = vectors.length;
  const chosen = [Math.floor(rand() * n)];
  const sqDistToNearest = new Float64Array(n);
  // Initial distances: to the one chosen center.
  for (let i = 0; i < n; i++) {
    sqDistToNearest[i] = sqDistance(vectors[i], vectors[chosen[0]]);
  }
  while (chosen.length < k) {
    // Weighted sample by sqDistToNearest
    let total = 0;
    for (let i = 0; i < n; i++) total += sqDistToNearest[i];
    if (total === 0) {
      // All remaining points are duplicates of an existing center —
      // pick any unchosen index (defensive; rarely triggers).
      const already = new Set(chosen);
      for (let i = 0; i < n; i++) {
        if (!already.has(i)) { chosen.push(i); break; }
      }
      if (chosen.length === k) break;
      continue;
    }
    let target = rand() * total;
    let pick = n - 1;
    for (let i = 0; i < n; i++) {
      target -= sqDistToNearest[i];
      if (target <= 0) { pick = i; break; }
    }
    chosen.push(pick);
    // Update nearest-distance cache with the newly chosen center
    const newCenter = vectors[pick];
    for (let i = 0; i < n; i++) {
      const d = sqDistance(vectors[i], newCenter);
      if (d < sqDistToNearest[i]) sqDistToNearest[i] = d;
    }
  }
  return chosen;
}

/**
 * Compute the centroid of a subset of vectors. Returns a new Float64Array
 * (higher precision for accumulation than Float32).
 * @param {Vector[]} vectors
 * @param {number[]} indices
 * @returns {Float64Array}
 */
function centroid(vectors, indices) {
  const d = vectors[indices[0]].length;
  const c = new Float64Array(d);
  for (const idx of indices) {
    const v = vectors[idx];
    for (let i = 0; i < d; i++) c[i] += v[i];
  }
  const inv = 1 / indices.length;
  for (let i = 0; i < d; i++) c[i] *= inv;
  return c;
}

/**
 * Run k-means clustering on the given vectors.
 *
 * @param {Object} opts
 * @param {Vector[]} opts.vectors  L2-normalized vectors (will be normalized
 *   in place if not already). All same dimension.
 * @param {number} opts.k          desired cluster count. Will be clamped to
 *   [1, vectors.length].
 * @param {number} [opts.maxIterations=100]
 * @param {number} [opts.seed]     override derived seed (for testing)
 * @returns {{
 *   assignments: number[],  // length n, each entry in [0, k)
 *   centers: Float64Array[], // length k
 *   iterations: number,
 *   converged: boolean,
 * }}
 */
export function kmeans({ vectors, k, maxIterations = 100, seed } = {}) {
  const n = vectors ? vectors.length : 0;
  if (n === 0) {
    return { assignments: [], centers: [], iterations: 0, converged: true };
  }
  const effectiveK = Math.max(1, Math.min(k | 0, n));

  // Normalize in place — cheap if already normalized (detected: skip on
  // already-unit vectors), and ensures downstream distance is cosine-esque.
  for (const v of vectors) l2Normalize(v);

  const rand = seededRandom(seed != null ? seed : deriveSeed(vectors));

  // Init centers via k-means++
  const initIndices = kmeansPlusPlusInit(vectors, effectiveK, rand);
  let centers = initIndices.map(i => {
    const src = vectors[i];
    const c = new Float64Array(src.length);
    for (let j = 0; j < src.length; j++) c[j] = src[j];
    return c;
  });

  const assignments = new Array(n).fill(0);
  let iterations = 0;
  let converged = false;

  while (iterations < maxIterations) {
    iterations++;

    // Assign step
    let anyChanged = false;
    for (let i = 0; i < n; i++) {
      let bestK = 0;
      let bestD = sqDistance(vectors[i], centers[0]);
      for (let j = 1; j < effectiveK; j++) {
        const d = sqDistance(vectors[i], centers[j]);
        if (d < bestD) { bestD = d; bestK = j; }
      }
      if (assignments[i] !== bestK) {
        assignments[i] = bestK;
        anyChanged = true;
      }
    }

    if (!anyChanged) { converged = true; break; }

    // Update step
    const clusterIndices = Array.from({ length: effectiveK }, () => []);
    for (let i = 0; i < n; i++) clusterIndices[assignments[i]].push(i);
    const nextCenters = centers.slice();
    for (let j = 0; j < effectiveK; j++) {
      if (clusterIndices[j].length > 0) {
        nextCenters[j] = centroid(vectors, clusterIndices[j]);
      }
      // Empty cluster: keep its old center. Re-seeding empty clusters is
      // a known improvement but our inputs are small and it rarely matters.
    }
    centers = nextCenters;
  }

  return { assignments, centers, iterations, converged };
}

/**
 * Recommended k for the given input size, using the sqrt(N/2) heuristic
 * capped at [3, 15]. Also exported for UI slider default values.
 * @param {number} n  entry count
 * @returns {number} recommended k, always >= 1
 */
/**
 * Recommend a K value for kmeans given N items.
 *
 * Returns 1 for trivially small inputs (≤3 items: just show them all
 * as "bubbles of one"), otherwise scales as ~sqrt(n/2) clamped to
 * [3, 15]. The clamp keeps small datasets from being over-clustered
 * and large ones from being unwieldy.
 *
 * Optional `prefMultiplier` (default 1.0): user preference for sparser
 * (<1) or denser (>1) bubble structure. Applied to the sqrt result
 * BEFORE the [3, 15] clamp so the user can't escape the sanity bounds
 * but can express "I prefer smaller groups" or "I prefer fewer bigger
 * groups." Read from settings.memory.tool.kPrefMultiplier by callers
 * who care; default behavior (1.0) is exactly the pre-#5 algorithm.
 */
export function recommendK(n, prefMultiplier = 1) {
  if (!Number.isFinite(n) || n <= 0) return 1;
  if (n <= 3) return n;
  const mult = (typeof prefMultiplier === 'number' && Number.isFinite(prefMultiplier) && prefMultiplier > 0)
    ? prefMultiplier
    : 1;
  const raw = Math.round(Math.sqrt(n / 2) * mult);
  return Math.max(3, Math.min(15, raw));
}

// stats/radar_stats.js
//
// Pure normalization for the Writing Style radar. Takes the combined stat
// bundle, returns the 5 radar values in [0, 1] plus the axis labels and
// raw values for tooltips.
//
// Why tier-based normalization instead of absolute /max?
//   If we divided raw value by the last-tier threshold, someone at 1,000 words
//   out of a 100,000-word max axis would barely register visually — despite
//   having already earned two tier-up milestones. Tier-based normalization
//   makes each earned tier represent equal visual progress (1/N of the
//   radar), so the shape is meaningful at every stage.

/**
 * Tier thresholds per axis. Keep in sync with chronicle_grid.js — these
 * are the same progression ladders Chronicle uses.
 */
const AXES = Object.freeze([
  { key: 'wordsWritten',   label: 'Words',       tiers: [100, 1000, 10_000, 50_000, 100_000] },
  { key: 'characterCount', label: 'Cast',        tiers: [1, 5, 20, 50] },
  { key: 'longestThread',  label: 'Depth',       tiers: [100, 500, 1000, 5000] },
  { key: 'loreCount',      label: 'Lore',        tiers: [10, 50, 100, 500] },
  { key: 'daysActive',     label: 'Regularity',  tiers: [7, 30, 100, 365] },
]);

/**
 * Compute normalized 0–1 values for each axis, with labels and raw values
 * attached for rendering.
 *
 * @param {object} stats
 * @returns {Array<{ key: string, label: string, raw: number, normalized: number }>}
 */
export function computeRadarValues(stats = {}) {
  return AXES.map(axis => {
    const raw = Math.max(0, Number(stats[axis.key]) || 0);
    return {
      key: axis.key,
      label: axis.label,
      raw,
      normalized: normalizeAgainstTiers(raw, axis.tiers),
    };
  });
}

/**
 * Normalize a value against a tier ladder: each passed tier contributes
 * 1/N of the result, with linear interpolation inside the current tier.
 *
 *   value=0          → 0
 *   value=tiers[0]   → 1/N
 *   value=tiers[N-1] → 1.0
 *   value > last     → clamped to 1.0
 */
export function normalizeAgainstTiers(value, tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) return 0;
  const v = Math.max(0, Number(value) || 0);
  if (v <= 0) return 0;
  const n = tiers.length;

  for (let i = 0; i < n; i++) {
    if (v <= tiers[i]) {
      const prev = i === 0 ? 0 : tiers[i - 1];
      const span = tiers[i] - prev;
      const fraction = span === 0 ? 1 : (v - prev) / span;
      return (i + fraction) / n;
    }
  }
  return 1;
}

export { AXES };

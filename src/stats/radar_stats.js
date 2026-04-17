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
//
// Why the radar has its OWN tier ladders (different from Chronicle's)?
//   The Chronicle's tiers are achievement milestones — reasonable progression
//   goals that top out where a dedicated user would expect to earn their
//   last badge in a category. Using those same thresholds for the radar
//   ceiling means experienced Perchance users (who easily pass things like
//   "50 characters" or "500 lore entries") peg multiple axes at max with no
//   visual headroom left, making their shape a meaningless shaped-against-
//   the-ceiling triangle. The radar's tiers are set higher — designed for
//   visual range, not progression milestones — so the shape keeps evolving
//   as you grow, no matter how far you go.

/**
 * Tier thresholds per radar axis. Tuned for VISUAL RANGE: the top tier
 * represents "monumental user" territory that most people will never
 * reach. 5 tiers per axis keeps the normalization granularity consistent.
 *
 * These are intentionally different from the Chronicle's achievement
 * tiers. See the comment block at the top of this file.
 */
const AXES = Object.freeze([
  { key: 'wordsWritten',   label: 'Words',      tiers: [100,   1_000, 10_000, 100_000, 1_000_000] },
  { key: 'characterCount', label: 'Cast',       tiers: [1,     5,     20,     100,     500] },
  { key: 'longestThread',  label: 'Depth',      tiers: [50,    200,   1_000,  5_000,   20_000] },
  { key: 'loreCount',      label: 'Lore',       tiers: [10,    50,    250,    1_000,   5_000] },
  { key: 'daysActive',     label: 'Regularity', tiers: [7,     30,    100,    365,     1_825] },
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

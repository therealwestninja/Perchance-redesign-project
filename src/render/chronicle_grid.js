// render/chronicle_grid.js
//
// Read-only grid of fraction-style stats. Each stat shows either:
//   - "value / next_tier"   with a progress bar toward that tier
//   - raw "value"           if past the last configured tier
// Grid is responsive via CSS auto-fit minmax.

import { h } from '../utils/dom.js';
import { formatNumber } from '../utils/format.js';

/**
 * Stat → tier thresholds. The next unpassed threshold becomes the
 * fraction denominator; past the last, we just show the raw number.
 */
const TIERS = Object.freeze({
  wordsWritten:   [100, 1000, 10_000, 50_000, 100_000],
  characterCount: [1, 5, 20, 50],
  threadCount:    [1, 5, 25, 100],
  loreCount:      [10, 50, 100, 500],
  daysActive:     [7, 30, 100, 365],
  longestThread:  [100, 500, 1000, 5000],
});

const STATS_TO_SHOW = [
  { key: 'wordsWritten',   label: 'Words written' },
  { key: 'characterCount', label: 'Characters' },
  { key: 'threadCount',    label: 'Stories told' },
  { key: 'loreCount',      label: 'Lore entries' },
  { key: 'daysActive',     label: 'Active days' },
  { key: 'longestThread',  label: 'Longest arc' },
];

/**
 * @param {{ stats: import('../stats/queries.js').Stats }} opts
 */
export function createChronicleGrid({ stats }) {
  const cards = STATS_TO_SHOW.map(({ key, label }) =>
    createStatCard(label, Number(stats[key]) || 0, TIERS[key] || [])
  );
  return h('div', { class: 'pf-chron-grid' }, cards);
}

function createStatCard(label, value, thresholds) {
  const nextTier = thresholds.find(t => value < t);

  const valueEl = nextTier != null
    ? h('div', { class: 'pf-chron-value' }, [
        h('span', { class: 'pf-chron-num' }, [formatNumber(value)]),
        h('span', { class: 'pf-chron-denom' }, [` / ${formatNumber(nextTier)}`]),
      ])
    : h('div', { class: 'pf-chron-value pf-chron-value-maxed' }, [
        h('span', { class: 'pf-chron-num' }, [formatNumber(value)]),
        h('span', { class: 'pf-chron-denom' }, [' ✓']),
      ]);

  const progress = nextTier != null ? Math.min(1, value / nextTier) : 1;
  const bar = h('div', { class: 'pf-chron-bar' }, [
    h('div', {
      class: 'pf-chron-bar-fill',
      style: { width: `${(progress * 100).toFixed(1)}%` },
    }),
  ]);

  return h('div', { class: 'pf-chron-card' }, [
    h('div', { class: 'pf-chron-label' }, [label]),
    valueEl,
    bar,
  ]);
}

// render/share_chips.js
//
// Four compact stat callouts shown at the corners of the radar card in
// Focus mode. Chosen to NOT duplicate what's in the splash card or the
// radar's own readout, so the share screenshot gains new information
// rather than repeating it.
//
// Layout: two flex rows — one above the radar, one below. Chips within
// each row are justified space-between, so they anchor visually to the
// left and right corners of the card.

import { h } from '../utils/dom.js';
import { TIER_ICON } from './achievements_grid.js';

const TIER_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/**
 * @param {{
 *   level: number,
 *   unlockedIds: string[],
 *   achievements: Array<{ id: string, name: string, tier: string }>,
 *   promptsCompleted: number,
 * }} opts
 * @returns {{ topRow: HTMLElement, bottomRow: HTMLElement }}
 */
export function createShareChips({ level, unlockedIds, achievements, promptsCompleted }) {
  const unlockedCount = unlockedIds.length;
  const totalAch = achievements.length;
  const rarest = findRarestUnlocked(unlockedIds, achievements);

  const topRow = h('div', { class: 'pf-share-chips-row pf-share-chips-top' }, [
    chip({
      label: 'Level',
      value: 'LV ' + formatInt(level),
    }),
    chip({
      label: 'Unlocks',
      value: formatInt(unlockedCount) + ' / ' + formatInt(totalAch),
    }),
  ]);

  const bottomRow = h('div', { class: 'pf-share-chips-row pf-share-chips-bottom' }, [
    chip({
      label: 'Prompts',
      value: formatInt(promptsCompleted),
    }),
    chip({
      label: 'Rarest',
      value: rarest ? rarest.name : '—',
      icon:  rarest ? (TIER_ICON[rarest.tier] || '◆') : null,
      tier:  rarest ? rarest.tier : null,
    }),
  ]);

  return { topRow, bottomRow };
}

function chip({ label, value, icon, tier }) {
  const valueChildren = [];
  if (icon) {
    valueChildren.push(h('span', {
      class: 'pf-share-chip-icon pf-share-chip-icon-' + (tier || 'common'),
      'aria-hidden': 'true',
    }, [icon]));
  }
  valueChildren.push(h('span', { class: 'pf-share-chip-value-text' }, [String(value)]));

  return h('div', { class: 'pf-share-chip' }, [
    h('div', { class: 'pf-share-chip-label' }, [String(label)]),
    h('div', { class: 'pf-share-chip-value' }, valueChildren),
  ]);
}

/**
 * Find the rarest unlocked achievement for highlight. "Rarest" = highest
 * tier in TIER_ORDER among the user's unlocks. Ties broken by registry
 * order (first seen wins). Returns null if nothing is unlocked or if
 * every unlocked id is unknown to the registry.
 */
export function findRarestUnlocked(unlockedIds, achievements) {
  if (!Array.isArray(unlockedIds) || unlockedIds.length === 0) return null;
  if (!Array.isArray(achievements)) return null;
  const unlockedSet = new Set(unlockedIds);
  const unlocked = achievements.filter(a => a && unlockedSet.has(a.id));
  if (unlocked.length === 0) return null;
  // Stable sort: higher tier first; within a tier, preserve registry order
  const indexed = unlocked.map((a, i) => ({ a, i }));
  indexed.sort((x, y) => {
    const tierDiff = tierRank(y.a.tier) - tierRank(x.a.tier);
    if (tierDiff !== 0) return tierDiff;
    return x.i - y.i;
  });
  return indexed[0].a;
}

export function tierRank(tier) {
  const idx = TIER_ORDER.indexOf(tier);
  return idx < 0 ? 0 : idx;
}

function formatInt(n) {
  const v = Number(n) || 0;
  return String(Math.round(v));
}

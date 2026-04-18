// render/achievements_grid.js
//
// Grid showing every achievement. Unlocked ones are tier-colored;
// locked ones are dimmed. Hovering / focusing shows name + description,
// plus the unlock date if the achievement has been earned.

import { h } from '../utils/dom.js';
import { ACHIEVEMENTS } from '../achievements/registry.js';

const TIER_ICON = {
  common:    '●',
  uncommon:  '◆',
  rare:      '★',
  epic:      '✦',
  legendary: '⚜',
};
export { TIER_ICON };

/**
 * Format an ISO timestamp as a short relative string. Null/missing
 * input returns empty string so callers can conditionally prepend.
 */
function formatUnlockDate(iso) {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diffMs = Date.now() - ts;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60)  return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60)  return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)   return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30)  return `${diffDay}d ago`;
  const diffMon = Math.floor(diffDay / 30);
  if (diffMon < 12)  return `${diffMon}mo ago`;
  return `${Math.floor(diffMon / 12)}y ago`;
}

/**
 * Absolute-date form for the tooltip. Keeps the card text short but
 * lets hover reveal the exact date for users who want it.
 */
function formatUnlockDateAbsolute(iso) {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const d = new Date(ts);
  // ISO-like, local: 2026-04-18
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * @param {{ unlockedIds: string[], unlockDates?: Object<string, string> }} opts
 */
export function createAchievementsGrid({ unlockedIds, unlockDates }) {
  const unlocked = new Set(unlockedIds || []);
  const dates = (unlockDates && typeof unlockDates === 'object') ? unlockDates : {};

  const cards = ACHIEVEMENTS.map(a => {
    const isUnlocked = unlocked.has(a.id);
    const icon = TIER_ICON[a.tier] || '◆';
    const unlockIso = dates[a.id];
    const relative = isUnlocked ? formatUnlockDate(unlockIso) : '';
    const absolute = isUnlocked ? formatUnlockDateAbsolute(unlockIso) : '';

    const titleParts = [`${a.name} — ${a.description}`];
    if (isUnlocked && absolute) titleParts.push(`Unlocked: ${absolute}`);
    const ariaParts = [`${a.name}. ${a.description}.`];
    if (isUnlocked) {
      ariaParts.push(absolute ? `Unlocked ${absolute}.` : 'Unlocked.');
    } else {
      ariaParts.push('Locked.');
    }

    const cardChildren = [
      h('div', { class: 'pf-ach-icon', 'aria-hidden': 'true' }, [icon]),
      h('div', { class: 'pf-ach-name' }, [a.name]),
      h('div', { class: 'pf-ach-tier' }, [a.tier]),
    ];
    // Only show the unlock-date row for achievements that have one.
    // Keeps locked cards visually cleaner and avoids a stale "—" for
    // achievements unlocked before unlockDates tracking shipped.
    if (isUnlocked && relative) {
      cardChildren.push(h('div', { class: 'pf-ach-unlock-date' }, [relative]));
    }

    return h('div', {
      class: [
        'pf-ach-card',
        `pf-ach-tier-${a.tier}`,
        isUnlocked ? 'pf-ach-unlocked' : 'pf-ach-locked',
      ].join(' '),
      title: titleParts.join(' · '),
      tabindex: '0',
      'aria-label': ariaParts.join(' '),
    }, cardChildren);
  });

  // Small summary at the top of the grid
  const total = ACHIEVEMENTS.length;
  const unlockedCount = cards.filter((_, i) => unlocked.has(ACHIEVEMENTS[i].id)).length;

  return h('div', { class: 'pf-ach-wrap' }, [
    h('div', { class: 'pf-ach-summary' }, [
      `${unlockedCount} of ${total} unlocked`,
    ]),
    h('div', { class: 'pf-ach-grid' }, cards),
  ]);
}

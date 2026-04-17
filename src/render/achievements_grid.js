// render/achievements_grid.js
//
// Grid showing every achievement. Unlocked ones are tier-colored;
// locked ones are dimmed. Hovering / focusing shows name + description.

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
 * @param {{ unlockedIds: string[] }} opts
 */
export function createAchievementsGrid({ unlockedIds }) {
  const unlocked = new Set(unlockedIds || []);

  const cards = ACHIEVEMENTS.map(a => {
    const isUnlocked = unlocked.has(a.id);
    const icon = TIER_ICON[a.tier] || '◆';
    return h('div', {
      class: [
        'pf-ach-card',
        `pf-ach-tier-${a.tier}`,
        isUnlocked ? 'pf-ach-unlocked' : 'pf-ach-locked',
      ].join(' '),
      title: `${a.name} — ${a.description}`,
      tabindex: '0',
      'aria-label': `${a.name}. ${a.description}. ${isUnlocked ? 'Unlocked.' : 'Locked.'}`,
    }, [
      h('div', { class: 'pf-ach-icon', 'aria-hidden': 'true' }, [icon]),
      h('div', { class: 'pf-ach-name' }, [a.name]),
      h('div', { class: 'pf-ach-tier' }, [a.tier]),
    ]);
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

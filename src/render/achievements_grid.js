// render/achievements_grid.js
//
// Achievement browser. Horizontal tab strip across the top (Summary,
// Writing, Stories, Prompts, Consistency, Curation, Preservation,
// Creation, Events) lets the user drill into one category at a time
// instead of scrolling through all 58 cards at once.
//
// Summary tab shows progress bars per category — quick overview of
// where the user has unlocks and where they don't.
//
// Category tabs show the achievements in that category as cards,
// tier families appearing together in registry order so progression
// is readable (Curator Bronze → Silver → Gold, side by side).
//
// Locked achievements are still visible (dimmed). This is
// deliberate — locked entries serve as discovery hints, showing the
// user what they could work toward. Hide-locked-by-default was
// considered and rejected because it would make the grid feel empty
// for new users.
//
// Visual style stays aligned with the rest of the profile — we'll
// reskin later during the theme overhaul. Today's goal is structure.

import { h } from '../utils/dom.js';
import { ACHIEVEMENTS } from '../achievements/registry.js';
import {
  CATEGORIES,
  groupByCategory,
  computeCategoryProgress,
} from '../achievements/categories.js';

const TIER_ICON = {
  common:    '●',
  uncommon:  '◆',
  rare:      '★',
  epic:      '✦',
  legendary: '⚜',
};
export { TIER_ICON };

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

function formatUnlockDateAbsolute(iso) {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * @param {{ unlockedIds: string[], unlockDates?: Object<string, string> }} opts
 */
export function createAchievementsGrid({ unlockedIds, unlockDates } = {}) {
  const unlocked = new Set(unlockedIds || []);
  const dates = (unlockDates && typeof unlockDates === 'object') ? unlockDates : {};
  const byCat = groupByCategory(ACHIEVEMENTS);
  const progress = computeCategoryProgress(ACHIEVEMENTS, unlocked);

  // Mounted panes — kept in DOM and toggled via hidden. Cheaper than
  // re-creating on tab switch, and preserves scroll position within
  // a category if the user jumps away and back.
  const summaryPane = createSummaryPane(progress, unlocked, dates);
  const categoryPanes = {};
  for (const cat of CATEGORIES) {
    categoryPanes[cat.id] = createCategoryPane(cat, byCat[cat.id] || [], unlocked, dates);
  }
  if ((byCat.other || []).length > 0) {
    categoryPanes.other = createCategoryPane(
      { id: 'other', label: 'Other', icon: '?', description: 'Uncategorized achievements.' },
      byCat.other,
      unlocked,
      dates
    );
  }

  const panes = [summaryPane, ...Object.values(categoryPanes)];
  for (const p of panes) p.hidden = p !== summaryPane;

  // Tab strip
  const tabs = [];
  const summaryTab = createTabButton({
    id: 'summary',
    label: 'Summary',
    icon: '★',
    badge: `${unlocked.size}/${ACHIEVEMENTS.length}`,
    active: true,
    onClick: () => activate('summary'),
  });
  tabs.push(summaryTab);

  for (const row of progress) {
    if (row.category.id === 'other' && row.total === 0) continue;
    const tab = createTabButton({
      id: row.category.id,
      label: row.category.label,
      icon: row.category.icon,
      badge: `${row.unlocked}/${row.total}`,
      active: false,
      onClick: () => activate(row.category.id),
    });
    tabs.push(tab);
  }

  const tabBar = h('div', { class: 'pf-ach-tabs', role: 'tablist' }, tabs);
  const paneWrap = h('div', { class: 'pf-ach-panes' }, panes);

  function activate(id) {
    for (const t of tabs) {
      const match = t.dataset.tabId === id;
      t.classList.toggle('pf-ach-tab-active', match);
      t.setAttribute('aria-selected', match ? 'true' : 'false');
    }
    for (const p of panes) p.hidden = p.dataset.paneId !== id;
  }

  return h('div', { class: 'pf-ach-browser' }, [tabBar, paneWrap]);
}

// ---- tab button ----

function createTabButton({ id, label, icon, badge, active, onClick }) {
  const btn = h('button', {
    type: 'button',
    role: 'tab',
    class: 'pf-ach-tab' + (active ? ' pf-ach-tab-active' : ''),
    'aria-selected': active ? 'true' : 'false',
    onClick,
  }, [
    h('span', { class: 'pf-ach-tab-icon', 'aria-hidden': 'true' }, [icon]),
    h('span', { class: 'pf-ach-tab-label' }, [label]),
    h('span', { class: 'pf-ach-tab-badge' }, [badge]),
  ]);
  btn.dataset.tabId = id;
  return btn;
}

// ---- Summary pane ----

function createSummaryPane(progress, unlocked, dates) {
  const totalUnlocked = [...unlocked].filter(id =>
    ACHIEVEMENTS.some(a => a.id === id)
  ).length;
  const pct = ACHIEVEMENTS.length > 0
    ? Math.round((totalUnlocked / ACHIEVEMENTS.length) * 100)
    : 0;

  const rows = progress
    .filter(r => r.total > 0)
    .map(r => {
      const p = r.total > 0 ? Math.round((r.unlocked / r.total) * 100) : 0;
      return h('div', { class: 'pf-ach-prog-row' }, [
        h('span', { class: 'pf-ach-prog-icon', 'aria-hidden': 'true' }, [r.category.icon]),
        h('span', { class: 'pf-ach-prog-label' }, [r.category.label]),
        h('div', { class: 'pf-ach-prog-bar' }, [
          h('div', { class: 'pf-ach-prog-bar-fill', style: `width: ${p}%;` }),
        ]),
        h('span', { class: 'pf-ach-prog-pct' }, [`${r.unlocked}/${r.total}`]),
      ]);
    });

  // Recent unlocks — last 6 with dates, newest first
  const withDates = ACHIEVEMENTS
    .filter(a => unlocked.has(a.id) && dates[a.id])
    .map(a => ({ a, ts: Date.parse(dates[a.id]) || 0 }))
    .filter(x => x.ts > 0)
    .sort((x, y) => y.ts - x.ts)
    .slice(0, 6);

  const recentChildren = withDates.length > 0
    ? [
        h('h3', { class: 'pf-ach-sec-title' }, ['Recent unlocks']),
        h('div', { class: 'pf-ach-recent' },
          withDates.map(({ a }) => createCard(a, unlocked, dates))
        ),
      ]
    : [];

  const pane = h('div', { class: 'pf-ach-pane pf-ach-pane-summary' }, [
    h('div', { class: 'pf-ach-summary-overall' }, [
      h('div', { class: 'pf-ach-summary-head' }, [
        h('span', { class: 'pf-ach-summary-label' }, ['Achievements earned']),
        h('span', { class: 'pf-ach-summary-count' }, [`${totalUnlocked} of ${ACHIEVEMENTS.length}`]),
      ]),
      h('div', { class: 'pf-ach-prog-bar pf-ach-prog-bar-lg' }, [
        h('div', { class: 'pf-ach-prog-bar-fill', style: `width: ${pct}%;` }),
      ]),
    ]),
    h('div', { class: 'pf-ach-prog-list' }, rows),
    ...recentChildren,
  ]);
  pane.dataset.paneId = 'summary';
  return pane;
}

// ---- Category pane ----

function createCategoryPane(cat, items, unlocked, dates) {
  const unlockedN = items.reduce((n, a) => (unlocked.has(a.id) ? n + 1 : n), 0);
  const pct = items.length > 0 ? Math.round((unlockedN / items.length) * 100) : 0;

  const headChildren = [
    h('div', { class: 'pf-ach-pane-head-main' }, [
      h('span', { class: 'pf-ach-pane-icon', 'aria-hidden': 'true' }, [cat.icon || '◆']),
      h('span', { class: 'pf-ach-pane-title' }, [cat.label]),
      h('span', { class: 'pf-ach-pane-count' }, [`${unlockedN}/${items.length}`]),
    ]),
  ];
  if (cat.description) {
    headChildren.push(h('p', { class: 'pf-ach-pane-desc' }, [cat.description]));
  }
  headChildren.push(h('div', { class: 'pf-ach-prog-bar' }, [
    h('div', { class: 'pf-ach-prog-bar-fill', style: `width: ${pct}%;` }),
  ]));

  const children = [
    h('div', { class: 'pf-ach-pane-head' }, headChildren),
    items.length > 0
      ? h('div', { class: 'pf-ach-grid' }, items.map(a => createCard(a, unlocked, dates)))
      : h('p', { class: 'pf-ach-pane-empty' }, ['No achievements in this category yet.']),
  ];

  const pane = h('div', { class: 'pf-ach-pane' }, children);
  pane.dataset.paneId = cat.id;
  return pane;
}

// ---- card ----

function createCard(a, unlocked, dates) {
  const isUnlocked = unlocked.has(a.id);
  const icon = TIER_ICON[a.tier] || '◆';
  const unlockIso = dates[a.id];
  const relative = isUnlocked ? formatUnlockDate(unlockIso) : '';
  const absolute = isUnlocked ? formatUnlockDateAbsolute(unlockIso) : '';

  const titleParts = [`${a.name} — ${a.description}`];
  if (isUnlocked && absolute) titleParts.push(`Unlocked: ${absolute}`);

  const children = [
    h('div', { class: 'pf-ach-icon', 'aria-hidden': 'true' }, [icon]),
    h('div', { class: 'pf-ach-name' }, [a.name]),
    h('div', { class: 'pf-ach-desc' }, [a.description]),
    h('div', { class: 'pf-ach-tier' }, [a.tier]),
  ];
  if (isUnlocked && relative) {
    children.push(h('div', { class: 'pf-ach-unlock-date' }, [relative]));
  }

  return h('div', {
    class: [
      'pf-ach-card',
      `pf-ach-tier-${a.tier}`,
      isUnlocked ? 'pf-ach-unlocked' : 'pf-ach-locked',
    ].join(' '),
    title: titleParts.join(' · '),
    tabindex: '0',
    'aria-label': `${a.name}. ${a.description}. ${isUnlocked ? (absolute ? `Unlocked ${absolute}.` : 'Unlocked.') : 'Locked.'}`,
  }, children);
}

// render/activity_body.js
//
// "Activity" section of the profile page. Surfaces the per-feature
// usage counters tracked by stats/counters.js — bubble tool opens,
// renames, reorders, saves, backups, etc.
//
// These counters are our answer to "what has the user actually DONE
// with this tool?" — data that isn't in upstream Dexie. They're also
// the substrate for the future gamification / tiered-achievement
// system. Showing them in the profile now (a) gives users feedback
// about their own use, and (b) makes the data visible before it's
// used for unlocks, so there's no "wait, where did that come from?"
// moment later.

import { h } from '../utils/dom.js';
import { createSparkline } from './sparkline.js';
import { getCounterSeriesByDay } from '../stats/counters.js';

/**
 * Display metadata for each counter. Order here drives render order.
 *
 * `label` is user-facing; `key` matches the field name in getCounters();
 * `hint` is optional title tooltip; `hideIfZero` hides the chip until
 * the user has done the thing at least once (avoids a wall of zeros
 * on first use).
 */
const CHIPS = [
  { key: 'memoryWindowOpens',          label: 'Memory tool opens',   hint: 'Times you\'ve opened the Memory & Lore window' },
  { key: 'memorySaves',                label: 'Saves',               hint: 'Successful saves from the Memory tool', hideIfZero: true },
  { key: 'bubblesReordered',           label: 'Bubble reorders',     hint: 'Bubbles you\'ve reordered via drag', hideIfZero: true },
  { key: 'cardsReorderedInBubble',     label: 'Card reorders',       hint: 'Cards rearranged within a bubble', hideIfZero: true },
  { key: 'cardsReorderedCrossBubble',  label: 'Cross-bubble moves',  hint: 'Cards dragged from one bubble to another', hideIfZero: true },
  { key: 'bubblesRenamed',             label: 'Bubbles renamed',     hint: 'Custom labels you\'ve given bubbles', hideIfZero: true },
  { key: 'bubblesLocked',              label: 'Bubbles locked',      hint: 'Bubbles locked to preserve their clustering', hideIfZero: true },
  { key: 'snapshotsRestored',          label: 'Snapshots restored',  hint: 'Times you\'ve rolled back via Restore', hideIfZero: true },
  { key: 'backupsExported',            label: 'Backups exported',    hint: 'Backup files you\'ve exported', hideIfZero: true },
  { key: 'backupsImported',            label: 'Backups imported',    hint: 'Backup files imported from disk', hideIfZero: true },
  { key: 'promptArchiveOpens',         label: 'Archive views',       hint: 'Prompt Archive section expanded', hideIfZero: true },
  { key: 'focusModeToggles',           label: 'Focus mode',          hint: 'Focus-mode toggles', hideIfZero: true },
  { key: 'charactersSpawned',          label: 'Characters spawned',  hint: 'New characters spun off from memory bubbles', hideIfZero: true },
];

/**
 * Format an ISO timestamp as a short human-friendly relative string.
 * Null-safe — returns placeholder for missing values.
 */
function formatTimeAgo(iso) {
  if (!iso) return '—';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '—';
  const now = Date.now();
  const diffMs = now - ts;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60)       return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60)       return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)        return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30)       return `${diffDay}d ago`;
  const diffMon = Math.floor(diffDay / 30);
  if (diffMon < 12)       return `${diffMon}mo ago`;
  return `${Math.floor(diffMon / 12)}y ago`;
}

/**
 * Format big numbers compactly: 1234 -> "1.2k", 1234567 -> "1.2M".
 * Keeps chips compact for heavy users without losing signal.
 */
function formatCount(n) {
  const v = Number(n) || 0;
  if (v < 1000)       return String(v);
  if (v < 1_000_000)  return `${(v / 1000).toFixed(v < 10000 ? 1 : 0)}k`;
  return `${(v / 1_000_000).toFixed(1)}M`;
}

/**
 * Build the body of the Activity section.
 *
 * @param {{ counters: object, streaks?: object, streakStatus?: string }} opts
 */
export function createActivityBody({ counters, streaks, streakStatus: status } = {}) {
  const c = counters || {};
  const s = streaks || { current: 0, longest: 0, lastActiveDay: null };
  const st = status || 'broken';
  const totalActions =
    (Number(c.memoryWindowOpens)         || 0) +
    (Number(c.memorySaves)               || 0) +
    (Number(c.bubblesReordered)          || 0) +
    (Number(c.cardsReorderedInBubble)    || 0) +
    (Number(c.cardsReorderedCrossBubble) || 0) +
    (Number(c.bubblesRenamed)            || 0) +
    (Number(c.bubblesLocked)             || 0) +
    (Number(c.snapshotsRestored)         || 0) +
    (Number(c.backupsExported)           || 0) +
    (Number(c.backupsImported)           || 0) +
    (Number(c.promptArchiveOpens)        || 0) +
    (Number(c.focusModeToggles)          || 0) +
    (Number(c.charactersSpawned)         || 0);

  // Streak banner — shown above the chip grid when there's any streak
  // history. Icon + tone shifts based on streakStatus:
  //   'active'  — user was active TODAY: 🔥 gold flame
  //   'at-risk' — last active yesterday but not today: ⏳ amber
  //   'broken'  — more than a day gap: 💤 or start-new-streak prompt
  const hasStreakData = (Number(s.current) || 0) > 0 || (Number(s.longest) || 0) > 0;
  let streakBanner = null;
  if (hasStreakData) {
    let icon, tone, msg;
    if (st === 'active') {
      icon = '🔥';
      tone = 'pf-streak-active';
      msg = s.current === 1
        ? 'Day 1 — start of a new streak!'
        : `${s.current} days in a row — keep it going!`;
    } else if (st === 'at-risk') {
      icon = '⏳';
      tone = 'pf-streak-at-risk';
      msg = `${s.current}-day streak at risk — come back today to keep it alive.`;
    } else {
      icon = '💤';
      tone = 'pf-streak-broken';
      msg = s.longest > 0
        ? `Last streak: ${s.longest} days. Open again tomorrow to start a new one.`
        : 'No streak yet. Come back tomorrow to start one.';
    }
    streakBanner = h('div', { class: `pf-streak-banner ${tone}` }, [
      h('span', { class: 'pf-streak-icon', 'aria-hidden': 'true' }, [icon]),
      h('div', { class: 'pf-streak-text' }, [
        h('div', { class: 'pf-streak-line' }, [msg]),
        h('div', { class: 'pf-streak-sub' }, [
          `Current ${s.current} · Longest ${s.longest}`,
        ]),
      ]),
    ]);
  }

  if (totalActions === 0 && !hasStreakData) {
    return h('div', { class: 'pf-activity-empty' }, [
      'No activity tracked yet. As you curate memories, rename bubbles, ' +
      'save changes, and use other features, counts will appear here.',
    ]);
  }

  // Render only chips with non-zero values (or those without hideIfZero)
  const chipNodes = [];
  for (const spec of CHIPS) {
    const raw = Number(c[spec.key]) || 0;
    if (spec.hideIfZero && raw === 0) continue;

    // 30-day sparkline under the label. Values beyond the window are
    // not reflected — this is "recent activity shape", not "lifetime
    // shape". A flat zero bar renders if the user hasn't done this
    // action in the last 30 days.
    const series = getCounterSeriesByDay(spec.key, 30);
    const spark = createSparkline(series, {
      width: 80,
      height: 16,
      color: 'currentColor',
      fill: 'currentColor',
      label: `${spec.label} — last 30 days`,
    });

    chipNodes.push(h('div', {
      class: 'pf-activity-chip',
      title: spec.hint || '',
    }, [
      h('div', { class: 'pf-activity-chip-count' }, [formatCount(raw)]),
      h('div', { class: 'pf-activity-chip-label' }, [spec.label]),
      h('div', { class: 'pf-activity-chip-spark' }, [spark]),
    ]));
  }

  const grid = h('div', { class: 'pf-activity-grid' }, chipNodes);

  // Footer strip — first/last activity timestamps for context.
  const footer = h('div', { class: 'pf-activity-footer' }, [
    h('span', {}, [
      h('strong', {}, ['First activity: ']),
      formatTimeAgo(c.firstUsedAt),
    ]),
    h('span', {}, [
      h('strong', {}, ['Last activity: ']),
      formatTimeAgo(c.lastUsedAt),
    ]),
  ]);

  const children = [];
  if (streakBanner) children.push(streakBanner);
  children.push(grid);
  children.push(footer);
  return h('div', { class: 'pf-activity' }, children);
}

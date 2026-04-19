// prompts/gc.js
//
// Manual "Clear history" action for prompt completions. User-initiated
// from the Backup section — never runs automatically.
//
// Design rationale: automatic GC is a black box. A visible button the
// user controls is more honest. Storage is cheap either way (~10 KB per
// year), so there's no forcing function behind silent pruning.
//
// Preserves lifetime progress: before deleting completedByWeek entries,
// their counts accumulate into prompts.historicalTotals. computePromptStats
// folds historicalTotals into lifetime sums, so achievements earned via
// past completions stay earned even after clearing.
//
// The partition helpers (partitionWeekKeys, weekKeyToOrdinal) are still
// exported — they'd be useful for any future "Clear last year only" or
// other scoped-clear feature. Unused publicly today.

import { loadSettings, saveSettings } from '../profile/settings_store.js';
import { getCurrentWeekKey } from './scheduler.js';
import { getPromptById, PROMPT_CATEGORIES } from './registry.js';

/**
 * Retention window used by any scoped-clear variants. Currently unused
 * by the default Clear action (which clears everything before the
 * current week), but left in place for future scoped-clear options.
 */
export const RETENTION_WEEKS = 104;

/**
 * Clear all past completion history, preserving lifetime counts in
 * historicalTotals so achievements don't regress. Spares the current
 * week (the live Prompts section shouldn't lose its checkmarks).
 *
 * User-initiated: invoked by the "Clear history" button in the Backup
 * section. Never runs automatically.
 *
 * @param {{ now?: Date }} [opts]
 * @returns {{
 *   droppedWeeks: number,
 *   droppedCompletions: number,
 *   kept: { currentWeekKey: string }
 * }}
 */
export function clearCompletionHistory({ now = new Date() } = {}) {
  let settings;
  try { settings = loadSettings(); }
  catch { return { droppedWeeks: 0, droppedCompletions: 0, kept: { currentWeekKey: null } }; }

  const byWeek = (settings.prompts && settings.prompts.completedByWeek) || {};
  const keys = Object.keys(byWeek);
  const currentKey = getCurrentWeekKey(now);

  // Drop everything except the current week. Current week keeps its
  // checkmarks — the live Prompts section would feel wrong if opening
  // the Clear button visibly unticked your in-progress items.
  const drop = keys.filter(k => k !== currentKey);
  if (drop.length === 0) {
    return { droppedWeeks: 0, droppedCompletions: 0, kept: { currentWeekKey: currentKey } };
  }

  let droppedCompletions = 0;
  let droppedActiveWeeks = 0;
  // Per-category buckets accumulated from dropped weeks. These roll
  // into historicalTotals.byCategory so computePromptStats can still
  // read per-category counts after old weeks are pruned.
  const droppedByCat = {};
  for (const cat of PROMPT_CATEGORIES) droppedByCat[cat.id] = 0;

  for (const key of drop) {
    const list = byWeek[key];
    if (!Array.isArray(list)) continue;
    droppedCompletions += list.length;
    if (list.length > 0) droppedActiveWeeks += 1;
    for (const id of list) {
      const p = getPromptById(id);
      if (p && p.category && droppedByCat[p.category] !== undefined) {
        droppedByCat[p.category] += 1;
      }
    }
  }

  const nextByWeek = {};
  if (Array.isArray(byWeek[currentKey])) {
    nextByWeek[currentKey] = byWeek[currentKey];
  }

  const prevHist = (settings.prompts && settings.prompts.historicalTotals) || {};
  const prevTotal = Number(prevHist.total) || 0;
  const prevWeeks = Number(prevHist.weeksActive) || 0;
  const prevByCat = (prevHist.byCategory && typeof prevHist.byCategory === 'object')
    ? prevHist.byCategory : {};
  const mergedByCat = {};
  for (const cat of PROMPT_CATEGORIES) {
    mergedByCat[cat.id] = (Number(prevByCat[cat.id]) || 0) + (droppedByCat[cat.id] || 0);
  }

  const nextSettings = {
    ...settings,
    prompts: {
      ...(settings.prompts || {}),
      completedByWeek: nextByWeek,
      historicalTotals: {
        total: prevTotal + droppedCompletions,
        weeksActive: prevWeeks + droppedActiveWeeks,
        byCategory: mergedByCat,
      },
    },
  };
  saveSettings(nextSettings);

  return {
    droppedWeeks: drop.length,
    droppedCompletions,
    kept: { currentWeekKey: currentKey },
  };
}

// ---- Scoped partitioning helpers — kept for potential future scoped-clear
// ---- variants. Not used by the default Clear History action (which
// ---- clears everything before the current week).

/**
 * Split a set of week keys into "keep" (within retention) and "drop"
 * (older than retention). Pure — no I/O, no side effects.
 *
 * @param {string[]} weekKeys          e.g., ['2024-W01', '2025-W52', ...]
 * @param {string}   currentWeekKey    e.g., '2026-W16'
 * @param {number}   retentionWeeks
 * @returns {{ keep: string[], drop: string[] }}
 */
export function partitionWeekKeys(weekKeys, currentWeekKey, retentionWeeks = RETENTION_WEEKS) {
  const currentOrdinal = weekKeyToOrdinal(currentWeekKey);
  if (currentOrdinal == null) return { keep: [...(weekKeys || [])], drop: [] };

  const cutoff = currentOrdinal - retentionWeeks;
  const keep = [];
  const drop = [];

  for (const key of (weekKeys || [])) {
    const ord = weekKeyToOrdinal(key);
    if (ord == null) {
      // Malformed key — keep it (we don't know how to reason about it
      // and dropping silently would feel worse than a speck of dust)
      keep.push(key);
      continue;
    }
    if (ord < cutoff) drop.push(key);
    else              keep.push(key);
  }
  return { keep, drop };
}

/**
 * Convert 'YYYY-Www' to a monotonically increasing integer for comparison.
 * Returns null if the key doesn't match the expected format.
 *
 *   '2024-W01' → 2024 * 53 + 1
 *   '2026-W16' → 2026 * 53 + 16
 *
 * Why *53 not *52? ISO 8601 weeks can go up to W53 in some years. Using
 * 53 as the multiplier avoids overlap between year N's W53 and year N+1's
 * W01. Not a calendar-exact mapping, just an ordering function.
 */
export function weekKeyToOrdinal(weekKey) {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(String(weekKey || ''));
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  if (!Number.isFinite(year) || !Number.isFinite(week)) return null;
  return year * 53 + week;
}

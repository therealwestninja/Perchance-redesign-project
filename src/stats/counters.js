// stats/counters.js
//
// Lifetime action counters for features the user has engaged with.
//
// The upstream Dexie database has the source of truth for what EXISTS
// (characters, threads, messages, memories, lore). This module tracks
// what the user has DONE with our tool — actions that don't leave a
// natural trail in Dexie. Bubble tool opens, lock toggles, renames,
// reorders, snapshot restorations, etc.
//
// Counter increments are written through settings_store.js (same
// persistence path as the rest of the profile), so they round-trip
// through the backup/export/import flow for free.
//
// In addition to the lifetime counters, we maintain a per-day
// histogram (`settings.countersByDay`) with the same counter keys,
// used to render 30-day sparklines. Pruned to the last ~60 days on
// every bump to prevent unbounded growth for long-lived profiles.
//
// Writes are best-effort: if localStorage is full or unavailable,
// we silently swallow the error. Counters are a pleasant-to-have
// indicator, not critical data — the user's primary work is their
// chat history, not their counter totals.

import { loadSettings, saveSettings } from '../profile/settings_store.js';

// Keep this many days of per-day history. 60 gives us a 30-day
// sparkline window plus some slack for users who visit at irregular
// cadences. Raising this has linear storage cost (~200 bytes/day for
// an active user), so we keep it tight by default.
const DAILY_HISTORY_DAYS = 60;

/**
 * UTC day-key for the given date: "YYYY-MM-DD". UTC (not local) so
 * the histogram is timezone-neutral — a user traveling across time
 * zones won't see their sparkline get weird double-counting or
 * gap days from midnight-shifts. Matches the convention used by
 * streaks.js.
 */
function dayKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Prune day-buckets older than DAILY_HISTORY_DAYS from `byDay` IN
 * PLACE. Returns the same object for chaining.
 */
function pruneByDay(byDay, now = new Date()) {
  if (!byDay || typeof byDay !== 'object') return byDay;
  const cutoffMs = now.getTime() - DAILY_HISTORY_DAYS * 86400_000;
  const cutoffKey = dayKey(new Date(cutoffMs));
  for (const k of Object.keys(byDay)) {
    if (k < cutoffKey) {
      delete byDay[k];
    }
  }
  return byDay;
}

/**
 * Increment a named counter by `n` (default 1). Also updates the
 * firstUsedAt (set-once) and lastUsedAt (always) timestamps, and
 * bumps today's per-day bucket in countersByDay.
 *
 * Missing counters are created at 0 before the bump, which means a
 * new counter name added in code lands smoothly on existing profiles
 * — the counter appears at `n` on first bump.
 *
 * Best-effort: errors are swallowed (logged at debug level).
 *
 * @param {string} name - The counter field name, e.g. 'memoryWindowOpens'
 * @param {number} [n=1] - Increment amount
 */
export function bumpCounter(name, n = 1) {
  if (typeof name !== 'string' || !name) return;
  const delta = Number(n) || 0;
  if (delta <= 0) return;
  try {
    const settings = loadSettings();
    if (!settings.counters || typeof settings.counters !== 'object') {
      settings.counters = {};
    }
    const current = Number(settings.counters[name]) || 0;
    settings.counters[name] = current + delta;

    const now = new Date();
    const nowIso = now.toISOString();
    if (!settings.counters.firstUsedAt) {
      settings.counters.firstUsedAt = nowIso;
    }
    settings.counters.lastUsedAt = nowIso;

    // Per-day histogram. Bump today's bucket, then prune older-than-
    // 60-days entries so the histogram never grows unbounded.
    if (!settings.countersByDay || typeof settings.countersByDay !== 'object') {
      settings.countersByDay = {};
    }
    const key = dayKey(now);
    if (!settings.countersByDay[key] || typeof settings.countersByDay[key] !== 'object') {
      settings.countersByDay[key] = {};
    }
    const dayCurrent = Number(settings.countersByDay[key][name]) || 0;
    settings.countersByDay[key][name] = dayCurrent + delta;
    pruneByDay(settings.countersByDay, now);

    saveSettings(settings);
  } catch { /* best-effort */ }
}

/**
 * Read the current counters object. Always returns an object (never
 * null/undefined), with every known counter defaulted to 0 if missing
 * from storage.
 *
 * @returns {object}
 */
export function getCounters() {
  try {
    const settings = loadSettings();
    const c = (settings && settings.counters) || {};
    return {
      memoryWindowOpens:         Number(c.memoryWindowOpens)         || 0,
      bubblesLocked:             Number(c.bubblesLocked)             || 0,
      bubblesRenamed:            Number(c.bubblesRenamed)            || 0,
      bubblesReordered:          Number(c.bubblesReordered)          || 0,
      cardsReorderedInBubble:    Number(c.cardsReorderedInBubble)    || 0,
      cardsReorderedCrossBubble: Number(c.cardsReorderedCrossBubble) || 0,
      snapshotsRestored:         Number(c.snapshotsRestored)         || 0,
      backupsExported:           Number(c.backupsExported)           || 0,
      backupsImported:           Number(c.backupsImported)           || 0,
      promptArchiveOpens:        Number(c.promptArchiveOpens)        || 0,
      focusModeToggles:          Number(c.focusModeToggles)          || 0,
      memorySaves:               Number(c.memorySaves)               || 0,
      charactersSpawned:         Number(c.charactersSpawned)         || 0,
      shareCardOpens:            Number(c.shareCardOpens)             || 0,
      firstUsedAt:               c.firstUsedAt || null,
      lastUsedAt:                c.lastUsedAt  || null,
    };
  } catch {
    return {
      memoryWindowOpens: 0, bubblesLocked: 0, bubblesRenamed: 0,
      bubblesReordered: 0, cardsReorderedInBubble: 0,
      cardsReorderedCrossBubble: 0, snapshotsRestored: 0,
      backupsExported: 0, backupsImported: 0,
      promptArchiveOpens: 0, focusModeToggles: 0, memorySaves: 0,
      charactersSpawned: 0,
      shareCardOpens: 0,
      firstUsedAt: null, lastUsedAt: null,
    };
  }
}

/**
 * Reset all counters to zero. Used for testing and for the "reset
 * profile" / "clear history" flows.
 */
export function resetCounters() {
  try {
    const settings = loadSettings();
    if (settings.counters && typeof settings.counters === 'object') {
      const keep = { firstUsedAt: null, lastUsedAt: null };
      for (const k of Object.keys(settings.counters)) {
        if (k === 'firstUsedAt' || k === 'lastUsedAt') continue;
        settings.counters[k] = 0;
      }
      settings.counters.firstUsedAt = keep.firstUsedAt;
      settings.counters.lastUsedAt = keep.lastUsedAt;
    }
    settings.countersByDay = {};
    saveSettings(settings);
  } catch { /* best-effort */ }
}

/**
 * Return the full countersByDay object, pruned to the last
 * DAILY_HISTORY_DAYS days. Returns an empty object if storage is
 * unavailable or the field is missing.
 *
 * Shape:
 *   { "2026-04-17": { memorySaves: 2 }, "2026-04-18": { memorySaves: 3 }, ... }
 *
 * Prunes lazily on READ too so older buckets fall off even if the
 * user hasn't bumped anything recently.
 */
export function getCountersByDay() {
  try {
    const settings = loadSettings();
    const byDay = (settings && settings.countersByDay) || {};
    return pruneByDay({ ...byDay }, new Date());
  } catch {
    return {};
  }
}

/**
 * Return a contiguous numeric series for one counter over the last
 * `days` days, with the oldest at index 0 and today at index
 * `days-1`. Missing days are 0.
 *
 * Useful for rendering sparklines (most SVG sparkline code expects
 * a flat array of points).
 *
 * @param {string} name   counter key
 * @param {number} [days=30]
 * @param {Date}   [now=new Date()] injected for tests
 * @returns {number[]}
 */
export function getCounterSeriesByDay(name, days = 30, now = new Date()) {
  const byDay = getCountersByDay();
  const out = new Array(days).fill(0);
  for (let i = 0; i < days; i++) {
    const dt = new Date(now.getTime() - (days - 1 - i) * 86400_000);
    const k = dayKey(dt);
    const bucket = byDay[k];
    if (bucket && typeof bucket === 'object') {
      out[i] = Number(bucket[name]) || 0;
    }
  }
  return out;
}

/**
 * Expose dayKey and pruneByDay for tests. Not part of the public API
 * for other modules — use the series/map readers above.
 */
export const __test = { dayKey, pruneByDay, DAILY_HISTORY_DAYS };

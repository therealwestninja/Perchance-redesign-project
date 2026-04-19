// profile/personal_bests.js
//
// Tracks the user's best-ever value for a set of engagement signals
// (total words written, total memory saves, longest streak, level,
// etc.) and detects when the current session crosses a previous
// high-water mark.
//
// Usage pattern:
//   1. At session start (profile open), pass the current stats to
//      checkAndUpdateBests(). It returns an array of { metric,
//      previous, current } for every metric that just improved.
//   2. If the list is non-empty, show a toast/notification with the
//      results. The store is already updated with the new peaks —
//      caller doesn't need to save.
//
// This is DELIBERATELY a simple high-water-mark tracker, NOT a
// per-session delta tracker. We report new records, not per-session
// improvements. Rationale: "You wrote 200 words this session" is
// cute but hard to define (what's a session?); "You broke your
// all-time word-count record of 1,500" is unambiguous and
// meaningful.
//
// Storage: settings.personalBests = { [metric]: { value, achievedAt } }.
// Missing metrics default to 0 and treat the first observed value as
// a record, so new fields land gracefully on old profiles.

import { loadSettings, updateField } from './settings_store.js';

/**
 * Metric definitions. Each entry describes how to read the metric's
 * current value from a stats bundle plus a user-facing label for the
 * notification message.
 *
 * minFirstRun: below this value, we treat the observation as noise
 * and DON'T record the first one as a personal best. Keeps us from
 * celebrating "new record: 1 word!" on the very first page load.
 * Once the user crosses the threshold, every subsequent improvement
 * is a real record.
 */
export const METRICS = Object.freeze([
  {
    key: 'wordsWritten',
    label: 'words written',
    read: (s) => Number((s && s.wordsWritten) || 0),
    format: (v) => `${v.toLocaleString()} words`,
    minFirstRun: 100, // don't celebrate until they've at least hit 100
  },
  {
    key: 'characterCount',
    label: 'characters created',
    read: (s) => Number((s && s.characterCount) || 0),
    format: (v) => `${v} character${v === 1 ? '' : 's'}`,
    minFirstRun: 2,
  },
  {
    key: 'threadCount',
    label: 'threads started',
    read: (s) => Number((s && s.threadCount) || 0),
    format: (v) => `${v} thread${v === 1 ? '' : 's'}`,
    minFirstRun: 2,
  },
  {
    key: 'loreCount',
    label: 'lore entries',
    read: (s) => Number((s && s.loreCount) || 0),
    format: (v) => `${v} lore entr${v === 1 ? 'y' : 'ies'}`,
    minFirstRun: 3,
  },
  {
    key: 'memorySaves',
    label: 'memory saves',
    read: (s) => Number((s && s.counters && s.counters.memorySaves) || 0),
    format: (v) => `${v} memory save${v === 1 ? '' : 's'}`,
    minFirstRun: 2,
  },
  {
    key: 'bubblesRenamed',
    label: 'bubbles renamed',
    read: (s) => Number((s && s.counters && s.counters.bubblesRenamed) || 0),
    format: (v) => `${v} bubble${v === 1 ? '' : 's'} renamed`,
    minFirstRun: 2,
  },
  {
    key: 'streakLongest',
    label: 'longest streak',
    read: (s) => Number((s && s.streaks && s.streaks.longest) || 0),
    format: (v) => `${v}-day streak`,
    minFirstRun: 2,
  },
]);

/**
 * Current personal-best record for a metric, or a zero record if
 * nothing's been recorded yet.
 */
function readStored(settings) {
  const bests = (settings && settings.personalBests) || {};
  return (bests && typeof bests === 'object' && !Array.isArray(bests)) ? bests : {};
}

/**
 * Check every metric for an improvement over the stored best.
 * Updates the store in-place with any improvements. Returns an array
 * of improvement records the caller should surface.
 *
 * @param {object} stats - augmented stats bundle (counters + streaks
 *   should already be injected; see profile/full_page.js)
 * @returns {Array<{ key: string, label: string, previous: number,
 *   current: number, formatted: string }>}
 */
export function checkAndUpdateBests(stats) {
  const settings = safeLoad();
  const stored = readStored(settings);
  const improvements = [];
  const nowIso = new Date().toISOString();
  const nextStore = { ...stored };
  let changed = false;

  for (const m of METRICS) {
    const current = m.read(stats);
    const prevRec = stored[m.key];
    const prev = prevRec ? Number(prevRec.value) || 0 : 0;

    // Only record/report if we crossed a threshold. First-run guard
    // prevents noise from trivial initial values.
    if (current <= prev) continue;
    if (prev === 0 && current < m.minFirstRun) continue;

    // For subsequent bumps past a recorded best, ANY improvement
    // counts. For first-ever records (prev === 0), require
    // minFirstRun to avoid celebrating "1 word" type baselines.
    nextStore[m.key] = { value: current, achievedAt: nowIso };
    changed = true;

    // Only surface to the user if the improvement is over a
    // previously-recorded best (not the initial zero -> N jump,
    // which feels like noise for metrics the user has been
    // accumulating silently). Users shouldn't get a wall of 7
    // notifications on their first profile open after upgrading.
    if (prev > 0) {
      improvements.push({
        key: m.key,
        label: m.label,
        previous: prev,
        current,
        formatted: m.format(current),
      });
    }
  }

  if (changed) {
    try {
      updateField('personalBests', nextStore);
    } catch { /* non-fatal */ }
  }

  return improvements;
}

/**
 * Read current personal bests. Always returns an object (possibly
 * empty). Useful for displaying "your records" somewhere in the UI.
 *
 * @returns {Object<string, { value: number, achievedAt: string }>}
 */
export function getPersonalBests() {
  const settings = safeLoad();
  return readStored(settings);
}

// ---- helpers ----

function safeLoad() {
  try { return loadSettings(); } catch { return null; }
}

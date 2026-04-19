// profile/summary_notifications.js
//
// Weekly "what you did" summary. On profile open, if a week has
// passed since the last snapshot AND the user has meaningful activity
// deltas, fire a celebratory toast summarizing their week.
//
// Design: pull-based (not scheduled). We don't need background
// timers — the snapshot lives in settings, the delta is computed
// lazily the next time the user opens their profile. Quiet weeks
// don't get notifications; opening the profile after a busy week
// does.
//
// Opt-out: settings.summaryNotifications.enabled defaults to true.
// Users who find the weekly summary noisy can disable it from
// details/settings (UI affordance is out-of-scope for this commit —
// can be added later without touching this module; disabling via
// direct settings edit works today).

import { loadSettings, updateField } from './settings_store.js';

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Metrics we summarize, in priority order. The top 3 non-zero deltas
 * appear in the summary; the rest are silently ignored to keep the
 * message short.
 *
 * Each entry is a counter key + a labeled plural/singular renderer.
 * Easy to extend: add a new counter key to settings, then add a
 * METRIC entry here and it's automatically eligible for summaries.
 */
const SUMMARY_METRICS = [
  { key: 'memorySaves',                 noun: 'memory save'           },
  { key: 'bubblesRenamed',              noun: 'bubble rename'         },
  { key: 'bubblesLocked',               noun: 'bubble lock'           },
  { key: 'cardsReorderedInBubble',      noun: 'card reorder'          },
  { key: 'cardsReorderedCrossBubble',   noun: 'cross-bubble reorder'  },
  { key: 'snapshotsRestored',           noun: 'snapshot restore'      },
  { key: 'charactersSpawned',           noun: 'new character'         },
  { key: 'backupsExported',             noun: 'backup'                },
  { key: 'memoryWindowOpens',           noun: 'memory tool open'      },
  { key: 'promptArchiveOpens',          noun: 'prompt review'         },
];

/**
 * Check whether the user should see a summary toast right now.
 * Updates the snapshot in settings as a side effect.
 *
 * Returns either:
 *   { kind: 'none' } — nothing to show (no snapshot yet, under 7
 *     days, or no deltas worth surfacing)
 *   { kind: 'summary', line, deltas } — caller should toast this
 *
 * `line` is a human-readable sentence like "This week: 5 memory
 * saves, 12 bubble renames, and 2 new characters."
 *
 * @param {object} currentCounters  result of getCounters()
 * @param {Date}   [now=new Date()] injected for testability
 */
export function checkSummary(currentCounters, now = new Date()) {
  const settings = safeLoad();
  if (settings && settings.summaryNotifications &&
      settings.summaryNotifications.enabled === false) {
    return { kind: 'none', reason: 'disabled' };
  }

  const snap = (settings && settings.summaryNotifications &&
                settings.summaryNotifications.lastSnapshot) || null;

  if (!snap || !snap.timestamp) {
    // No snapshot yet — record one and stay silent. Next week's
    // check will have a baseline to compare against.
    writeSnapshot(currentCounters, now);
    return { kind: 'none', reason: 'first-run' };
  }

  const elapsed = now.getTime() - new Date(snap.timestamp).getTime();
  if (elapsed < WEEK_MS) {
    return { kind: 'none', reason: 'too-soon' };
  }

  const deltas = computeDeltas(snap.counters || {}, currentCounters || {});
  // Advance the snapshot window regardless of whether we surface.
  // Prevents a user who comes back every 8 days from accumulating
  // 2-week, 3-week deltas — the summary tracks "since we last told
  // you," not "since you first used the app."
  writeSnapshot(currentCounters, now);

  const top = pickTopDeltas(deltas, 3);
  if (top.length === 0) return { kind: 'none', reason: 'no-activity' };

  const line = composeSummaryLine(top);
  return { kind: 'summary', line, deltas: top };
}

/**
 * Raw delta computation. Exported for tests + possible UI use.
 */
export function computeDeltas(prevCounters, currCounters) {
  const out = {};
  for (const m of SUMMARY_METRICS) {
    const prev = Number((prevCounters || {})[m.key]) || 0;
    const curr = Number((currCounters || {})[m.key]) || 0;
    const diff = curr - prev;
    if (diff > 0) out[m.key] = diff;
  }
  return out;
}

/**
 * Pick the top N deltas (by magnitude) and attach metric metadata.
 */
export function pickTopDeltas(deltas, n = 3) {
  const entries = Object.entries(deltas || {})
    .map(([key, delta]) => {
      const meta = SUMMARY_METRICS.find(m => m.key === key);
      return meta ? { key, delta, noun: meta.noun } : null;
    })
    .filter(Boolean);
  entries.sort((a, b) => b.delta - a.delta);
  return entries.slice(0, n);
}

/**
 * Turn an array of [{ delta, noun }] into a readable sentence.
 * "This week: 5 memory saves, 12 bubble renames, and 2 characters."
 */
export function composeSummaryLine(top) {
  if (!top || !top.length) return '';
  const parts = top.map(t => `${t.delta} ${pluralize(t.noun, t.delta)}`);
  let joined;
  if (parts.length === 1) joined = parts[0];
  else if (parts.length === 2) joined = `${parts[0]} and ${parts[1]}`;
  else joined = `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
  return `This week: ${joined}.`;
}

// ---- helpers ----

function writeSnapshot(counters, now) {
  const snap = {
    timestamp: now.toISOString(),
    counters: { ...(counters || {}) },
  };
  try {
    updateField('summaryNotifications.lastSnapshot', snap);
  } catch { /* non-fatal */ }
}

function pluralize(noun, n) {
  return n === 1 ? noun : `${noun}s`;
}

function safeLoad() {
  try { return loadSettings(); } catch { return null; }
}

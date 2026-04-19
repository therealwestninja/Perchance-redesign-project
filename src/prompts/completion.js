// prompts/completion.js
//
// Per-week completion tracking for weekly prompts, plus the "new week has
// rolled over" detection that feeds the mini-card pulse.
//
// State shape inside pf:settings:
//   prompts: {
//     completedByWeek: { 'YYYY-Www': ['p-id-1', 'p-id-2', ...] },
//     lastSeenWeek: 'YYYY-Www',
//     hasInitialized: boolean,
//   }

import { loadSettings, updateField } from '../profile/settings_store.js';
import { getCurrentWeekKey, getCurrentDayKey } from './scheduler.js';

// ---- completion get/set ----

/**
 * Return the set of prompt IDs the user has marked done for the given week.
 */
export function getCompletedIds(weekKey) {
  const s = safeLoad();
  const byWeek = (s.prompts && s.prompts.completedByWeek) || {};
  const list = byWeek[weekKey] || [];
  return new Set(Array.isArray(list) ? list : []);
}

/**
 * Toggle a prompt's completion state for the given week.
 * Idempotent when already in the desired state.
 *
 * @param {string} weekKey
 * @param {string} id
 * @param {boolean} completed
 */
export function setCompleted(weekKey, id, completed) {
  if (typeof weekKey !== 'string' || typeof id !== 'string') return;
  const s = safeLoad();
  const byWeek = { ...((s.prompts && s.prompts.completedByWeek) || {}) };
  const current = new Set(Array.isArray(byWeek[weekKey]) ? byWeek[weekKey] : []);

  if (completed) {
    if (current.has(id)) return;
    current.add(id);
  } else {
    if (!current.has(id)) return;
    current.delete(id);
  }

  byWeek[weekKey] = [...current];
  updateField('prompts.completedByWeek', byWeek);

  // Event-participation hook. When the user completes a prompt
  // whose ID belongs to an event (namespaced with `e-`), bump that
  // event's participation record to 'responded'. Monotonic — a
  // later un-check doesn't regress the record (see
  // events/participation.js#recordEventParticipation). No-op for
  // non-event prompts.
  if (completed) {
    try {
      // recordPromptCompletionParticipation is in the same IIFE scope
      // (bundled from events/participation.js). No dynamic import
      // needed — the bundle has no separate module files.
      recordPromptCompletionParticipation(id);
    } catch { /* non-fatal */ }
  }
}

// ---- "new week pending" — feeds the mini-card pulse ----

/**
 * Has the week rolled over since the user last acknowledged prompts?
 * Used to decide whether the mini-card should pulse.
 *
 * @param {string} [currentWeekKey]   defaults to today's
 * @returns {boolean}
 */
export function hasNewWeekPending(currentWeekKey = getCurrentWeekKey()) {
  const s = safeLoad();
  const lastSeen = (s.prompts && s.prompts.lastSeenWeek) || null;
  return lastSeen !== currentWeekKey;
}

/**
 * Acknowledge the current week's prompts. Called when the user opens the
 * full profile — same semantics as achievement mark-seen.
 */
export function markWeekSeen(weekKey = getCurrentWeekKey()) {
  if (typeof weekKey !== 'string') return;
  updateField('prompts.lastSeenWeek', weekKey);
}

// ---- "new day pending" — parallel feed for daily-cadence users ----

/**
 * Has the day rolled over since the user last acknowledged prompts?
 * Drives the mini-card pulse when cadence is set to 'daily'.
 *
 * @param {string} [currentDayKey]   defaults to today's YYYY-MM-DD
 * @returns {boolean}
 */
export function hasNewDayPending(currentDayKey = getCurrentDayKey()) {
  const s = safeLoad();
  const lastSeen = (s.prompts && s.prompts.lastSeenDay) || null;
  return lastSeen !== currentDayKey;
}

/**
 * Acknowledge today's prompt. Called alongside markWeekSeen when the
 * profile opens so BOTH caches stay fresh regardless of cadence.
 */
export function markDaySeen(dayKey = getCurrentDayKey()) {
  if (typeof dayKey !== 'string') return;
  updateField('prompts.lastSeenDay', dayKey);
}

/**
 * First-run initialization. On first ever load, mark the current week
 * AND day as already seen — so the pulse doesn't fire just because the
 * feature is new to the user. Next week's (or day's) rollover will
 * correctly pulse.
 *
 * @returns {boolean} true iff this call performed the initialization
 */
export function initPromptsOnFirstRun() {
  const s = safeLoad();
  const alreadyInited = !!(s.prompts && s.prompts.hasInitialized);
  if (alreadyInited) return false;

  // Merge rather than replace — preserve any other prompts subfields
  // (e.g. historicalTotals from a restored backup, or future fields)
  // instead of clobbering them. Today these are usually defaults at
  // first-run, but preemptively safe for code paths that might write
  // prompt fields before this init has had a chance to run.
  const prev = s.prompts || {};
  updateField('prompts', {
    ...prev,
    completedByWeek: prev.completedByWeek || {},
    lastSeenWeek: getCurrentWeekKey(),
    lastSeenDay: getCurrentDayKey(),
    hasInitialized: true,
    cadence: prev.cadence || 'weekly',
  });
  return true;
}

// ---- internals ----

function safeLoad() {
  try { return loadSettings(); }
  catch { return {}; }
}

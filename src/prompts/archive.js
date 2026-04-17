// prompts/archive.js
//
// Compute a historical record of past weeks' prompts — what was offered,
// what the user completed. Pure: reads stored completions from settings,
// recomputes offerings via the deterministic scheduler + event calendar.
//
// No new storage. completedByWeek already exists in pf:settings (that's
// how weekly completions persist across days). Past offerings are
// recreated on demand — same week key + same registry always yields the
// same prompts.

import { getCurrentWeekKey, getWeekPrompts } from './scheduler.js';
import { getActiveEvents } from '../events/active.js';
import { loadSettings } from '../profile/settings_store.js';

const DEFAULT_WEEKS_BACK = 8;
export const MAX_WEEKS_BACK = 52;

/**
 * Returns past-week archive entries in reverse chronological order
 * (newest first). Does NOT include the current week — that lives in the
 * live Prompts section. Each entry carries enough data to render the
 * offerings, completion state, and associated events.
 *
 * @param {{ weeksBack?: number, now?: Date }} [opts]
 * @returns {Array<ArchiveEntry>}
 */
export function computeArchiveEntries({ weeksBack = DEFAULT_WEEKS_BACK, now = new Date() } = {}) {
  const bound = Math.max(0, Math.min(weeksBack, MAX_WEEKS_BACK));
  const s = safeLoadSettings();
  const completedByWeek = (s && s.prompts && s.prompts.completedByWeek) || {};

  const entries = [];
  for (let i = 1; i <= bound; i++) {
    const weekDate = new Date(now);
    weekDate.setUTCDate(weekDate.getUTCDate() - i * 7);
    const weekKey = getCurrentWeekKey(weekDate);

    entries.push(buildWeekEntry(weekKey, completedByWeek[weekKey] || []));
  }
  return entries;
}

function buildWeekEntry(weekKey, completedIds) {
  const completedSet = new Set(Array.isArray(completedIds) ? completedIds : []);
  const monday = weekKeyToMondayDate(weekKey);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const regularPrompts = getWeekPrompts(weekKey).map(p => ({
    id: p.id,
    text: p.text,
    completed: completedSet.has(p.id),
  }));

  // Events active on ANY day in this week (union across 7 days)
  const eventsInWeek = getEventsInWeekRange(monday, sunday);
  const eventGroups = eventsInWeek.map(ev => ({
    eventId: ev.id,
    eventName: ev.name,
    eventIcon: ev.icon,
    prompts: ev.prompts.map(p => ({
      id: p.id,
      text: p.text,
      completed: completedSet.has(p.id),
    })),
  }));

  const regularCompleted = regularPrompts.filter(p => p.completed).length;
  const eventCompleted = eventGroups.reduce(
    (acc, g) => acc + g.prompts.filter(p => p.completed).length, 0
  );
  const eventTotal = eventGroups.reduce((acc, g) => acc + g.prompts.length, 0);

  return {
    weekKey,
    monday,
    sunday,
    dateRange: formatDateRange(monday, sunday),
    regularPrompts,
    eventGroups,
    completedCount: regularCompleted + eventCompleted,
    totalCount: regularPrompts.length + eventTotal,
  };
}

/**
 * Map an ISO week key like "2026-W16" back to the Date of its Monday (UTC).
 * Uses the canonical ISO definition: week 1 is the week containing Jan 4.
 *
 * @param {string} weekKey
 * @returns {Date}
 */
export function weekKeyToMondayDate(weekKey) {
  const match = /^(\d{4})-W(\d{1,2})$/.exec(String(weekKey || ''));
  if (!match) return new Date(NaN);
  const year = parseInt(match[1], 10);
  const weekNo = parseInt(match[2], 10);

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4DayOfWeek = jan4.getUTCDay() || 7;   // Sun=0 → 7 (ISO treats Sun as end-of-week)
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4DayOfWeek - 1));

  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (weekNo - 1) * 7);
  return monday;
}

/**
 * Iterate each day from `start` to `end` (inclusive, UTC), return the
 * union of events that were active on any of them. Deduplicated by event id.
 */
export function getEventsInWeekRange(start, end) {
  const found = new Map();
  const day = new Date(start);
  const last = new Date(end);
  // Safety bound — an ISO week is always exactly 7 days but don't trust inputs
  let guard = 14;
  while (day.getTime() <= last.getTime() && guard > 0) {
    for (const ev of getActiveEvents(day)) {
      if (!found.has(ev.id)) found.set(ev.id, ev);
    }
    day.setUTCDate(day.getUTCDate() + 1);
    guard--;
  }
  return Array.from(found.values());
}

/**
 * Compact, human-readable week range — "Apr 7–13" or "Apr 28 – May 4".
 * Always UTC, en-US month names (consistent with the app's existing
 * UTC-based week boundaries).
 */
export function formatDateRange(start, end) {
  const startM = UTC_MONTHS[start.getUTCMonth()];
  const endM   = UTC_MONTHS[end.getUTCMonth()];
  const startD = start.getUTCDate();
  const endD   = end.getUTCDate();
  if (startM === endM) return `${startM} ${startD}–${endD}`;
  return `${startM} ${startD} – ${endM} ${endD}`;
}

const UTC_MONTHS = Object.freeze([
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]);

function safeLoadSettings() {
  try { return loadSettings(); }
  catch { return null; }
}

/**
 * @typedef {Object} ArchiveEntry
 * @property {string} weekKey
 * @property {Date}   monday
 * @property {Date}   sunday
 * @property {string} dateRange       "Apr 7–13" or "Apr 28 – May 4"
 * @property {Array<{id: string, text: string, completed: boolean}>} regularPrompts
 * @property {Array<{eventId: string, eventName: string, eventIcon: string,
 *                   prompts: Array<{id: string, text: string, completed: boolean}>}>}
 *          eventGroups
 * @property {number} completedCount
 * @property {number} totalCount
 */

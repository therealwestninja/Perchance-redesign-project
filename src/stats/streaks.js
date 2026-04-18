// stats/streaks.js
//
// Consecutive-day activity streak tracking.
//
// Activity = any meaningful engagement: opening the profile, opening
// the Memory tool, completing a prompt. Each activity call passes
// through the streak updater, which is idempotent within a day so
// multiple calls on the same day don't inflate anything.
//
// Streak rules:
//   - First activity ever: current = 1, longest = 1.
//   - Activity on the SAME UTC day as lastActiveDay: no change.
//   - Activity on the day AFTER lastActiveDay: current += 1; longest
//     bumps if current > previous longest.
//   - Activity after a gap > 1 day: current = 1, longest preserved.
//
// We use UTC day-keys for consistency. Local-timezone-midnight would
// be user-friendlier but introduces DST/travel ambiguity. A UTC day
// being "the wrong shape" for a given user is a small cost; we can
// revisit with explicit local-day opt-in later.

import { loadSettings, updateField } from '../profile/settings_store.js';
import { getCurrentDayKey } from '../prompts/scheduler.js';

/**
 * Record activity for the streak system. Idempotent within a day.
 * Returns the updated streak state so callers can surface it without
 * a second read.
 *
 * @param {Date} [now=new Date()]
 * @returns {{ current: number, longest: number, lastActiveDay: string }}
 */
export function recordActivityForStreak(now = new Date()) {
  const todayKey = getCurrentDayKey(now);
  const settings = safeLoad();
  const streaks = (settings && settings.streaks) || { current: 0, longest: 0, lastActiveDay: null };

  const lastDay = streaks.lastActiveDay;

  // Same-day activity: no-op, return existing state.
  if (lastDay === todayKey) {
    return {
      current: Number(streaks.current) || 0,
      longest: Number(streaks.longest) || 0,
      lastActiveDay: lastDay,
    };
  }

  let current;
  if (!lastDay) {
    // First activity ever.
    current = 1;
  } else if (isConsecutiveDay(lastDay, todayKey)) {
    current = (Number(streaks.current) || 0) + 1;
  } else {
    // Gap > 1 day: streak resets.
    current = 1;
  }
  const longest = Math.max(Number(streaks.longest) || 0, current);

  try {
    updateField('streaks', {
      current,
      longest,
      lastActiveDay: todayKey,
    });
  } catch { /* best-effort */ }

  return { current, longest, lastActiveDay: todayKey };
}

/**
 * Read the current streak state without modifying it. Safe default
 * for missing/malformed storage.
 *
 * @returns {{ current: number, longest: number, lastActiveDay: string | null }}
 */
export function getStreaks() {
  try {
    const s = loadSettings();
    const v = (s && s.streaks) || {};
    return {
      current: Number(v.current) || 0,
      longest: Number(v.longest) || 0,
      lastActiveDay: v.lastActiveDay || null,
    };
  } catch {
    return { current: 0, longest: 0, lastActiveDay: null };
  }
}

/**
 * Derived state: is the current streak still "live"? A streak is
 * live if the user was active today OR yesterday. If two or more
 * days have passed without activity, the streak is still stored as
 * the current value but technically "at risk" — the next activity
 * will reset it.
 *
 * Used by UI to decide flame vs ember icon.
 *
 * @param {Date} [now=new Date()]
 * @returns {'active' | 'at-risk' | 'broken'}
 */
export function streakStatus(now = new Date()) {
  const { current, lastActiveDay } = getStreaks();
  if (!lastActiveDay || current === 0) return 'broken';
  const todayKey = getCurrentDayKey(now);
  if (lastActiveDay === todayKey) return 'active';
  if (isConsecutiveDay(lastActiveDay, todayKey)) return 'at-risk';
  return 'broken';
}

// ---- helpers ----

function safeLoad() {
  try { return loadSettings(); } catch { return null; }
}

/**
 * True iff `todayKey` is exactly one day after `lastDay` in UTC.
 * Both args are "YYYY-MM-DD" strings.
 */
export function isConsecutiveDay(lastDay, todayKey) {
  if (typeof lastDay !== 'string' || typeof todayKey !== 'string') return false;
  const a = Date.parse(lastDay + 'T00:00:00Z');
  const b = Date.parse(todayKey + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const dayMs = 86400000;
  const diff = b - a;
  return diff === dayMs;
}

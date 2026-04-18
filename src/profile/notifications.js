// profile/notifications.js
//
// Tracks which noteworthy events the user has been shown so that newly-
// occurring ones can trigger a gentle attention cue (the mini-card pulse)
// without pestering them about things they've already acknowledged.
//
// Acknowledgment semantics: opening the full profile page marks all
// currently-pending events as seen. We don't require the user to scroll
// to the relevant section — opening the profile is the acknowledgment.
//
// First-run semantics: if the user has never "seen" anything before, we
// treat everything currently unlocked as already seen. Otherwise a fresh
// install would pulse for every pre-existing achievement at once, which
// would feel like spam instead of "hey, this thing just happened!"
//
// Right now this covers achievements only. The API is shaped so that
// daily quests / events / holiday events can slot in as parallel methods
// (getSeenQuestIds / markQuestsSeen / etc.) without disturbing existing
// callers.

import { loadSettings, updateField } from './settings_store.js';

// ---- achievements ----

/**
 * @returns {Set<string>} IDs of achievements the user has already been shown.
 */
export function getSeenAchievementIds() {
  const s = safeLoad();
  const list = (s.notifications && s.notifications.seenAchievements) || [];
  return new Set(Array.isArray(list) ? list : []);
}

/**
 * Mark the given achievement IDs as seen. Idempotent — adding an already-seen
 * ID is a no-op. Persists via the settings store, which fires the normal
 * settings-changed event so live UI (mini-card) updates.
 *
 * @param {string[]} ids
 */
export function markAchievementsSeen(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const seen = getSeenAchievementIds();
  let changed = false;
  for (const id of ids) {
    if (typeof id === 'string' && !seen.has(id)) {
      seen.add(id);
      changed = true;
    }
  }
  if (changed) {
    updateField('notifications.seenAchievements', [...seen]);
  }
}

/**
 * Given the current list of unlocked achievement IDs, return the subset
 * that the user hasn't seen yet. The mini-card pulses iff this list is
 * non-empty.
 *
 * @param {string[]} unlockedIds
 * @returns {string[]}
 */
export function computePendingAchievements(unlockedIds) {
  if (!Array.isArray(unlockedIds) || unlockedIds.length === 0) return [];
  const seen = getSeenAchievementIds();
  return unlockedIds.filter(id => typeof id === 'string' && !seen.has(id));
}

/**
 * Read the stored map of achievement unlock dates.
 * Returns an object keyed by achievement id -> ISO timestamp string.
 * Always returns an object (never null) for safe iteration.
 *
 * @returns {Object<string, string>}
 */
export function getUnlockDates() {
  const s = safeLoad();
  const map = (s.notifications && s.notifications.unlockDates) || {};
  return (map && typeof map === 'object' && !Array.isArray(map)) ? map : {};
}

/**
 * Persist a first-detected unlock date for each newly unlocked achievement.
 * Idempotent: an achievement that already has a recorded date keeps it.
 * (We never overwrite — the first unlock is the meaningful one. If a
 * user later re-crosses a threshold after data loss or reset, we keep
 * the original date since it reflects when they FIRST earned it.)
 *
 * Call this alongside markAchievementsSeen so every pass through the
 * unlocks pipeline captures new dates.
 *
 * @param {string[]} unlockedIds - currently-unlocked achievement IDs
 */
export function recordUnlockDates(unlockedIds) {
  if (!Array.isArray(unlockedIds) || unlockedIds.length === 0) return;
  const existing = getUnlockDates();
  const nowIso = new Date().toISOString();
  let changed = false;
  const next = { ...existing };
  for (const id of unlockedIds) {
    if (typeof id !== 'string' || id === '') continue;
    if (!next[id]) {
      next[id] = nowIso;
      changed = true;
    }
  }
  if (changed) {
    updateField('notifications.unlockDates', next);
  }
}

/**
 * First-run initialization. If the user's notifications state hasn't been
 * touched yet, mark everything currently unlocked as already seen so we
 * don't spam them with a pulse for every old achievement. Idempotent.
 *
 * @param {string[]} currentUnlocked
 * @returns {boolean} true iff this call performed the initialization
 */
export function initSeenOnFirstRun(currentUnlocked) {
  const s = safeLoad();
  const alreadyInited = !!(s.notifications && s.notifications.hasInitialized);
  if (alreadyInited) return false;

  const ids = Array.isArray(currentUnlocked)
    ? currentUnlocked.filter(id => typeof id === 'string')
    : [];

  // Merge rather than replace — preserve any other notifications subfields
  // (e.g. seenEventIds, future additions) instead of clobbering them.
  // Today these are all defaults at first-run anyway, but preemptively
  // safe for any future code that touches notifications.* before this
  // first-run init has had a chance to run.
  const prevNotifications = s.notifications || {};
  updateField('notifications', {
    ...prevNotifications,
    seenAchievements: ids,
    hasInitialized: true,
  });
  return true;
}

// ---- internal ----

function safeLoad() {
  try { return loadSettings(); }
  catch { return { notifications: { seenAchievements: [], hasInitialized: false } }; }
}

// ---- events ----
//
// "Seen" here means the user has opened the profile while an event was
// active. Used to avoid pulsing repeatedly for the same event during its
// whole multi-day window. When an event's window ends and later recurs
// next year, it needs to be acknowledged again — but since the set is
// small and windows are short, we just clear the set when no events are
// currently active (handled in markEventsSeen).

/**
 * @returns {Set<string>} IDs of events the user has been shown.
 */
export function getSeenEventIds() {
  const s = safeLoad();
  const list = (s.notifications && s.notifications.seenEventIds) || [];
  return new Set(Array.isArray(list) ? list : []);
}

/**
 * Given the current list of active event IDs, return the subset the user
 * hasn't yet been shown. Non-empty → mini-card pulses.
 *
 * @param {string[]} activeIds
 * @returns {string[]}
 */
export function computePendingEvents(activeIds) {
  if (!Array.isArray(activeIds) || activeIds.length === 0) return [];
  const seen = getSeenEventIds();
  return activeIds.filter(id => typeof id === 'string' && !seen.has(id));
}

/**
 * Mark the given event IDs as seen. Also garbage-collects the seen set:
 * we only keep IDs that are currently active, so next year when the same
 * event window opens again we'll re-announce it.
 *
 * @param {string[]} currentlyActiveIds
 */
export function markEventsSeen(currentlyActiveIds) {
  if (!Array.isArray(currentlyActiveIds)) return;
  const nextSet = currentlyActiveIds.filter(id => typeof id === 'string');
  updateField('notifications.seenEventIds', nextSet);
}

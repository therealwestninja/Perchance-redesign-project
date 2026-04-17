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

  updateField('notifications', {
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

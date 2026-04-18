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
// Writes are best-effort: if localStorage is full or unavailable,
// we silently swallow the error. Counters are a pleasant-to-have
// indicator, not critical data — the user's primary work is their
// chat history, not their counter totals.

import { loadSettings, saveSettings } from '../profile/settings_store.js';

/**
 * Increment a named counter by `n` (default 1). Also updates the
 * firstUsedAt (set-once) and lastUsedAt (always) timestamps.
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

    const nowIso = new Date().toISOString();
    if (!settings.counters.firstUsedAt) {
      settings.counters.firstUsedAt = nowIso;
    }
    settings.counters.lastUsedAt = nowIso;

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
      saveSettings(settings);
    }
  } catch { /* best-effort */ }
}

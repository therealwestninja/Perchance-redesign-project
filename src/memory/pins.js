// memory/pins.js
//
// Persistent per-thread memory pinning. Pinned memories are exempt from
// prune actions. Stored in our settings_store under memory.pinsByThread
// so it rides along with the rest of profile state (backup/export/restore
// "just work" without special handling).
//
// Adapted from PMT (Perchance Memory Trimmer Tool) src/core/pins.js —
// MIT licensed. API preserved (loadPins / savePins / togglePin / getPinnedIds);
// storage layer swapped from PMT's direct localStorage with a per-scope
// key prefix to our settings_store subtree model. This means backup/import
// round-trip the pin state automatically.
//
// Storage shape:
//   settings.memory.pinsByThread: {
//     [threadId]: {
//       [entryId]: { label: string, createdAt: number, policy: 'protect' }
//     }
//   }

import { loadSettings, updateField } from '../profile/settings_store.js';

/**
 * Load the pin map for a given thread.
 *
 * @param {string} threadId
 * @returns {Record<string, { label: string, createdAt: number, policy: string }>}
 */
export function loadPins(threadId) {
  if (!threadId) return {};
  try {
    const s = loadSettings();
    const all = (s && s.memory && s.memory.pinsByThread) || {};
    const forThread = all[threadId];
    return (forThread && typeof forThread === 'object') ? forThread : {};
  } catch {
    return {};
  }
}

/**
 * Replace the pin map for a given thread.
 *
 * @param {string} threadId
 * @param {Record<string, { label: string, createdAt: number, policy: string }>} pins
 */
export function savePins(threadId, pins) {
  if (!threadId) return;
  try {
    const s = loadSettings();
    const all = (s && s.memory && s.memory.pinsByThread) || {};
    all[threadId] = pins || {};
    updateField('memory.pinsByThread', all);
  } catch { /* persist best-effort */ }
}

/**
 * Toggle pin state for an entry. Returns the NEW pinned state.
 *
 * @param {string} threadId
 * @param {string} entryId
 * @param {string} [label='']
 * @returns {boolean}
 */
export function togglePin(threadId, entryId, label = '') {
  const pins = loadPins(threadId);
  if (pins[entryId]) {
    delete pins[entryId];
    savePins(threadId, pins);
    return false;
  }
  pins[entryId] = {
    label: String(label || ''),
    createdAt: Date.now(),
    policy: 'protect',
  };
  savePins(threadId, pins);
  return true;
}

/**
 * Get the Set of pinned entry IDs for a thread — the shape trim.js expects
 * for its protectedEntryIds parameter.
 *
 * @param {string} threadId
 * @returns {Set<string>}
 */
export function getPinnedIds(threadId) {
  return new Set(Object.keys(loadPins(threadId)));
}

/**
 * Clear all pins for a thread. Useful when a thread is deleted upstream
 * and we want to free up our associated state.
 *
 * @param {string} threadId
 */
export function clearPinsForThread(threadId) {
  if (!threadId) return;
  try {
    const s = loadSettings();
    const all = (s && s.memory && s.memory.pinsByThread) || {};
    if (all[threadId]) {
      delete all[threadId];
      updateField('memory.pinsByThread', all);
    }
  } catch { /* best-effort */ }
}

/**
 * Return all thread IDs that currently have at least one pin. Useful for
 * diagnostics and for bulk operations across threads.
 *
 * @returns {string[]}
 */
export function getThreadsWithPins() {
  try {
    const s = loadSettings();
    const all = (s && s.memory && s.memory.pinsByThread) || {};
    return Object.keys(all).filter(tid =>
      all[tid] && typeof all[tid] === 'object' && Object.keys(all[tid]).length > 0
    );
  } catch {
    return [];
  }
}

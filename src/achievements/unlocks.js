// achievements/unlocks.js
//
// Given a stats bundle, compute which achievements are unlocked.
// Pure function — does not persist or read unlock state.
//
// Callers persist the list separately so we can detect "newly unlocked"
// between calls by diffing against a stored prior set.

import { ACHIEVEMENTS } from './registry.js';

/**
 * @param {import('../stats/queries.js').Stats} stats
 * @returns {string[]} sorted array of unlocked achievement IDs
 */
export function computeUnlockedIds(stats) {
  if (!stats) return [];
  const out = [];
  for (const a of ACHIEVEMENTS) {
    try {
      if (a.criteria(stats)) out.push(a.id);
    } catch {
      // Bad criteria — skip quietly. An individual malformed achievement
      // must not blow up the whole profile.
    }
  }
  return out.sort();
}

/**
 * Given previously-unlocked IDs and currently-unlocked IDs, return IDs
 * that are newly unlocked this time around.
 */
export function diffNewUnlocks(previousIds, currentIds) {
  const prev = new Set(previousIds || []);
  return (currentIds || []).filter(id => !prev.has(id));
}

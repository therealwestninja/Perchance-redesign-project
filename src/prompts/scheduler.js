// prompts/scheduler.js
//
// Given a date, produce the week's prompt selection deterministically.
// Same ISO week always yields the same prompts, across devices, without
// a server or shared database. Over many weeks the pool cycles through
// fairly (seeded shuffle, not same-N-modulo-pool).

import { PROMPTS } from './registry.js';

const PROMPTS_PER_WEEK = 4;

/**
 * ISO week key — "YYYY-Www" format (e.g., "2026-W16"). Week boundaries
 * follow ISO 8601: weeks start Monday, week 1 is the week containing
 * January 4th.
 *
 * We intentionally use UTC throughout so users in different timezones
 * transition weeks at the same wall-clock moment (Monday 00:00 UTC).
 * Minor timezone shift vs. local Monday is acceptable — this isn't a
 * deadline system, just a freshness cadence.
 *
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
export function getCurrentWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ));
  // Shift to the Thursday of this week (ISO week always contains the
  // "representative" Thursday).
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86_400_000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Deterministically select N prompts for the given week.
 * Same weekKey always returns the same prompts, same order.
 *
 * @param {string} weekKey     e.g., "2026-W16"
 * @param {{count?: number, pool?: Array}} [opts]
 * @returns {Array<{id: string, text: string}>}
 */
export function getWeekPrompts(weekKey, opts = {}) {
  const count = Math.max(1, Math.min(opts.count ?? PROMPTS_PER_WEEK, PROMPTS.length));
  const pool = opts.pool ?? PROMPTS;

  const indices = Array.from({ length: pool.length }, (_, i) => i);
  seededShuffleInPlace(indices, hashWeekKey(weekKey));
  return indices.slice(0, count).map(i => pool[i]);
}

// ---- internals: seeded PRNG + shuffle ----

/**
 * Hash a string to a 32-bit seed. Consistent cross-browser.
 * We don't need cryptographic quality — just a seed that changes
 * meaningfully across weeks.
 */
function hashWeekKey(s) {
  let h = 2166136261 >>> 0; // FNV-1a offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Seeded PRNG — mulberry32. Produces a deterministic stream of
 * floats in [0, 1) given an integer seed.
 */
function makeRandom(seed) {
  let t = seed >>> 0;
  return function next() {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle using a seeded PRNG. Mutates in place.
 */
function seededShuffleInPlace(arr, seed) {
  const rand = makeRandom(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
}

export { PROMPTS_PER_WEEK };

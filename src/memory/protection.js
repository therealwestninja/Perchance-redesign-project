// memory/protection.js
//
// Entry ID hashing + a session-scoped "protected" set.
//
// Adapted from PMT (Perchance Memory Trimmer Tool) src/core/protection.js —
// MIT licensed, original by the PMT authors. Preserved verbatim in logic;
// reformatted for our ESM conventions and commented for our context.
//
// getEntryId() is a djb2 string hash — deterministic, fast, and stable across
// sessions. Used as the primary key for pins (persisted) and session-only
// protection (ephemeral). Two memories with the same text always get the
// same ID, which matters for round-tripping through backup/restore.
//
// createSessionProtectionStore() returns an ephemeral Set wrapped in a small
// interface. Lives only in memory (not persisted) — PMT uses this for
// "protect this entry from trim IN THIS SESSION ONLY" scenarios. We'll
// probably use the persisted pins instead for most flows, but keeping the
// API around is cheap and matches the shape trim.js expects.

/**
 * Deterministic djb2 hash of the entry text, returned as 'e_' + 8 lowercase
 * hex chars. Trims whitespace first so "foo" and "foo " share an ID.
 *
 * @param {string} entry
 * @returns {string}
 */
export function getEntryId(entry) {
  const s = String(entry != null ? entry : '').trim();
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return `e_${(h >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Session-only protection store. Not persisted.
 *
 * @returns {{
 *   protect: (id: string) => void,
 *   unprotect: (id: string) => void,
 *   toggle: (id: string) => boolean,  // returns new protected state
 *   has: (id: string) => boolean,
 *   clear: () => void,
 *   values: () => string[],
 *   size: () => number,
 * }}
 */
export function createSessionProtectionStore() {
  const protectedIds = new Set();
  return {
    protect(id)   { protectedIds.add(id); },
    unprotect(id) { protectedIds.delete(id); },
    toggle(id) {
      if (protectedIds.has(id)) { protectedIds.delete(id); return false; }
      protectedIds.add(id);
      return true;
    },
    has(id)    { return protectedIds.has(id); },
    clear()    { protectedIds.clear(); },
    values()   { return [...protectedIds]; },
    size()     { return protectedIds.size; },
  };
}

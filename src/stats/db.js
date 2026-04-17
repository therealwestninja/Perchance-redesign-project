// stats/db.js
//
// Read upstream's chat data via the Dexie instance that Perchance's own code
// sets up at window.db. We do NOT open our own IndexedDB connection — doing
// that in parallel with Dexie's version/upgrade handling corrupts Dexie's
// view of the DB schema and causes "storeNames parameter was empty" errors
// later on transaction calls.
//
// Returns plain JS arrays so the pure `stats/queries.js` layer can consume
// them. Defensive: if window.db isn't ready, any table is missing, or any
// read fails, we return empty arrays rather than throw.

const STORES_TO_READ = ['characters', 'threads', 'messages', 'lore', 'misc'];

/**
 * @returns {Promise<{
 *   characters: Array, threads: Array, messages: Array,
 *   lore: Array, misc: Array
 * }>}
 */
export async function readAllStores() {
  const empty = { characters: [], threads: [], messages: [], lore: [], misc: [] };

  if (typeof window === 'undefined') return empty;
  const db = window.db;
  if (!db || typeof db !== 'object') return empty;

  try {
    const results = await Promise.all(STORES_TO_READ.map(async (name) => {
      const table = db[name];
      if (!table || typeof table.toArray !== 'function') return [name, []];
      try {
        const rows = await table.toArray();
        return [name, Array.isArray(rows) ? rows : []];
      } catch {
        return [name, []];
      }
    }));
    const out = { ...empty };
    for (const [name, rows] of results) out[name] = rows;
    return out;
  } catch {
    return empty;
  }
}

/**
 * Poll until upstream's Dexie instance is ready AND has the expected tables.
 * Resolves with the Dexie instance once ready, or null on timeout.
 *
 * @param {number} timeoutMs
 * @returns {Promise<object|null>}
 */
export async function waitForUpstreamDb(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (typeof window !== 'undefined' &&
        window.db &&
        typeof window.db === 'object' &&
        window.db.characters &&
        typeof window.db.characters.toArray === 'function') {
      return window.db;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  return null;
}

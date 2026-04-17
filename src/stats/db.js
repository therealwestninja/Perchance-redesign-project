// stats/db.js
//
// Read-only IndexedDB access for the `chatbot-ui-v1` database (the store
// upstream AI Character Chat writes to). We never write to this DB.
//
// Uses raw IndexedDB rather than Dexie so we have zero dependency surface
// and can't be broken by upstream swapping out their ORM.
//
// Returns plain JS arrays that the pure `stats/queries.js` layer can consume,
// keeping this file the only place in the codebase that touches browser APIs
// for data access.

/**
 * Name of the IndexedDB database to read. Upstream exposes window.dbName
 * if available; we fall back to the well-known name.
 */
function getDbName() {
  return (typeof window !== 'undefined' && window.dbName) || 'chatbot-ui-v1';
}

/**
 * Object stores we try to read. Missing stores are silently skipped so
 * we work even on fresh installs or upstream schema changes.
 */
const STORES_TO_READ = ['characters', 'threads', 'messages', 'lore', 'misc'];

/**
 * Open the upstream DB in read-only mode.
 * @returns {Promise<IDBDatabase>}
 */
function openDb() {
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(getDbName());
    } catch (e) {
      reject(e);
      return;
    }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB open blocked by another tab'));
    // We intentionally do NOT handle onupgradeneeded — if upstream hasn't
    // created the DB yet, opening with no version number creates an empty
    // one at version 1, which has no object stores. That's fine: we just
    // return empty arrays below.
  });
}

/**
 * Promise wrapper for IDBObjectStore.getAll().
 */
function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = store.getAll();
    } catch (e) {
      reject(e);
      return;
    }
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error || new Error('getAll failed'));
  });
}

/**
 * Read every record from every relevant store.
 *
 * @returns {Promise<{
 *   characters: Array, threads: Array, messages: Array,
 *   lore: Array, misc: Array
 * }>}
 */
export async function readAllStores() {
  const empty = { characters: [], threads: [], messages: [], lore: [], misc: [] };

  let db;
  try {
    db = await openDb();
  } catch {
    return empty;
  }

  try {
    const available = STORES_TO_READ.filter(n => db.objectStoreNames.contains(n));
    if (available.length === 0) return empty;

    const tx = db.transaction(available, 'readonly');
    const reads = available.map(name =>
      getAllFromStore(tx.objectStore(name)).then(records => [name, records])
    );
    const results = await Promise.all(reads);

    const out = { ...empty };
    for (const [name, records] of results) {
      out[name] = records;
    }
    return out;
  } catch {
    return empty;
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

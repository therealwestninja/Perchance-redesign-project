// haptic/settings.js
//
// IndexedDB-backed persistence for the haptic subsystem.
//
// Four tables (§6):
//   hapticSettings  — single row (id=global), user preferences
//   hapticPlugins   — registered backend plugins (builtin + user-added)
//   userHapticOverrides — per-character consent + overrides
//   hapticMessageEdits  — per-message tag edits (thread-local)
//
// Uses the same Dexie instance as upstream ai-character-chat.
// Tables are additive — no schema changes to pre-existing tables.
// All reads/writes are async. Missing tables degrade gracefully.

import { defaultHapticSettings } from './schema.js';

// ---- Table names ----
const T_SETTINGS  = 'hapticSettings';
const T_PLUGINS   = 'hapticPlugins';
const T_OVERRIDES = 'userHapticOverrides';
const T_EDITS     = 'hapticMessageEdits';

// ---- DB access ----

/**
 * Get the Dexie DB instance. In the Perchance bundle, `window.db`
 * is the shared Dexie database. In tests, callers inject a mock.
 */
function getDb() {
  if (typeof window !== 'undefined' && window.db) return window.db;
  return null;
}

/**
 * Check if our tables exist on the DB. They're added via Dexie
 * version upgrade in the init function below.
 */
function hasTable(db, name) {
  return db && db.tables && db.tables.some(t => t.name === name);
}

// ---- Init: ensure tables exist ----

let _initialized = false;

/**
 * Register haptic tables on the Dexie DB. Called once at boot.
 * If the DB already has the tables (from a previous session), this
 * is a no-op. If not, it opens a new version with the added stores.
 *
 * In the Perchance environment, the upstream DB is already open.
 * We can't call db.version() after open, so we use a separate
 * lightweight IDB open to create our tables if missing.
 */
export async function initHapticDb() {
  if (_initialized) return;
  _initialized = true;

  const db = getDb();
  if (!db) {
    console.warn('[haptic:settings] No database available — settings will not persist');
    return;
  }

  // Ensure our tables exist. In Perchance's Dexie setup, tables are
  // declared before the DB opens. Since we're a fork adding tables
  // after upstream's schema, we check if they already exist; if not,
  // we create them via a raw IDB upgrade.
  try {
    const idb = db.backendDB && db.backendDB();
    if (idb && !idb.objectStoreNames.contains(T_SETTINGS)) {
      // Tables don't exist yet — need to close and reopen with new version
      const dbName = db.name;
      const currentVersion = idb.version;
      db.close();

      const req = indexedDB.open(dbName, currentVersion + 1);
      req.onupgradeneeded = (event) => {
        const raw = event.target.result;
        if (!raw.objectStoreNames.contains(T_SETTINGS)) {
          raw.createObjectStore(T_SETTINGS, { keyPath: 'id' });
        }
        if (!raw.objectStoreNames.contains(T_PLUGINS)) {
          raw.createObjectStore(T_PLUGINS, { keyPath: 'id' });
        }
        if (!raw.objectStoreNames.contains(T_OVERRIDES)) {
          raw.createObjectStore(T_OVERRIDES, { keyPath: 'characterId' });
        }
        if (!raw.objectStoreNames.contains(T_EDITS)) {
          raw.createObjectStore(T_EDITS, { keyPath: 'messageId' });
        }
      };
      await new Promise((resolve, reject) => {
        req.onsuccess = () => { req.result.close(); resolve(); };
        req.onerror = () => reject(req.error);
      });

      // Reopen Dexie so it picks up the new tables
      await db.open();
    }
  } catch (err) {
    console.warn('[haptic:settings] Could not init DB tables:', err && err.message);
    // Non-fatal — settings just won't persist
  }
}

// ---- Settings CRUD ----

/** In-memory cache so reads don't hit IDB every time. */
let _settingsCache = null;

/**
 * Load the global haptic settings. Returns merged defaults + stored.
 */
export async function loadHapticSettings() {
  if (_settingsCache) return { ..._settingsCache };

  const defaults = defaultHapticSettings();
  const db = getDb();
  if (!db) return defaults;

  try {
    const row = await db.table(T_SETTINGS).get('global');
    if (row) {
      _settingsCache = { ...defaults, ...row, clamps: { ...defaults.clamps, ...(row.clamps || {}) } };
    } else {
      _settingsCache = defaults;
    }
  } catch {
    _settingsCache = defaults;
  }
  return { ..._settingsCache };
}

/**
 * Save the global haptic settings.
 */
export async function saveHapticSettings(settings) {
  _settingsCache = { ...settings, id: 'global' };
  const db = getDb();
  if (!db) return;
  try {
    await db.table(T_SETTINGS).put(_settingsCache);
  } catch (err) {
    console.warn('[haptic:settings] save failed:', err && err.message);
  }
}

/**
 * Update a single field in haptic settings (convenience).
 */
export async function updateHapticSetting(key, value) {
  const settings = await loadHapticSettings();
  settings[key] = value;
  await saveHapticSettings(settings);
}

// ---- Per-character overrides ----

/**
 * Load overrides for a specific character.
 */
export async function loadCharacterOverrides(characterId) {
  const db = getDb();
  if (!db || !characterId) return null;
  try {
    return await db.table(T_OVERRIDES).get(characterId) || null;
  } catch { return null; }
}

/**
 * Save per-character overrides (consent, added patterns, clamps).
 */
export async function saveCharacterOverrides(characterId, overrides) {
  const db = getDb();
  if (!db || !characterId) return;
  try {
    await db.table(T_OVERRIDES).put({ ...overrides, characterId });
  } catch {}
}

/**
 * Check if the user has consented to haptics for a character.
 */
export async function hasCharacterConsent(characterId) {
  const ov = await loadCharacterOverrides(characterId);
  return !!(ov && ov.consentedAt);
}

/**
 * Record consent for a character.
 */
export async function grantCharacterConsent(characterId) {
  const ov = (await loadCharacterOverrides(characterId)) || {};
  ov.consentedAt = new Date().toISOString();
  await saveCharacterOverrides(characterId, ov);
}

// ---- Plugin registry persistence ----

/**
 * Load all registered plugins from DB.
 */
export async function loadPlugins() {
  const db = getDb();
  if (!db) return [];
  try {
    return await db.table(T_PLUGINS).toArray();
  } catch { return []; }
}

/**
 * Save a plugin entry.
 */
export async function savePlugin(plugin) {
  const db = getDb();
  if (!db || !plugin || !plugin.id) return;
  try {
    await db.table(T_PLUGINS).put(plugin);
  } catch {}
}

// ---- Message edits ----

/**
 * Load edits for a message.
 */
export async function loadMessageEdits(messageId) {
  const db = getDb();
  if (!db || !messageId) return null;
  try {
    return await db.table(T_EDITS).get(messageId) || null;
  } catch { return null; }
}

/**
 * Save edits for a message.
 */
export async function saveMessageEdits(messageId, threadId, edits) {
  const db = getDb();
  if (!db || !messageId) return;
  try {
    await db.table(T_EDITS).put({ messageId, threadId, edits });
  } catch {}
}

/**
 * Clear settings cache (for tests).
 */
export function _resetSettingsCache() {
  _settingsCache = null;
}

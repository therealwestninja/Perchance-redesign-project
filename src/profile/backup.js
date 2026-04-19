// profile/backup.js
//
// Export/import of the user's profile settings as portable JSON.
//
// Protects against subdomain churn (every Perchance generator has its own
// random subdomain → own localStorage namespace), browser data clearing,
// device migration, or experimenting with settings the user might want to
// undo later.
//
// Export produces a wrapped payload:
//   { schema: 1, exportedAt: <ISO>, settings: {...} }
// Import accepts that shape OR a raw settings object (forgiving, in case
// the user manually constructed something or pasted just the settings part).

import { loadSettings, saveSettings } from './settings_store.js';

/**
 * Bump this if the settings shape changes in a way that old exports can't
 * be safely restored. Never needs to be decremented — import always tries
 * to handle older schemas gracefully via saveSettings's deep-merge with
 * defaultSettings.
 */
export const BACKUP_SCHEMA_VERSION = 1;

/**
 * Serialize current settings as pretty-printed JSON for display or copy.
 *
 * @returns {string}
 */
export function exportSettingsAsJson() {
  const settings = loadSettings();
  const payload = {
    schema: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Validate and apply an imported backup. Returns a result object rather
 * than throwing, so callers can render a user-visible error message.
 *
 * @param {string} jsonText
 * @returns {{ success: boolean, error?: string, schema?: number }}
 */
// stats/counters.js — imported lazily inside importSettingsFromJson
// to avoid a circular import with settings_store (counters imports
// settings_store, and we don't want backup.js → settings_store →
// counters → settings_store).

/**
 * Import settings from a JSON blob (either wrapped with schema meta
 * or raw settings). Returns { success, schema } on happy path or
 * { success: false, error } otherwise.
 */
export function importSettingsFromJson(jsonText) {
  if (typeof jsonText !== 'string' || !jsonText.trim()) {
    return { success: false, error: 'No backup text provided.' };
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { success: false, error: 'Not valid JSON — check for typos or missing braces.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { success: false, error: 'Backup is not a JSON object.' };
  }

  // Accept both shapes: wrapped payload OR raw settings
  let settings;
  let schema;
  if ('schema' in parsed && 'settings' in parsed && parsed.settings && typeof parsed.settings === 'object') {
    settings = parsed.settings;
    schema = Number(parsed.schema) || 1;
  } else {
    // Raw settings — check for at least one recognized top-level key so
    // we don't accept a random object
    if (!('profile' in parsed) && !('display' in parsed) && !('prompts' in parsed) && !('notifications' in parsed)) {
      return { success: false, error: 'Backup does not look like profile settings data.' };
    }
    settings = parsed;
    schema = 0;
  }

  try {
    saveSettings(settings);
    // Bump the import counter AFTER saving (so the bump itself lands
    // in the post-import settings and isn't clobbered by restoring
    // bumpCounter is in the same IIFE scope (bundled from
    // stats/counters.js). The old dynamic import was designed for
    // circular-dep avoidance in ESM, but the bundle has no modules.
    try { bumpCounter('backupsImported'); } catch { /* best-effort */ }
    return { success: true, schema };
  } catch (err) {
    return { success: false, error: (err && err.message) || 'Could not save settings.' };
  }
}

/**
 * Attempt to copy text to the clipboard. Returns a promise that resolves
 * to true on success, false if the Clipboard API is unavailable or the
 * request is denied (e.g. insecure context, no user gesture).
 *
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  try {
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to false */
  }
  return false;
}

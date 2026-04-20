// profile/backup.js
//
// Compact export/import of the user's profile settings.
//
// Export format (pfb1):
//   pfb1:<base64url(deflate(JSON.stringify(stripped_settings)))>
//
// "Stripped" means only values that differ from defaultSettings() are
// included — a typical profile drops 70-80% of the JSON before
// compression even starts. Deflate + base64url shrinks the rest.
//
// Typical backup: ~400-600 chars (vs ~3000 for the old pretty JSON).
//
// Import accepts:
//   1. pfb1:<compressed>  (new compact format)
//   2. Raw JSON object    (legacy backward compat)

import { loadSettings, saveSettings, defaultSettings } from './settings_store.js';

export const BACKUP_SCHEMA_VERSION = 2;

// ---- Deflate helpers (browser CompressionStream / Node zlib) ----

async function deflateBytes(data) {
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(data);
    writer.close();
    const chunks = [];
    const reader = cs.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const c of chunks) { out.set(c, pos); pos += c.length; }
    return out;
  }
  // Node.js fallback (tests)
  const { promisify } = await import('node:util');
  const { deflateRaw } = await import('node:zlib');
  return promisify(deflateRaw)(Buffer.from(data));
}

async function inflateBytes(data) {
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(data);
    writer.close();
    const chunks = [];
    const reader = ds.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const c of chunks) { out.set(c, pos); pos += c.length; }
    return out;
  }
  // Node.js fallback (tests)
  const { promisify } = await import('node:util');
  const { inflateRaw } = await import('node:zlib');
  return promisify(inflateRaw)(Buffer.from(data));
}

function uint8ToBase64url(arr) {
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  if (typeof btoa === 'function') {
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  return Buffer.from(arr).toString('base64url');
}

function base64urlToUint8(b64url) {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad === 2) b64 += '==';
  else if (pad === 3) b64 += '=';
  if (typeof atob === 'function') {
    const binary = atob(b64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return arr;
  }
  const buf = Buffer.from(b64, 'base64');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

// ---- Default stripping ----

/**
 * Recursively remove keys whose values match the default. Produces
 * the smallest possible JSON by only encoding what the user changed.
 */
function stripDefaults(obj, defaults) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object' || typeof defaults !== 'object') return obj;
  if (Array.isArray(obj)) return obj; // arrays aren't default-stripped

  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const d = defaults[k];
    // Fast path: identical primitives / identical JSON
    if (v === d) continue;
    if (JSON.stringify(v) === JSON.stringify(d)) continue;
    // Recurse into nested objects (not arrays)
    if (v && typeof v === 'object' && !Array.isArray(v) &&
        d && typeof d === 'object' && !Array.isArray(d)) {
      const nested = stripDefaults(v, d);
      if (Object.keys(nested).length > 0) out[k] = nested;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Deep-merge stripped settings back over defaults to reconstitute
 * the full settings object. Missing keys get their default values.
 */
function mergeOverDefaults(stripped, defaults) {
  if (!stripped || typeof stripped !== 'object') return { ...defaults };
  const out = {};
  for (const k of new Set([...Object.keys(defaults), ...Object.keys(stripped)])) {
    const s = stripped[k];
    const d = defaults[k];
    if (s === undefined) {
      out[k] = d;
    } else if (s && typeof s === 'object' && !Array.isArray(s) &&
               d && typeof d === 'object' && !Array.isArray(d)) {
      out[k] = mergeOverDefaults(s, d);
    } else {
      out[k] = s;
    }
  }
  return out;
}

// ---- Public API ----

/**
 * Export current settings as a compact pfb1 string.
 * Falls back to minified JSON if compression is unavailable.
 */
export async function exportSettingsCompact() {
  const settings = loadSettings();
  const stripped = stripDefaults(settings, defaultSettings());
  const json = JSON.stringify(stripped);

  try {
    const deflated = await deflateBytes(new TextEncoder().encode(json));
    return 'pfb1:' + uint8ToBase64url(deflated);
  } catch {
    // Compression unavailable — fall back to minified JSON
    return JSON.stringify({ schema: BACKUP_SCHEMA_VERSION, settings });
  }
}

/**
 * Legacy export — pretty JSON for backward compat display.
 * Still used by the "show raw" option if we add one.
 */
export function exportSettingsAsJson() {
  const settings = loadSettings();
  return JSON.stringify({ schema: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), settings }, null, 2);
}

/**
 * Import from either pfb1 compact format or legacy JSON.
 * Returns { success, error?, schema? }.
 */
export async function importSettingsFromText(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { success: false, error: 'No backup text provided.' };
  }

  const trimmed = text.trim();

  // ---- pfb1 compact format ----
  if (trimmed.startsWith('pfb1:')) {
    try {
      const b64 = trimmed.slice(5);
      const compressed = base64urlToUint8(b64);
      const inflated = await inflateBytes(compressed);
      const json = new TextDecoder().decode(inflated);
      const stripped = JSON.parse(json);

      if (!stripped || typeof stripped !== 'object') {
        return { success: false, error: 'Decompressed backup is not a valid object.' };
      }

      const settings = mergeOverDefaults(stripped, defaultSettings());
      saveSettings(settings);
      try { bumpCounter('backupsImported'); } catch {}
      return { success: true, schema: BACKUP_SCHEMA_VERSION };
    } catch (err) {
      return { success: false, error: 'Could not decompress backup: ' + ((err && err.message) || 'unknown error') };
    }
  }

  // ---- Legacy JSON format ----
  return importSettingsFromJson(trimmed);
}

/**
 * Legacy JSON import — kept for backward compat with existing exports
 * and manual JSON editing. Synchronous.
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

  let settings;
  let schema;
  if ('schema' in parsed && 'settings' in parsed && parsed.settings && typeof parsed.settings === 'object') {
    settings = parsed.settings;
    schema = Number(parsed.schema) || 1;
  } else {
    if (!('profile' in parsed) && !('display' in parsed) && !('prompts' in parsed) && !('notifications' in parsed)) {
      return { success: false, error: 'Backup does not look like profile settings data.' };
    }
    settings = parsed;
    schema = 0;
  }

  try {
    saveSettings(settings);
    try { bumpCounter('backupsImported'); } catch {}
    return { success: true, schema };
  } catch (err) {
    return { success: false, error: (err && err.message) || 'Could not save settings.' };
  }
}

/**
 * Copy text to clipboard. Returns true on success.
 */
export async function copyToClipboard(text) {
  try {
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  return false;
}

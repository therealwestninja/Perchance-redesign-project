// profile/share_code.js
//
// Compact, versioned profile share codes. Three format generations:
//
//   pf1: JSON → base64url (legacy, 250+ chars)
//   pf2: pipe-delimited → base64url (compact, ~135 chars)
//   pf3: binary-packed → base64url (indices, ~38 chars)
//
// pf3 encodes everything except the display name as numeric indices
// into existing registries (achievements, archetypes, accents).
// Only the display name is sent as raw text. This cuts codes by 85%.
//
// All three formats decode transparently. New codes always use pf3.

import { ACHIEVEMENTS } from '../achievements/registry.js';

const CODE_PREFIX = 'pf3';
const CURRENT_VERSION = 3;

const LIMITS = Object.freeze({
  displayName: 40,
  title: 60,
  archetype: 30,
  badgeName: 40,
  badgeIcon: 4,
  maxBadges: 5,
});

// ---- Index tables for binary packing ----
// Built once at module load from the registries.

const ARCHETYPE_IDS = ['newcomer','storyteller','rp','daily','twice_weekly','casual'];
const ACCENT_IDS = ['amber','sage','ash','clay','moss','mist','honey','rust',
  'iron','copper','jade','slate','wine','ocean','plum','silver',
  'pink','purple','sky','gold','ruby','teal','pearl','obsidian'];

// Achievement ID → index (0-based). Built from ACHIEVEMENTS registry.
const ACH_ID_TO_IDX = {};
const ACH_IDX_TO_OBJ = [];
for (let i = 0; i < ACHIEVEMENTS.length; i++) {
  ACH_ID_TO_IDX[ACHIEVEMENTS[i].id] = i;
  ACH_IDX_TO_OBJ[i] = ACHIEVEMENTS[i];
}

// Badge icon from tier — local helper to avoid load-order dependency
// on TIER_ICON from achievements_grid.js.
function badgeIconForTier(tier) { return '◆'; }
// prefixes so a later pf2 format can ship without silently
// misinterpreting old data. Payload JSON uses short field keys so
// codes stay short even with more fields added later:
//
//   { v: 1,                  payload schema version (also in prefix, repeated for robustness)
//     n: "Display Name",     n = name
//     t: "Earned Title",     t = title
//     a: "archetype label",  a = archetype (null/omitted if Newcomer)
//     l: 5,                  l = level
//     c: "d8b36a",           c = accent hex (no '#' to save 1 char)
//     b: [                   b = badges; up to 5
//       { n: "Curator", i: "●" },
//       ...
//     ],
//     x: { i: 30, f: 100 },  x = XP: into level / for next level
//     p: 0.30,               p = progress 0..1
//   }
//
// IMPORTANT: there is no avatar / image data here. Codes are
// strictly text descriptors — small enough to paste into chat and
// safe from metadata leakage. Reconstruction of a visual card is
// not a goal of this module; downstream UI can render a preview
// from the decoded fields if it wants to.
//
// PRIVACY CONTRACT (same as the old PNG flow, enforced on encode):
//   - Accepts only the public-display fields.
//   - DOES NOT accept bio, username, age range, custom gender text,
//     raw counter values, or any unlisted field.
//   - Accent is coerced to /^[0-9a-f]{6}$/i (strips '#').
//   - String fields are length-capped to prevent bloated codes.
//   - Badge list is capped to 5.
//   - Newcomer archetype is filtered to null (noise; not a signal).

/**
 * Build a safe, whitelist-enforced view-model from raw profile
 * inputs. Same privacy contract as the old PNG flow. Accepts a
 * superset-shaped object and keeps only the fields we'll encode.
 *
 * Returns a view-model suitable for encodeShareCode(), or for UI
 * preview rendering.
 *
 * @param {object} raw
 * @returns {object}
 */
export function toShareViewModel({
  displayName,
  title,
  archetype,
  level,
  accent,
  pinnedBadges,
  xpIntoLevel,
  xpForNextLevel,
  progress01,
} = {}) {
  // Accept either the raw { label } object from profile/archetypes.js
  // OR an already-normalized string (e.g., when the caller chains
  // toShareViewModel(toShareViewModel(vm)) — idempotency matters
  // since encodeShareCode defensively re-filters its input).
  let archetypeLabel = null;
  if (archetype && typeof archetype === 'object' && archetype.label) {
    archetypeLabel = String(archetype.label);
  } else if (typeof archetype === 'string') {
    archetypeLabel = archetype;
  }
  if (archetypeLabel === 'Newcomer') archetypeLabel = null;

  return {
    displayName: String(displayName || 'Chronicler').slice(0, LIMITS.displayName),
    title: String(title || 'Newcomer').slice(0, LIMITS.title),
    archetype: archetypeLabel ? archetypeLabel.slice(0, LIMITS.archetype) : null,
    level: Math.max(1, Math.floor(Number(level) || 1)),
    accent: normalizeAccent(accent),
    pinnedBadges: Array.isArray(pinnedBadges)
      ? pinnedBadges.slice(0, LIMITS.maxBadges).map(b => ({
          name: String((b && b.name) || '').slice(0, LIMITS.badgeName),
          icon: String((b && b.icon) || '◆').slice(0, LIMITS.badgeIcon),
        }))
      : [],
    xpIntoLevel: Math.max(0, Math.floor(Number(xpIntoLevel) || 0)),
    xpForNextLevel: Math.max(1, Math.floor(Number(xpForNextLevel) || 1)),
    progress01: Math.max(0, Math.min(1, Number(progress01) || 0)),
  };
}

/**
 * Encode a view-model into a share code string.
 *
 *   encodeShareCode(viewModel) => 'pf1:eyJ2Ijox...'
 *
 * Safe against extraneous caller fields — the payload is built from
 * the fixed schema below, so extras in the input are ignored.
 *
 * @param {object} viewModel  output of toShareViewModel
 * @returns {string}
 */
export function encodeShareCode(viewModel) {
  const safe = toShareViewModel(viewModel || {});

  // pf3: binary-packed format. Everything except the display name
  // is encoded as numeric indices into existing registries.
  const bytes = [];

  // Byte 0: version
  bytes.push(CURRENT_VERSION);

  // Byte 1: level (clamped to 0-255)
  bytes.push(Math.min(255, safe.level));

  // Byte 2: archetype index (0-5, 255 = null/Newcomer)
  const ARCHETYPE_LABELS = ['newcomer','storyteller','roleplayer','daily user','regular','casual'];
  let archIdx = 255;
  if (safe.archetype) {
    const lower = safe.archetype.toLowerCase();
    archIdx = ARCHETYPE_IDS.indexOf(lower);
    if (archIdx === -1) archIdx = ARCHETYPE_LABELS.indexOf(lower);
    if (archIdx === -1) archIdx = 255;
  }
  bytes.push(archIdx);

  // Byte 3: accent index (0-23, 255 = custom hex follows)
  const accentId = findAccentId(safe.accent);
  const accIdx = accentId ? ACCENT_IDS.indexOf(accentId) : -1;
  bytes.push(accIdx >= 0 ? accIdx : 255);
  // If not in palette, append 3 raw RGB bytes
  const accNotInPalette = accIdx < 0;
  if (accNotInPalette) {
    const hex = normalizeAccent(safe.accent);
    bytes.push(parseInt(hex.substring(0,2), 16) || 0);
    bytes.push(parseInt(hex.substring(2,4), 16) || 0);
    bytes.push(parseInt(hex.substring(4,6), 16) || 0);
  }

  // Byte 4: progress (0-100 integer)
  bytes.push(Math.round(safe.progress01 * 100));

  // Bytes 5-6: xpIntoLevel (uint16 big-endian)
  const xpI = Math.min(65535, safe.xpIntoLevel);
  bytes.push((xpI >> 8) & 0xFF, xpI & 0xFF);

  // Bytes 7-8: xpForNextLevel (uint16 big-endian)
  const xpF = Math.min(65535, safe.xpForNextLevel);
  bytes.push((xpF >> 8) & 0xFF, xpF & 0xFF);

  // Byte 9: title type + value
  // If title matches an achievement name, send the achievement index.
  // Otherwise send 255 (= use display name as title, or "Newcomer").
  const titleAchIdx = findAchievementIndexByName(safe.title);
  bytes.push(titleAchIdx !== -1 ? titleAchIdx : 255);

  // Byte 10: badge count
  const badges = safe.pinnedBadges || [];
  bytes.push(Math.min(LIMITS.maxBadges, badges.length));

  // Bytes 11+: badge achievement indices
  for (let i = 0; i < Math.min(LIMITS.maxBadges, badges.length); i++) {
    const bIdx = findAchievementIndexByName(badges[i].name);
    bytes.push(bIdx !== -1 ? bIdx : 255);
  }

  // Remaining: display name as UTF-8 (length-prefixed)
  const nameBytes = utf8Encode(safe.displayName.slice(0, LIMITS.displayName));
  bytes.push(Math.min(255, nameBytes.length));
  for (const b of nameBytes) bytes.push(b);

  // If title was custom (idx 255), append the title text
  if (titleAchIdx === -1 && safe.title && safe.title !== 'Newcomer') {
    const titleBytes = utf8Encode(safe.title.slice(0, LIMITS.title));
    bytes.push(Math.min(255, titleBytes.length));
    for (const b of titleBytes) bytes.push(b);
  }

  const packed = new Uint8Array(bytes);
  return `${CODE_PREFIX}:${uint8ToBase64url(packed)}`;
}

/**
 * Decode a share code back to a view-model. Returns null only if
 * the code is truly malformed — unparseable base64, non-JSON
 * payload, etc. Never throws.
 *
 * VERSION TRACKING IS CURRENTLY STUBBED OUT (see
 * `enforceVersion = false` below). While the format is still in
 * flux, we accept any `pf*:` prefix and any `v:` value so schema
 * changes during development don't invalidate codes in flight.
 * When the format stabilizes, flip `enforceVersion` to `true` and
 * update the tests that round-trip at specific versions.
 *
 * The returned shape matches toShareViewModel's output, with one
 * addition: a `source: 'shareCode'` tag so UI code can tell
 * decoded codes apart from locally-built view-models.
 *
 * @param {string} code
 * @returns {object|null}
 */
export function decodeShareCode(code) {
  if (typeof code !== 'string') return null;
  const trimmed = code.trim();
  const idx = trimmed.indexOf(':');
  if (idx < 0) return null;
  const prefix = trimmed.slice(0, idx);
  const body   = trimmed.slice(idx + 1);

  if (!/^pf\d/.test(prefix)) return null;

  // ---- pf3: binary-packed ----
  if (prefix === 'pf3') {
    try { return decodePf3(body); } catch { return null; }
  }

  // ---- pf2 / pf1: text-based (legacy) ----
  let raw;
  try { raw = base64urlDecode(body); } catch { return null; }

  // pf2: pipe-delimited
  if (raw[0] === '2' && raw[1] === '|') return decodePf2(raw);

  // pf1: JSON
  try {
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== 'object') return null;
    const badges = Array.isArray(payload.b) ? payload.b : [];
    return {
      source: 'shareCode',
      displayName: String(payload.n || 'Chronicler').slice(0, LIMITS.displayName),
      title: String(payload.t || 'Newcomer').slice(0, LIMITS.title),
      archetype: payload.a == null ? null
        : (String(payload.a).slice(0, LIMITS.archetype) || null),
      level: Math.max(1, Math.floor(Number(payload.l) || 1)),
      accent: normalizeAccent(payload.c),
      pinnedBadges: badges.slice(0, LIMITS.maxBadges).map(b => ({
        name: String((b && b.n) || '').slice(0, LIMITS.badgeName),
        icon: String((b && b.i) || '◆').slice(0, LIMITS.badgeIcon),
      })),
      xpIntoLevel: Math.max(0, Math.floor(Number(payload.x && payload.x.i) || 0)),
      xpForNextLevel: Math.max(1, Math.floor(Number(payload.x && payload.x.f) || 1)),
      progress01: Math.max(0, Math.min(1, Number(payload.p) || 0)),
    };
  } catch { return null; }
}

/** Decode pf3 binary format. */
function decodePf3(b64body) {
  const bytes = base64urlToUint8(b64body);
  if (!bytes || bytes.length < 12) return null;

  let pos = 0;
  const version = bytes[pos++];
  if (version !== 3) return null;

  const level = bytes[pos++];
  const archIdx = bytes[pos++];
  const accIdx = bytes[pos++];

  // If accent index is 255, next 3 bytes are raw RGB
  let accentHex;
  if (accIdx === 255) {
    const r = bytes[pos++] || 0;
    const g = bytes[pos++] || 0;
    const b = bytes[pos++] || 0;
    accentHex = r.toString(16).padStart(2,'0') + g.toString(16).padStart(2,'0') + b.toString(16).padStart(2,'0');
  } else {
    const accentId = accIdx < ACCENT_IDS.length ? ACCENT_IDS[accIdx] : 'amber';
    accentHex = resolveAccentColor(accentId);
  }

  const progress = bytes[pos++];
  const xpInto = (bytes[pos++] << 8) | bytes[pos++];
  const xpFor = (bytes[pos++] << 8) | bytes[pos++];
  const titleIdx = bytes[pos++];
  const badgeCount = Math.min(LIMITS.maxBadges, bytes[pos++]);

  const badges = [];
  for (let i = 0; i < badgeCount && pos < bytes.length; i++) {
    const bIdx = bytes[pos++];
    const ach = ACH_IDX_TO_OBJ[bIdx];
    if (ach) {
      badges.push({ name: ach.name, icon: badgeIconForTier(ach.tier) });
    } else {
      badges.push({ name: `Achievement #${bIdx}`, icon: '◆' });
    }
  }

  // Display name
  const nameLen = pos < bytes.length ? bytes[pos++] : 0;
  const nameBytes = bytes.slice(pos, pos + nameLen);
  pos += nameLen;
  const displayName = utf8Decode(nameBytes) || 'Chronicler';

  // Title: from achievement index or custom text
  let title = 'Newcomer';
  if (titleIdx !== 255) {
    const ach = ACH_IDX_TO_OBJ[titleIdx];
    if (ach) title = ach.name;
  } else if (pos < bytes.length) {
    const titleLen = bytes[pos++];
    const titleBytes = bytes.slice(pos, pos + titleLen);
    pos += titleLen;
    const custom = utf8Decode(titleBytes);
    if (custom) title = custom;
  }

  // Archetype
  const ARCHETYPE_LABELS = ['Newcomer','Storyteller','Roleplayer','Daily User','Regular','Casual'];
  const archetype = archIdx < ARCHETYPE_LABELS.length
    ? ARCHETYPE_LABELS[archIdx]
    : null;

  return {
    source: 'shareCode',
    displayName: displayName.slice(0, LIMITS.displayName),
    title: title.slice(0, LIMITS.title),
    archetype: archIdx === 255 ? null : archetype,
    level: Math.max(1, level),
    accent: accentHex,
    pinnedBadges: badges,
    xpIntoLevel: xpInto,
    xpForNextLevel: Math.max(1, xpFor),
    progress01: Math.max(0, Math.min(1, progress / 100)),
  };
}

/** Decode pf2 pipe-delimited format. */
function decodePf2(raw) {
  const parts = raw.split('|');
  if (parts.length < 9) return null;

  const pct = Math.max(0, Math.min(100, parseInt(parts[8], 10) || 0));
  const badges = [];
  for (let i = 9; i < parts.length && badges.length < LIMITS.maxBadges; i++) {
    const sep = parts[i].indexOf('\x01');
    if (sep >= 0) {
      badges.push({
        name: parts[i].substring(0, sep).slice(0, LIMITS.badgeName),
        icon: parts[i].substring(sep + 1).slice(0, LIMITS.badgeIcon),
      });
    } else if (parts[i]) {
      badges.push({ name: parts[i].slice(0, LIMITS.badgeName), icon: '◆' });
    }
  }

  return {
    source: 'shareCode',
    displayName: String(parts[1] || 'Chronicler').slice(0, LIMITS.displayName),
    title: String(parts[2] || 'Newcomer').slice(0, LIMITS.title),
    archetype: parts[3] ? String(parts[3]).slice(0, LIMITS.archetype) : null,
    level: Math.max(1, Math.floor(Number(parts[4]) || 1)),
    accent: normalizeAccent(parts[5]),
    pinnedBadges: badges,
    xpIntoLevel: Math.max(0, Math.floor(Number(parts[6]) || 0)),
    xpForNextLevel: Math.max(1, Math.floor(Number(parts[7]) || 1)),
    progress01: pct / 100,
  };
}

// ---- helpers ----

function normalizeAccent(accent) {
  const raw = String(accent || '').replace(/^#/, '').toLowerCase();
  return /^[0-9a-f]{6}$/.test(raw) ? raw : 'd8b36a';
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Find accent ID from hex color (reverse lookup). Returns null if not in palette. */
function findAccentId(hex) {
  const normalized = (hex || '').replace('#', '').toLowerCase();
  const map = {
    'd8b36a':'amber', '7a9a6a':'sage', '8a8a8a':'ash', 'b08a6a':'clay',
    '5a7a4e':'moss', '7a8a9a':'mist', 'c4a03a':'honey', 'a05a3a':'rust',
    '6a6a7a':'iron', 'b87333':'copper', '4a9a6a':'jade', '6a7a8a':'slate',
    '8a3a5a':'wine', '3a7a9a':'ocean', '7a4a8a':'plum', '9aaaba':'silver',
    'c07a8a':'pink', '8a5aaa':'purple', '5a8aca':'sky', 'c4a832':'gold',
    'aa3a3a':'ruby', '3a8a8a':'teal', 'cac8c0':'pearl', '2a2a3a':'obsidian',
  };
  return map[normalized] || null;
}

/** Find achievement index by name (case-insensitive). */
function findAchievementIndexByName(name) {
  if (!name) return -1;
  const lower = name.toLowerCase();
  for (let i = 0; i < ACHIEVEMENTS.length; i++) {
    if (ACHIEVEMENTS[i].name.toLowerCase() === lower) return i;
  }
  return -1;
}

/** Resolve accent ID → hex color. Simple lookup table. */
function resolveAccentColor(accentId) {
  // Hardcoded subset matching flair.js ACCENTS palette.
  const map = {
    amber:'d8b36a', sage:'7a9a6a', ash:'8a8a8a', clay:'b08a6a',
    moss:'5a7a4e', mist:'7a8a9a', honey:'c4a03a', rust:'a05a3a',
    iron:'6a6a7a', copper:'b87333', jade:'4a9a6a', slate:'6a7a8a',
    wine:'8a3a5a', ocean:'3a7a9a', plum:'7a4a8a', silver:'9aaaba',
    pink:'c07a8a', purple:'8a5aaa', sky:'5a8aca', gold:'c4a832',
    ruby:'aa3a3a', teal:'3a8a8a', pearl:'cac8c0', obsidian:'2a2a3a',
  };
  return map[accentId] || 'd8b36a';
}

/** UTF-8 encode string → Uint8Array. */
function utf8Encode(str) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str || '');
  }
  return new Uint8Array(Buffer.from(str || '', 'utf8'));
}

/** UTF-8 decode Uint8Array → string. */
function utf8Decode(bytes) {
  if (!bytes || bytes.length === 0) return '';
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  }
  return Buffer.from(bytes).toString('utf8');
}

/** Uint8Array → base64url string. */
function uint8ToBase64url(arr) {
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  if (typeof btoa === 'function') {
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  return Buffer.from(arr).toString('base64url');
}

/** Base64url string → Uint8Array. */
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

/**
 * Base64url encode (URL-safe base64, no padding). Works in both
 * browser and Node test environments.
 */
function base64urlEncode(str) {
  // Prefer TextEncoder + btoa path for wide support; fall back to
  // Buffer in Node test contexts where btoa may still exist but
  // TextEncoder could be the cleaner bridge.
  let b64;
  if (typeof btoa === 'function') {
    // Handle multi-byte characters correctly via URI-encode detour
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    b64 = btoa(binary);
  } else {
    // Node-native fallback
    b64 = Buffer.from(str, 'utf8').toString('base64');
  }
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(b64url) {
  // Restore padding
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad === 2) b64 += '==';
  else if (pad === 3) b64 += '=';
  else if (pad === 1) throw new Error('malformed base64');

  if (typeof atob === 'function') {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(b64, 'base64').toString('utf8');
}

/**
 * Test-only export — exposes internal constants for assertions.
 * Renamed from `__test` to avoid top-level collision with the
 * counters.js `__test` export (the bundler concatenates modules
 * into a single IIFE, so identical export names clash).
 */
export const __shareCodeTest = { LIMITS, CODE_PREFIX, CURRENT_VERSION };

/**
 * Build a share URL by appending the share code as a `?h=` parameter
 * to the current page's base URL. The URL is fully clickable — when
 * someone visits it, the boot code reads `?h=` and opens the card
 * viewer.
 *
 * URL construction strips any existing `h` parameter from the current
 * URL before appending, so re-sharing doesn't double-stack.
 *
 * @param {string} shareCode  output of encodeShareCode
 * @returns {string}  full URL like https://perchance.org/ai-character-hero-chat?h=pf1:eyJ...
 */
export function buildShareUrl(shareCode) {
  let base;
  try {
    const url = new URL(typeof window !== 'undefined' ? window.location.href : 'https://perchance.org/');
    // Strip existing share params so we don't double-stack
    url.searchParams.delete('h');
    // Also remove hash fragment if any (not part of the share flow)
    url.hash = '';
    base = url;
  } catch {
    // Fallback: construct from scratch if URL parsing fails
    base = new URL('https://perchance.org/');
  }
  base.searchParams.set('h', shareCode);
  return base.toString();
}

/**
 * Check the current page URL for a `?h=` share code parameter.
 * If present and decodable, returns the decoded view-model.
 * Returns null if absent, malformed, or non-decodable.
 *
 * Called on boot to decide whether to auto-open the card viewer.
 *
 * @returns {object|null}  decoded view-model with `source: 'shareCode'`
 */
export function parseShareUrl() {
  try {
    const url = new URL(typeof window !== 'undefined' ? window.location.href : '');
    const h = url.searchParams.get('h');
    if (!h) return null;
    return decodeShareCode(h);
  } catch {
    return null;
  }
}

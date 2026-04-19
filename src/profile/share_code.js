// profile/share_code.js
//
// Binary-packed profile share codes (pf3 format).
//
// Encodes profile data as numeric indices into existing registries
// (achievements, archetypes, accents). Only the display name is raw
// text. Produces ~36-char codes embedded in shareable URLs.
//
// Flow: User clicks share → encodeShareCode() → buildShareUrl() →
//       URL copied → recipient clicks → parseShareUrl() →
//       decodeShareCode() → openShareViewer()

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

const ARCHETYPE_IDS = ['newcomer','storyteller','rp','daily','twice_weekly','casual'];
const ARCHETYPE_LABELS = ['Newcomer','Storyteller','Roleplayer','Daily User','Regular','Casual'];
const ACCENT_IDS = ['amber','sage','ash','clay','moss','mist','honey','rust',
  'iron','copper','jade','slate','wine','ocean','plum','silver',
  'pink','purple','sky','gold','ruby','teal','pearl','obsidian'];

const ACH_ID_TO_IDX = {};
const ACH_IDX_TO_OBJ = [];
for (let i = 0; i < ACHIEVEMENTS.length; i++) {
  ACH_ID_TO_IDX[ACHIEVEMENTS[i].id] = i;
  ACH_IDX_TO_OBJ[i] = ACHIEVEMENTS[i];
}

function badgeIconForTier(tier) { return '◆'; }

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
 *   encodeShareCode(viewModel) => 'pf3:AwIEBBEA...'
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
 * Decode a pf3 share code back to a view-model.
 * Returns null if malformed. Never throws.
 */
export function decodeShareCode(code) {
  if (typeof code !== 'string') return null;
  const trimmed = code.trim();
  const idx = trimmed.indexOf(':');
  if (idx < 0) return null;
  const prefix = trimmed.slice(0, idx);
  const body   = trimmed.slice(idx + 1);

  if (prefix !== 'pf3') return null;
  try { return decodePf3(body); } catch { return null; }
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

// ---- helpers ----

function normalizeAccent(accent) {
  const raw = String(accent || '').replace(/^#/, '').toLowerCase();
  return /^[0-9a-f]{6}$/.test(raw) ? raw : 'd8b36a';
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
 * Test-only export — exposes internal constants for assertions.
 * Renamed from `__test` to avoid top-level collision with the
 * counters.js `__test` export (the bundler concatenates modules
 * into a single IIFE, so identical export names clash).
 */
export const __shareCodeTest = { LIMITS, CODE_PREFIX, CURRENT_VERSION };

/**
 * Build a canonical share URL.
 *
 * Perchance serves pages from hashed subdomains like
 * `b7b87bd7cc56b30fe95d472cd81985e4.perchance.org` and adds
 * internal query params like `__generatorLastEditTime`. We strip
 * all of that and build a clean canonical URL:
 *
 *   https://perchance.org/<generator-slug>?h=pf3:...
 *
 * @param {string} shareCode  output of encodeShareCode
 * @returns {string}
 */
export function buildShareUrl(shareCode) {
  // Extract the generator slug from the current pathname.
  // On Perchance this is always /<slug> (e.g. /ai-character-hero-chat).
  let slug = 'ai-character-hero-chat';
  try {
    const path = (typeof window !== 'undefined' && window.location && window.location.pathname) || '/';
    // Remove leading slash, take first segment
    const clean = path.replace(/^\/+/, '').split('/')[0];
    if (clean) slug = clean;
  } catch { /* use default */ }

  return `https://perchance.org/${slug}?h=${encodeURIComponent(shareCode)}`;
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

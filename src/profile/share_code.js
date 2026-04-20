// profile/share_code.js
//
// Compact binary-packed profile share codes (pf5 format).
//
// Prefixless base64url encoding. First byte is the version (5).
// Uses LEB128 varints for numbers, flag-based color omission
// (default colors cost 0 bytes), and delta-encoded badge indices.
//
// Typical profile: ~30–45 chars. Minimal: ~18 chars.
//
// Flow: User clicks share → encodeShareCode() → buildShareUrl() →
//       URL copied → recipient clicks → parseShareUrl() →
//       decodeShareCode() → openShareViewer()

import { ACHIEVEMENTS } from '../achievements/registry.js';

const CODE_PREFIX = 'pf5';
const CURRENT_VERSION = 5;

// Default colors — when a color matches its default, the flag bit
// stays 0 and the 3 RGB bytes are omitted entirely.
const COLOR_DEFAULTS = {
  accent:    'd8b36a',
  vellum:    'e8dcc4',
  silver:    '8b95a3',
  secondary: '161b22',
  primary:   '0d1117',
  future:    '000000',
};
const COLOR_KEYS = ['accent','vellum','silver','secondary','primary','future'];

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
  vellum,
  silver,
  secondary,
  primary,
  pinnedBadges,
  xpIntoLevel,
  xpForNextLevel,
  progress01,
  wordsWritten,
  threadCount,
  daysActive,
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
    vellum: normalizeAccent(vellum || 'e8dcc4'),
    silver: normalizeAccent(silver || '8b95a3'),
    secondary: normalizeAccent(secondary || '161b22'),
    primary: normalizeAccent(primary || '0d1117'),
    wordsWritten: Math.max(0, Math.floor(Number(wordsWritten) || 0)),
    threadCount: Math.max(0, Math.floor(Number(threadCount) || 0)),
    daysActive: Math.max(0, Math.floor(Number(daysActive) || 0)),
  };
}

// ---- LEB128 varint helpers ----

/** Encode a non-negative integer as LEB128 varint bytes. */
function pushVarint(bytes, value) {
  let v = value >>> 0; // clamp to uint32
  do {
    let b = v & 0x7F;
    v >>>= 7;
    if (v > 0) b |= 0x80;
    bytes.push(b);
  } while (v > 0);
}

/** Read a LEB128 varint from bytes at pos. Returns { value, pos }. */
function readVarint(bytes, pos) {
  let value = 0, shift = 0;
  while (pos < bytes.length) {
    const b = bytes[pos++];
    value |= (b & 0x7F) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
    if (shift > 28) break; // safety — max 32-bit
  }
  return { value: value >>> 0, pos };
}

/** Push 3 RGB bytes from a 6-char hex string. */
function pushRgb(bytes, hex) {
  bytes.push(parseInt(hex.substring(0,2), 16) || 0);
  bytes.push(parseInt(hex.substring(2,4), 16) || 0);
  bytes.push(parseInt(hex.substring(4,6), 16) || 0);
}

/** Read 3 RGB bytes → 6-char hex string. */
function readRgb(bytes, pos) {
  const hex = (bytes[pos] || 0).toString(16).padStart(2,'0')
            + (bytes[pos+1] || 0).toString(16).padStart(2,'0')
            + (bytes[pos+2] || 0).toString(16).padStart(2,'0');
  return { hex, pos: pos + 3 };
}

/**
 * Encode a view-model into a compact share code string.
 *
 * pf5 format — prefixless, varint-packed, flag-based color omission.
 * ~30 chars for a typical profile (vs ~60 for pf4).
 *
 * Layout:
 *   byte 0: version (5)
 *   byte 1: flags
 *     bit 0-5: color[i] is non-default (accent,vellum,silver,sec,pri,future)
 *     bit 6: has custom title text
 *     bit 7: has archetype
 *   varint: level
 *   varint: progress (0-100)
 *   varint: xpIntoLevel
 *   varint: xpForNextLevel
 *   [if bit 7] 1 byte: archetype index
 *   1 byte: title achievement index (255 = custom/Newcomer)
 *   1 byte: badge count
 *   [badges] varint deltas from previous (sorted ascending)
 *   [for each set color flag] 3 bytes RGB
 *   varint: wordsWritten
 *   varint: threadCount
 *   varint: daysActive
 *   varint-length-prefixed: display name UTF-8
 *   [if bit 6 AND title=255] varint-length-prefixed: title UTF-8
 */
export function encodeShareCode(viewModel) {
  const safe = toShareViewModel(viewModel || {});
  const bytes = [];

  // Version
  bytes.push(CURRENT_VERSION);

  // ---- Build flags ----
  let flags = 0;
  const colors = {
    accent:    normalizeAccent(safe.accent),
    vellum:    normalizeAccent(safe.vellum),
    silver:    normalizeAccent(safe.silver),
    secondary: normalizeAccent(safe.secondary || ''),
    primary:   normalizeAccent(safe.primary || ''),
    future:    '000000',
  };
  for (let i = 0; i < COLOR_KEYS.length; i++) {
    if (colors[COLOR_KEYS[i]] !== COLOR_DEFAULTS[COLOR_KEYS[i]]) {
      flags |= (1 << i);
    }
  }

  const titleAchIdx = findAchievementIndexByName(safe.title);
  const hasCustomTitle = titleAchIdx === -1 && safe.title && safe.title !== 'Newcomer';
  if (hasCustomTitle) flags |= (1 << 6);

  const ARCH_LABELS_LOWER = ['newcomer','storyteller','roleplayer','daily user','regular','casual'];
  let archIdx = 255;
  if (safe.archetype) {
    const lower = safe.archetype.toLowerCase();
    archIdx = ARCHETYPE_IDS.indexOf(lower);
    if (archIdx === -1) archIdx = ARCH_LABELS_LOWER.indexOf(lower);
    if (archIdx === -1) archIdx = 255;
  }
  if (archIdx !== 255) flags |= (1 << 7);

  bytes.push(flags);

  // ---- Varints: level, progress, xp ----
  pushVarint(bytes, safe.level);
  pushVarint(bytes, Math.round(safe.progress01 * 100));
  pushVarint(bytes, safe.xpIntoLevel);
  pushVarint(bytes, safe.xpForNextLevel);

  // ---- Archetype (if present) ----
  if (archIdx !== 255) bytes.push(archIdx);

  // ---- Title ----
  bytes.push(titleAchIdx !== -1 ? titleAchIdx : 255);

  // ---- Badges: count + delta-encoded indices ----
  const badges = safe.pinnedBadges || [];
  const badgeIndices = [];
  for (const b of badges) {
    const idx = findAchievementIndexByName(b.name);
    if (idx !== -1) badgeIndices.push(idx);
  }
  badgeIndices.sort((a, b) => a - b);
  bytes.push(badgeIndices.length);
  let prevBadge = 0;
  for (const idx of badgeIndices) {
    pushVarint(bytes, idx - prevBadge);
    prevBadge = idx;
  }

  // ---- Colors (only non-defaults) ----
  for (let i = 0; i < COLOR_KEYS.length; i++) {
    if (flags & (1 << i)) {
      pushRgb(bytes, colors[COLOR_KEYS[i]]);
    }
  }

  // ---- Stats ----
  pushVarint(bytes, safe.wordsWritten);
  pushVarint(bytes, safe.threadCount);
  pushVarint(bytes, safe.daysActive);

  // ---- Display name ----
  const nameBytes = utf8Encode(safe.displayName.slice(0, LIMITS.displayName));
  pushVarint(bytes, nameBytes.length);
  for (const b of nameBytes) bytes.push(b);

  // ---- Custom title text ----
  if (hasCustomTitle) {
    const titleBytes = utf8Encode(safe.title.slice(0, LIMITS.title));
    pushVarint(bytes, titleBytes.length);
    for (const b of titleBytes) bytes.push(b);
  }

  return uint8ToBase64url(new Uint8Array(bytes));
}

/**
 * Decode a pf5 share code. Prefixless: pure base64url with version
 * byte 5. Returns null if malformed. Never throws.
 */
export function decodeShareCode(code) {
  if (typeof code !== 'string') return null;
  const trimmed = code.trim();
  if (!trimmed) return null;
  try {
    const bytes = base64urlToUint8(trimmed);
    if (bytes && bytes.length >= 4 && bytes[0] === 5) {
      return decodePf5(bytes);
    }
  } catch { /* malformed */ }
  return null;
}

/** Decode pf5 compact format. */
function decodePf5(bytes) {
  let pos = 1; // skip version byte (already checked)
  const flags = bytes[pos++];

  const ARCH_LABELS = ['Newcomer','Storyteller','Roleplayer','Daily User','Regular','Casual'];

  // Varints
  let r;
  r = readVarint(bytes, pos); const level = r.value; pos = r.pos;
  r = readVarint(bytes, pos); const progress = r.value; pos = r.pos;
  r = readVarint(bytes, pos); const xpInto = r.value; pos = r.pos;
  r = readVarint(bytes, pos); const xpFor = r.value; pos = r.pos;

  // Archetype
  let archetype = null;
  if (flags & (1 << 7)) {
    const archIdx = bytes[pos++];
    archetype = archIdx < ARCH_LABELS.length ? ARCH_LABELS[archIdx] : null;
  }

  // Title
  const titleIdx = bytes[pos++];
  let title = 'Newcomer';
  if (titleIdx !== 255) {
    const ach = ACH_IDX_TO_OBJ[titleIdx];
    if (ach) title = ach.name;
  }

  // Badges (delta-decoded)
  const badgeCount = bytes[pos++];
  const badges = [];
  let prevIdx = 0;
  for (let i = 0; i < badgeCount; i++) {
    r = readVarint(bytes, pos); pos = r.pos;
    prevIdx += r.value;
    const ach = ACH_IDX_TO_OBJ[prevIdx];
    badges.push(ach
      ? { name: ach.name, icon: badgeIconForTier(ach.tier) }
      : { name: `#${prevIdx}`, icon: '◆' });
  }

  // Colors (only non-defaults present)
  const colors = {};
  for (let i = 0; i < COLOR_KEYS.length; i++) {
    if (flags & (1 << i)) {
      r = readRgb(bytes, pos); pos = r.pos;
      colors[COLOR_KEYS[i]] = r.hex;
    } else {
      colors[COLOR_KEYS[i]] = COLOR_DEFAULTS[COLOR_KEYS[i]];
    }
  }

  // Stats
  r = readVarint(bytes, pos); const wordsWritten = r.value; pos = r.pos;
  r = readVarint(bytes, pos); const threadCount = r.value; pos = r.pos;
  r = readVarint(bytes, pos); const daysActive = r.value; pos = r.pos;

  // Display name
  r = readVarint(bytes, pos); const nameLen = r.value; pos = r.pos;
  const displayName = utf8Decode(bytes.slice(pos, pos + nameLen)) || 'Chronicler';
  pos += nameLen;

  // Custom title
  if ((flags & (1 << 6)) && titleIdx === 255 && pos < bytes.length) {
    r = readVarint(bytes, pos); const tLen = r.value; pos = r.pos;
    const custom = utf8Decode(bytes.slice(pos, pos + tLen));
    if (custom) title = custom;
  }

  return {
    source: 'shareCode',
    displayName: displayName.slice(0, LIMITS.displayName),
    title: title.slice(0, LIMITS.title),
    archetype,
    level: Math.max(1, level),
    accent: colors.accent,
    vellum: colors.vellum,
    silver: colors.silver,
    secondary: colors.secondary,
    primary: colors.primary,
    pinnedBadges: badges,
    xpIntoLevel: xpInto,
    xpForNextLevel: Math.max(1, xpFor),
    progress01: Math.max(0, Math.min(1, progress / 100)),
    wordsWritten,
    threadCount,
    daysActive,
  };
}

// ---- helpers ----

function normalizeAccent(accent) {
  const raw = String(accent || '').replace(/^#/, '').toLowerCase();
  return /^[0-9a-f]{6}$/.test(raw) ? raw : 'd8b36a';
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
 *   https://perchance.org/<generator-slug>?h=<base64url>
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

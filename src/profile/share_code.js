// profile/share_code.js
//
// A compact, versioned, text-only profile share code. Replaces the
// earlier PNG-based card flow.
//
// Format:
//
//   pf1:<base64url-encoded JSON payload>
//
// The "pf1" prefix is a schema version. Decoders reject unknown
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

const CODE_PREFIX = 'pf1';
const CURRENT_VERSION = 1;

// Length caps match the old toShareViewModel limits so behaviour is
// consistent with the retired PNG path.
const LIMITS = Object.freeze({
  displayName: 40,
  title: 60,
  archetype: 30,
  badgeName: 40,
  badgeIcon: 4,
  maxBadges: 5,
});

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
  const payload = {
    v: CURRENT_VERSION,
    n: safe.displayName,
    t: safe.title,
    a: safe.archetype,  // may be null
    l: safe.level,
    c: safe.accent,     // 6-char hex without '#'
    b: safe.pinnedBadges.map(b => ({ n: b.name, i: b.icon })),
    x: { i: safe.xpIntoLevel, f: safe.xpForNextLevel },
    p: round2(safe.progress01),
  };
  const json = JSON.stringify(payload);
  return `${CODE_PREFIX}:${base64urlEncode(json)}`;
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
  // Flip to `true` once the format is locked to start enforcing
  // prefix + payload-version matches. Keep the check code intact
  // so we don't have to rewrite it later.
  const enforceVersion = false;

  if (typeof code !== 'string') return null;
  const trimmed = code.trim();
  const idx = trimmed.indexOf(':');
  if (idx < 0) return null;
  const prefix = trimmed.slice(0, idx);
  const body   = trimmed.slice(idx + 1);

  // Prefix sanity: require the "pf" family marker (so random text
  // pasted into the decoder is still rejected) but accept any
  // numeric suffix while we iterate (pf1, pf2, pf9-draft, etc.).
  if (!/^pf\d/.test(prefix)) return null;
  if (enforceVersion && prefix !== CODE_PREFIX) return null;

  let payload;
  try {
    const json = base64urlDecode(body);
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  if (enforceVersion && payload.v !== CURRENT_VERSION) return null;

  // Re-apply the same whitelist on decode. Defends against hand-
  // crafted codes with oversized fields, injected keys, etc.
  const badges = Array.isArray(payload.b) ? payload.b : [];
  return {
    source: 'shareCode',
    displayName: String(payload.n || 'Chronicler').slice(0, LIMITS.displayName),
    title: String(payload.t || 'Newcomer').slice(0, LIMITS.title),
    archetype: payload.a == null
      ? null
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
}

// ---- helpers ----

function normalizeAccent(accent) {
  // Input forms: "#d8b36a", "d8b36a", "D8B36A", undefined
  const raw = String(accent || '').replace(/^#/, '').toLowerCase();
  return /^[0-9a-f]{6}$/.test(raw) ? raw : 'd8b36a';
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
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

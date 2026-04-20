// profile/flair.js
//
// Flair — user-facing cosmetic unlocks tied to achievement progression.
//
// Today's flair types:
//   - Title: which achievement's name is worn in the profile splash.
//     Previously auto-picked the rarest unlocked; now the user can
//     pick any title they've earned (or keep the auto pick).
//   - Accent: a themed color that tints chrome around the splash +
//     mini-card. Unlocked in tiers as the user accumulates
//     bronze/silver/gold achievements.
//
// Extension-friendly: new flair types (avatar borders, background
// patterns, etc.) just add a selector here, a settings.profile.flair
// field, and a consumer in the splash/mini-card.

import { ACHIEVEMENTS } from '../achievements/registry.js';
import { tierRank } from '../render/share_chips.js';

// ---- Accent palette ----
//
// Each accent has an id, label, and unlock criterion. The criterion
// is a pure function of stats+unlocked so we can tell "what's
// unlocked for this user" without polling lots of separate state.
//
// Unlock thresholds are intentionally modest so a user who's
// earned SOMETHING has SOMETHING to pick. A user with zero
// achievements still sees the default amber.
//
// The palette is laid out as three conceptual rows of eight:
//   Row 1 — Traveler's satchel  (starters; first 4 always free,
//                                rest gated at low bronze thresholds)
//   Row 2 — Veteran's cache     (metals + jewels; silver/gold gated)
//   Row 3 — Legendary regalia   (the endgame rarities;
//                                legendary-tier conditions)
//
// The picker renders as a single flex-wrap row; visual row breaks
// happen at the 8/16/24 boundary naturally at typical widths.
//
// Migration: users with a previously-picked accent that no longer
// exists (forest/azure/rose/violet/crimson got relabeled or
// upgraded) will silently fall back to amber via resolveActiveAccent,
// consistent with the pre-existing "picked but no-longer-eligible"
// handling. They can re-pick from the picker on next open.

export const ACCENTS = Object.freeze([
  // --------------------------------------------------------------
  // Row 1 — Traveler's satchel (warm/earthy starters)
  // --------------------------------------------------------------
  {
    id: 'amber',
    label: 'Amber',
    color: '#d8b36a',
    description: 'The default, available to all.',
    criterion: () => true,
  },
  {
    id: 'sage',
    label: 'Sage',
    color: '#8ba67a',
    description: 'Always available.',
    criterion: () => true,
  },
  {
    id: 'ash',
    label: 'Ash',
    color: '#9a8b7a',
    description: 'Always available.',
    criterion: () => true,
  },
  {
    id: 'clay',
    label: 'Clay',
    color: '#b08a6b',
    description: 'Always available.',
    criterion: () => true,
  },
  {
    id: 'moss',
    label: 'Moss',
    color: '#5a7a4e',
    description: 'Unlocked at 1 bronze-tier achievement.',
    criterion: (_s, unlocked) => countTier(unlocked, 'common') >= 1,
  },
  {
    id: 'mist',
    label: 'Mist',
    color: '#a8b4bc',
    description: 'Unlocked at 3 bronze-tier achievements.',
    criterion: (_s, unlocked) => countTier(unlocked, 'common') >= 3,
  },
  {
    id: 'honey',
    label: 'Honey',
    color: '#e6c078',
    description: 'Unlocked at 5 bronze-tier achievements.',
    criterion: (_s, unlocked) => countTier(unlocked, 'common') >= 5,
  },
  {
    id: 'rust',
    label: 'Rust',
    color: '#b56a3e',
    description: 'Unlocked at 10 bronze-tier achievements.',
    criterion: (_s, unlocked) => countTier(unlocked, 'common') >= 10,
  },

  // --------------------------------------------------------------
  // Row 2 — Veteran's cache (metals + jewels; rare/epic gated)
  // --------------------------------------------------------------
  {
    id: 'iron',
    label: 'Iron',
    color: '#6d7a82',
    description: 'Unlocked at 1 silver-tier achievement.',
    criterion: (_s, unlocked) => countTier(unlocked, 'rare') >= 1,
  },
  {
    id: 'copper',
    label: 'Copper',
    color: '#b47659',
    description: 'Unlocked at 2 silver-tier achievements.',
    criterion: (_s, unlocked) => countTier(unlocked, 'rare') >= 2,
  },
  {
    id: 'jade',
    label: 'Jade',
    color: '#5ea07a',
    description: 'Unlocked at 3 silver-tier achievements.',
    criterion: (_s, unlocked) => countTier(unlocked, 'rare') >= 3,
  },
  {
    id: 'slate',
    label: 'Slate',
    color: '#7a96a8',
    description: 'Unlocked at 5 silver-tier achievements.',
    criterion: (_s, unlocked) => countTier(unlocked, 'rare') >= 5,
  },
  {
    id: 'wine',
    label: 'Wine',
    color: '#8a3b3b',
    description: 'Unlocked at 1 gold-tier achievement.',
    criterion: (_s, unlocked) => countTier(unlocked, 'epic') >= 1,
  },
  {
    id: 'ocean',
    label: 'Ocean',
    color: '#2e5a6e',
    description: 'Unlocked at 2 gold-tier achievements.',
    criterion: (_s, unlocked) => countTier(unlocked, 'epic') >= 2,
  },
  {
    id: 'plum',
    label: 'Plum',
    color: '#6a3b5e',
    description: 'Unlocked at 3 gold-tier achievements.',
    criterion: (_s, unlocked) => countTier(unlocked, 'epic') >= 3,
  },
  {
    id: 'silver',
    label: 'Silver',
    color: '#c0c0c4',
    description: 'Unlocked at 5 gold-tier achievements.',
    criterion: (_s, unlocked) => countTier(unlocked, 'epic') >= 5,
  },

  // --------------------------------------------------------------
  // Row 3 — Legendary regalia (the rarest; legendary-tier conditions)
  // The 6 named hardest colors: Pink, Purple, Sky, Gold, Ruby, Teal.
  // Pearl and Obsidian round out the row as completionist rewards.
  // --------------------------------------------------------------
  {
    id: 'pink',
    label: 'Pink',
    color: '#e8a5c2',
    description:
      'Unlocked at 1 legendary achievement AND all 5 prompt categories touched. Breadth of craft.',
    criterion: (s, unlocked) =>
      countTier(unlocked, 'legendary') >= 1 &&
      Number((s && s.promptCategoriesTouched) || 0) >= 5,
  },
  {
    id: 'purple',
    label: 'Purple',
    color: '#8a4ec8',
    description:
      'Unlocked at 1 legendary achievement AND a 30-day writing streak. Persistence of spirit.',
    criterion: (s, unlocked) =>
      countTier(unlocked, 'legendary') >= 1 &&
      Number((s && s.streaks && s.streaks.longest) || 0) >= 30,
  },
  {
    id: 'sky',
    label: 'Sky',
    color: '#7ac8e8',
    description:
      'Unlocked at 1 legendary achievement AND 5 distinct events completed. Celebrant of seasons.',
    criterion: (s, unlocked) =>
      countTier(unlocked, 'legendary') >= 1 &&
      Number((s && s.eventsResponded) || 0) >= 5,
  },
  {
    id: 'gold',
    label: 'Gold',
    color: '#ffc832',
    description: 'Unlocked at 2 legendary achievements.',
    criterion: (_s, unlocked) => countTier(unlocked, 'legendary') >= 2,
  },
  {
    id: 'ruby',
    label: 'Ruby',
    color: '#dc2c2c',
    description: 'Unlocked at 3 legendary achievements.',
    criterion: (_s, unlocked) => countTier(unlocked, 'legendary') >= 3,
  },
  {
    id: 'teal',
    label: 'Teal',
    color: '#2cc0b0',
    description: 'Unlocked at 5 legendary achievements.',
    criterion: (_s, unlocked) => countTier(unlocked, 'legendary') >= 5,
  },
  {
    id: 'pearl',
    label: 'Pearl',
    color: '#f4f0e8',
    description:
      'Unlocked at 10 gold-tier achievements AND 15 distinct events completed. Seasoned celebrant.',
    criterion: (s, unlocked) =>
      countTier(unlocked, 'epic') >= 10 &&
      Number((s && s.eventsResponded) || 0) >= 15,
  },
  {
    id: 'obsidian',
    label: 'Obsidian',
    color: '#2a2a30',
    description:
      'The hardest unlock in the game: 5 legendaries, all 5 prompt categories, a 30-day streak, AND 15 distinct events completed. Grandmaster of every pillar.',
    criterion: (s, unlocked) =>
      countTier(unlocked, 'legendary') >= 5 &&
      Number((s && s.promptCategoriesTouched) || 0) >= 5 &&
      Number((s && s.streaks && s.streaks.longest) || 0) >= 30 &&
      Number((s && s.eventsResponded) || 0) >= 15,
  },
]);

/**
 * Titles unlocked for a user: every unlocked achievement's name can be
 * worn as a title, plus the always-available default.
 *
 * Returns [{ id, name, tier, isUnlocked }, ...] with isUnlocked always
 * true here (callers already filtered), but kept in the shape for
 * future "preview locked titles" UI if we add one.
 *
 * @param {string[]} unlockedIds
 * @returns {Array<{id: string, name: string, tier: string, isUnlocked: boolean}>}
 */
export function getAvailableTitles(unlockedIds) {
  const unlocked = new Set(unlockedIds || []);
  const titles = [];
  for (const a of ACHIEVEMENTS) {
    if (unlocked.has(a.id)) {
      titles.push({ id: a.id, name: a.name, tier: a.tier, isUnlocked: true });
    }
  }
  // Sort by rarity desc so rarest titles show first in any picker.
  titles.sort((x, y) => tierRank(y.tier) - tierRank(x.tier));
  return titles;
}

// hexToRgb is the shared utility used by all resolve*Vars paths.
// Kept as a standalone export for tests and share_code.js.

/**
 * Convert a '#rrggbb' hex color to a comma-separated 'r, g, b' string.
 * Tolerates shorthand '#rgb' and malformed input (falls back to
 * amber's RGB so a bad value doesn't blank every rgba-styled chip).
 *
 * @param {string} hex
 * @returns {string} 'r, g, b' (numbers 0-255, comma-separated)
 */
export function hexToRgb(hex) {
  const AMBER_FALLBACK = '216, 179, 106';
  if (typeof hex !== 'string') return AMBER_FALLBACK;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return AMBER_FALLBACK;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

/**
 * Resolve the ACTIVE title. Priority:
 *   1. user's picked flair.title if it's still unlocked
 *   2. settings.profile.titleOverride (custom free text)
 *   3. rarest unlocked achievement name
 *   4. 'Newcomer' default
 *
 * @param {object} settings
 * @param {string[]} unlockedIds
 * @returns {string}
 */
export function resolveActiveTitle(settings, unlockedIds) {
  const pickedId =
    (settings && settings.profile && settings.profile.flair &&
     settings.profile.flair.title) || null;

  if (pickedId) {
    const unlocked = new Set(unlockedIds || []);
    if (unlocked.has(pickedId)) {
      const ach = ACHIEVEMENTS.find(a => a.id === pickedId);
      if (ach) return ach.name;
    }
    // Picked id no longer matches an unlocked achievement. Fall
    // through rather than showing a stale string.
  }

  const override =
    (settings && settings.profile && settings.profile.titleOverride) || '';
  if (override && override.trim()) return override.trim();

  // Fallback: rarest unlocked. Inlined to avoid circular imports with
  // share_chips.js → full_page.js → flair.js.
  const unlocked = new Set(unlockedIds || []);
  const candidates = ACHIEVEMENTS.filter(a => unlocked.has(a.id));
  candidates.sort((x, y) => tierRank(y.tier) - tierRank(x.tier));
  return candidates[0] ? candidates[0].name : 'Newcomer';
}

// ---- helpers ----

function countTier(unlockedIds, tier) {
  const unlocked = new Set(unlockedIds || []);
  let n = 0;
  for (const a of ACHIEVEMENTS) {
    if (a.tier === tier && unlocked.has(a.id)) n++;
  }
  return n;
}

// ================================================================
// Vellum palette — primary text color
// ================================================================
//
// Readability-critical, so options are constrained to warm/cool
// neutrals that pass WCAG AA on dark backgrounds.
// Culled: bone (≈ parchment), chalk (≈ cream ≈ ACCENT/pearl),
// moonstone (≈ frost ≈ SILVER/quicksilver).

export const VELLUMS = Object.freeze([
  {
    id: 'parchment',
    label: 'Parchment',
    color: '#e8dcc4',
    description: 'The classic warm parchment. Always available.',
    criterion: () => true,
  },
  {
    id: 'frost',
    label: 'Frost',
    color: '#d4dce4',
    description: 'Cool blue-white. Unlocked at 5 achievements.',
    criterion: (s) => (s._unlockedCount || 0) >= 5,
  },
  {
    id: 'linen',
    label: 'Linen',
    color: '#e0d8cc',
    description: 'Warm neutral. Unlocked at 8 achievements.',
    criterion: (s) => (s._unlockedCount || 0) >= 8,
  },
  {
    id: 'cream',
    label: 'Cream',
    color: '#f0e8d8',
    description: 'Bright warm. Unlocked at 1 epic achievement.',
    criterion: (_s, unlocked) => countTier(unlocked, 'epic') >= 1,
  },
  {
    id: 'starlight',
    label: 'Starlight',
    color: '#f4f0ec',
    description: 'Near-white. Unlocked at 1 legendary achievement.',
    criterion: (_s, unlocked) => countTier(unlocked, 'legendary') >= 1,
  },
]);

// ================================================================
// Silver palette — secondary / meta text color
// ================================================================
//
// Controls timestamps, labels, hint text, and stat annotations.
// Culled: dusk (≈ ACCENT/ash, dist 1.9), quicksilver (≈ ACCENT/mist).

export const SILVERS = Object.freeze([
  {
    id: 'pewter',
    label: 'Pewter',
    color: '#8b95a3',
    description: 'The default cool grey. Always available.',
    criterion: () => true,
  },
  {
    id: 'smoke',
    label: 'Smoke',
    color: '#9a9a9a',
    description: 'Neutral mid-grey. Always available.',
    criterion: () => true,
  },
  {
    id: 'steel',
    label: 'Steel',
    color: '#7a8a98',
    description: 'Blue-tinted grey. Unlocked at 10 achievements.',
    criterion: (s) => (s._unlockedCount || 0) >= 10,
  },
  {
    id: 'lavender',
    label: 'Lavender',
    color: '#9a8aaa',
    description: 'Soft purple-grey. Unlocked at 20 achievements.',
    criterion: (s) => (s._unlockedCount || 0) >= 20,
  },
  {
    id: 'patina',
    label: 'Patina',
    color: '#7a9a8a',
    description: 'Green-tinted grey. Unlocked at 1 rare achievement.',
    criterion: (_s, unlocked) => countTier(unlocked, 'rare') >= 1,
  },
  {
    id: 'dawn',
    label: 'Dawn',
    color: '#b0a898',
    description: 'Warm light grey. Unlocked at 2 epic achievements.',
    criterion: (_s, unlocked) => countTier(unlocked, 'epic') >= 2,
  },
]);

// ================================================================
// Generic palette helpers — one implementation for all channels
// ================================================================
//
// Accent, vellum, and silver follow the exact same resolve → vars →
// paint pipeline. The generic helpers eliminate the per-channel
// copy-paste; named exports below are thin wrappers for callers
// that import by name.

/**
 * Annotate a palette with isUnlocked for the current user.
 * @param {Array} palette  ACCENTS | VELLUMS | SILVERS
 */
function getPicks(palette, stats, unlockedIds) {
  const ids = unlockedIds || [];
  return palette.map(a => ({
    id: a.id,
    label: a.label,
    color: a.color,
    description: a.description,
    isUnlocked: Boolean(a.criterion(stats || {}, ids)),
  }));
}

/**
 * Resolve the active pick for a channel. User's stored flair wins
 * if valid + unlocked; otherwise falls back to palette[0].
 *
 * @param {string} channel   'accent' | 'vellum' | 'silver'
 * @param {Array}  palette   ACCENTS | VELLUMS | SILVERS
 */
function resolveActive(channel, palette, settings, stats, unlockedIds) {
  const picked =
    (settings && settings.profile && settings.profile.flair &&
     settings.profile.flair[channel]) || null;
  if (picked) {
    const entry = palette.find(a => a.id === picked);
    if (entry && entry.criterion(stats || {}, unlockedIds || [])) {
      return { id: entry.id, color: entry.color };
    }
  }
  const def = palette[0];
  return { id: def.id, color: def.color };
}

/** resolveActive + derive rgb triple. */
function resolveVars(channel, palette, settings, stats, unlockedIds) {
  const base = resolveActive(channel, palette, settings, stats, unlockedIds);
  return { ...base, rgb: hexToRgb(base.color) };
}

/**
 * Set --pf-<cssVar> and --pf-<cssVar>-rgb on :root.
 * @param {string} cssVar  CSS custom property stem (e.g. 'vellum')
 */
function paintRoot(cssVar, vars) {
  if (typeof document === 'undefined' || !document.documentElement) return;
  if (!vars || typeof vars.color !== 'string') return;
  try {
    const root = document.documentElement;
    root.style.setProperty(`--pf-${cssVar}`, vars.color);
    root.style.setProperty(`--pf-${cssVar}-rgb`, vars.rgb || hexToRgb(vars.color));
  } catch { /* non-fatal */ }
}

// ---- Named exports (thin wrappers) ----

export const getAccents = (s, u) => getPicks(ACCENTS, s, u);
export const getVellums = (s, u) => getPicks(VELLUMS, s, u);
export const getSilvers = (s, u) => getPicks(SILVERS, s, u);

export const resolveActiveAccent  = (se, st, u) => resolveActive('accent',  ACCENTS, se, st, u);
export const resolveActiveVellum  = (se, st, u) => resolveActive('vellum',  VELLUMS, se, st, u);
export const resolveActiveSilver  = (se, st, u) => resolveActive('silver',  SILVERS, se, st, u);

export const resolveAccentVars = (se, st, u) => resolveVars('accent',  ACCENTS, se, st, u);
export const resolveVellumVars = (se, st, u) => resolveVars('vellum',  VELLUMS, se, st, u);
export const resolveSilverVars = (se, st, u) => resolveVars('silver',  SILVERS, se, st, u);

export function paintAppVellum(v) { paintRoot('vellum', v); }
export function paintAppSilver(v) { paintRoot('silver', v); }

/**
 * paintAppAccent is special: besides setting --pf-accent and
 * --pf-accent-rgb, it also derives --pf-accent-hi, --pf-accent-deep,
 * and --pf-accent-shadow from the chosen color, then cascades into
 * upstream Perchance's chrome vars (notification, links, thread
 * highlight).
 */
export function paintAppAccent(accent) {
  paintRoot('accent', accent);
  if (typeof document === 'undefined' || !document.documentElement) return;
  if (!accent || typeof accent.color !== 'string') return;
  const root = document.documentElement;
  try {
    // Derive companion tones from the picked accent
    const hi     = shiftHex(accent.color,  35);
    const deep   = shiftHex(accent.color, -50);
    const shadow = shiftHex(accent.color, -70);
    root.style.setProperty('--pf-accent-hi',     hi);
    root.style.setProperty('--pf-accent-hi-rgb',  hexToRgb(hi));
    root.style.setProperty('--pf-accent-deep',   deep);
    root.style.setProperty('--pf-accent-deep-rgb', hexToRgb(deep));
    root.style.setProperty('--pf-accent-shadow', shadow);

    // Cascade into upstream Perchance chrome
    root.style.setProperty('--notification-bg-color', accent.color);
    root.style.setProperty('--link-color', accent.color);
    root.style.setProperty('--selected-thread-border-color', accent.color);
    root.style.setProperty(
      '--selected-thread-bg',
      `rgba(${accent.rgb || hexToRgb(accent.color)}, 0.18)`,
    );
  } catch { /* non-fatal */ }
}

/**
 * Shift a hex color lighter (positive) or darker (negative) by a
 * fixed amount per channel. Clamped to [0, 255].
 */
function shiftHex(hex, amount) {
  if (typeof hex !== 'string') return hex;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex;
  const r = Math.max(0, Math.min(255, parseInt(h.slice(0,2),16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(h.slice(2,4),16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(h.slice(4,6),16) + amount));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

/**
 * Convenience: paint all three channels in one call.
 * Used by full_page.js to consolidate apply logic.
 *
 * @param {object} settings
 * @param {object} stats
 * @param {string[]} unlockedIds
 * @param {HTMLElement} [overlay]  optional overlay element for scoped vars
 */
export function paintAllChannels(settings, stats, unlockedIds, overlay) {
  const channels = [
    { channel: 'accent',  palette: ACCENTS, cssVar: 'accent',  paint: paintAppAccent },
    { channel: 'vellum',  palette: VELLUMS, cssVar: 'vellum',  paint: paintAppVellum },
    { channel: 'silver',  palette: SILVERS, cssVar: 'silver',  paint: paintAppSilver },
  ];
  for (const { channel, palette, cssVar, paint } of channels) {
    const vars = resolveVars(channel, palette, settings, stats, unlockedIds);
    paint(vars);
    if (overlay && overlay.style) {
      try {
        overlay.style.setProperty(`--pf-${cssVar}`, vars.color);
        overlay.style.setProperty(`--pf-${cssVar}-rgb`, vars.rgb);
      } catch { /* non-fatal */ }
    }
  }
}

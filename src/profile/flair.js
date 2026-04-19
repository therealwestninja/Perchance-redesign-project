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

/**
 * Accents available to a user, annotated with whether each is
 * unlocked. The full list is always returned so a picker can show
 * locked accents greyed out with their unlock hint.
 *
 * @param {object} stats      - full stats bundle
 * @param {string[]} unlockedIds
 * @returns {Array<{id, label, color, description, isUnlocked}>}
 */
export function getAccents(stats, unlockedIds) {
  const ids = unlockedIds || [];
  return ACCENTS.map(a => ({
    id: a.id,
    label: a.label,
    color: a.color,
    description: a.description,
    isUnlocked: Boolean(a.criterion(stats || {}, ids)),
  }));
}

/**
 * Resolve the ACTIVE accent. User's pick wins if valid+unlocked;
 * otherwise falls back to 'amber' (always unlocked).
 *
 * @param {object} settings
 * @param {object} stats
 * @param {string[]} unlockedIds
 * @returns {{ id: string, color: string }}
 */
export function resolveActiveAccent(settings, stats, unlockedIds) {
  const picked =
    (settings && settings.profile && settings.profile.flair &&
     settings.profile.flair.accent) || null;

  if (picked) {
    const accent = ACCENTS.find(a => a.id === picked);
    if (accent && accent.criterion(stats || {}, unlockedIds || [])) {
      return { id: accent.id, color: accent.color };
    }
    // Picked accent but no longer eligible (e.g., backup restored to
    // a state where the unlock hadn't happened yet). Silent fallback
    // to the default rather than showing a broken style.
  }
  // Default
  return { id: 'amber', color: '#d8b36a' };
}

/**
 * Convert a '#rrggbb' hex color to a comma-separated 'r, g, b' string.
 * Used to derive --pf-accent-rgb from the chosen accent's hex, so
 * CSS rules can shade via rgba(var(--pf-accent-rgb), <alpha>).
 *
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
 * Resolve the active accent AND its rgba-ready rgb triple in one call.
 * Used by applyAccent() in full_page.js to set both CSS custom
 * properties (--pf-accent and --pf-accent-rgb) so shaded rules
 * (rgba(var(--pf-accent-rgb), 0.X)) pick up the user's pick.
 *
 * @param {object} settings
 * @param {object} stats
 * @param {string[]} unlockedIds
 * @returns {{ id: string, color: string, rgb: string }}
 */
export function resolveAccentVars(settings, stats, unlockedIds) {
  const base = resolveActiveAccent(settings, stats, unlockedIds);
  return { ...base, rgb: hexToRgb(base.color) };
}

/**
 * Cascade the user's accent beyond our own overlay into upstream
 * Perchance's chrome. Upstream defines its theme via CSS custom
 * properties on :root — we shadow the handful that carry brand /
 * highlight meaning so the whole app re-tints with the picker.
 *
 * Scouted-and-chosen upstream targets:
 *   --notification-bg-color          top banner background (accent)
 *   --link-color                     all <a> links throughout
 *   --selected-thread-border-color   active thread highlight ring
 *   --selected-thread-bg             active thread soft tint (~18%)
 *
 * Scope: only these four. Structural/neutral upstream vars
 * (--background, --text-color, --button-bg, --box-color, etc.) are
 * left alone so our accent-tint doesn't overpaint layout chrome the
 * user expects to stay neutral. Light/dark mode continues to work
 * because upstream resolves those vars per-color-scheme; we only
 * shadow the accent-y subset.
 *
 * Called at boot (profile/index.js start) so the theme applies even
 * before the user opens the profile, and from applyAccent() on any
 * subsequent pick.
 *
 * No-op if document or documentElement isn't available (server-side
 * safety or early-boot edge).
 *
 * @param {{ color: string, rgb: string }} accent  from resolveAccentVars
 */
export function paintAppAccent(accent) {
  if (typeof document === 'undefined' || !document.documentElement) return;
  if (!accent || typeof accent.color !== 'string') return;
  const root = document.documentElement;
  try {
    root.style.setProperty('--notification-bg-color', accent.color);
    root.style.setProperty('--link-color', accent.color);
    root.style.setProperty('--selected-thread-border-color', accent.color);
    // The selected-thread BACKGROUND wants a soft tint rather than
    // a solid fill — 18% alpha reads as "this one's picked" without
    // overpowering the thread text.
    root.style.setProperty(
      '--selected-thread-bg',
      `rgba(${accent.rgb || hexToRgb(accent.color)}, 0.18)`,
    );
  } catch { /* non-fatal — upstream theming is a nicety, not a promise */ }
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

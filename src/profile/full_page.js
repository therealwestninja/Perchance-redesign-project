// profile/full_page.js
//
// Orchestrates the full-screen hero profile page. Called from the mini-card's
// onOpen handler. Reads fresh stats + current settings, builds the overlay,
// wires auto-save through each section.

import { createOverlay } from '../render/overlay.js';
import { createSection } from '../render/section.js';
import { createSplash } from '../render/splash.js';
import { createAboutBody } from '../render/about_section.js';
import { createDetailsBody } from '../render/details_form.js';
import { createChronicleGrid } from '../render/chronicle_grid.js';
import { createAchievementsGrid } from '../render/achievements_grid.js';

import { readAllStores } from '../stats/db.js';
import { computeStats } from '../stats/queries.js';
import { xpFromStats, levelFromXP } from '../achievements/tiers.js';
import { ACHIEVEMENTS, getAchievementById } from '../achievements/registry.js';
import { computeUnlockedIds } from '../achievements/unlocks.js';
import { TIER_ICON } from '../render/achievements_grid.js';
import { loadSettings } from './settings_store.js';

const TIER_ORDER = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

/**
 * Given unlocked achievement IDs, pick up to N to show as pinned badges
 * on the splash. Highest tier first; within a tier, registry order.
 */
function pickPinnedBadges(unlockedIds, n = 6) {
  const unlocked = unlockedIds
    .map(id => getAchievementById(id))
    .filter(Boolean)
    .sort((a, b) => (TIER_ORDER[b.tier] || 0) - (TIER_ORDER[a.tier] || 0));
  return unlocked.slice(0, n).map(a => ({
    id: a.id,
    name: a.name,
    icon: TIER_ICON[a.tier] || '◆',
  }));
}

/**
 * Derive a title string: override > rarest unlocked achievement's name > default.
 */
function deriveTitle(unlockedIds, settings) {
  const override = settings && settings.profile && settings.profile.titleOverride;
  if (override && override.trim()) return override.trim();

  const unlocked = unlockedIds
    .map(id => getAchievementById(id))
    .filter(Boolean)
    .sort((a, b) => (TIER_ORDER[b.tier] || 0) - (TIER_ORDER[a.tier] || 0));

  return unlocked[0] ? unlocked[0].name : 'Newcomer';
}

/**
 * Build and open the full-screen profile page.
 */
export async function openFullPage() {
  // Fresh data + settings on every open
  let stats, unlockedIds, settings;
  try {
    const data = await readAllStores();
    stats = computeStats(data);
  } catch {
    stats = computeStats({});
  }
  try {
    settings = loadSettings();
  } catch {
    settings = null;
  }
  try {
    unlockedIds = computeUnlockedIds(stats);
  } catch {
    unlockedIds = [];
  }

  const profile = (settings && settings.profile) || {};
  const displayState = (settings && settings.display && settings.display.sections) || {};

  // ---- splash ----
  const xp = xpFromStats(stats);
  const lvl = levelFromXP(xp);

  const splash = createSplash();
  splash.update({
    displayName: profile.displayName || profile.username || 'Chronicler',
    avatarUrl: profile.avatarUrl || null,
    title: deriveTitle(unlockedIds, settings),
    level: lvl.level,
    xpIntoLevel: lvl.xpIntoLevel,
    xpForNextLevel: lvl.xpForNextLevel,
    progress01: lvl.progress01,
    pinnedBadges: pickPinnedBadges(unlockedIds, 6),
  });

  // ---- sections ----
  const aboutSection = createSection({
    id: 'about',
    title: 'About',
    children: createAboutBody({ initialValue: profile.bio }),
    initialState: displayState.about,
  });

  const detailsSection = createSection({
    id: 'details',
    title: 'Details',
    children: createDetailsBody({ profile }),
    initialState: displayState.details,
  });

  const chronicleSection = createSection({
    id: 'chronicle',
    title: 'Chronicle',
    children: createChronicleGrid({ stats }),
    initialState: displayState.chronicle,
  });

  const achievementsSection = createSection({
    id: 'achievements',
    title: 'Achievements',
    children: createAchievementsGrid({ unlockedIds }),
    initialState: displayState.achievements,
  });

  // ---- overlay ----
  const overlay = createOverlay({
    ariaLabel: 'Your profile',
    children: [
      splash,
      aboutSection,
      detailsSection,
      chronicleSection,
      achievementsSection,
    ],
  });

  overlay.show();
}

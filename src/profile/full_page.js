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
import { createPromptsBody } from '../render/prompts_section.js';

import { readAllStores } from '../stats/db.js';
import { computeStats } from '../stats/queries.js';
import { computePromptStats } from '../stats/prompt_stats.js';
import { xpFromStats, levelFromXP } from '../achievements/tiers.js';
import { ACHIEVEMENTS, getAchievementById } from '../achievements/registry.js';
import { computeUnlockedIds } from '../achievements/unlocks.js';
import { TIER_ICON } from '../render/achievements_grid.js';
import { loadSettings, onSettingsChange } from './settings_store.js';
import { markAchievementsSeen } from './notifications.js';
import { getCurrentWeekKey, getWeekPrompts } from '../prompts/scheduler.js';
import { getCompletedIds, markWeekSeen } from '../prompts/completion.js';

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
    settings = loadSettings();
  } catch {
    settings = null;
  }
  try {
    const data = await readAllStores();
    // Merge IDB-derived stats with settings-derived prompt stats so
    // achievement criteria can read both from one bundle.
    stats = { ...computeStats(data), ...computePromptStats(settings) };
  } catch {
    stats = { ...computeStats({}), ...computePromptStats(settings) };
  }
  try {
    unlockedIds = computeUnlockedIds(stats);
  } catch {
    unlockedIds = [];
  }

  // Opening the profile counts as acknowledgment of any pending notifications.
  // This fires the settings-changed event, which causes the mini-card to
  // re-render without its pulse state. We don't require the user to scroll
  // to the relevant section — opening is the acknowledgment.
  try { markAchievementsSeen(unlockedIds); } catch { /* non-fatal */ }
  try { markWeekSeen(); } catch { /* non-fatal */ }

  // Current week's prompts + completion state (read after markWeekSeen so
  // the section renders with fresh data).
  const weekKey = getCurrentWeekKey();
  const weekPrompts = getWeekPrompts(weekKey);
  const completedIds = getCompletedIds(weekKey);

  const profile = (settings && settings.profile) || {};
  const displayState = (settings && settings.display && settings.display.sections) || {};

  // ---- splash ----
  const xp = xpFromStats(stats);
  const lvl = levelFromXP(xp);

  const splash = createSplash();

  function refreshSplashFromSettings() {
    let freshSettings = settings;
    try { freshSettings = loadSettings(); } catch { /* keep stale */ }
    const p = (freshSettings && freshSettings.profile) || {};

    // Re-compute unlocks with current prompt stats — completing a prompt
    // mid-overlay-session should update pinned badges and title if it
    // crossed an achievement threshold.
    let freshUnlocked = unlockedIds;
    try {
      const freshStats = { ...stats, ...computePromptStats(freshSettings) };
      freshUnlocked = computeUnlockedIds(freshStats);
    } catch { /* fall back to initial unlock list */ }

    splash.update({
      displayName: p.displayName || p.username || 'Chronicler',
      avatarUrl: p.avatarUrl || null,
      title: deriveTitle(freshUnlocked, freshSettings),
      level: lvl.level,
      xpIntoLevel: lvl.xpIntoLevel,
      xpForNextLevel: lvl.xpForNextLevel,
      progress01: lvl.progress01,
      pinnedBadges: pickPinnedBadges(freshUnlocked, 6),
    });
  }
  refreshSplashFromSettings();

  // Live-refresh the splash when the user changes avatar / title / display
  // name inside the Details form. Cleaned up when the overlay closes.
  const unsubscribe = onSettingsChange(refreshSplashFromSettings);

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

  const promptsSection = createSection({
    id: 'prompts',
    title: 'Prompts',
    children: createPromptsBody({
      weekKey,
      prompts: weekPrompts,
      completedIds,
    }),
    initialState: displayState.prompts,
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
    onClose: () => { try { unsubscribe(); } catch {} },
    children: [
      splash,
      aboutSection,
      detailsSection,
      promptsSection,
      chronicleSection,
      achievementsSection,
    ],
  });

  overlay.show();
}

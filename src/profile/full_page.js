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
import { createPromptArchive } from '../render/prompt_archive.js';
import { createWritingRadar } from '../render/writing_radar.js';
import { createActivityBody } from '../render/activity_body.js';
import { bumpCounter, getCounters } from '../stats/counters.js';
import { createBackupBody } from '../render/backup_section.js';
import { createShareChips } from '../render/share_chips.js';
import { createActivitySparkline } from '../render/activity_sparkline.js';
import { h } from '../utils/dom.js';

import { readAllStores } from '../stats/db.js';
import { computeStats } from '../stats/queries.js';
import { computePromptStats } from '../stats/prompt_stats.js';
import { xpFromStats, levelFromXP } from '../achievements/tiers.js';
import { ACHIEVEMENTS, getAchievementById } from '../achievements/registry.js';
import { computeUnlockedIds } from '../achievements/unlocks.js';
import { TIER_ICON } from '../render/achievements_grid.js';
import { loadSettings, onSettingsChange } from './settings_store.js';
import { getCurrentWeekKey, getCurrentDayKey, getWeekPrompts, getDayPrompt } from '../prompts/scheduler.js';
import { getCompletedIds, markWeekSeen, markDaySeen } from '../prompts/completion.js';
import { getActiveEvents, getActiveEventIds } from '../events/active.js';
import { markAchievementsSeen, markEventsSeen } from './notifications.js';
import { findRarestUnlocked, tierRank } from '../render/share_chips.js';

/**
 * Given unlocked achievement IDs, pick up to N to show as pinned badges
 * on the splash. Highest tier first; within a tier, registry order.
 */
function pickPinnedBadges(unlockedIds, n = 6) {
  const unlocked = unlockedIds
    .map(id => getAchievementById(id))
    .filter(Boolean)
    .sort((a, b) => tierRank(b.tier) - tierRank(a.tier));
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
  const rarest = findRarestUnlocked(unlockedIds, ACHIEVEMENTS);
  return rarest ? rarest.name : 'Newcomer';
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
  // Inject counter data into stats so counter-backed achievement
  // criteria (bubble renames, memory saves, etc.) can see it. The
  // counters module is the single source of truth for per-feature
  // usage counts; stats (from Dexie) is the source for "what exists"
  // data. Together they're the full picture for unlock criteria.
  try { stats.counters = getCounters(); } catch { stats.counters = {}; }
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
  // Acknowledge BOTH week and day — the user is seeing the current state,
  // and if they toggle cadence later we don't want stale pulse-pending on
  // the mode they weren't using.
  try { markWeekSeen(); } catch { /* non-fatal */ }
  try { markDaySeen(); } catch { /* non-fatal */ }
  const activeEvents = getActiveEvents();
  try { markEventsSeen(activeEvents.map(ev => ev.id)); } catch { /* non-fatal */ }

  // Current prompts + completion state. Cadence determines how many
  // prompts show and what key drives selection. Either way, completions
  // bucket into the containing week (stored under completedByWeek) so
  // cadence switching leaves history intact.
  const weekKey = getCurrentWeekKey();
  const cadence = (settings && settings.prompts && settings.prompts.cadence) || 'weekly';
  let livePrompts;
  let dayKey = null;
  if (cadence === 'daily') {
    dayKey = getCurrentDayKey();
    const dayPrompt = getDayPrompt(dayKey);
    livePrompts = dayPrompt ? [dayPrompt] : [];
  } else {
    livePrompts = getWeekPrompts(weekKey);
  }
  const completedIds = getCompletedIds(weekKey);

  const profile = (settings && settings.profile) || {};
  const displayState = (settings && settings.display && settings.display.sections) || {};

  // ---- splash ----
  const xp = xpFromStats(stats);
  const lvl = levelFromXP(xp);

  const splash = createSplash({
    onShareClick: () => {
      if (overlay && typeof overlay.setFocused === 'function') {
        overlay.setFocused(true);
        bumpCounter('focusModeToggles');
      }
    },
  });

  function refreshSplashFromSettings() {
    let freshSettings = settings;
    try { freshSettings = loadSettings(); } catch { /* keep stale */ }
    const p = (freshSettings && freshSettings.profile) || {};

    // Re-compute unlocks with current prompt stats — completing a prompt
    // mid-overlay-session should update pinned badges and title if it
    // crossed an achievement threshold.
    let freshUnlocked = unlockedIds;
    try {
      const freshCounters = (() => { try { return getCounters(); } catch { return {}; } })();
      const freshStats = { ...stats, ...computePromptStats(freshSettings), counters: freshCounters };
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

  // Focus mode extras — rendered in the overlay flow but hidden by CSS
  // until focus mode is entered. Splash on its own is generic; this card
  // carries the user's "writing fingerprint" (radar) plus four corner
  // stat chips so the screenshot has texture to read.
  const shareChips = createShareChips({
    level: lvl.level,
    unlockedIds,
    achievements: ACHIEVEMENTS,
    promptsCompleted: stats.promptsCompletedTotal || 0,
  });
  const focusExtras = h('div', { class: 'pf-focus-extras' }, [
    shareChips.topRow,
    createWritingRadar({ stats }),
    shareChips.bottomRow,
    createActivitySparkline({
      currentWeekCompletedCount: completedIds.size,
    }),
  ]);

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
      prompts: livePrompts,
      completedIds,
      activeEvents,
      cadence,
    }),
    initialState: displayState.prompts,
  });

  const archiveSection = createSection({
    id: 'archive',
    title: 'Prompt Archive',
    children: createPromptArchive(),
    initialState: displayState.archive,
    onToggled: ({ collapsed }) => {
      // Bump only on EXPAND (user is opening the archive), not on
      // collapse. Counter reflects "views" of the archive.
      if (!collapsed) bumpCounter('promptArchiveOpens');
    },
  });

  const chronicleSection = createSection({
    id: 'chronicle',
    title: 'Chronicle',
    children: createChronicleGrid({ stats }),
    initialState: displayState.chronicle,
  });

  const styleSection = createSection({
    id: 'style',
    title: 'Writing Style',
    children: createWritingRadar({ stats }),
    initialState: displayState.style,
  });

  const achievementsSection = createSection({
    id: 'achievements',
    title: 'Achievements',
    children: createAchievementsGrid({ unlockedIds }),
    initialState: displayState.achievements,
  });

  // ---- activity counters ----
  // Shows per-feature usage counts tracked by stats/counters.js.
  // Surfaces data that users have been accumulating silently; also
  // establishes visibility for the future tiered-achievement system
  // that will unlock based on these same counters.
  const counters = getCounters();
  const activitySection = createSection({
    id: 'activity',
    title: 'Activity',
    children: createActivityBody({ counters }),
    initialState: displayState.activity || { collapsed: false, blurred: false },
  });

  const backupSection = createSection({
    id: 'backup',
    title: 'Backup',
    children: createBackupBody(),
    initialState: displayState.backup,
  });

  // ---- overlay ----
  const overlay = createOverlay({
    ariaLabel: 'Your profile',
    onClose: () => { try { unsubscribe(); } catch {} },
    children: [
      splash,
      focusExtras,
      aboutSection,
      detailsSection,
      promptsSection,
      archiveSection,
      chronicleSection,
      styleSection,
      achievementsSection,
      activitySection,
      backupSection,
    ],
  });

  overlay.show();
}

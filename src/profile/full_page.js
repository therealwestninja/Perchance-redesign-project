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
import { bumpCounter, getCounters, getCountersByThread, pruneCountersByThread } from '../stats/counters.js';
import { recordActivityForStreak, getStreaks, streakStatus } from '../stats/streaks.js';
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
import { markAchievementsSeen, markEventsSeen, recordUnlockDates, getUnlockDates } from './notifications.js';
import { findRarestUnlocked, tierRank } from '../render/share_chips.js';
import { resolveActiveTitle, resolveActiveAccent, resolveAccentVars, paintAppAccent } from './flair.js';
import { checkAndUpdateBests } from './personal_bests.js';
import { getPrimaryArchetype } from './archetypes.js';
import { checkSummary } from './summary_notifications.js';
// showToast import removed — profile-open no longer surfaces personal-
// best or weekly-summary toasts. The mini-card pulse + in-splash
// reveal handle that signal now. toast.js stays in-tree for future
// callers (save failures, destructive-op undo, etc.).

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
 * Derive a title string. Delegates to the flair module, which
 * honors the user's flair.title pick before falling back to
 * titleOverride and then auto-rarest.
 */
function deriveTitle(unlockedIds, settings) {
  return resolveActiveTitle(settings, unlockedIds);
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

  // Record today as an activity day for streak tracking. Done FIRST so
  // even if stats loading fails, the user's streak is still credited.
  // Idempotent within a day — repeated opens don't inflate.
  try { recordActivityForStreak(); } catch { /* non-fatal */ }

  // Declare `overlay` as `let` initialized to null up-front so
  // refreshSplashFromSettings() — which is called synchronously
  // during init, before createOverlay has returned — can safely
  // test `if (overlay) ...` without a temporal-dead-zone violation.
  // Assigned exactly once further down when createOverlay runs.
  let overlay = null;

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
  // Same story for streaks — achievement criteria that gate on
  // consecutive-day activity read stats.streaks.current.
  try { stats.streaks = getStreaks(); } catch { stats.streaks = { current: 0, longest: 0 }; }
  // Celebrant achievement criteria read stats.eventsResponded —
  // distinct events the user has completed at least one prompt for.
  try {
    const { countEventsResponded } = await import('../events/participation.js');
    stats.eventsResponded = countEventsResponded();
  } catch { stats.eventsResponded = 0; }

  /**
   * Rebuild a FRESH stats bundle for mid-session refreshes (splash
   * redraw after a new unlock, share-dialog open, accent repaint,
   * etc.). Starts from the init-time `stats` (which carries IDB-
   * derived + prompt-derived data that doesn't change mid-session)
   * and re-reads the mutable fields from their sources.
   *
   * Every achievement criterion that reads `stats.<x>` for a mutable
   * source must be represented here, otherwise refresh paths will
   * silently read stale values and criteria won't re-fire on a
   * threshold crossing.
   *
   * This consolidation is deliberate: previously each refresh site
   * re-inlined the fresh-read logic and any new stat source risked
   * being added to some sites and not others. Keeping all refresh
   * paths routed through this helper means "add a new stat" is a
   * one-file change.
   *
   * @returns {object} merged stats bundle ready to pass to
   *                   computeUnlockedIds or getPrimaryArchetype
   */
  async function buildFreshStats() {
    const fresh = { ...stats };
    try { fresh.counters = getCounters(); } catch { fresh.counters = stats.counters || {}; }
    try { fresh.streaks  = getStreaks();  } catch { fresh.streaks  = stats.streaks  || { current: 0, longest: 0 }; }
    try {
      const { countEventsResponded } = await import('../events/participation.js');
      fresh.eventsResponded = countEventsResponded();
    } catch { fresh.eventsResponded = stats.eventsResponded || 0; }
    // Future fields go here. Any new mutable stat source referenced
    // by an achievement criterion (or by getPrimaryArchetype) should
    // be re-read from its source right here; otherwise refresh sites
    // pick up whatever stale value was in `stats` at openFullPage time.
    return fresh;
  }

  /**
   * Sync variant of buildFreshStats for use in sync handlers where
   * `await` would be disruptive (e.g. accent repaint on settings-
   * change, which fires many times per session). Reads the cheap
   * localStorage-backed stats synchronously and carries forward the
   * LAST-KNOWN value of any async-derived field (currently
   * eventsResponded) from `stats`. Call sites that genuinely need
   * a just-fetched eventsResponded should use the async form.
   *
   * @returns {object}
   */
  function buildFreshStatsSync() {
    const fresh = { ...stats };
    try { fresh.counters = getCounters(); } catch { fresh.counters = stats.counters || {}; }
    try { fresh.streaks  = getStreaks();  } catch { fresh.streaks  = stats.streaks  || { current: 0, longest: 0 }; }
    // eventsResponded is async (dynamic-imported participation.js) so
    // we carry the init-time value; callers that change event state
    // (completing a prompt in the profile) should use buildFreshStats()
    // instead. The TYPICAL sync-path caller (accent / title repaint
    // on a flair change) doesn't mutate events, so stale is safe.
    fresh.eventsResponded = stats.eventsResponded || 0;
    return fresh;
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
  // Record the first-detected unlock date for any new achievement. This
  // populates notifications.unlockDates so the achievements grid can
  // show "Unlocked: 3d ago" on hover.
  try { recordUnlockDates(unlockedIds); } catch { /* non-fatal */ }
  // Acknowledge BOTH week and day — the user is seeing the current state,
  // and if they toggle cadence later we don't want stale pulse-pending on
  // the mode they weren't using.
  try { markWeekSeen(); } catch { /* non-fatal */ }
  try { markDaySeen(); } catch { /* non-fatal */ }

  // Personal-best detection. Compares current stats against stored
  // peaks, updates peaks if any improved. The IMPROVEMENTS themselves
  // are no longer surfaced as pop-up celebration toasts — the mini-card
  // pulse (wider when pendingCount increases) now handles "hey come
  // look" and the personal-bests chips inside the splash reveal what
  // changed once the profile is open. Keeps the "friendly neighbor
  // waving you over" energy the user asked for, rather than bolting on
  // a distracting toast stack over their chat.
  //
  // We still call checkAndUpdateBests for its side effect — persisting
  // new peak values. That state feeds the chips inside the profile,
  // which is where the reveal now lives.
  try { checkAndUpdateBests(stats); } catch { /* non-fatal */ }

  // Weekly activity summary. We still call checkSummary for its side
  // effect (resetting the weekly-snapshot window + updating the
  // activity-summary section data), but no longer surface it as a
  // toast. The user will see the summary in the activity section
  // when they open the profile. Same rationale as personal bests:
  // pulse to invite, splash to reveal.
  try {
    const counters = (() => { try { return getCounters(); } catch { return {}; } })();
    checkSummary(counters);
  } catch { /* non-fatal */ }

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
    onCardClick: () => {
      // Dynamic import so the share machinery loads only when the
      // user asks for it — keeps the cold-start cost of the profile
      // overlay down for the common case where nobody shares.
      import('../render/share_dialog.js').then(async (mod) => {
        // Derive the latest-display view-model from freshest settings +
        // stats — the card should reflect the user's current state
        // (flair pick, archetype, accent), not the init-time snapshot.
        let freshSettings = settings;
        try { freshSettings = loadSettings(); } catch { /* keep stale */ }
        let freshUnlocked = unlockedIds;
        let freshArchetype = null;
        try {
          const freshStats = await buildFreshStats();
          freshUnlocked = computeUnlockedIds(freshStats);
          try { freshArchetype = getPrimaryArchetype(freshStats); } catch { /* null */ }
        } catch { /* fall back */ }
        const accent = resolveActiveAccent(freshSettings, stats, freshUnlocked);
        const p = (freshSettings && freshSettings.profile) || {};
        mod.openShareDialog({
          displayName: p.displayName || p.username || 'Chronicler',
          title: deriveTitle(freshUnlocked, freshSettings),
          archetype: freshArchetype,
          level: lvl.level,
          accent: accent.color,
          avatarUrl: p.avatarUrl || null,
          pinnedBadges: pickPinnedBadges(freshUnlocked, 5),
          xpIntoLevel: lvl.xpIntoLevel,
          xpForNextLevel: lvl.xpForNextLevel,
          progress01: lvl.progress01,
        });
        try { bumpCounter('shareCardOpens'); } catch { /* non-fatal */ }
      }).catch(e => {
        console.warn('[pf] share dialog failed to load:', e && e.message);
      });
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
      // Prompt-stats change mid-session when the user checks a prompt
      // inside the profile, so fold them in from freshSettings. The
      // rest of the bundle (counters/streaks/eventsResponded) comes
      // from the helper. Sync form is fine here — this runs on every
      // settings-changed event (many times/session) and eventsResponded
      // doesn't shift without an explicit event-prompt completion,
      // which the splash-refresh path doesn't perform.
      const freshStats = { ...buildFreshStatsSync(), ...computePromptStats(freshSettings) };
      freshUnlocked = computeUnlockedIds(freshStats);
    } catch { /* fall back to initial unlock list */ }

    // Re-derive archetype on every refresh so a threshold crossing
    // (e.g., just completed the streak that pushes them into Daily)
    // reflects live in the splash.
    let freshArchetype = null;
    try {
      freshArchetype = getPrimaryArchetype(buildFreshStatsSync());
    } catch { /* non-fatal */ }

    splash.update({
      displayName: p.displayName || p.username || 'Chronicler',
      avatarUrl: p.avatarUrl || null,
      title: deriveTitle(freshUnlocked, freshSettings),
      archetype: freshArchetype,
      level: lvl.level,
      xpIntoLevel: lvl.xpIntoLevel,
      xpForNextLevel: lvl.xpForNextLevel,
      progress01: lvl.progress01,
      pinnedBadges: pickPinnedBadges(freshUnlocked, 6),
    });

    // Re-apply the user's accent — they may have just picked a new
    // one in the Details form. resolveActiveAccent falls back to
    // amber if the picked id isn't currently unlocked. overlay is
    // declared up-front as `let overlay = null`, so a truthiness
    // check is safe on the first synchronous call (before
    // createOverlay returns) — we just skip. applyAccent() below
    // handles the initial paint.
    if (overlay && overlay.style) {
      try {
        const accent = resolveAccentVars(freshSettings, stats, freshUnlocked);
        overlay.style.setProperty('--pf-accent', accent.color);
        overlay.style.setProperty('--pf-accent-rgb', accent.rgb);
        // Cascade the same accent into upstream Perchance's chrome —
        // user picks a color in the profile, the whole app re-tints.
        paintAppAccent(accent);
      } catch { /* non-fatal */ }
    }

    // Rebuild the Prompts section body when the cadence setting changes.
    // Previously we closed the overlay to force a reload; that slammed
    // shut on the user as they were toggling Daily/Weekly. Now we just
    // re-render the body in place — no overlay flicker, no context loss.
    const freshCadence = (freshSettings && freshSettings.prompts && freshSettings.prompts.cadence) || 'weekly';
    if (freshCadence !== currentCadence) {
      currentCadence = freshCadence;
      let newPrompts;
      let newDayKey = null;
      if (freshCadence === 'daily') {
        newDayKey = getCurrentDayKey();
        const dayPrompt = getDayPrompt(newDayKey);
        newPrompts = dayPrompt ? [dayPrompt] : [];
      } else {
        newPrompts = getWeekPrompts(weekKey);
      }
      const newBody = createPromptsBody({
        weekKey,
        prompts: newPrompts,
        completedIds: getCompletedIds(weekKey),
        activeEvents,
        cadence: freshCadence,
      });
      const bodyWrap = promptsSection.querySelector('.pf-section-body');
      if (bodyWrap) {
        bodyWrap.replaceChildren(newBody);
      }
    }
  }
  // Track the mounted cadence so the listener can detect changes.
  let currentCadence = cadence;
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
    children: createDetailsBody({ profile, unlockedIds, stats }),
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
    children: createAchievementsGrid({ unlockedIds, unlockDates: getUnlockDates() }),
    initialState: displayState.achievements,
  });

  // ---- activity counters ----
  // Shows per-feature usage counts tracked by stats/counters.js.
  // Surfaces data that users have been accumulating silently; also
  // establishes visibility for the future tiered-achievement system
  // that will unlock based on these same counters.
  const counters = getCounters();

  // Per-thread breakdown (#3) needs human-readable thread names. We
  // resolve them here BEFORE handing off to createActivityBody so the
  // builder stays pure-sync. Two layers of best-effort:
  //   - if window.db / threads table missing → empty map (builder
  //     falls back to 'Thread #<id>' for every entry)
  //   - if a specific thread was deleted upstream since the counter
  //     was tagged → that id stays unresolved (same fallback)
  // We resolve the union of ids across ALL per-thread counters so
  // every breakdown row in the strip can render names without
  // additional fetches.
  const threadNamesById = {};
  try {
    const byThread = getCountersByThread();
    const ids = Object.keys(byThread)
      .map(s => Number(s))
      .filter(n => Number.isFinite(n));
    if (ids.length > 0 && typeof window !== 'undefined' && window.db && window.db.threads) {
      // Use bulkGet when available (Dexie supports it), fall back to
      // serial gets if not. Either way we tolerate per-id failures.
      let rows = [];
      if (typeof window.db.threads.bulkGet === 'function') {
        rows = await window.db.threads.bulkGet(ids).catch(() => []);
      } else {
        rows = await Promise.all(
          ids.map(id => window.db.threads.get(id).catch(() => null))
        );
      }
      for (const row of rows || []) {
        if (row && row.id != null && typeof row.name === 'string' && row.name) {
          threadNamesById[String(row.id)] = row.name;
        }
      }
      // Opportunistic prune of stale per-thread counters (#3 follow-up).
      // We just enumerated live threads anyway — pass the live set so
      // pruneCountersByThread can drop entries for threads the user
      // deleted upstream. Bounded growth without a separate scan.
      // Build the live set from rows that came back non-null, regardless
      // of whether they had a name; non-null === thread still exists.
      const liveSet = new Set(
        (rows || [])
          .filter(r => r && r.id != null)
          .map(r => String(r.id))
      );
      try { pruneCountersByThread(liveSet); } catch { /* best-effort */ }
    }
  } catch { /* best-effort; empty map → fallback labels in builder */ }

  const activitySection = createSection({
    id: 'activity',
    title: 'Activity',
    children: createActivityBody({
      counters,
      streaks: (() => { try { return getStreaks(); } catch { return null; } })(),
      streakStatus: (() => { try { return streakStatus(); } catch { return 'broken'; } })(),
      threadNamesById,
    }),
    initialState: displayState.activity || { collapsed: false, blurred: false },
  });

  const backupSection = createSection({
    id: 'backup',
    title: 'Backup',
    children: createBackupBody(),
    initialState: displayState.backup,
  });

  // ---- overlay ----
  //
  // `overlay` was declared `let overlay = null` at the top of
  // openFullPage() so refreshSplashFromSettings(), which fires
  // synchronously during init, can safely test `if (overlay)`
  // without a TDZ violation. Assign exactly once, here.
  overlay = createOverlay({
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

  // Apply the user's chosen accent (or the default amber) as a CSS
  // custom property on the overlay root. Consumers: splash title,
  // level badge, pinned-badge borders, section focus rings. If the
  // user changes their accent mid-session, refreshSplashFromSettings
  // (wired to onSettingsChange) picks up the new value and calls
  // applyAccent() again.
  function applyAccent() {
    let freshSettings = settings;
    try { freshSettings = loadSettings(); } catch { /* keep stale */ }
    let freshUnlocked = unlockedIds;
    try {
      freshUnlocked = computeUnlockedIds(buildFreshStatsSync());
    } catch { /* fall back */ }
    // Set BOTH custom properties so rules using either the solid hex
    // (var(--pf-accent)) or a shaded rgba (rgba(var(--pf-accent-rgb), <a>))
    // pick up the chosen accent. The -rgb form is derived via hexToRgb
    // so accents defined with any '#rrggbb' value get full shading support.
    const accent = resolveAccentVars(freshSettings, stats, freshUnlocked);
    overlay.style.setProperty('--pf-accent', accent.color);
    overlay.style.setProperty('--pf-accent-rgb', accent.rgb);
    // Cascade to upstream Perchance chrome — notification banner,
    // link color, selected-thread highlight all re-tint to match
    // the user's pick. Boot-time paint is handled by profile/index.js
    // start() so the theme persists even when the profile isn't open.
    paintAppAccent(accent);
  }
  applyAccent();

  overlay.show();
}

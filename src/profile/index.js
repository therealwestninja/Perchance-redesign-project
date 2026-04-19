// profile/index.js
//
// Top-level wiring. Brings together:
//   - stats/db.js    — read upstream IndexedDB
//   - stats/queries.js — pure stat computation
//   - achievements/tiers.js — XP/level math
//   - render/mini_card.js — the DOM element
//   - profile/mount.js — sidebar injection
//
// This module is the one "main" for the project — everything else is a pure
// helper. Keep it small: if logic lives here and it grows past ~100 lines,
// extract it.

import { readAllStores } from '../stats/db.js';
import { computeStats } from '../stats/queries.js';
import { computePromptStats } from '../stats/prompt_stats.js';
import { xpFromStats, levelFromXP } from '../achievements/tiers.js';
import { computeUnlockedIds } from '../achievements/unlocks.js';
import { getCounters } from '../stats/counters.js';
import { recordActivityForStreak, getStreaks } from '../stats/streaks.js';
import { createMiniCard } from '../render/mini_card.js';
import { mountMiniCard } from './mount.js';
import { createMemoryButton } from '../render/memory_button.js';
import { openMemoryWindow } from '../memory/window_open.js';
import { openFullPage } from './full_page.js';
import { loadSettings, onSettingsChange } from './settings_store.js';
import { initSeenOnFirstRun, computePendingAchievements, computePendingEvents, recordUnlockDates } from './notifications.js';
import { initPromptsOnFirstRun, hasNewWeekPending, hasNewDayPending } from '../prompts/completion.js';
import { getActiveEventIds } from '../events/active.js';
import { resolveAccentVars, paintAppAccent } from './flair.js';
import { parseShareUrl } from './share_code.js';

const REFRESH_INTERVAL_MS = 30_000;

/**
 * Build a mini-card view model from current stats + profile settings.
 *
 * `isFreshlyIncreased` is true when pendingCount just bumped up from the
 * previous refresh's value — the mini-card uses that signal to throw a
 * brief, more attention-getting "hey look over here" pulse on top of its
 * ambient pending pulse. See mini_card.js for the render-time wiring.
 */
function buildViewModel(stats, profile, pendingCount = 0, isFreshlyIncreased = false) {
  const xp = xpFromStats(stats);
  const lvl = levelFromXP(xp);
  return {
    displayName: (profile && profile.displayName) || 'Chronicler',
    avatarUrl: (profile && profile.avatarUrl) || null,
    level: lvl.level,
    xpIntoLevel: lvl.xpIntoLevel,
    xpForNextLevel: lvl.xpForNextLevel,
    progress01: lvl.progress01,
    pendingCount,
    isFreshlyIncreased,
  };
}

// Module-local: last pendingCount we sent to the card. Lets the refresh()
// loop detect NEW pending events (vs. ambient pending) so the mini-card
// can fire an extra-attention pulse for freshly-landed things — the
// "friendly neighbor waving you over" signal. Initialized lazily on the
// first refresh (to `null` so the first render never false-fires).
let lastPendingCountSeen = null;

/**
 * Pure detector for "did pendingCount just rise?". Extracted so the
 * rule is unit-testable without a live IDB or DOM. The three-case
 * truth table:
 *   previous=null, current=anything   → false  (first render baseline)
 *   previous=N,    current<=N         → false  (same or decreased)
 *   previous=N,    current>N          → true   (fresh landing)
 *
 * Called from refresh() as part of the view-model build; the return
 * value is then passed through to mini_card.js which applies the
 * transient .pf-mini-card-fresh class.
 *
 * @param {number|null} previous - last rendered pendingCount, or null
 * @param {number}      current  - just-computed pendingCount
 * @returns {boolean} true only when current strictly exceeds a known previous
 */
export function detectFreshIncrease(previous, current) {
  if (previous === null || previous === undefined) return false;
  return Number(current) > Number(previous);
}

/**
 * Compute stats from IDB and push a fresh view model into the card.
 * Never throws — the card always renders something, even if IDB is unreachable.
 */
async function refresh(card) {
  try {
    const data = await readAllStores();
    const settings = loadSettings();
    // Merge IDB-derived stats with settings-derived prompt stats so
    // achievement criteria can read both from one stat bundle. Also
    // inject counter data so counter-backed achievements can unlock.
    const stats = { ...computeStats(data), ...computePromptStats(settings) };
    try { stats.counters = getCounters(); } catch { stats.counters = {}; }
    // Inject streak state for any streak-based achievement criteria.
    // Note: we do NOT call recordActivityForStreak here — mini-card
    // refreshes fire on every settings-changed event (many per session),
    // and the recordActivity idempotency guard keys on day-rollover.
    // Calling it here would be correct but noisy — cleaner to confine
    // the "activity" signal to explicit user actions (profile open,
    // memory tool open) that already handle it.
    try { stats.streaks = getStreaks(); } catch { stats.streaks = { current: 0, longest: 0 }; }
    // Celebrant achievement criteria read stats.eventsResponded —
    // distinct events the user has completed at least one prompt for.
    // countEventsResponded is in the same IIFE scope (bundled from
    // events/participation.js).
    try {
      stats.eventsResponded = countEventsResponded();
    } catch { stats.eventsResponded = 0; }
    const unlockedIds = computeUnlockedIds(stats);

    // First deploy: treat current unlocks as "already seen" so this commit
    // doesn't pulse for every pre-existing achievement. Subsequent loads
    // only pulse for actually-new ones. Same for prompts — don't pulse just
    // because the feature is new to the user.
    initSeenOnFirstRun(unlockedIds);
    initPromptsOnFirstRun();
    // Record the first-detected unlock date for each unlocked achievement
    // (idempotent; existing entries preserved). Done here so background
    // refreshes capture unlock dates even if the user never opens the
    // full profile page.
    try { recordUnlockDates(unlockedIds); } catch { /* non-fatal */ }

    const pendingIds = computePendingAchievements(unlockedIds);
    const cadence = (settings && settings.prompts && settings.prompts.cadence) || 'weekly';
    const newPromptsPending = cadence === 'daily' ? hasNewDayPending() : hasNewWeekPending();
    const activeEventIds = getActiveEventIds();
    const pendingEvents = computePendingEvents(activeEventIds);
    const pendingCount =
      pendingIds.length +
      (newPromptsPending ? 1 : 0) +
      pendingEvents.length;

    // Detect a freshly-landed pending event: on the second+ refresh of
    // the session, if the count STRICTLY increased vs. what we rendered
    // last time, flag it for the mini-card's extra-attention pulse. The
    // null check (in detectFreshIncrease) prevents the very first render
    // from false-firing (e.g. if the user already has 3 pending from
    // last session — we don't want the wave on page load, only when
    // something NEW appears).
    const isFreshlyIncreased = detectFreshIncrease(lastPendingCountSeen, pendingCount);
    lastPendingCountSeen = pendingCount;

    card.update(buildViewModel(
      stats,
      settings && settings.profile,
      pendingCount,
      isFreshlyIncreased,
    ));
  } catch (e) {
    if (!refresh._warned) {
      refresh._warned = true;
      console.warn('[pf] profile refresh failed:', e && e.message);
    }
  }
}

/**
 * Start the profile feature. Idempotent — calling twice is a no-op.
 */
export async function start() {
  if (start._started) return;
  start._started = true;

  const card = await mountMiniCard({
    buildElement: () => createMiniCard({
      onOpen: () => {
        openFullPage().catch(e => {
          console.warn('[pf] failed to open profile page:', e && e.message);
        });
      },
    }),
    onMounted: (cardEl) => {
      // Inject the Memory & Lore button directly after the mini-card so
      // it lives in the same sidebar slot. Stop-propagation inside the
      // button prevents click bubbling into the card's open-profile handler.
      const btn = createMemoryButton({
        onClick: () => {
          openMemoryWindow().catch(e => {
            console.warn('[pf] failed to open memory window:', e && e.message);
          });
        },
      });
      cardEl.parentNode.appendChild(btn);
    },
  });

  if (!card) {
    // Sidebar never appeared (unusual — happens if the chat page didn't load).
    // Nothing to update, nothing to clean up.
    return;
  }

  console.info('[pf] profile fork active — mini-card mounted');

  // ---- Chat UX enhancements (Batch 1) ----
  // Message controls: copy, edit, delete, regen buttons on each message.
  // Waits a tick for chatMessagesEl to be in the DOM (it may not exist
  // at the exact moment start() runs if the chat UI initializes async).
  try {
    if (document.getElementById('chatMessagesEl')) {
      initMessageControls();
    } else {
      // Retry after a short delay — chat DOM might still be loading
      setTimeout(() => { try { initMessageControls(); } catch { /* non-fatal */ } }, 1500);
    }
  } catch { /* non-fatal */ }

  // Chat search: sidebar thread filter
  try {
    if (document.getElementById('chatThreads')) {
      initChatSearch();
    } else {
      setTimeout(() => { try { initChatSearch(); } catch { /* non-fatal */ } }, 1500);
    }
  } catch { /* non-fatal */ }

  // Stop generating: button + aiTextPlugin monkey-patch
  // (also handles dynamic glossary injection via the same patch)
  try {
    if (window.root && window.root.aiTextPlugin) {
      initStopGenerating();
    } else {
      // root.aiTextPlugin might load async — retry
      setTimeout(() => { try { initStopGenerating(); } catch { /* non-fatal */ } }, 3000);
    }
  } catch { /* non-fatal */ }

  // Token count display (Batch 2)
  try {
    if (document.getElementById('chatMessagesEl')) {
      initTokenDisplay();
    } else {
      setTimeout(() => { try { initTokenDisplay(); } catch { /* non-fatal */ } }, 1500);
    }
  } catch { /* non-fatal */ }

  // Glossary editor — now handled by Context Editor (📝 tabbed modal)
  // initGlossaryEditor() standalone button removed to avoid duplicates.

  // Chat export (Batch 5) — ⬇ button in chat header
  try { initChatExport(); } catch { /* non-fatal */ }

  // Thread archiving (Batch 5) — archive buttons on threads
  try {
    if (document.getElementById('chatThreads')) {
      initThreadArchive();
    } else {
      setTimeout(() => { try { initThreadArchive(); } catch { /* non-fatal */ } }, 1500);
    }
  } catch { /* non-fatal */ }

  // Impersonation — now handled by AI Writer (✍ mode picker)
  // Writing enhancer — now handled by AI Writer
  // Narration — now handled by AI Writer

  // Keyboard shortcuts (Batch 6)
  try { initKeyboardShortcuts(); } catch { /* non-fatal */ }

  // Prompt presets (Batch 6) — 📋 dropdown near input
  try { initPromptPresets(); } catch { /* non-fatal */ }

  // Quick reminder editor (Batch 6) — 📌 button near input
  // Quick reminder — now handled by Context Editor

  // Fullscreen toggle (Batch 7) — ⛶ button in header
  try { initFullscreen(); } catch { /* non-fatal */ }

  // Bulk thread operations (Batch 5) — multi-select in sidebar
  try {
    if (document.getElementById('chatThreads')) {
      initBulkThreads();
    } else {
      setTimeout(() => { try { initBulkThreads(); } catch { /* non-fatal */ } }, 1500);
    }
  } catch { /* non-fatal */ }

  // AI reasoning toggle (Batch 6) — 🧠/💭 in header
  try { initReasoningToggle(); } catch { /* non-fatal */ }

  // Font settings (Batch 7) — Aa dropdown in header
  try { initFontSettings(); } catch { /* non-fatal */ }

  // Generation settings (Batch 6) — ⚙ temp/tokens near input
  try { initGenSettings(); } catch { /* non-fatal */ }

  // Image generation (Batch 4) — 🖼 button on AI messages
  try {
    if (document.getElementById('chatMessagesEl') && window.root && window.root.textToImagePlugin) {
      initImageGen();
    } else {
      setTimeout(() => { try { initImageGen(); } catch { /* non-fatal */ } }, 3000);
    }
  } catch { /* non-fatal */ }

  // Theme toggle (Batch 7) — ☀/🌙 in header
  try { initThemeToggle(); } catch { /* non-fatal */ }

  // Custom background (Batch 7) — 🏞 in header
  try { initCustomBg(); } catch { /* non-fatal */ }

  // Auto-summary (Batch 2) — compress older messages
  try {
    if (document.getElementById('chatMessagesEl')) {
      initAutoSummary();
    } else {
      setTimeout(() => { try { initAutoSummary(); } catch { /* non-fatal */ } }, 1500);
    }
  } catch { /* non-fatal */ }

  // Character browser (Batch 5) — 👥 in header
  try {
    if (window.db && window.db.characters) {
      initCharBrowser();
    } else {
      setTimeout(() => { try { initCharBrowser(); } catch { /* non-fatal */ } }, 3000);
    }
  } catch { /* non-fatal */ }

  // UI animation polish + mobile refinements (Batch 7)
  try { initUiPolish(); } catch { /* non-fatal */ }

  // Conversation branching (Batch 6)
  try {
    if (document.getElementById('chatMessagesEl')) {
      initBranching();
    } else {
      setTimeout(() => { try { initBranching(); } catch { /* non-fatal */ } }, 1500);
    }
  } catch { /* non-fatal */ }

  // Document analysis (Batch 6) — 📎 upload text files
  try { initDocAnalysis(); } catch { /* non-fatal */ }

  // Anti-repetition (Batch 8) — 🚫 banlist + auto-detect
  // Anti-repetition — now handled by Context Editor

  // Dice roller (Batch 8) — 🎲 button + /roll command
  try { initDiceRoller(); } catch { /* non-fatal */ }

  // Message timestamps (Batch 8)
  try {
    if (document.getElementById('chatMessagesEl')) {
      initTimestamps();
    } else {
      setTimeout(() => { try { initTimestamps(); } catch { /* non-fatal */ } }, 1500);
    }
  } catch { /* non-fatal */ }

  // Auto-lorebook (Batch 8) — 🔮 AI generates glossary entries
  try {
    if (window.root && window.root.aiTextPlugin) {
      initAutoLorebook();
    } else {
      setTimeout(() => { try { initAutoLorebook(); } catch { /* non-fatal */ } }, 3000);
    }
  } catch { /* non-fatal */ }

  // User persona editor (Batch 9) — 👤 in header
  // User persona — now handled by Context Editor

  // Character card import/export (Batch 9) — 🃏 in header
  try {
    if (window.db && window.db.characters) {
      initCharCards();
    } else {
      setTimeout(() => { try { initCharCards(); } catch { /* non-fatal */ } }, 3000);
    }
  } catch { /* non-fatal */ }

  // Code syntax highlighting (Batch 3)
  try {
    if (document.getElementById('chatMessagesEl')) {
      initCodeHighlight();
    } else {
      setTimeout(() => { try { initCodeHighlight(); } catch { /* non-fatal */ } }, 1500);
    }
  } catch { /* non-fatal */ }

  // Voice I/O (Batch 3) — mic + speaker buttons
  try { initVoice(); } catch { /* non-fatal */ }

  // Combined tools — unified entry points for grouped features
  // AI Writer: impersonate + narrate + enhance + recap in one dropdown
  try {
    if (window.root && window.root.aiTextPlugin) {
      initAiWriter();
    } else {
      setTimeout(() => { try { initAiWriter(); } catch { /* non-fatal */ } }, 3000);
    }
  } catch { /* non-fatal */ }

  // Context Editor: glossary + banlist + reminder + persona in tabbed modal
  try { initContextEditor(); } catch { /* non-fatal */ }

  // Tools menu (MUST be last — collects all buttons injected above)
  try { initToolsMenu(); } catch { /* non-fatal */ }

  // Context dashboard (shows what's injected into AI prompt)
  try { initContextDashboard(); } catch { /* non-fatal */ }

  // Recap — "Previously on..." narrative summary
  // Recap — now handled by AI Writer

  // Message bookmarks — star important messages
  try {
    if (document.getElementById('chatMessagesEl')) {
      initBookmarks();
    } else {
      setTimeout(() => { try { initBookmarks(); } catch { /* non-fatal */ } }, 1500);
    }
  } catch { /* non-fatal */ }

  // Daily quest — AI-generated date-seeded quest card
  try {
    setTimeout(() => { try { initDailyQuest(); } catch { /* non-fatal */ } }, 2000);
  } catch { /* non-fatal */ }

  // Initial fetch
  await refresh(card);

  // Boot-time app-wide accent paint. Cascades the user's picked
  // accent into upstream Perchance's CSS variables so the whole app
  // re-tints BEFORE the user even opens the profile. Safe no-op if
  // the user hasn't picked an accent (resolves to amber, which is
  // close to the default #005ac2 blue upstream ships with — still
  // a noticeable shift, but that's the user's point: "even the
  // standard Perchance has been replaced by the new theme color").
  //
  // Derived from the same settings+stats+unlocked signal the
  // profile uses — so if the user picks an accent they haven't
  // unlocked yet (e.g. from a restored backup), we fall back to
  // amber consistently everywhere.
  try {
    const bootSettings = loadSettings();
    const bootStats = await (async () => {
      try {
        const data = await readAllStores();
        return { ...computeStats(data), ...computePromptStats(bootSettings) };
      } catch { return {}; }
    })();
    const bootUnlocked = computeUnlockedIds(bootStats);
    paintAppAccent(resolveAccentVars(bootSettings, bootStats, bootUnlocked));
  } catch { /* non-fatal — upstream theming is a nicety, not a promise */ }

  // ---- Theme colors (custom background gradient) ----
  // Apply user's chosen primary/secondary background colors at boot.
  // applyThemeColorsLive() is in the same IIFE scope (details_form.js).
  try {
    if (typeof applyThemeColorsLive === 'function') {
      applyThemeColorsLive();
    }
  } catch { /* non-fatal */ }

  // ---- Share-link detection ----
  // If the URL contains ?h=<shareCode>, auto-open the card viewer
  // overlay showing the shared profile. openShareViewer is in the
  // same IIFE scope (bundled from render/share_viewer.js).
  try {
    const sharedVM = parseShareUrl();
    if (sharedVM) {
      try { openShareViewer(sharedVM); } catch { /* non-fatal */ }
    }
  } catch { /* non-fatal */ }

  // Live refresh when the user changes settings (avatar, title, etc.) —
  // no need to wait for the 30s interval.
  onSettingsChange(() => { refresh(card); });

  // Periodic refresh. Cheap — IDB getAll is fast at Perchance scale,
  // and we don't hook into message events, keeping the surface tiny.
  //
  // We hold onto the interval handle so it can be cleared on page
  // unload (belt + suspenders against browsers that keep timers
  // alive across bfcache navigations) AND we defensively skip the
  // refresh if the card element has been removed from the DOM for
  // any reason — the interval self-clears in that case so we don't
  // keep doing IDB reads against a ghost node.
  const refreshHandle = setInterval(() => {
    if (!card.isConnected) {
      clearInterval(refreshHandle);
      return;
    }
    refresh(card);
  }, REFRESH_INTERVAL_MS);

  // Page unload / bfcache — clear the interval. `pagehide` fires in
  // more cases than `beforeunload` (bfcache, mobile background, etc.)
  // so it's the more defensive choice. One-shot; no teardown needed.
  const onPageHide = () => { clearInterval(refreshHandle); };
  window.addEventListener('pagehide', onPageHide, { once: true });

  // Refresh when the tab becomes visible again — catches "user came back
  // after a while" without waiting for the next interval tick.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh(card);
  });
}

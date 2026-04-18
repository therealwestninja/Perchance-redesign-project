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
import { createMiniCard } from '../render/mini_card.js';
import { mountMiniCard } from './mount.js';
import { createMemoryButton } from '../render/memory_button.js';
import { openMemoryWindow } from '../memory/window_open.js';
import { openFullPage } from './full_page.js';
import { loadSettings, onSettingsChange } from './settings_store.js';
import { initSeenOnFirstRun, computePendingAchievements, computePendingEvents } from './notifications.js';
import { initPromptsOnFirstRun, hasNewWeekPending, hasNewDayPending } from '../prompts/completion.js';
import { getActiveEventIds } from '../events/active.js';

const REFRESH_INTERVAL_MS = 30_000;

/**
 * Build a mini-card view model from current stats + profile settings.
 */
function buildViewModel(stats, profile, pendingCount = 0) {
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
  };
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
    const unlockedIds = computeUnlockedIds(stats);

    // First deploy: treat current unlocks as "already seen" so this commit
    // doesn't pulse for every pre-existing achievement. Subsequent loads
    // only pulse for actually-new ones. Same for prompts — don't pulse just
    // because the feature is new to the user.
    initSeenOnFirstRun(unlockedIds);
    initPromptsOnFirstRun();

    const pendingIds = computePendingAchievements(unlockedIds);
    const cadence = (settings && settings.prompts && settings.prompts.cadence) || 'weekly';
    const newPromptsPending = cadence === 'daily' ? hasNewDayPending() : hasNewWeekPending();
    const activeEventIds = getActiveEventIds();
    const pendingEvents = computePendingEvents(activeEventIds);
    const pendingCount =
      pendingIds.length +
      (newPromptsPending ? 1 : 0) +
      pendingEvents.length;

    card.update(buildViewModel(stats, settings && settings.profile, pendingCount));
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

  // Initial fetch
  await refresh(card);

  // Live refresh when the user changes settings (avatar, title, etc.) —
  // no need to wait for the 30s interval.
  onSettingsChange(() => { refresh(card); });

  // Periodic refresh. Cheap — IDB getAll is fast at Perchance scale,
  // and we don't hook into message events, keeping the surface tiny.
  setInterval(() => { refresh(card); }, REFRESH_INTERVAL_MS);

  // Refresh when the tab becomes visible again — catches "user came back
  // after a while" without waiting for the next interval tick.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh(card);
  });
}

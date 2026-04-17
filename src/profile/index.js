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
import { xpFromStats, levelFromXP } from '../achievements/tiers.js';
import { computeUnlockedIds } from '../achievements/unlocks.js';
import { createMiniCard } from '../render/mini_card.js';
import { mountMiniCard } from './mount.js';
import { openFullPage } from './full_page.js';
import { loadSettings, onSettingsChange } from './settings_store.js';
import { initSeenOnFirstRun, computePendingAchievements } from './notifications.js';

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
    const stats = computeStats(data);
    const unlockedIds = computeUnlockedIds(stats);

    // First deploy: treat current unlocks as "already seen" so this commit
    // doesn't pulse for every pre-existing achievement. Subsequent loads
    // only pulse for actually-new ones.
    initSeenOnFirstRun(unlockedIds);
    const pendingIds = computePendingAchievements(unlockedIds);

    const settings = loadSettings();
    card.update(buildViewModel(stats, settings && settings.profile, pendingIds.length));
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
    onMounted: () => {},
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

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
import { createMiniCard } from '../render/mini_card.js';
import { mountMiniCard } from './mount.js';

const LS_PROFILE_KEY = 'pf:profile';
const REFRESH_INTERVAL_MS = 30_000;

/**
 * Read user profile settings (display name, avatar URL) from localStorage.
 * Returns defaults if nothing is saved yet.
 */
function loadProfileSettings() {
  try {
    const raw = localStorage.getItem(LS_PROFILE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Build a mini-card view model from current stats + profile settings.
 */
function buildViewModel(stats, profile) {
  const xp = xpFromStats(stats);
  const lvl = levelFromXP(xp);
  return {
    displayName: (profile && profile.displayName) || 'Chronicler',
    avatarUrl: (profile && profile.avatarUrl) || null,
    level: lvl.level,
    xpIntoLevel: lvl.xpIntoLevel,
    xpForNextLevel: lvl.xpForNextLevel,
    progress01: lvl.progress01,
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
    const profile = loadProfileSettings();
    card.update(buildViewModel(stats, profile));
  } catch (e) {
    // Leave the last-good view model in place. Log once for debugging.
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

  let cardRef = null;

  const card = await mountMiniCard({
    buildElement: () => createMiniCard({
      onOpen: () => {
        // Full hero-card modal lives in a later commit.
        console.info('[pf] profile clicked — full card modal is coming soon');
      },
    }),
    onMounted: (el) => { cardRef = el; },
  });

  if (!card) {
    // Sidebar never appeared (unusual — happens if the chat page didn't load).
    // Nothing to update, nothing to clean up.
    return;
  }

  // Initial fetch
  await refresh(card);

  // Periodic refresh. Cheap — IDB getAll is fast at Perchance scale,
  // and we don't hook into message events, keeping the surface tiny.
  setInterval(() => { refresh(card); }, REFRESH_INTERVAL_MS);

  // Refresh when the tab becomes visible again — catches "user came back
  // after a while" without waiting for the next interval tick.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh(card);
  });
}

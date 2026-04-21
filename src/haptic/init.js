// haptic/init.js
//
// Boot-time initialization for the haptic subsystem.
// Called from start() in profile/index.js after the DB is open.
//
// Sequence:
//   1. Init DB tables (additive, no upstream schema changes)
//   2. Load persisted settings
//   3. Set active backend from saved preference
//   4. Wire control bus → backend stopAll
//   5. Mount UI chip + slider in chat header
//   6. Watch for character/thread switches

import { initHapticDb, loadHapticSettings } from './settings.js';
import { setActiveBackend, getActiveBackend, stopAll } from './backend.js';
import { onBusEvent, busStop } from './control_bus.js';
import { initMessageHook } from './message_hook.js';
import { autoLoadCachedPlugins } from './plugin_loader.js';
import { activateCharacterHaptics } from './consent.js';
import { renderHapticChip } from '../render/haptic_chip.js';
// buttplug.js self-registers on import — just ensure it's loaded
import './buttplug.js';

let _booted = false;
let _lastThreadId = null;

/**
 * Initialize the haptic subsystem. Safe to call multiple times.
 * Non-blocking, non-throwing — haptic failures never break chat.
 */
export async function initHapticSubsystem() {
  if (_booted) return;
  _booted = true;

  try {
    // 1. Ensure DB tables exist
    await initHapticDb();

    // 2. Load saved settings
    const settings = await loadHapticSettings();

    // 3. Activate saved backend preference
    setActiveBackend(settings.activeBackendId || 'buttplug');

    // 3b. Load any cached third-party plugins
    try { await autoLoadCachedPlugins(); } catch {}

    // 4. Wire control bus → backend stopAll on any stop/error/pause
    onBusEvent('stop', () => { stopAll().catch(() => {}); });
    onBusEvent('pause', () => { stopAll().catch(() => {}); });
    onBusEvent('error', () => { stopAll().catch(() => {}); });

    // 5. Mount UI (deferred to next tick so DOM is ready)
    setTimeout(() => {
      try { mountHapticChip(); } catch (e) {
        console.warn('[haptic:init] chip mount failed:', e && e.message);
      }
      try { initMessageHook(); } catch (e) {
        console.warn('[haptic:init] message hook failed:', e && e.message);
      }
    }, 0);

    // 6. Watch for character/thread switches to activate haptics
    _startCharacterWatcher();

  } catch (err) {
    console.warn('[haptic:init] subsystem init failed:', err && err.message);
  }
}

/**
 * Mount the device status chip + pause button into the chat header.
 */
function mountHapticChip() {
  if (typeof document === 'undefined') return;

  const header = document.querySelector('.chat-header')
              || document.querySelector('#chatHeader')
              || document.querySelector('[data-chat-header]');

  if (!header) {
    setTimeout(() => { try { mountHapticChip(); } catch {} }, 2000);
    return;
  }

  if (header.querySelector('.pf-haptic-chip')) return;

  const chipContainer = document.createElement('div');
  chipContainer.className = 'pf-haptic-chip-container';
  chipContainer.setAttribute('data-haptic-chip', '');
  header.appendChild(chipContainer);
  renderHapticChip(chipContainer);
}

/**
 * Poll for character/thread changes and activate haptics.
 * Upstream Perchance sets window.currentThreadId and provides
 * window.db.threads/characters for lookups. We poll since there's
 * no event API for thread switches.
 */
function _startCharacterWatcher() {
  if (typeof window === 'undefined') return;

  const CHECK_MS = 2000;

  async function check() {
    try {
      const threadId = window.currentThreadId || null;
      if (!threadId || threadId === _lastThreadId) return;
      _lastThreadId = threadId;

      // Look up the thread → character
      if (!window.db || !window.db.threads || !window.db.characters) return;
      const thread = await window.db.threads.get(threadId);
      if (!thread || !thread.characterId) return;
      const character = await window.db.characters.get(thread.characterId);
      if (!character) return;

      // Activate haptics for this character (shows consent gate if needed)
      activateCharacterHaptics(character).catch(() => {});
    } catch {
      // Non-fatal — keep polling
    }
  }

  // Initial check
  setTimeout(check, 1000);
  // Poll for changes
  setInterval(check, CHECK_MS);
}

/**
 * Check if haptics are globally available (subsystem booted).
 */
export function isHapticSubsystemReady() {
  return _booted;
}

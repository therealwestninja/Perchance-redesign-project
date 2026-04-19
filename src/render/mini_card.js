// render/mini_card.js
//
// Builds the compact sidebar mini-card: avatar, display name, level chip,
// XP progress bar. Clicking the card fires an onOpen callback — the
// callers hooks this up to openFullPage() to open the hero profile overlay.
//
// This module only produces DOM. It does not read IDB, does not compute
// stats, does not persist state. Data flows in via the update(vm) method
// attached to the returned root element.

import { h, replaceContents, escapeCssUrl } from '../utils/dom.js';
import { formatNumber, formatPercent, getInitialFromName } from '../utils/format.js';

/**
 * @typedef {Object} MiniCardViewModel
 * @property {string} displayName
 * @property {string|null} avatarUrl        URL or null for monogram fallback
 * @property {number} level
 * @property {number} xpIntoLevel
 * @property {number} xpForNextLevel
 * @property {number} progress01            0..1 progress toward next level
 * @property {number} [pendingCount]        count of unseen noteworthy events
 * @property {boolean} [isFreshlyIncreased] true if pendingCount just rose
 *                                          this refresh — triggers a brief
 *                                          louder pulse to draw the eye
 */

/**
 * Create the mini-card element. Returns the root with an `update(vm)` method
 * attached so callers can refresh without rebuilding the DOM.
 *
 * @param {{ onOpen?: () => void }} [opts]
 * @returns {HTMLElement & { update: (vm: MiniCardViewModel) => void }}
 */
export function createMiniCard({ onOpen } = {}) {
  const avatarEl = h('div', { class: 'pf-mini-avatar' });
  const nameEl = h('div', { class: 'pf-mini-name' });
  const levelEl = h('div', { class: 'pf-mini-level' });
  const metaEl = h('div', { class: 'pf-mini-meta' });
  const barFillEl = h('div', { class: 'pf-mini-bar-fill', style: { width: '0%' } });

  // Fresh-pulse timer: when isFreshlyIncreased fires, we apply the
  // pf-mini-card-fresh class for ~10s then strip it so the amplified
  // "hey look" pulse settles back into the ambient pending pulse.
  // Stored at closure scope so successive updates can cancel-and-restart
  // the timer — a second landing during the window extends the attention-
  // grab rather than cutting it short.
  let freshPulseTimerId = null;
  // Duration is a little longer than the CSS (~9.9s for 3 iterations)
  // so the class-strip always follows the final paint tick.
  const FRESH_PULSE_MS = 10500;

  const root = h('div', {
    class: 'pf-mini-card',
    role: 'button',
    tabindex: '0',
    'aria-label': 'Open profile',
    onClick: () => {
      // User engaged — cancel any in-flight fresh-pulse so re-opening
      // the profile doesn't leave the card "waving" after the user has
      // clearly seen the signal.
      if (freshPulseTimerId !== null) {
        try { clearTimeout(freshPulseTimerId); } catch { /* non-fatal */ }
        freshPulseTimerId = null;
        root.classList.remove('pf-mini-card-fresh');
      }
      if (typeof onOpen === 'function') onOpen();
    },
    onKeydown: (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        if (freshPulseTimerId !== null) {
          try { clearTimeout(freshPulseTimerId); } catch { /* non-fatal */ }
          freshPulseTimerId = null;
          root.classList.remove('pf-mini-card-fresh');
        }
        if (typeof onOpen === 'function') onOpen();
      }
    },
  }, [
    avatarEl,
    h('div', { class: 'pf-mini-info' }, [
      h('div', { class: 'pf-mini-row' }, [
        nameEl,
        levelEl,
      ]),
      metaEl,
      h('div', { class: 'pf-mini-bar' }, [barFillEl]),
    ]),
    h('div', { class: 'pf-mini-chevron', 'aria-hidden': 'true' }, ['›']),
  ]);

  /**
   * Refresh the mini-card's displayed values without rebuilding DOM.
   */
  root.update = function update(vm) {
    vm = vm || {};

    // Avatar: image if provided, else monogram fallback
    if (vm.avatarUrl) {
      avatarEl.style.backgroundImage = `url("${escapeCssUrl(vm.avatarUrl)}")`;
      replaceContents(avatarEl, []);
      avatarEl.classList.remove('pf-mini-avatar-text');
    } else {
      avatarEl.style.backgroundImage = '';
      avatarEl.classList.add('pf-mini-avatar-text');
      replaceContents(avatarEl, [getInitialFromName(vm.displayName)]);
    }

    // Text content — text nodes only, never innerHTML
    replaceContents(nameEl, [vm.displayName || 'Chronicler']);
    replaceContents(levelEl, [`Lv ${vm.level || 1}`]);

    const pct = formatPercent(vm.progress01 || 0);
    replaceContents(metaEl, [
      `${formatNumber(vm.xpIntoLevel)} / ${formatNumber(vm.xpForNextLevel)} XP · ${pct}`,
    ]);

    barFillEl.style.width = pct;

    // Pulse / indicator dot when there are unseen noteworthy events.
    // Covers: newly-unlocked achievements, a new week's prompts the user
    // hasn't acknowledged, and active holiday/observance events.
    const hasPending = Number(vm.pendingCount) > 0;
    root.classList.toggle('pf-mini-card-pending', hasPending);
    avatarEl.classList.toggle('pf-mini-avatar-has-dot', hasPending);

    // Fresh landing? Apply the louder "friendly neighbor waving" pulse
    // for ~10s. Cancel any prior timer so a rapid-succession of landings
    // (two achievements in a row) extends the attention-grab rather than
    // resetting to the ambient pulse mid-burst.
    if (vm.isFreshlyIncreased && hasPending) {
      if (freshPulseTimerId !== null) {
        try { clearTimeout(freshPulseTimerId); } catch { /* non-fatal */ }
      }
      root.classList.add('pf-mini-card-fresh');
      freshPulseTimerId = setTimeout(() => {
        root.classList.remove('pf-mini-card-fresh');
        freshPulseTimerId = null;
      }, FRESH_PULSE_MS);
    }

    // aria-label gets the count so screen readers announce it.
    if (hasPending) {
      const n = Number(vm.pendingCount);
      const noun = n === 1 ? 'thing' : 'things';
      root.setAttribute('aria-label', `Open profile — ${n} new ${noun} to see`);
    } else {
      root.setAttribute('aria-label', 'Open profile');
    }
  };

  // Initial render with empty-but-safe values
  root.update({
    displayName: '',
    avatarUrl: null,
    level: 1,
    xpIntoLevel: 0,
    xpForNextLevel: 100,
    progress01: 0,
    pendingCount: 0,
  });

  return root;
}

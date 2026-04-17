// render/mini_card.js
//
// Builds the compact sidebar mini-card: avatar, display name, level chip,
// XP progress bar. Clicking the card fires an onOpen callback (for the
// future full-hero-card modal).
//
// This module only produces DOM. It does not read IDB, does not compute
// stats, does not persist state. Data flows in via updateMiniCard(el, viewModel).

import { h, replaceContents } from '../utils/dom.js';
import { formatNumber, formatPercent, getInitialFromName } from '../utils/format.js';

/**
 * @typedef {Object} MiniCardViewModel
 * @property {string} displayName
 * @property {string|null} avatarUrl        URL or null for monogram fallback
 * @property {number} level
 * @property {number} xpIntoLevel
 * @property {number} xpForNextLevel
 * @property {number} progress01            0..1 progress toward next level
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

  const root = h('div', {
    class: 'pf-mini-card',
    role: 'button',
    tabindex: '0',
    'aria-label': 'Open profile',
    onClick: () => { if (typeof onOpen === 'function') onOpen(); },
    onKeydown: (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
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
  };

  // Initial render with empty-but-safe values
  root.update({
    displayName: '',
    avatarUrl: null,
    level: 1,
    xpIntoLevel: 0,
    xpForNextLevel: 100,
    progress01: 0,
  });

  return root;
}

/**
 * Minimal escaping for a value that goes into a CSS url(...). Blocks
 * the two characters that could break out of the quoted URL.
 */
function escapeCssUrl(url) {
  return String(url || '').replace(/["\\]/g, '\\$&');
}

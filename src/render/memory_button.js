// render/memory_button.js
//
// Small sidebar button that opens the Memory & Lore window. Sits
// below the mini-card as a separate element, so clicking it doesn't
// interact with the profile-open behavior.
//
// Pure DOM. Wired to openMemoryWindow by the caller.

import { h } from '../utils/dom.js';

/**
 * @param {{ onClick?: () => void }} [opts]
 * @returns {HTMLElement}
 */
export function createMemoryButton({ onClick } = {}) {
  const btn = h('button', {
    type: 'button',
    class: 'pf-memory-button',
    'aria-label': 'Open Memory & Lore',
    onClick: (ev) => {
      ev.stopPropagation();
      if (typeof onClick === 'function') onClick();
    },
  }, [
    h('span', { class: 'pf-memory-button-icon', 'aria-hidden': 'true' }, ['🧠']),
    h('span', { class: 'pf-memory-button-label' }, ['Memory & Lore']),
  ]);
  return btn;
}

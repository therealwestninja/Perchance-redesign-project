// render/overlay.js
//
// Full-screen overlay used by the hero profile. Fixed positioning, fills
// the viewport, dark backdrop, centered content column with max-width,
// scrolls internally. Close via: close button, ESC key, click on backdrop.

import { h } from '../utils/dom.js';

/**
 * Create a dismissible overlay.
 *
 * @param {{
 *   ariaLabel?: string,
 *   children?: any,
 *   onClose?: () => void,
 * }} opts
 * @returns {HTMLElement & { show: () => void, hide: () => void }}
 */
export function createOverlay({ ariaLabel = 'Overlay', children = [], onClose } = {}) {
  const closeBtn = h('button', {
    class: 'pf-overlay-close',
    type: 'button',
    'aria-label': 'Close',
    onClick: () => dismiss(),
  }, ['×']);

  const contentCol = h('div', { class: 'pf-overlay-content' }, children);

  const scroll = h('div', {
    class: 'pf-overlay-scroll',
    // Click on the scroll container (outside the content column) dismisses
    onClick: (ev) => { if (ev.target === scroll) dismiss(); },
  }, [
    closeBtn,
    contentCol,
  ]);

  const root = h('div', {
    class: 'pf-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': ariaLabel,
    hidden: true,
  }, [scroll]);

  function dismiss() {
    root.hide();
    if (typeof onClose === 'function') onClose();
  }

  function onKeydown(ev) {
    if (ev.key === 'Escape' && !root.hidden) {
      ev.preventDefault();
      dismiss();
    }
  }

  root.show = function show() {
    if (!root.parentNode) document.body.appendChild(root);
    root.hidden = false;
    document.addEventListener('keydown', onKeydown);
    // Move focus into the dialog so screen readers pick it up and
    // Tab is trapped inside the scroll container naturally.
    setTimeout(() => { closeBtn.focus(); }, 0);
  };

  root.hide = function hide() {
    root.hidden = true;
    document.removeEventListener('keydown', onKeydown);
  };

  return root;
}

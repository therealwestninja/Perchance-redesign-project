// render/toast.js
//
// Lightweight toast notifications. Stacks messages in the bottom
// right, each auto-dismisses after a few seconds, click to dismiss
// early. Safe to call from anywhere in the profile flow — the
// container self-installs on first use and lives for the page
// lifetime.
//
// Kept deliberately simple: no queue prioritization, no animations
// beyond fade, no action buttons. If we later want richer
// notifications (action buttons, prioritized undo toasts, etc.) we
// can extend here or build a dedicated module.

import { h } from '../utils/dom.js';

const CONTAINER_ID = 'pf-toast-container';

function ensureContainer() {
  let el = document.getElementById(CONTAINER_ID);
  if (el) return el;
  el = h('div', {
    id: CONTAINER_ID,
    class: 'pf-toast-container',
    'aria-live': 'polite',
    'aria-atomic': 'false',
  });
  document.body.appendChild(el);
  return el;
}

/**
 * Show a toast. Returns a handle with `.dismiss()` in case the
 * caller wants to close it early. Auto-dismisses after `ms`.
 *
 * @param {string|HTMLElement} content - string or DOM node
 * @param {{ ms?: number, kind?: 'ok'|'info'|'celebrate'|'warn' }} [opts]
 */
export function showToast(content, { ms = 5000, kind = 'info' } = {}) {
  const container = ensureContainer();
  const child = typeof content === 'string'
    ? document.createTextNode(content)
    : content;

  const toast = h('div', {
    class: `pf-toast pf-toast-${kind}`,
    role: 'status',
    onClick: () => dismiss(),
    title: 'Click to dismiss',
  }, [child]);
  // Force a reflow so the CSS transition fires on the add.
  container.appendChild(toast);
  void toast.offsetWidth;
  toast.classList.add('pf-toast-visible');

  let dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    toast.classList.remove('pf-toast-visible');
    setTimeout(() => {
      try { container.removeChild(toast); } catch {}
      // Clean up the container if this was the last toast.
      if (container.childNodes.length === 0 && container.parentNode) {
        try { container.parentNode.removeChild(container); } catch {}
      }
    }, 220);
  }

  if (ms > 0) setTimeout(dismiss, ms);

  return { dismiss };
}

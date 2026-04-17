// profile/mount.js
//
// Waits for the upstream sidebar to appear, then injects our stylesheet
// and the mini-card as the first child of #leftColumn — above the
// #newThreadButton row.
//
// Mount strategy:
//   1. On script start, check whether #leftColumn already exists.
//   2. If not, set up a brief polling loop + MutationObserver fallback.
//   3. When it appears, inject once. We do not remount if the element is
//      later removed — upstream doesn't remove it in normal operation.

import { injectStylesheet } from './styles_install.js';

const MOUNT_ID = 'pf-mini-card-slot';
const TARGET_SELECTOR = '#leftColumn';
const POLL_INTERVAL_MS = 100;
const POLL_TIMEOUT_MS = 30_000;

/**
 * Wait for a selector to exist in the DOM, then resolve with the element.
 * Uses requestAnimationFrame polling rather than MutationObserver for
 * simplicity and predictable cleanup.
 *
 * @param {string} selector
 * @param {number} timeoutMs
 * @returns {Promise<Element|null>}
 */
function waitForElement(selector, timeoutMs = POLL_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) { resolve(existing); return; }

    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      const el = document.querySelector(selector);
      if (el) { resolve(el); return; }
      if (Date.now() > deadline) { resolve(null); return; }
      setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();
  });
}

/**
 * Mount the mini-card.
 *
 * @param {{
 *   buildElement: () => HTMLElement,
 *   onMounted?: (el: HTMLElement) => void,
 * }} opts
 * @returns {Promise<HTMLElement|null>} the mounted element, or null on timeout
 */
export async function mountMiniCard({ buildElement, onMounted }) {
  injectStylesheet();

  const sidebar = await waitForElement(TARGET_SELECTOR);
  if (!sidebar) return null;

  // If we somehow already mounted, don't double-inject.
  const existing = sidebar.querySelector(`#${MOUNT_ID}`);
  if (existing) return existing;

  const slot = document.createElement('div');
  slot.id = MOUNT_ID;

  const card = buildElement();
  slot.appendChild(card);

  // Insert as the first child of the sidebar, above the new-chat-button row.
  sidebar.insertBefore(slot, sidebar.firstChild);

  if (typeof onMounted === 'function') {
    try { onMounted(card); } catch (e) { /* swallow — card must not crash Perchance */ }
  }

  return card;
}

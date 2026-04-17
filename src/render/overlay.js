// render/overlay.js
//
// Full-screen overlay used by the hero profile. Fixed positioning, fills
// the viewport, dark backdrop, centered content column with max-width,
// scrolls internally. Close via: close button, ESC key, click on backdrop.
//
// Focus mode: a "clean view for screenshot" state. Called via setFocused(true).
// Hides everything except the splash, centers it, keeps a discreet exit.
// ESC has staged behavior — if focused, ESC exits focus; otherwise dismisses.

import { h } from '../utils/dom.js';

/**
 * Create a dismissible overlay.
 *
 * @param {{
 *   ariaLabel?: string,
 *   children?: any,
 *   onClose?: () => void,
 * }} opts
 * @returns {HTMLElement & {
 *   show: () => void,
 *   hide: () => void,
 *   setFocused: (focused: boolean) => void,
 * }}
 */
export function createOverlay({ ariaLabel = 'Overlay', children = [], onClose } = {}) {
  const closeBtn = h('button', {
    class: 'pf-overlay-close',
    type: 'button',
    'aria-label': 'Close',
    onClick: () => dismiss(),
  }, ['×']);

  const contentCol = h('div', { class: 'pf-overlay-content' }, children);

  // Hint that shows up only in focus mode to tell the user how to get out.
  // Fades itself after a moment so it doesn't clutter their screenshot
  // if they're slow to click the shutter.
  const focusHint = h('div', {
    class: 'pf-overlay-focus-hint',
    'aria-hidden': 'true',
  }, ['Tap anywhere or press Esc to exit']);

  const scroll = h('div', {
    class: 'pf-overlay-scroll',
    onClick: (ev) => {
      if (isFocused && ev.target !== closeBtn) {
        // In focus mode, a click anywhere returns you to the full profile.
        // Convenient — matches how most photo/lightbox apps behave.
        setFocused(false);
        return;
      }
      // Normal mode: click on the scroll container (outside the content column) dismisses
      if (ev.target === scroll) dismiss();
    },
  }, [
    closeBtn,
    contentCol,
    focusHint,
  ]);

  const root = h('div', {
    class: 'pf-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': ariaLabel,
    hidden: true,
  }, [scroll]);

  let isFocused = false;
  let hintFadeTimer = null;

  function dismiss() {
    // Clean up focus state so reopening the overlay isn't in focus mode
    if (isFocused) setFocused(false);
    root.hide();
    if (typeof onClose === 'function') onClose();
  }

  function onKeydown(ev) {
    if (root.hidden) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      // Staged dismiss: Esc in focus mode exits focus, Esc again closes
      if (isFocused) setFocused(false);
      else           dismiss();
    }
  }

  function setFocused(focused) {
    isFocused = !!focused;
    root.classList.toggle('pf-overlay-focused', isFocused);

    // Cancel any pending hint fade
    if (hintFadeTimer) { clearTimeout(hintFadeTimer); hintFadeTimer = null; }

    if (isFocused) {
      // Scroll to top so the splash is centered, no leftover scroll offset
      try { scroll.scrollTop = 0; } catch {}
      // Show hint, then fade after a few seconds so screenshots are clean
      focusHint.classList.remove('pf-overlay-focus-hint-fading');
      hintFadeTimer = setTimeout(() => {
        focusHint.classList.add('pf-overlay-focus-hint-fading');
      }, 3500);
    } else {
      focusHint.classList.remove('pf-overlay-focus-hint-fading');
    }
  }

  root.show = function show() {
    if (!root.parentNode) document.body.appendChild(root);
    root.hidden = false;
    document.addEventListener('keydown', onKeydown);
    setTimeout(() => { closeBtn.focus(); }, 0);
  };

  root.hide = function hide() {
    root.hidden = true;
    document.removeEventListener('keydown', onKeydown);
    if (hintFadeTimer) { clearTimeout(hintFadeTimer); hintFadeTimer = null; }
  };

  root.setFocused = setFocused;

  return root;
}

// render/share_dialog.js
//
// Dialog shown when the user wants to share their profile card.
// Renders a PNG via share_card.renderShareCard, previews it, and
// offers Download / Copy / (if supported) native Share actions.
//
// Self-contained — accepts a view-model and an overlay-mounter;
// no direct dependency on full_page.js so it can be composed from
// elsewhere later (e.g., Milestones page, summary-notifications).

import { h, replaceContents } from '../utils/dom.js';
import { renderShareCard, toShareViewModel } from './share_card.js';
import { createOverlay } from './overlay.js';

/**
 * Open a share dialog on top of the current UI. Self-installs its
 * own overlay (separate from the main profile overlay) so the user
 * doesn't lose their place when they close the card.
 *
 * @param {object} vm    raw inputs; passed through toShareViewModel
 *                       for whitelist filtering
 */
export async function openShareDialog(vm) {
  const safeVm = toShareViewModel(vm || {});

  const previewImg = h('img', {
    class: 'pf-share-preview',
    alt: 'Your profile card',
  });
  const status = h('div', { class: 'pf-share-status', 'aria-live': 'polite' });

  let blob = null;
  try {
    blob = await renderShareCard(safeVm);
  } catch (e) {
    status.textContent = `Couldn't render the card: ${(e && e.message) || e}`;
    status.className = 'pf-share-status pf-share-status-err';
  }
  if (blob) {
    previewImg.src = URL.createObjectURL(blob);
  }

  const downloadBtn = h('button', {
    type: 'button',
    class: 'pf-mem-btn pf-mem-btn-primary',
    disabled: !blob,
    onClick: () => {
      if (!blob) return;
      const filename = `${sanitizeFilename(safeVm.displayName)}-profile.png`;
      const a = h('a', { href: URL.createObjectURL(blob), download: filename });
      document.body.appendChild(a);
      try { a.click(); } finally { a.remove(); }
      flash(status, 'Saved.', 'ok');
    },
  }, ['Download PNG']);

  const copyBtn = h('button', {
    type: 'button',
    class: 'pf-mem-btn pf-mem-btn-secondary',
    disabled: !blob || typeof ClipboardItem === 'undefined',
    title: typeof ClipboardItem === 'undefined'
      ? 'Clipboard image copy not supported in this browser'
      : 'Copy card to clipboard',
    onClick: async () => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob }),
        ]);
        flash(status, 'Copied to clipboard.', 'ok');
      } catch (e) {
        flash(status, `Copy failed: ${(e && e.message) || 'browser blocked it'}`, 'err');
      }
    },
  }, ['Copy image']);

  // Web Share API — if available, many mobile browsers will route
  // this to the native share sheet (Messages, mail, social apps).
  // We only render the button when support is present so desktop
  // users don't see a non-functional button.
  let shareBtn = null;
  const canShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    blob && navigator.canShare({
      files: [new File([blob], 'profile.png', { type: blob.type })],
    });
  if (canShare) {
    shareBtn = h('button', {
      type: 'button',
      class: 'pf-mem-btn pf-mem-btn-secondary',
      onClick: async () => {
        try {
          const file = new File([blob], 'profile.png', { type: blob.type });
          await navigator.share({
            files: [file],
            title: `${safeVm.displayName}'s profile`,
            text: `Lv ${safeVm.level} · ${safeVm.title}`,
          });
        } catch (e) {
          // User-canceled share is noisy on some platforms — swallow AbortError
          if (e && e.name !== 'AbortError') {
            flash(status, `Share failed: ${e.message || e}`, 'err');
          }
        }
      },
    }, ['Share…']);
  }

  const closeBtn = h('button', {
    type: 'button',
    class: 'pf-mem-btn pf-mem-btn-neutral',
    onClick: () => overlay.hide(),
  }, ['Close']);

  const privacyNote = h('p', { class: 'pf-share-privacy' }, [
    'Only your display name, avatar, earned title, level, archetype, ',
    'and achievement badges appear on the card. Bio and personal ',
    'details are never included.',
  ]);

  const overlay = createOverlay({
    ariaLabel: 'Share your profile card',
    children: [
      h('div', { class: 'pf-share-body' }, [
        h('h2', { class: 'pf-mem-title' }, ['Profile card']),
        previewImg,
        status,
        privacyNote,
        h('div', { class: 'pf-share-actions' },
          [downloadBtn, copyBtn, shareBtn, closeBtn].filter(Boolean)
        ),
      ]),
    ],
  });
  overlay.show();
}

// ---- helpers ----

function flash(el, text, kind) {
  el.textContent = text;
  el.className = `pf-share-status pf-share-status-${kind === 'err' ? 'err' : 'ok'}`;
  setTimeout(() => {
    if (el.textContent === text) {
      el.textContent = '';
      el.className = 'pf-share-status';
    }
  }, 2500);
}

function sanitizeFilename(name) {
  return String(name || 'profile')
    .replace(/[^\w\-]/g, '_')
    .slice(0, 32) || 'profile';
}

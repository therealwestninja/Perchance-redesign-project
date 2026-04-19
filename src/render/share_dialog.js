// render/share_dialog.js
//
// Dialog shown when the user wants to share their profile.
//
// Produces a short, versioned share code (see profile/share_code.js)
// — a text string the user can paste anywhere that accepts text.
// No PNG, no avatar data, nothing you can't read with your eyes.
// The card is now something you COPY, not something you DOWNLOAD.
//
// Why text-only: simpler (no canvas/blob pipeline), safer (no image
// metadata to audit, no clipboard-write permission needed beyond
// plain text), and it pastes cleanly into chat, DMs, forums, etc.
// When we want to add new fields later we bump the format version
// in share_code.js; old codes stay decodable.

import { h } from '../utils/dom.js';
import { encodeShareCode, toShareViewModel } from '../profile/share_code.js';
import { createOverlay } from './overlay.js';

/**
 * Open the share dialog. Renders a read-only textarea with the
 * user's share code and offers Copy + (optional) native Share.
 *
 * @param {object} vm   raw view-model, same shape the old PNG path
 *                      accepted. toShareViewModel filters it.
 */
export async function openShareDialog(vm) {
  const safeVm = toShareViewModel(vm || {});
  const code = encodeShareCode(safeVm);

  const status = h('div', { class: 'pf-share-status', 'aria-live': 'polite' });

  // Read-only code box. Textarea (not input) so long codes wrap
  // cleanly instead of horizontally scrolling. readonly + select
  // all on focus for easy keyboard-copy workflow.
  const codeBox = h('textarea', {
    class: 'pf-share-code',
    readonly: true,
    rows: '4',
    spellcheck: 'false',
    'aria-label': 'Your share code',
    onClick: (e) => { try { e.target.select(); } catch { /* non-fatal */ } },
    onFocus: (e) => { try { e.target.select(); } catch { /* non-fatal */ } },
  });
  codeBox.value = code;

  // Human-readable preview of what's packed into the code, so users
  // can see what they're about to paste. Purely decorative — the
  // code itself is the source of truth.
  const badgePreview = (safeVm.pinnedBadges || [])
    .map(b => b.icon || '◆').join(' ');
  const previewLines = [
    h('div', { class: 'pf-share-preview-name' }, [safeVm.displayName]),
    h('div', { class: 'pf-share-preview-sub' }, [
      `Lv ${safeVm.level} · ${safeVm.title}` +
      (safeVm.archetype ? ` · ${safeVm.archetype}` : ''),
    ]),
    badgePreview
      ? h('div', { class: 'pf-share-preview-badges' }, [badgePreview])
      : null,
  ].filter(Boolean);

  const previewCard = h('div', { class: 'pf-share-preview' }, previewLines);

  const copyBtn = h('button', {
    type: 'button',
    class: 'pf-mem-btn pf-mem-btn-primary',
    onClick: async () => {
      try {
        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(code);
        } else {
          // Fallback: rely on the textarea select + execCommand
          codeBox.focus();
          codeBox.select();
          try { document.execCommand('copy'); }
          catch { throw new Error('clipboard not supported'); }
        }
        flash(status, 'Copied to clipboard.', 'ok');
      } catch (e) {
        flash(status, `Copy failed: ${(e && e.message) || 'browser blocked it'}`, 'err');
      }
    },
  }, ['Copy code']);

  // Web Share API — text share is broadly supported on mobile
  // without the file-upload gating the old PNG flow needed.
  let shareBtn = null;
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    shareBtn = h('button', {
      type: 'button',
      class: 'pf-mem-btn pf-mem-btn-secondary',
      onClick: async () => {
        try {
          await navigator.share({
            title: `${safeVm.displayName}'s profile`,
            text: code,
          });
        } catch (e) {
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
    'Share codes contain only your display name, earned title, ',
    'level, archetype, and pinned badges. Bio, personal details, ',
    'and avatar image are never included.',
  ]);

  const overlay = createOverlay({
    ariaLabel: 'Share your profile',
    children: [
      h('div', { class: 'pf-share-body' }, [
        h('h2', { class: 'pf-mem-title' }, ['Share your profile']),
        previewCard,
        h('label', { class: 'pf-share-code-label' }, ['Share code']),
        codeBox,
        status,
        privacyNote,
        h('div', { class: 'pf-share-actions' },
          [copyBtn, shareBtn, closeBtn].filter(Boolean)
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

// render/share_dialog.js
//
// Dialog shown when the user wants to share their profile.
//
// Produces a shareable URL with the profile data encoded in a `?h=`
// query parameter. The URL is fully clickable — when someone visits
// it, the boot code reads `?h=` and opens a card viewer showing the
// shared profile.
//
// Why URL instead of raw code: URLs are clickable, pasteable, and
// auto-preview in most chat/social platforms. The underlying data is
// the same share code (pf1:<base64url JSON>) that was always used —
// now it's just wrapped in a URL.
//
// Privacy: same contract as before. Only public-display fields
// (name, title, archetype, level, accent, badges, XP) are included.
// No avatar, no bio, no personal details.

import { h } from '../utils/dom.js';
import { encodeShareCode, decodeShareCode, toShareViewModel, buildShareUrl } from '../profile/share_code.js';
import { createOverlay } from './overlay.js';

/**
 * Open the share dialog. Renders a read-only URL with the user's
 * profile data and offers Copy Link + (optional) native Share.
 *
 * @param {object} vm   raw view-model (same shape the old paths
 *                      accepted). toShareViewModel filters it.
 */
export async function openShareDialog(vm) {
  const safeVm = toShareViewModel(vm || {});
  const code = encodeShareCode(safeVm);
  const shareUrl = buildShareUrl(code);

  const status = h('div', { class: 'pf-share-status', 'aria-live': 'polite' });

  // Read-only URL box. Textarea so long URLs wrap cleanly.
  const urlBox = h('textarea', {
    class: 'pf-share-code',
    readonly: true,
    rows: '3',
    spellcheck: 'false',
    'aria-label': 'Your share link',
    onClick: (e) => { try { e.target.select(); } catch { /* non-fatal */ } },
    onFocus: (e) => { try { e.target.select(); } catch { /* non-fatal */ } },
  });
  urlBox.value = shareUrl;

  // Human-readable preview of what's in the link.
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
          await navigator.clipboard.writeText(shareUrl);
        } else {
          urlBox.focus();
          urlBox.select();
          try { document.execCommand('copy'); }
          catch { throw new Error('clipboard not supported'); }
        }
        flash(status, 'Link copied!', 'ok');
      } catch (e) {
        flash(status, `Copy failed: ${(e && e.message) || 'browser blocked it'}`, 'err');
      }
    },
  }, ['Copy link']);

  // Web Share API — share the URL directly.
  let shareBtn = null;
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    shareBtn = h('button', {
      type: 'button',
      class: 'pf-mem-btn pf-mem-btn-secondary',
      onClick: async () => {
        try {
          await navigator.share({
            title: `${safeVm.displayName}'s profile`,
            url: shareUrl,
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
    'Share links contain only your display name, earned title, ',
    'level, archetype, and pinned badges. Bio, personal details, ',
    'and avatar image are never included.',
  ]);

  // ---- Code-only section (shorter, for pasting in chat) ----
  const codeLabel = h('label', { class: 'pf-share-code-label' }, ['Short code (paste in chat)']);
  const codeBox = h('input', {
    type: 'text',
    class: 'pf-field-input',
    readonly: true,
    value: code,
    style: 'font-family:ui-monospace,monospace;font-size:11px;letter-spacing:0.02em;',
    onClick: (e) => { try { e.target.select(); } catch {} },
    onFocus: (e) => { try { e.target.select(); } catch {} },
  });

  const copyCodeBtn = h('button', {
    type: 'button',
    class: 'pf-mem-btn',
    style: 'font-size:11px;padding:4px 10px;',
    onClick: async () => {
      try {
        if (navigator && navigator.clipboard) await navigator.clipboard.writeText(code);
        else { codeBox.focus(); codeBox.select(); document.execCommand('copy'); }
        flash(status, 'Code copied!', 'ok');
      } catch { flash(status, 'Copy failed', 'err'); }
    },
  }, ['Copy code']);

  const codeRow = h('div', { style: 'display:flex;gap:6px;align-items:center;' }, [
    h('div', { style: 'flex:1;' }, [codeBox]),
    copyCodeBtn,
  ]);

  // ---- "View someone's profile" paste input ----
  const pasteLabel = h('label', { class: 'pf-share-code-label' }, ['View someone\'s profile']);
  const pasteInput = h('input', {
    type: 'text',
    class: 'pf-field-input',
    placeholder: 'Paste a pf2:... or pf1:... code here',
    style: 'font-family:ui-monospace,monospace;font-size:11px;',
  });
  const viewBtn = h('button', {
    type: 'button',
    class: 'pf-mem-btn',
    style: 'font-size:11px;padding:4px 10px;',
    onClick: () => {
      const input = pasteInput.value.trim();
      if (!input) return;
      // Try to extract code from a URL or raw code
      let codeToView = input;
      try {
        const url = new URL(input);
        const h = url.searchParams.get('h');
        if (h) codeToView = h;
      } catch { /* not a URL — treat as raw code */ }
      const decoded = decodeShareCode(codeToView);
      if (decoded) {
        overlay.hide();
        try { openShareViewer(decoded); } catch {}
      } else {
        flash(status, 'Invalid code — must start with pf1: or pf2:', 'err');
      }
    },
  }, ['View']);

  const pasteRow = h('div', { style: 'display:flex;gap:6px;align-items:center;' }, [
    h('div', { style: 'flex:1;' }, [pasteInput]),
    viewBtn,
  ]);

  const overlay = createOverlay({
    ariaLabel: 'Share your profile',
    children: [
      h('div', { class: 'pf-share-body' }, [
        h('h2', { class: 'pf-mem-title' }, ['Share your profile']),
        previewCard,
        h('label', { class: 'pf-share-code-label' }, ['Share link']),
        urlBox,
        codeLabel,
        codeRow,
        status,
        privacyNote,
        h('div', { class: 'pf-share-actions' },
          [copyBtn, shareBtn, closeBtn].filter(Boolean)
        ),
        h('div', { style: 'border-top:1px solid rgba(212,168,85,0.1);margin-top:8px;padding-top:12px;' }, [
          pasteLabel,
          pasteRow,
        ]),
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

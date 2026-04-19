// render/share_viewer.js
//
// Read-only card viewer that renders a profile from decoded share-link
// data. Triggered on boot when the page URL contains a `?h=` parameter
// carrying a valid share code.
//
// The viewer is an overlay that sits on top of everything, showing the
// shared profile as a styled card: name, title, archetype, level, XP
// bar, accent color, and badges. The card is NOT editable — it's what
// the link recipient sees.
//
// Dismissable via a Close button. After dismissal, the URL's `?h=`
// parameter is cleaned so a page refresh doesn't re-show the viewer.

import { h } from '../utils/dom.js';
import { createOverlay } from './overlay.js';

/**
 * Render the share-link card viewer.
 *
 * @param {object} vm  decoded view-model from decodeShareCode, with
 *   fields: displayName, title, archetype, level, accent, pinnedBadges,
 *   xpIntoLevel, xpForNextLevel, progress01
 * @returns {{ overlay: object }}  the overlay instance for lifecycle
 */
export function openShareViewer(vm) {
  if (!vm) return { overlay: null };

  const accentHex = vm.accent ? `#${vm.accent}` : '#d8b36a';

  // XP bar
  const progress = Math.max(0, Math.min(1, vm.progress01 || 0));
  const xpBarFill = h('div', {
    class: 'pf-sv-xp-fill',
    style: `width:${Math.round(progress * 100)}%;background:${accentHex};`,
  });
  const xpBar = h('div', { class: 'pf-sv-xp-bar' }, [xpBarFill]);
  const xpLabel = h('div', { class: 'pf-sv-xp-label' }, [
    `${vm.xpIntoLevel || 0} / ${vm.xpForNextLevel || 1} XP`,
  ]);

  // Badges row
  const badgeNodes = (vm.pinnedBadges || []).map(b =>
    h('span', {
      class: 'pf-sv-badge',
      title: b.name || '',
    }, [b.icon || '◆'])
  );

  // Subtitle line: "Lv 5 · Earned Title · Archetype"
  const subParts = [`Lv ${vm.level || 1}`, vm.title || 'Newcomer'];
  if (vm.archetype) subParts.push(vm.archetype);
  const subtitle = subParts.join(' · ');

  // Card body
  const card = h('div', {
    class: 'pf-sv-card',
    style: `border-color:${accentHex};`,
  }, [
    h('div', { class: 'pf-sv-name', style: `color:${accentHex};` }, [
      vm.displayName || 'Chronicler',
    ]),
    h('div', { class: 'pf-sv-sub' }, [subtitle]),
    badgeNodes.length > 0
      ? h('div', { class: 'pf-sv-badges' }, badgeNodes)
      : null,
    xpBar,
    xpLabel,
  ].filter(Boolean));

  // Close button
  const closeBtn = h('button', {
    type: 'button',
    class: 'pf-mem-btn pf-mem-btn-neutral',
    onClick: () => {
      overlay.hide();
      // Clean the URL so a page refresh doesn't re-show the viewer.
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('h');
        const cleanUrl = url.toString();
        if (typeof window.history !== 'undefined' && typeof window.history.replaceState === 'function') {
          window.history.replaceState(null, '', cleanUrl);
        }
      } catch { /* non-fatal — URL stays but viewer is closed */ }
    },
  }, ['Close']);

  const body = h('div', { class: 'pf-sv-body' }, [
    h('div', { class: 'pf-sv-heading' }, ['Shared profile']),
    card,
    h('div', { class: 'pf-sv-actions' }, [closeBtn]),
  ]);

  const overlay = createOverlay({
    ariaLabel: 'Shared profile card',
    children: [body],
  });
  overlay.show();
  return { overlay };
}

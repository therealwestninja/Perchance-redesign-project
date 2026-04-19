// render/splash.js
//
// Above-the-fold identity splash: avatar, display name, title, level + XP bar.
// This is the part people photograph and share. Everything below the fold
// is plainer by design.

import { h, replaceContents, escapeCssUrl } from '../utils/dom.js';
import { formatNumber, formatPercent, getInitialFromName } from '../utils/format.js';

/**
 * @typedef {Object} SplashViewModel
 * @property {string} displayName
 * @property {string|null} avatarUrl
 * @property {string} title
 * @property {number} level
 * @property {number} xpIntoLevel
 * @property {number} xpForNextLevel
 * @property {number} progress01
 * @property {Array<{ id: string, name: string, icon: string }>} pinnedBadges
 */

/**
 * @param {{
 *   onShareClick?: () => void,     // existing: enter focus mode for screenshot
 *   onCardClick?: () => void,      // new: open share card dialog
 * }} [opts]
 */
export function createSplash({ onShareClick, onCardClick } = {}) {
  const avatar = h('div', { class: 'pf-splash-avatar', 'aria-hidden': 'true' });
  const nameEl = h('h1', { class: 'pf-splash-name' });
  const titleEl = h('div', { class: 'pf-splash-title' });
  const archetypeEl = h('div', { class: 'pf-splash-archetype' });
  const levelChip = h('span', { class: 'pf-splash-level' });
  const xpBarFill = h('div', { class: 'pf-splash-xpbar-fill' });
  const xpLabel = h('span', { class: 'pf-splash-xp-label' });
  const badgesRow = h('div', { class: 'pf-splash-badges' });

  // Small "view for screenshot" button, top-right corner of the splash.
  // Only rendered when onShareClick is supplied.
  const focusBtn = typeof onShareClick === 'function'
    ? h('button', {
        class: 'pf-splash-share',
        type: 'button',
        title: 'View for screenshot',
        'aria-label': 'Open a clean, screenshot-ready view of this card',
        onClick: (ev) => { ev.stopPropagation(); onShareClick(); },
      }, [
        // Camera-ish glyph that works in system fonts without needing an icon font
        h('span', { 'aria-hidden': 'true' }, ['◉']),
      ])
    : null;

  // Share-card button, adjacent to the focus button. Opens the share
  // dialog (render PNG, Download/Copy/Share actions). Distinct from
  // focus mode: focus is for manual screenshots; the card is a
  // canvas-rendered PNG that travels predictably regardless of
  // browser zoom, scroll offset, etc.
  const cardBtn = typeof onCardClick === 'function'
    ? h('button', {
        class: 'pf-splash-share pf-splash-card-btn',
        type: 'button',
        title: 'Download a shareable profile card',
        'aria-label': 'Open the shareable profile card dialog',
        onClick: (ev) => { ev.stopPropagation(); onCardClick(); },
      }, [
        // Picture-ish glyph
        h('span', { 'aria-hidden': 'true' }, ['▤']),
      ])
    : null;

  const root = h('div', { class: 'pf-splash' }, [
    focusBtn,
    cardBtn,
    h('div', { class: 'pf-splash-top' }, [
      avatar,
      h('div', { class: 'pf-splash-ident' }, [
        nameEl,
        titleEl,
        archetypeEl,
      ]),
    ]),
    h('div', { class: 'pf-splash-levelrow' }, [
      levelChip,
      h('div', { class: 'pf-splash-xpbar' }, [xpBarFill]),
      xpLabel,
    ]),
    badgesRow,
  ]);

  root.update = function update(vm) {
    vm = vm || {};

    // Avatar — either a background-image or a monogram fallback
    if (vm.avatarUrl) {
      avatar.style.backgroundImage = `url("${escapeCssUrl(vm.avatarUrl)}")`;
      replaceContents(avatar, []);
      avatar.classList.remove('pf-splash-avatar-text');
    } else {
      avatar.style.backgroundImage = '';
      avatar.classList.add('pf-splash-avatar-text');
      replaceContents(avatar, [getInitialFromName(vm.displayName)]);
    }

    replaceContents(nameEl, [vm.displayName || 'Chronicler']);
    replaceContents(titleEl, [vm.title ? `— ${vm.title} —` : '— Newcomer —']);
    // Archetype line — user's play-style classification. Subtle, under
    // the title. Only rendered when we have one; the element stays
    // empty otherwise to avoid reserving layout space.
    if (vm.archetype && vm.archetype.label && vm.archetype.label !== 'Newcomer') {
      replaceContents(archetypeEl, [
        h('span', { class: 'pf-splash-archetype-tag' }, [vm.archetype.label]),
      ]);
    } else {
      replaceContents(archetypeEl, []);
    }

    replaceContents(levelChip, [
      h('span', { class: 'pf-splash-level-word' }, ['Lv']),
      ' ',
      h('strong', {}, [String(vm.level || 1)]),
    ]);

    const pct = formatPercent(vm.progress01 || 0);
    xpBarFill.style.width = pct;
    replaceContents(xpLabel, [
      `${formatNumber(vm.xpIntoLevel)} / ${formatNumber(vm.xpForNextLevel)} XP  ·  ${pct}`,
    ]);

    // Pinned badges — up to 6. Locked slots get a dimmed lock glyph.
    const badges = Array.isArray(vm.pinnedBadges) ? vm.pinnedBadges.slice(0, 6) : [];
    const rendered = [];
    for (let i = 0; i < 6; i++) {
      const b = badges[i];
      if (b) {
        rendered.push(h('span', {
          class: 'pf-splash-badge',
          title: b.name || '',
          'aria-label': b.name || 'Achievement',
        }, [b.icon || '◆']));
      } else {
        rendered.push(h('span', {
          class: 'pf-splash-badge pf-splash-badge-locked',
          title: 'Locked',
          'aria-hidden': 'true',
        }, ['·']));
      }
    }
    replaceContents(badgesRow, rendered);
  };

  return root;
}

// render/share_viewer.js
//
// Read-only card viewer that renders a profile from decoded share-link
// data. Triggered on boot when the page URL contains a `?h=` parameter.
//
// Displays all shared profile data in a visually rich card:
//   - Accent-colored stripe and glow
//   - Circular level badge
//   - Large display name
//   - Title + archetype tags
//   - Full badge gallery with names and icons
//   - Animated XP progress bar
//   - Stats summary row

import { h } from '../utils/dom.js';
import { createOverlay } from './overlay.js';

export function openShareViewer(vm) {
  if (!vm) return { overlay: null };

  const accent = vm.accent ? `#${vm.accent}` : '#d8b36a';
  const progress = Math.max(0, Math.min(1, vm.progress01 || 0));
  const progressPct = Math.round(progress * 100);
  const displayName = vm.displayName || 'Chronicler';
  const level = vm.level || 1;
  const title = vm.title || 'Newcomer';
  const archetype = vm.archetype || null;
  const xpInto = vm.xpIntoLevel || 0;
  const xpFor = vm.xpForNextLevel || 1;
  const badges = vm.pinnedBadges || [];

  function adj(hex, amt) {
    const h2 = (hex || '').replace('#', '');
    const r = Math.max(0, Math.min(255, (parseInt(h2.substring(0,2),16)||0) + amt));
    const g = Math.max(0, Math.min(255, (parseInt(h2.substring(2,4),16)||0) + amt));
    const b = Math.max(0, Math.min(255, (parseInt(h2.substring(4,6),16)||0) + amt));
    return `rgb(${r},${g},${b})`;
  }

  // Level circle
  const levelCircle = h('div', {
    class: 'pf-sv2-level',
    style: `background:linear-gradient(135deg,${accent},${adj(accent,-30)});`
         + `box-shadow:0 0 20px ${accent}44,0 4px 12px rgba(0,0,0,0.4);`,
  }, [
    h('span', { class: 'pf-sv2-level-num' }, [String(level)]),
    h('span', { class: 'pf-sv2-level-label' }, ['LEVEL']),
  ]);

  // Name
  const nameEl = h('div', {
    class: 'pf-sv2-name',
    style: `color:${accent};text-shadow:0 0 24px ${accent}66;`,
  }, [displayName]);

  // Tags (title + archetype)
  const tagsRow = h('div', { class: 'pf-sv2-tags' }, [
    h('span', {
      class: 'pf-sv2-tag',
      style: `border-color:${accent}66;color:${accent};`,
    }, [title]),
    archetype ? h('span', { class: 'pf-sv2-tag pf-sv2-tag-arch' }, [archetype]) : null,
  ].filter(Boolean));

  // Stats row
  const statsRow = h('div', { class: 'pf-sv2-stats' }, [
    mkStat('Level', String(level), accent),
    mkStat('Badges', String(badges.length), accent),
    mkStat('Progress', `${progressPct}%`, accent),
  ]);

  // Badges
  const badgeSection = badges.length > 0
    ? h('div', { class: 'pf-sv2-section' }, [
        h('div', { class: 'pf-sv2-sec-label' }, ['ACHIEVEMENTS']),
        h('div', { class: 'pf-sv2-badges' }, badges.map(b =>
          h('div', { class: 'pf-sv2-badge' }, [
            h('span', { class: 'pf-sv2-badge-icon' }, [b.icon || '◆']),
            h('span', { class: 'pf-sv2-badge-name' }, [b.name || '']),
          ])
        )),
      ])
    : null;

  // XP
  const xpSection = h('div', { class: 'pf-sv2-section' }, [
    h('div', { class: 'pf-sv2-sec-label' }, ['EXPERIENCE']),
    h('div', { class: 'pf-sv2-xp-row' }, [
      h('div', { class: 'pf-sv2-xp-bar' }, [
        h('div', {
          class: 'pf-sv2-xp-fill',
          style: `width:${progressPct}%;`
               + `background:linear-gradient(90deg,${accent},${adj(accent,30)});`
               + `box-shadow:0 0 8px ${accent}88;`,
        }),
      ]),
      h('span', { class: 'pf-sv2-xp-pct' }, [`${progressPct}%`]),
    ]),
    h('div', { class: 'pf-sv2-xp-detail' }, [
      `${xpInto} / ${xpFor} XP to next level`,
    ]),
  ]);

  // Close
  const closeBtn = h('button', {
    type: 'button',
    class: 'pf-sv2-close',
    style: `border-color:${accent}44;`,
    onClick: () => {
      overlay.hide();
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('h');
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', url.toString());
        }
      } catch {}
    },
  }, ['Close']);

  // Card
  const card = h('div', {
    class: 'pf-sv2-card',
    style: `border-color:${accent}33;`,
  }, [
    h('div', {
      class: 'pf-sv2-stripe',
      style: `background:linear-gradient(90deg,${accent}00,${accent},${accent}00);`,
    }),
    levelCircle,
    nameEl,
    tagsRow,
    statsRow,
    badgeSection,
    xpSection,
    closeBtn,
  ].filter(Boolean));

  const body = h('div', { class: 'pf-sv2-body' }, [
    h('div', { class: 'pf-sv2-heading' }, ['✦ SHARED PROFILE ✦']),
    card,
  ]);

  const overlay = createOverlay({
    ariaLabel: 'Shared profile card',
    children: [body],
  });
  overlay.show();
  return { overlay };
}

function mkStat(label, value, accent) {
  return h('div', { class: 'pf-sv2-stat' }, [
    h('div', { class: 'pf-sv2-stat-val', style: `color:${accent};` }, [value]),
    h('div', { class: 'pf-sv2-stat-label' }, [label]),
  ]);
}

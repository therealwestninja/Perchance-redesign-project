// render/memory_panels.js
//
// Three-panel Memory/Lore curation widget with BUBBLE-based grouping:
//
//   [ MEMORY ] [ LORE ] [ DELETE ]
//     └ each bubble: collapsible topic cluster
//         └ individual cards when expanded
//
// Memory and Lore panels independently cluster their entries into topic
// bubbles (via memory/bubbles.js → bubbleize). Each bubble is a
// collapsible container with a header showing label + count. Bubbles
// are drag sources as a whole (drag the header) and drop targets for
// cross-panel promotion/demotion. Individual cards inside an expanded
// bubble are independently draggable.
//
// DRAG SEMANTICS — two kinds of payloads:
//
//   { kind: 'entry',  id,         scope }      single card
//   { kind: 'bubble', entries[],  scope }      entire bubble's contents
//
// DROP HANDLERS branch on payload.kind and payload.scope. Memory column
// accepts lore-scope entries (demote) and lore-scope bubbles (batch
// demote). Lore column accepts memory-scope entries/bubbles (batch
// promote). Delete accepts both.
//
// k-slider: each panel header shows the bubble count with ▲▼ buttons to
// adjust k. Changes re-render (caller-driven via onSetK handler).
//
// EXPAND/COLLAPSE: bubble ids are stable within a session (bubble:0,
// bubble:1, ...). The caller owns the expanded-set; this module just
// reads it and calls onToggleBubble when user clicks the header chevron.

import { h, replaceContents } from '../utils/dom.js';

// Module-scoped drag payload. See the header comment for shape.
let dragPayload = null;

/**
 * @typedef {Object} PanelHandlers
 * @property {(id) => void} [onPromote]            single entry memory → lore
 * @property {(id) => void} [onDemote]             single entry lore → memory
 * @property {(id) => void} [onDelete]             single entry → delete queue
 * @property {(entries) => void} [onBubblePromote] all entries in a bubble
 * @property {(entries) => void} [onBubbleDemote]  all entries in a bubble
 * @property {(entries) => void} [onBubbleDelete]  all entries in a bubble
 * @property {(scope, bubbleId) => void} [onToggleBubble] expand/collapse
 * @property {(scope, bubbleId) => void} [onToggleLock]   toggle lock state
 * @property {(scope, dir) => void} [onChangeK]    +1 or -1 to k for a panel
 */

/**
 * @param {{
 *   memoryBubbles?: Array<import('../memory/bubbles.js').Bubble>,
 *   loreBubbles?:   Array<import('../memory/bubbles.js').Bubble>,
 *   memoryK?: number,
 *   loreK?:   number,
 *   expandedMemoryIds?: Set<string>,
 *   expandedLoreIds?:   Set<string>,
 *   lockedMemoryIds?:   Set<string>,
 *   lockedLoreIds?:     Set<string>,
 *   handlers?: PanelHandlers,
 *   deleteCount?: number,
 * }} [opts]
 * @returns {HTMLElement & { update: (state) => void }}
 */
export function createMemoryPanels({
  memoryBubbles = [],
  loreBubbles = [],
  memoryK = 0,
  loreK = 0,
  expandedMemoryIds = new Set(),
  expandedLoreIds = new Set(),
  lockedMemoryIds = new Set(),
  lockedLoreIds = new Set(),
  handlers = {},
  deleteCount = 0,
} = {}) {

  // Reusable DOM slots — replace contents on every re-render so we
  // don't rebuild the whole panel structure each time.
  const memoryList = h('div', { class: 'pf-mem-list', role: 'list' });
  const loreList   = h('div', { class: 'pf-mem-list', role: 'list' });

  const memoryEntryCount = h('span', { class: 'pf-mem-col-count' });
  const loreEntryCount   = h('span', { class: 'pf-mem-col-count' });

  const memoryKValue = h('span', { class: 'pf-mem-k-value' });
  const loreKValue   = h('span', { class: 'pf-mem-k-value' });

  const deleteCountEl = h('span', { class: 'pf-mem-del-count', 'aria-live': 'polite' });

  const memoryCol = buildColumn({
    scope: 'memory',
    title: 'Memory',
    subtitle: 'current thread',
    list: memoryList,
    entryCountEl: memoryEntryCount,
    kValueEl: memoryKValue,
    handlers,
    acceptsScope: 'lore', // dropping a lore item/bubble here = demote
  });

  const loreCol = buildColumn({
    scope: 'lore',
    title: 'Lore',
    subtitle: 'world bible',
    list: loreList,
    entryCountEl: loreEntryCount,
    kValueEl: loreKValue,
    handlers,
    acceptsScope: 'memory', // dropping a memory item/bubble here = promote
  });

  const deleteCol = buildDeletePanel({ countEl: deleteCountEl, handlers });

  const root = h('div', { class: 'pf-mem-panels' }, [memoryCol, loreCol, deleteCol]);

  function render(state) {
    const s = state || {};
    const memB = s.memoryBubbles || [];
    const lorB = s.loreBubbles || [];
    const memK = Number(s.memoryK) || 0;
    const lorK = Number(s.loreK) || 0;
    const expMem = s.expandedMemoryIds || new Set();
    const expLor = s.expandedLoreIds || new Set();
    const lockMem = s.lockedMemoryIds || new Set();
    const lockLor = s.lockedLoreIds || new Set();
    const delCount = Number(s.deleteCount) || 0;

    // Header counts: total entries across all bubbles (Ungrouped included)
    const memEntryTotal = countEntries(memB);
    const lorEntryTotal = countEntries(lorB);

    memoryEntryCount.textContent = String(memEntryTotal);
    loreEntryCount.textContent   = String(lorEntryTotal);

    memoryKValue.textContent = memEntryTotal > 0 ? String(memK) : '—';
    loreKValue.textContent   = lorEntryTotal > 0 ? String(lorK) : '—';

    deleteCountEl.textContent = delCount === 0
      ? '0 queued'
      : `${delCount} queued for deletion`;

    replaceContents(
      memoryList,
      memB.length > 0
        ? memB.map(b => renderBubble(b, expMem.has(b.id), lockMem.has(b.id), 'memory', handlers))
        : [renderEmptyState('memory')]
    );
    replaceContents(
      loreList,
      lorB.length > 0
        ? lorB.map(b => renderBubble(b, expLor.has(b.id), lockLor.has(b.id), 'lore', handlers))
        : [renderEmptyState('lore')]
    );
  }

  render({
    memoryBubbles, loreBubbles,
    memoryK, loreK,
    expandedMemoryIds, expandedLoreIds,
    lockedMemoryIds, lockedLoreIds,
    deleteCount,
  });
  root.update = render;
  return root;
}

// ---- column builders ----

function buildColumn({
  scope, title, subtitle, list, entryCountEl, kValueEl, handlers, acceptsScope,
}) {
  // k-slider: a triplet of buttons with the current value.
  const kDecBtn = h('button', {
    type: 'button',
    class: 'pf-mem-k-btn',
    'aria-label': `Fewer groups in ${title}`,
    title: 'Fewer groups',
    onClick: (ev) => {
      ev.stopPropagation();
      if (typeof handlers.onChangeK === 'function') handlers.onChangeK(scope, -1);
    },
  }, ['−']);
  const kIncBtn = h('button', {
    type: 'button',
    class: 'pf-mem-k-btn',
    'aria-label': `More groups in ${title}`,
    title: 'More groups',
    onClick: (ev) => {
      ev.stopPropagation();
      if (typeof handlers.onChangeK === 'function') handlers.onChangeK(scope, +1);
    },
  }, ['+']);

  const kControl = h('div', {
    class: 'pf-mem-k-control',
    title: 'Number of topic groups',
  }, [
    kDecBtn,
    kValueEl,
    kIncBtn,
  ]);

  const col = h('section', {
    class: `pf-mem-col pf-mem-col-${scope}`,
    'aria-label': `${title} (${subtitle})`,
  }, [
    h('header', { class: 'pf-mem-col-header' }, [
      h('h3', { class: 'pf-mem-col-title' }, [title]),
      entryCountEl,
      h('span', { class: 'pf-mem-col-sub' }, [subtitle]),
      kControl,
    ]),
    list,
  ]);

  // Drop target wiring. Accepts matching-scope entries and bubbles.
  col.addEventListener('dragover', (ev) => {
    if (!dragPayload) return;
    if (dragPayload.scope !== acceptsScope) return;
    ev.preventDefault();
    col.classList.add('pf-mem-col-drop-over');
  });
  col.addEventListener('dragleave', (ev) => {
    if (!col.contains(ev.relatedTarget)) {
      col.classList.remove('pf-mem-col-drop-over');
    }
  });
  col.addEventListener('drop', (ev) => {
    ev.preventDefault();
    col.classList.remove('pf-mem-col-drop-over');
    if (!dragPayload) return;
    if (dragPayload.scope !== acceptsScope) return;
    const payload = dragPayload;
    dragPayload = null;

    if (payload.kind === 'entry') {
      if (scope === 'memory' && typeof handlers.onDemote === 'function') {
        handlers.onDemote(payload.id);
      } else if (scope === 'lore' && typeof handlers.onPromote === 'function') {
        handlers.onPromote(payload.id);
      }
    } else if (payload.kind === 'bubble') {
      if (scope === 'memory' && typeof handlers.onBubbleDemote === 'function') {
        handlers.onBubbleDemote(payload.entries);
      } else if (scope === 'lore' && typeof handlers.onBubblePromote === 'function') {
        handlers.onBubblePromote(payload.entries);
      }
    }
  });

  return col;
}

function buildDeletePanel({ countEl, handlers }) {
  const col = h('section', {
    class: 'pf-mem-col pf-mem-col-delete',
    'aria-label': 'Delete queue',
  }, [
    h('header', { class: 'pf-mem-col-header' }, [
      h('h3', { class: 'pf-mem-col-title pf-mem-col-title-danger' }, ['Delete']),
      countEl,
    ]),
    h('div', { class: 'pf-mem-del-body-empty', 'aria-hidden': 'true' }),
  ]);

  col.addEventListener('dragover', (ev) => {
    if (!dragPayload) return;
    ev.preventDefault();
    col.classList.add('pf-mem-col-drop-over');
  });
  col.addEventListener('dragleave', (ev) => {
    if (!col.contains(ev.relatedTarget)) {
      col.classList.remove('pf-mem-col-drop-over');
    }
  });
  col.addEventListener('drop', (ev) => {
    ev.preventDefault();
    col.classList.remove('pf-mem-col-drop-over');
    if (!dragPayload) return;
    const payload = dragPayload;
    dragPayload = null;

    if (payload.kind === 'entry' && typeof handlers.onDelete === 'function') {
      handlers.onDelete(payload.id);
    } else if (payload.kind === 'bubble' && typeof handlers.onBubbleDelete === 'function') {
      handlers.onBubbleDelete(payload.entries);
    }
  });

  return col;
}

// ---- bubble rendering ----

function renderBubble(bubble, isExpanded, isLocked, scope, handlers) {
  const count = bubble.entries.length;
  const chevron = h('span', {
    class: 'pf-mem-bubble-chevron',
    'aria-hidden': 'true',
  }, [isExpanded ? '▼' : '▶']);

  // Label sits on top; preview (first memory text, single-line, CSS-truncated
  // via ellipsis) sits underneath. Stacked in a flex-column that takes
  // remaining width between chevron and count/actions.
  const label = h('span', { class: 'pf-mem-bubble-label' }, [bubble.label]);
  const previewText = getPreviewText(bubble);
  const labelStack = h('div', { class: 'pf-mem-bubble-labelstack' },
    previewText
      ? [label, h('span', { class: 'pf-mem-bubble-preview', title: previewText }, [previewText])]
      : [label]
  );
  const countBadge = h('span', { class: 'pf-mem-bubble-count' }, [String(count)]);

  // Lock toggle — shown on every bubble (Memory AND Lore; only Memory
  // lock actually prevents reorder in 7d, but the visual is consistent).
  const lockBtn = h('button', {
    type: 'button',
    class: `pf-mem-bubble-lock ${isLocked ? 'pf-mem-bubble-lock-on' : ''}`,
    title: isLocked ? 'Unlock (allow reorder / cross-drag)' : 'Lock (prevent reorder)',
    'aria-label': isLocked ? 'Unlock bubble' : 'Lock bubble',
    'aria-pressed': String(!!isLocked),
    onClick: (ev) => {
      ev.stopPropagation();
      if (typeof handlers.onToggleLock === 'function') {
        handlers.onToggleLock(scope, bubble.id);
      }
    },
  }, [isLocked ? '🔒' : '🔓']);

  // Header is the drag source for the whole bubble, AND the click target
  // for expand/collapse. Actions (Promote, Lock, Delete) are inline.
  const header = h('div', {
    class: `pf-mem-bubble-header ${isLocked ? 'pf-mem-bubble-header-locked' : ''}`,
    role: 'button',
    tabindex: '0',
    'aria-expanded': String(isExpanded),
    'data-bubble-id': bubble.id,
    draggable: 'true',
    onClick: () => {
      if (typeof handlers.onToggleBubble === 'function') {
        handlers.onToggleBubble(scope, bubble.id);
      }
    },
    onKeydown: (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        if (typeof handlers.onToggleBubble === 'function') {
          handlers.onToggleBubble(scope, bubble.id);
        }
      }
    },
  }, [
    chevron,
    labelStack,
    countBadge,
    lockBtn,
    buildBubbleActions(bubble, scope, handlers),
  ]);

  // Drag source: drag the header = move the whole bubble
  header.addEventListener('dragstart', (ev) => {
    ev.stopPropagation();
    dragPayload = {
      kind: 'bubble',
      scope,
      bubbleId: bubble.id,
      entries: bubble.entries.slice(),
    };
    header.classList.add('pf-mem-bubble-dragging');
    try {
      ev.dataTransfer.setData('text/plain', `bubble:${bubble.id}`);
      ev.dataTransfer.effectAllowed = 'move';
    } catch { /* some environments block setData */ }
  });
  header.addEventListener('dragend', () => {
    dragPayload = null;
    header.classList.remove('pf-mem-bubble-dragging');
  });

  // Body: hidden when collapsed, nested cards when expanded.
  const body = h('div', {
    class: 'pf-mem-bubble-body',
    hidden: !isExpanded,
  }, isExpanded
    ? bubble.entries.map(entry => renderCard(entry, handlers))
    : []
  );

  return h('div', {
    class: `pf-mem-bubble ${bubble.isUngrouped ? 'pf-mem-bubble-ungrouped' : ''}`,
    role: 'listitem',
    'data-bubble-id': bubble.id,
  }, [header, body]);
}

function buildBubbleActions(bubble, scope, handlers) {
  const actions = [];
  if (scope === 'memory' && typeof handlers.onBubblePromote === 'function') {
    actions.push(h('button', {
      type: 'button',
      class: 'pf-mem-action pf-mem-action-promote',
      title: 'Promote all to Lore',
      'aria-label': 'Promote all to Lore',
      onClick: (ev) => {
        ev.stopPropagation();
        handlers.onBubblePromote(bubble.entries);
      },
    }, ['→ Lore']));
  }
  if (scope === 'lore' && typeof handlers.onBubbleDemote === 'function') {
    actions.push(h('button', {
      type: 'button',
      class: 'pf-mem-action pf-mem-action-demote',
      title: 'Demote all to Memory',
      'aria-label': 'Demote all to Memory',
      onClick: (ev) => {
        ev.stopPropagation();
        handlers.onBubbleDemote(bubble.entries);
      },
    }, ['Memory ←']));
  }
  if (typeof handlers.onBubbleDelete === 'function') {
    actions.push(h('button', {
      type: 'button',
      class: 'pf-mem-action pf-mem-action-delete',
      title: 'Delete all',
      'aria-label': 'Delete all',
      onClick: (ev) => {
        ev.stopPropagation();
        handlers.onBubbleDelete(bubble.entries);
      },
    }, ['✕']));
  }
  return h('div', { class: 'pf-mem-card-actions' }, actions);
}

// ---- card rendering (single entry within a bubble) ----

function renderCard(item, handlers) {
  const card = h('div', {
    class: 'pf-mem-card pf-mem-card-nested',
    role: 'listitem',
    draggable: 'true',
    'data-item-id': String(item.id),
    'data-scope': item.scope,
  }, [
    h('div', { class: 'pf-mem-card-text' }, [String(item.text || '')]),
    buildCardActions(item, handlers),
  ]);

  card.addEventListener('dragstart', (ev) => {
    ev.stopPropagation();
    dragPayload = { kind: 'entry', id: item.id, scope: item.scope };
    card.classList.add('pf-mem-card-dragging');
    try {
      ev.dataTransfer.setData('text/plain', String(item.id));
      ev.dataTransfer.effectAllowed = 'move';
    } catch { /* defensive */ }
  });
  card.addEventListener('dragend', () => {
    dragPayload = null;
    card.classList.remove('pf-mem-card-dragging');
  });

  return card;
}

function buildCardActions(item, handlers) {
  const actions = [];
  if (item.scope === 'memory' && typeof handlers.onPromote === 'function') {
    actions.push(h('button', {
      type: 'button',
      class: 'pf-mem-action pf-mem-action-promote',
      title: 'Promote to Lore',
      'aria-label': 'Promote to Lore',
      onClick: (ev) => {
        ev.stopPropagation();
        handlers.onPromote(item.id);
      },
    }, ['→ Lore']));
  }
  if (item.scope === 'lore' && typeof handlers.onDemote === 'function') {
    actions.push(h('button', {
      type: 'button',
      class: 'pf-mem-action pf-mem-action-demote',
      title: 'Demote to Memory',
      'aria-label': 'Demote to Memory',
      onClick: (ev) => {
        ev.stopPropagation();
        handlers.onDemote(item.id);
      },
    }, ['Memory ←']));
  }
  if (typeof handlers.onDelete === 'function') {
    actions.push(h('button', {
      type: 'button',
      class: 'pf-mem-action pf-mem-action-delete',
      title: 'Delete',
      'aria-label': 'Delete',
      onClick: (ev) => {
        ev.stopPropagation();
        handlers.onDelete(item.id);
      },
    }, ['✕']));
  }
  return h('div', { class: 'pf-mem-card-actions' }, actions);
}

// ---- helpers ----

function countEntries(bubbles) {
  let n = 0;
  for (const b of bubbles) n += (b.entries ? b.entries.length : 0);
  return n;
}

/**
 * Derive a one-line preview of a bubble's content. Uses the first entry's
 * text, takes its first line (anything before a newline), and caps at
 * ~60 characters (CSS handles the ellipsis visually; this just avoids
 * shipping an entire paragraph into the DOM).
 *
 * Returns empty string when no entries or no text — caller suppresses
 * the preview node in that case.
 *
 * @param {{ entries: Array<{text?: string}> }} bubble
 * @returns {string}
 */
function getPreviewText(bubble) {
  const first = bubble && bubble.entries && bubble.entries[0];
  if (!first || !first.text) return '';
  // Take only the first line so newlines inside multi-line memories don't
  // break the single-line layout. Then trim whitespace.
  const firstLine = String(first.text).split(/\r?\n/)[0].trim();
  if (!firstLine) return '';
  // Cap length so innerHTML stays small; CSS ellipsis handles on-screen truncation
  // at whatever width the column gives us.
  if (firstLine.length > 200) return firstLine.slice(0, 200);
  return firstLine;
}

function renderEmptyState(scope) {
  const text = scope === 'memory'
    ? 'No memories yet. They accumulate as you chat.'
    : 'No lore entries yet. Lore is worldbuilding that persists across threads.';
  return h('p', { class: 'pf-mem-empty' }, [text]);
}

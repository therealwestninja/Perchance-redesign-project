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
 * Wire a three-event drop-target on `el`: dragover (accept check +
 * preventDefault + add hover class), dragleave (remove hover class),
 * drop (preventDefault + remove hover class + invoke handler).
 *
 * Replaces what was previously four near-identical inline blocks
 * across buildColumn, buildDeletePanel, buildCreateCharacterPanel,
 * and createDropGap. A bug fix to drop-target mechanics now lands
 * in one place.
 *
 * @param {HTMLElement} el
 * @param {{
 *   accepts:        (payload: object) => boolean,
 *   onDrop:         (payload: object, ev: DragEvent) => void,
 *   activeClass?:   string,    // CSS class toggled while a valid drag hovers
 *   stopPropagation?: boolean, // true for nested gaps inside a larger drop target
 *   useRelatedTargetDragLeave?: boolean,
 *                              // true = only remove the class when the cursor
 *                              // actually leaves the element's subtree
 *                              // (relatedTarget outside). Useful for big
 *                              // columns with internal children. Gaps set
 *                              // this false — they're small, leaving = leaving.
 * }} opts
 */
function wireDropTarget(el, {
  accepts,
  onDrop,
  activeClass = 'pf-mem-col-drop-over',
  stopPropagation = false,
  useRelatedTargetDragLeave = true,
}) {
  el.addEventListener('dragover', (ev) => {
    if (!dragPayload) return;
    if (!accepts(dragPayload)) return;
    ev.preventDefault();
    if (stopPropagation) ev.stopPropagation();
    el.classList.add(activeClass);
  });
  el.addEventListener('dragleave', (ev) => {
    if (useRelatedTargetDragLeave) {
      if (!el.contains(ev.relatedTarget)) el.classList.remove(activeClass);
    } else {
      el.classList.remove(activeClass);
    }
  });
  el.addEventListener('drop', (ev) => {
    ev.preventDefault();
    if (stopPropagation) ev.stopPropagation();
    el.classList.remove(activeClass);
    if (!dragPayload) return;
    if (!accepts(dragPayload)) return;
    const payload = dragPayload;
    dragPayload = null;
    onDrop(payload, ev);
  });
}

/**
 * @typedef {Object} PanelHandlers
 * @property {(id) => void} [onPromote]            single entry memory → lore
 * @property {(id) => void} [onDemote]             single entry lore → memory
 * @property {(id) => void} [onDelete]             single entry → delete queue
 * @property {(bubbleId, entries) => void} [onBubblePromote] all entries in a bubble
 * @property {(bubbleId, entries) => void} [onBubbleDemote]  all entries in a bubble
 * @property {(bubbleId, entries, scope) => void} [onBubbleDelete]  all entries in a bubble
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

  // Right column: stacked Create-Character (2/3 height) + Delete (1/3
  // height). Create-Character accepts only bubble payloads (single
  // memories don't make sense as character seeds); Delete keeps its
  // existing semantics.
  const createCharCol = buildCreateCharacterPanel({ handlers });
  const rightCol = h('div', { class: 'pf-mem-right-stack' }, [
    createCharCol,
    deleteCol,
  ]);

  const root = h('div', { class: 'pf-mem-panels' }, [memoryCol, loreCol, rightCol]);

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
    // Usage histograms: Map<entryId, count>. Missing key = entry not
    // referenced by AI in recent window. Passed to renderBubble → render
    // the "recently used" dot on cards.
    const memUsage = s.memoryUsageCounts || new Map();
    const lorUsage = s.loreUsageCounts   || new Map();

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
        ? interleaveDropGaps(
            memB.map(b => renderBubble(b, expMem.has(b.id), lockMem.has(b.id), 'memory', handlers, memUsage)),
            memB, 'memory', 'bubble', handlers
          )
        : [renderEmptyState('memory')]
    );
    replaceContents(
      loreList,
      lorB.length > 0
        ? interleaveDropGaps(
            lorB.map(b => renderBubble(b, expLor.has(b.id), lockLor.has(b.id), 'lore', handlers, lorUsage)),
            lorB, 'lore', 'bubble', handlers
          )
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
  wireDropTarget(col, {
    accepts: (payload) => payload.scope === acceptsScope,
    onDrop: (payload) => {
      // Unified behavior (per design): a card dropped on a cross-panel
      // column gets promoted/demoted regardless of WHERE on the card the
      // user grabbed it. So both 'entry' (card body drag) and 'reorder-card'
      // (grip drag) are treated the same. Ditto 'bubble' vs 'reorder-bubble'
      // for whole-bubble drags.
      const isCardPayload   = payload.kind === 'entry'  || payload.kind === 'reorder-card';
      const isBubblePayload = payload.kind === 'bubble' || payload.kind === 'reorder-bubble';

      if (isCardPayload) {
        const cardId = payload.kind === 'entry' ? payload.id : payload.cardId;
        if (scope === 'memory' && typeof handlers.onDemote === 'function') {
          handlers.onDemote(cardId);
        } else if (scope === 'lore' && typeof handlers.onPromote === 'function') {
          handlers.onPromote(cardId);
        }
      } else if (isBubblePayload) {
        if (scope === 'memory' && typeof handlers.onBubbleDemote === 'function') {
          handlers.onBubbleDemote(payload.bubbleId, payload.entries);
        } else if (scope === 'lore' && typeof handlers.onBubblePromote === 'function') {
          handlers.onBubblePromote(payload.bubbleId, payload.entries);
        }
      }
    },
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

  wireDropTarget(col, {
    accepts: () => true,   // delete accepts anything draggable
    onDrop: (payload) => {
      // Same unified behavior as cross-panel columns (see buildColumn):
      // accept both body-drag and grip-drag payloads. Delete doesn't care
      // where you grabbed.
      const isCardPayload   = payload.kind === 'entry'  || payload.kind === 'reorder-card';
      const isBubblePayload = payload.kind === 'bubble' || payload.kind === 'reorder-bubble';

      if (isCardPayload && typeof handlers.onDelete === 'function') {
        const cardId = payload.kind === 'entry' ? payload.id : payload.cardId;
        handlers.onDelete(cardId);
      } else if (isBubblePayload && typeof handlers.onBubbleDelete === 'function') {
        handlers.onBubbleDelete(payload.bubbleId, payload.entries, payload.scope);
      }
    },
  });

  return col;
}

/**
 * Build the "Create Character" drop zone. Sits above the (now smaller)
 * Delete zone in the right column. Accepts whole-bubble drops only —
 * single memories can't seed a character; the unit of meaning is the
 * bubble. Themed with a green accent to distinguish from the red
 * Delete zone.
 *
 * On drop: invokes handlers.onSpinOffCharacter(scope, bubbleId, entries,
 * label). The handler decides whether to open a confirmation dialog
 * and whether to actually create the character — this panel is just
 * the gesture target.
 */
function buildCreateCharacterPanel({ handlers }) {
  const col = h('section', {
    class: 'pf-mem-col pf-mem-col-create-char',
    'aria-label': 'Spin off as new character',
  }, [
    h('header', { class: 'pf-mem-col-header' }, [
      h('h3', { class: 'pf-mem-col-title pf-mem-col-title-create' }, ['Create Character']),
    ]),
    h('div', { class: 'pf-mem-create-char-body' }, [
      h('div', { class: 'pf-mem-create-char-icon', 'aria-hidden': 'true' }, ['✨']),
      h('div', { class: 'pf-mem-create-char-hint' }, [
        'Drop a bubble here to spin off its memories into a new character.',
      ]),
    ]),
  ]);

  wireDropTarget(col, {
    // Only accept whole-bubble drops; reject single-card payloads.
    accepts: (payload) =>
      (payload.kind === 'bubble' || payload.kind === 'reorder-bubble'),
    onDrop: (payload) => {
      if (!Array.isArray(payload.entries) || payload.entries.length === 0) return;
      if (typeof handlers.onSpinOffCharacter === 'function') {
        // Pass scope so handler can decide how to label / route. The
        // entries themselves are scope-agnostic — both Memory and Lore
        // entries have a text field that maps cleanly to a lore item.
        handlers.onSpinOffCharacter(
          payload.scope,
          payload.bubbleId,
          payload.entries,
          payload.label || ''
        );
      }
    },
  });

  return col;
}

// ---- bubble rendering ----

function renderBubble(bubble, isExpanded, isLocked, scope, handlers, usageCounts) {
  const count = bubble.entries.length;
  const chevron = h('span', {
    class: 'pf-mem-bubble-chevron',
    'aria-hidden': 'true',
  }, [isExpanded ? '▼' : '▶']);

  // Drag-handle grip: rendered only on Memory bubbles (Lore has no
  // reorder concept). Disabled look when the bubble is locked —
  // visual affordance should match the behavior that 7d enforces.
  //
  // The grip is a SEPARATE drag source from the header itself. Header
  // drag = cross-panel (promote/demote/delete). Grip drag = reorder.
  // They emit different payload kinds ('bubble' vs 'reorder-bubble')
  // so drop handlers can distinguish. 7c only sets up the source; 7d
  // Drag-handle grip: rendered on bubbles for both Memory and Lore
  // scopes. Reorder is session-scoped in both cases (Lore has no order
  // field in Dexie, but in-window visual reordering is still useful
  // for curation). Disabled look when the bubble is locked.
  //
  // The grip is a SEPARATE drag source from the header itself. Header
  // drag = cross-panel (promote/demote/delete). Grip drag = reorder.
  // They emit different payload kinds ('bubble' vs 'reorder-bubble')
  // so drop handlers can distinguish.
  let grip = null;
  if (!bubble.isUngrouped) {
    grip = h('span', {
      class: `pf-mem-bubble-grip ${isLocked ? 'pf-mem-bubble-grip-disabled' : ''}`,
      title: isLocked ? 'Locked — reorder disabled' : 'Drag to reorder',
      'aria-hidden': 'true',
      draggable: isLocked ? 'false' : 'true',
      onClick: (ev) => {
        // Clicking the grip should not toggle expand/collapse.
        ev.stopPropagation();
      },
    }, ['⋮⋮']);

    if (!isLocked) {
      grip.addEventListener('dragstart', (ev) => {
        ev.stopPropagation();
        dragPayload = {
          kind: 'reorder-bubble',
          scope,
          bubbleId: bubble.id,
          entries: bubble.entries.slice(),
          label: bubble.label || '',
        };
        try {
          ev.dataTransfer.setData('text/plain', `reorder-bubble:${bubble.id}`);
          ev.dataTransfer.effectAllowed = 'move';
        } catch { /* defensive */ }
      });
      grip.addEventListener('dragend', () => {
        if (dragPayload && dragPayload.kind === 'reorder-bubble') {
          dragPayload = null;
        }
      });
    }
  }

  // Label sits on top; preview (first memory text, single-line, CSS-truncated
  // via ellipsis) sits underneath. Stacked in a flex-column that takes
  // remaining width between chevron and count/actions.
  //
  // Double-click the label → inline rename. Only supported on Memory
  // bubbles (Lore doesn't have a useful rename use-case in our current
  // UX — Lore is a flat list, bubbles are purely cosmetic).
  const label = h('span', {
    class: `pf-mem-bubble-label ${bubble.userRenamed ? 'pf-mem-bubble-label-renamed' : ''}`,
    title: bubble.userRenamed ? 'Renamed — double-click to change' : 'Double-click to rename',
  }, [bubble.label]);

  if (!bubble.isUngrouped && typeof handlers.onRenameBubble === 'function') {
    // Stop single-click propagation too — otherwise the FIRST click of a
    // double-click bubbles to the header's expand/collapse handler, toggling
    // the bubble once (first click) and back (second click), leaving it in
    // whatever state it started in, regardless of dblclick speed.
    //
    // Side effect: clicking the label no longer toggles expand/collapse.
    // Users can still use the rest of the header (chevron, preview, count,
    // empty space) for that. Power users can also dblclick to rename.
    // Main entry point remains the Rename button in the bubble settings row.
    label.addEventListener('click', (ev) => {
      ev.stopPropagation();
    });
    label.addEventListener('dblclick', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      startInlineRename(label, bubble, scope, handlers);
    });
  }

  const previewText = getPreviewText(bubble);
  const labelStack = h('div', { class: 'pf-mem-bubble-labelstack' },
    previewText
      ? [label, h('span', { class: 'pf-mem-bubble-preview', title: previewText }, [previewText])]
      : [label]
  );
  const countBadge = h('span', { class: 'pf-mem-bubble-count' }, [String(count)]);

  // Usage badge: sum of per-entry usage across this bubble's members.
  // Shown only when at least one member was referenced in the recent
  // message window. "Used N×" gives an at-a-glance "this bubble is
  // active" signal; per-card dots in the body give granularity.
  let usageBadge = null;
  if (usageCounts && usageCounts.get) {
    let bubbleUsage = 0;
    let usedMembers = 0;
    for (const e of bubble.entries) {
      const c = usageCounts.get(String(e.id)) || 0;
      if (c > 0) {
        bubbleUsage += c;
        usedMembers++;
      }
    }
    if (bubbleUsage > 0) {
      usageBadge = h('span', {
        class: 'pf-mem-bubble-used',
        title: `${usedMembers} of ${count} memor${count === 1 ? 'y' : 'ies'} referenced ${bubbleUsage}× in recent messages`,
      }, [`used ${bubbleUsage}×`]);
    }
  }

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
  const headerChildren = [];
  if (grip) headerChildren.push(grip);
  headerChildren.push(chevron, labelStack, countBadge);
  if (usageBadge) headerChildren.push(usageBadge);
  headerChildren.push(lockBtn, buildBubbleActions(bubble, scope, handlers));

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
  }, headerChildren);

  // Drag source: drag the header = move the whole bubble
  header.addEventListener('dragstart', (ev) => {
    ev.stopPropagation();
    dragPayload = {
      kind: 'bubble',
      scope,
      bubbleId: bubble.id,
      entries: bubble.entries.slice(),
      label: bubble.label || '',
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
  // For Memory/unlocked bubbles, interleave drop-gaps between cards
  // to enable within-bubble reorder.
  const cardNodes = isExpanded
    ? bubble.entries.map(entry => {
        const useCount = (usageCounts && usageCounts.get) ? (usageCounts.get(String(entry.id)) || 0) : 0;
        return renderCard(entry, { scope, bubbleId: bubble.id, isLocked, useCount }, handlers);
      })
    : [];
  let bodyChildren = (isExpanded && !isLocked)
    ? interleaveDropGaps(cardNodes, bubble.entries, scope, 'card', handlers, bubble.id, isLocked)
    : cardNodes;

  // Settings row — appears at the TOP of expanded bubbles (Memory or Lore)
  // that aren't Ungrouped. Currently hosts just the Rename button.
  // Intended to grow into a home for additional per-bubble controls
  // (exclude from re-cluster, export just this bubble, etc.) without
  // cluttering the header or forcing the user to scroll past long
  // card lists to find the controls.
  if (isExpanded && !bubble.isUngrouped) {
    const settingsRow = buildBubbleSettingsRow(bubble, scope, handlers);
    if (settingsRow) bodyChildren = [settingsRow, ...bodyChildren];
  }

  const body = h('div', {
    class: 'pf-mem-bubble-body',
    hidden: !isExpanded,
  }, bodyChildren);

  return h('div', {
    class: `pf-mem-bubble ${bubble.isUngrouped ? 'pf-mem-bubble-ungrouped' : ''}`,
    role: 'listitem',
    'data-bubble-id': bubble.id,
  }, [header, body]);
}

/**
 * Build the per-bubble settings row — shown at the TOP of an expanded
 * Memory bubble's body, above all cards. Currently just hosts the
 * Rename button; intended to grow into a home for other per-bubble
 * controls without adding header clutter or making users scroll past
 * long card lists to find them.
 *
 * Returns null if nothing to show (caller just skips prepending).
 */
function buildBubbleSettingsRow(bubble, scope, handlers) {
  const items = [];

  if (typeof handlers.onRenameBubble === 'function') {
    const renameBtn = h('button', {
      type: 'button',
      class: 'pf-mem-bubble-settings-btn',
      title: bubble.userRenamed
        ? 'Change the custom name for this bubble'
        : 'Give this bubble a custom name',
      onClick: (ev) => {
        ev.stopPropagation();
        // Find the label element in our bubble header and trigger the
        // same inline-rename flow the dblclick uses. We rely on DOM
        // querying up from the button — the bubble element is the
        // button's ancestor.
        const bubbleEl = ev.currentTarget.closest('.pf-mem-bubble');
        if (!bubbleEl) return;
        const labelEl = bubbleEl.querySelector('.pf-mem-bubble-label');
        if (!labelEl) return;
        startInlineRename(labelEl, bubble, scope, handlers);
      },
    }, ['✎ Rename']);
    items.push(renameBtn);
  }

  if (items.length === 0) return null;

  return h('div', {
    class: 'pf-mem-bubble-settings-row',
    'aria-label': 'Bubble settings',
  }, items);
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
        handlers.onBubblePromote(bubble.id, bubble.entries);
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
        handlers.onBubbleDemote(bubble.id, bubble.entries);
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
        handlers.onBubbleDelete(bubble.id, bubble.entries, scope);
      },
    }, ['✕']));
  }
  return h('div', { class: 'pf-mem-card-actions' }, actions);
}

// ---- card rendering (single entry within a bubble) ----

function renderCard(item, parent, handlers) {
  // parent = { scope, bubbleId, isLocked }
  const parentCtx = parent || {};

  // Card-level grip: rendered on cards in unlocked bubbles regardless
  // of scope. Lore cards gain session-scoped reorder (in-window curation)
  // the same way bubble-level reorder works for Lore.
  let grip = null;
  if (!parentCtx.isLocked) {
    grip = h('span', {
      class: 'pf-mem-card-grip',
      title: 'Drag to reorder',
      'aria-hidden': 'true',
      draggable: 'true',
      onClick: (ev) => { ev.stopPropagation(); },
    }, ['⋮⋮']);

    grip.addEventListener('dragstart', (ev) => {
      ev.stopPropagation();
      dragPayload = {
        kind: 'reorder-card',
        scope: item.scope,
        cardId: item.id,
        bubbleId: parentCtx.bubbleId,
      };
      try {
        ev.dataTransfer.setData('text/plain', `reorder-card:${item.id}`);
        ev.dataTransfer.effectAllowed = 'move';
      } catch { /* defensive */ }
    });
    grip.addEventListener('dragend', () => {
      if (dragPayload && dragPayload.kind === 'reorder-card') {
        dragPayload = null;
      }
    });
  }

  const cardChildren = [];
  if (grip) cardChildren.push(grip);

  // "Recently used" indicator: a small dot on the left side of the text
  // when this entry was referenced by the AI in the recent message
  // window. Opacity scales with usage count (clamped) so a memory used
  // 1× is a pale dot, used 5×+ is solid.
  const useCount = Number(parentCtx.useCount) || 0;
  if (useCount > 0) {
    const opacity = Math.min(1, 0.35 + (useCount - 1) * 0.15);
    const usedDot = h('span', {
      class: 'pf-mem-card-used-dot',
      title: `Referenced ${useCount}× in recent messages`,
      'aria-label': `Referenced ${useCount} time${useCount === 1 ? '' : 's'} recently`,
      style: { opacity: String(opacity.toFixed(2)) },
    }, ['•']);
    cardChildren.push(usedDot);
  }

  cardChildren.push(
    h('div', { class: 'pf-mem-card-text' }, [String(item.text || '')]),
    buildCardActions(item, handlers),
  );

  const card = h('div', {
    class: 'pf-mem-card pf-mem-card-nested',
    role: 'listitem',
    draggable: 'true',
    'data-item-id': String(item.id),
    'data-scope': item.scope,
  }, cardChildren);

  // The card as a whole remains draggable for cross-panel 'entry' drags
  // (promote/demote/delete). Grip emits 'reorder-card' separately.
  card.addEventListener('dragstart', (ev) => {
    ev.stopPropagation();
    // Skip setting the payload if the grip already did — dragstart on
    // the grip bubbles up to card, but the grip's handler ran first via
    // stopPropagation. If grip had stopPropagation but the native dragstart
    // fires on the card anyway, we'd overwrite a reorder-card payload.
    if (dragPayload && dragPayload.kind === 'reorder-card' && String(dragPayload.cardId) === String(item.id)) {
      return;
    }
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

/**
 * Interleave drop-gap elements between sibling drag items.
 * For N items, produces [gap, item0, gap, item1, gap, ..., itemN-1, gap]
 * — gaps before every item AND one at the end (for "move to end" drops).
 *
 * @param {HTMLElement[]} nodes         rendered item nodes
 * @param {Array} items                 the source items (for beforeId lookup)
 * @param {'memory'|'lore'} scope
 * @param {'bubble'|'card'} kind        what kind of reorder gap this is
 * @param {Object} handlers
 * @param {string} [parentBubbleId]     required when kind='card'
 * @param {boolean} [parentBubbleLocked]  required when kind='card'; locked
 *   bubbles reject incoming cross-bubble drops
 * @returns {HTMLElement[]}
 */
function interleaveDropGaps(nodes, items, scope, kind, handlers, parentBubbleId, parentBubbleLocked) {
  // Both Memory and Lore scopes get drop-gaps; reorder is session-scoped
  // for Lore (no Dexie order field to persist to), but in-window curation
  // is still useful.
  const out = [];
  for (let i = 0; i < nodes.length; i++) {
    const beforeId = items[i] && items[i].id;
    out.push(createDropGap({ scope, kind, beforeId, handlers, parentBubbleId, parentBubbleLocked }));
    out.push(nodes[i]);
  }
  // Trailing gap for "move to end" drops
  out.push(createDropGap({ scope, kind, beforeId: null, handlers, parentBubbleId, parentBubbleLocked }));
  return out;
}

/**
 * Create one drop-gap element. It's a thin horizontal div that expands
 * visually when a compatible reorder payload hovers over it. On drop,
 * invokes the appropriate handler.
 *
 * kind='bubble': accepts 'reorder-bubble' payload; beforeId is the id
 *   of the bubble that this gap sits before (null = end of list).
 * kind='card': accepts 'reorder-card' payload; beforeId is the id of
 *   the card this gap sits before (null = end of bubble); parentBubbleId
 *   is the bubble that owns this card list. As of 7d.2, cross-bubble
 *   drops are accepted (card relocates to target bubble) — EXCEPT when
 *   the target bubble is locked (parentBubbleLocked=true), which seals
 *   the target against incoming cards.
 */
function createDropGap({ scope, kind, beforeId, handlers, parentBubbleId, parentBubbleLocked }) {
  const gap = h('div', {
    class: `pf-mem-drop-gap pf-mem-drop-gap-${kind}`,
    'data-before-id': beforeId == null ? '' : String(beforeId),
    'aria-hidden': 'true',
  });

  wireDropTarget(gap, {
    accepts: (payload) => {
      if (kind === 'bubble' && payload.kind !== 'reorder-bubble') return false;
      if (kind === 'card'   && payload.kind !== 'reorder-card')   return false;
      // Reorder payloads carry the source scope; a Memory bubble/card
      // can't reorder INTO the Lore column and vice versa. (Cross-panel
      // drops use a different payload kind — 'bubble'/'entry' — handled
      // at the column level, not the gap level.)
      if (payload.scope !== scope) return false;
      if (kind === 'card' && parentBubbleLocked) return false; // 7d.2: locked target seals in AND out
      return true;
    },
    onDrop: (payload) => {
      if (kind === 'bubble') {
        if (typeof handlers.onReorderBubble === 'function') {
          handlers.onReorderBubble(scope, payload.bubbleId, beforeId);
        }
      } else if (kind === 'card') {
        if (typeof handlers.onReorderCard === 'function') {
          handlers.onReorderCard(
            scope,
            payload.bubbleId,         // source bubble
            payload.cardId,
            parentBubbleId,           // target bubble (may differ from source in 7d.2)
            beforeId,
          );
        }
      }
    },
    activeClass: 'pf-mem-drop-gap-active',
    // Gaps live inside columns; stopPropagation keeps the column's
    // drop handler from firing in addition to ours.
    stopPropagation: true,
    // Gaps are small horizontal strips — relatedTarget-based leave
    // detection is unnecessary and actually slightly wrong (moving
    // out of a 4px strip should ALWAYS remove the hover class).
    useRelatedTargetDragLeave: false,
  });

  return gap;
}

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

/**
 * Replace a bubble's label element with an inline <input> for editing.
 * Enter commits via handlers.onRenameBubble(scope, bubbleId, newLabel, memberIds).
 * Escape or blur without Enter cancels (label reverts to original text).
 *
 * Uses DOM replacement rather than building a second element type —
 * simpler plumbing, no state machine in the render path.
 */
function startInlineRename(labelEl, bubble, scope, handlers) {
  const original = labelEl.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'pf-mem-bubble-label-input';
  input.value = original;
  input.setAttribute('aria-label', 'Rename bubble');
  input.maxLength = 80;

  // Swap label for input
  const parent = labelEl.parentNode;
  if (!parent) return;
  parent.replaceChild(input, labelEl);
  input.focus();
  input.select();

  let committed = false;

  function commit() {
    if (committed) return;
    committed = true;
    const newLabel = String(input.value || '').trim();
    parent.replaceChild(labelEl, input);
    if (newLabel === original) return;
    if (typeof handlers.onRenameBubble === 'function') {
      handlers.onRenameBubble(scope, bubble.id, newLabel, bubble.entries.map(e => String(e.id)));
    }
  }

  function cancel() {
    if (committed) return;
    committed = true;
    parent.replaceChild(labelEl, input);
  }

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      commit();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      cancel();
    }
  });
  input.addEventListener('blur', commit);
  // Stop clicks inside the input from bubbling up to the header's
  // expand/collapse toggler.
  input.addEventListener('click', (ev) => ev.stopPropagation());
  input.addEventListener('mousedown', (ev) => ev.stopPropagation());
}

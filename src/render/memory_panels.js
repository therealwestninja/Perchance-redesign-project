// render/memory_panels.js
//
// Three-panel Memory/Lore curation widget:
//
//   [ MEMORY ] [ LORE ] [ DELETE ]
//
// Each card has Promote/Demote and Delete buttons inline. Cards are
// draggable. Memory and Lore columns are drop targets for each other
// (promote / demote). Delete column is a drop target only — items
// dropped there are immediately removed from the staged view.
//
// This module is rendering-only. It is handed:
//   - an initial list of StageItems
//   - a set of callback handlers (onPromote, onDemote, onDelete)
//   - a way to re-render after callbacks mutate external state
//
// The caller (window_open.js) owns the stage, re-renders on state
// change, and translates UI events into stage operations.

import { h, replaceContents } from '../utils/dom.js';

/**
 * @typedef {'memory' | 'lore'} Scope
 */

/**
 * @typedef {Object} PanelHandlers
 * @property {(id: string | number) => void} [onPromote]      memory → lore
 * @property {(id: string | number) => void} [onDemote]       lore → memory
 * @property {(id: string | number) => void} [onDelete]       either → removed
 */

// Use a module-scoped holder for the active drag payload. DataTransfer
// on some browsers is only readable on 'drop' (not 'dragover'), which
// breaks our "dim invalid targets" UX. Reading from a JS variable sidesteps
// that. Scope is the source scope — determines what actions are valid.
let dragPayload = null;

/**
 * @param {{
 *   items?: Array<import('../memory/stage.js').StageItem>,
 *   handlers?: PanelHandlers,
 *   deleteCount?: number,  // "3 items queued for deletion" tally
 * }} [opts]
 * @returns {HTMLElement & { update: (items, deleteCount) => void }}
 */
export function createMemoryPanels({ items = [], handlers = {}, deleteCount = 0 } = {}) {
  const memoryList = h('div', { class: 'pf-mem-list', role: 'list' });
  const loreList   = h('div', { class: 'pf-mem-list', role: 'list' });

  const memoryCount = h('span', { class: 'pf-mem-col-count' });
  const loreCount   = h('span', { class: 'pf-mem-col-count' });
  const deleteCountEl = h('span', { class: 'pf-mem-del-count', 'aria-live': 'polite' });

  const memoryCol = buildColumn({
    scope: 'memory',
    title: 'Memory',
    subtitle: 'current thread',
    list: memoryList,
    countEl: memoryCount,
    handlers,
    acceptsScope: 'lore',  // dropping a lore item here = demote
    onAcceptDrop: (payload) => {
      if (!payload) return;
      if (payload.scope === 'lore' && typeof handlers.onDemote === 'function') {
        handlers.onDemote(payload.id);
      }
    },
  });

  const loreCol = buildColumn({
    scope: 'lore',
    title: 'Lore',
    subtitle: 'world bible',
    list: loreList,
    countEl: loreCount,
    handlers,
    acceptsScope: 'memory',  // dropping a memory item here = promote
    onAcceptDrop: (payload) => {
      if (!payload) return;
      if (payload.scope === 'memory' && typeof handlers.onPromote === 'function') {
        handlers.onPromote(payload.id);
      }
    },
  });

  const deleteCol = buildDeletePanel({
    countEl: deleteCountEl,
    handlers,
  });

  const root = h('div', { class: 'pf-mem-panels' }, [memoryCol, loreCol, deleteCol]);

  function render(currentItems, currentDeleteCount) {
    const mems  = (currentItems || []).filter(it => it.scope === 'memory');
    const lores = (currentItems || []).filter(it => it.scope === 'lore');

    memoryCount.textContent = String(mems.length);
    loreCount.textContent   = String(lores.length);

    const count = Number(currentDeleteCount) || 0;
    deleteCountEl.textContent = count === 0
      ? '0 queued'
      : `${count} queued for deletion`;

    replaceContents(memoryList, mems.length > 0
      ? mems.map(it => renderCard(it, handlers))
      : [renderEmptyState('memory')]
    );
    replaceContents(loreList, lores.length > 0
      ? lores.map(it => renderCard(it, handlers))
      : [renderEmptyState('lore')]
    );
  }

  render(items, deleteCount);
  root.update = render;
  return root;
}

// ---- column builders ----

function buildColumn({ scope, title, subtitle, list, countEl, acceptsScope, onAcceptDrop }) {
  const col = h('section', {
    class: `pf-mem-col pf-mem-col-${scope}`,
    'aria-label': `${title} (${subtitle})`,
  }, [
    h('header', { class: 'pf-mem-col-header' }, [
      h('h3', { class: 'pf-mem-col-title' }, [title]),
      countEl,
      h('span', { class: 'pf-mem-col-sub' }, [subtitle]),
    ]),
    list,
  ]);

  // Drop target wiring — only accept drops from the opposite scope.
  col.addEventListener('dragover', (ev) => {
    if (!dragPayload) return;
    if (dragPayload.scope !== acceptsScope) return;
    ev.preventDefault();
    col.classList.add('pf-mem-col-drop-over');
  });
  col.addEventListener('dragleave', (ev) => {
    // Only clear the highlight when leaving the column itself, not
    // when crossing between child elements (which also fires dragleave
    // with event.target === the child). Using column bounds check.
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
    onAcceptDrop(payload);
  });

  return col;
}

function buildDeletePanel({ countEl, handlers }) {
  // The Delete panel is drop-target only. Items dropped here disappear
  // from view immediately (staged for removal, committed on Save).
  // Per user decision: the panel body stays empty — just a header with
  // a running count of queued deletions. No preview list, no drag-out-
  // to-undo. Cancel-the-whole-session is the recovery path.
  const col = h('section', {
    class: 'pf-mem-col pf-mem-col-delete',
    'aria-label': 'Delete queue',
  }, [
    h('header', { class: 'pf-mem-col-header' }, [
      h('h3', { class: 'pf-mem-col-title pf-mem-col-title-danger' }, ['Delete']),
      countEl,
    ]),
    // Intentionally empty body — the drop highlight is the only affordance
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
    if (typeof handlers.onDelete === 'function') handlers.onDelete(payload.id);
  });

  return col;
}

// ---- card rendering ----

function renderCard(item, handlers) {
  const card = h('div', {
    class: 'pf-mem-card',
    role: 'listitem',
    draggable: 'true',
    'data-item-id': String(item.id),
    'data-scope': item.scope,
  }, [
    h('div', { class: 'pf-mem-card-text' }, [String(item.text || '')]),
    buildCardActions(item, handlers),
  ]);

  // Drag source wiring. We stash the payload in the module-scoped
  // variable AND setData() for completeness (some browsers/AT rely on
  // the dataTransfer model).
  card.addEventListener('dragstart', (ev) => {
    dragPayload = { id: item.id, scope: item.scope };
    card.classList.add('pf-mem-card-dragging');
    try {
      ev.dataTransfer.setData('text/plain', String(item.id));
      ev.dataTransfer.effectAllowed = 'move';
    } catch { /* defensive — some environments block setData */ }
  });
  card.addEventListener('dragend', () => {
    dragPayload = null;
    card.classList.remove('pf-mem-card-dragging');
  });

  return card;
}

function buildCardActions(item, handlers) {
  // Per-item buttons for users who prefer clicks over drag.
  const actions = [];
  if (item.scope === 'memory' && typeof handlers.onPromote === 'function') {
    actions.push(h('button', {
      type: 'button',
      class: 'pf-mem-action pf-mem-action-promote',
      title: 'Promote to Lore',
      'aria-label': 'Promote to Lore',
      onClick: () => handlers.onPromote(item.id),
    }, ['→ Lore']));
  }
  if (item.scope === 'lore' && typeof handlers.onDemote === 'function') {
    actions.push(h('button', {
      type: 'button',
      class: 'pf-mem-action pf-mem-action-demote',
      title: 'Demote to Memory',
      'aria-label': 'Demote to Memory',
      onClick: () => handlers.onDemote(item.id),
    }, ['Memory ←']));
  }
  if (typeof handlers.onDelete === 'function') {
    actions.push(h('button', {
      type: 'button',
      class: 'pf-mem-action pf-mem-action-delete',
      title: 'Delete',
      'aria-label': 'Delete',
      onClick: () => handlers.onDelete(item.id),
    }, ['✕']));
  }
  return h('div', { class: 'pf-mem-card-actions' }, actions);
}

function renderEmptyState(scope) {
  const text = scope === 'memory'
    ? 'No memories yet. They accumulate as you chat.'
    : 'No lore entries yet. Lore is worldbuilding that persists across threads.';
  return h('p', { class: 'pf-mem-empty' }, [text]);
}

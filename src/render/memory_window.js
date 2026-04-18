// render/memory_window.js
//
// The Memory/Lore window. Wraps createOverlay with memory-specific content:
//
//   [ Header:  Memory & Lore   (thread chip)       ]
//   [ Panels:  Memory  |  Lore  |  Delete          ]
//   [ Footer:  [Export…]          [Cancel] [Save ▶]]
//
// Widens the overlay content column past the default 800px cap to fit
// three side-by-side columns comfortably.
//
// This module is composition only — it doesn't own the stage. The caller
// computes bubble state from stage contents, passes it in, and calls
// updatePanels(state) to re-render after stage mutations.
//
// See memory_panels.js for the state shape. At minimum:
//   { memoryBubbles, loreBubbles, memoryK, loreK,
//     expandedMemoryIds, expandedLoreIds, deleteCount }

import { h } from '../utils/dom.js';
import { createOverlay } from './overlay.js';
import { createMemoryPanels } from './memory_panels.js';

/**
 * @param {{
 *   initialState?: Object,     Initial bubble state (see memory_panels.js)
 *   threadLabel?: string,
 *   handlers?: Object,         See memory_panels.js PanelHandlers +
 *                              {onSave, onExport, onCancel}
 *   onClose?: () => void,
 * }} opts
 * @returns {HTMLElement & {
 *   show: () => void,
 *   hide: () => void,
 *   updatePanels: (state) => void,
 *   setSaveEnabled: (enabled: boolean) => void,
 *   setSaveLabel: (label: string) => void,
 * }}
 */
export function createMemoryWindow({
  initialState = {},
  threadLabel = '',
  handlers = {},
  onClose,
} = {}) {
  const title = h('h2', { class: 'pf-mem-title' }, ['Memory & Lore']);
  const contextChip = threadLabel
    ? h('span', { class: 'pf-mem-context-chip', title: 'Active thread' }, [threadLabel])
    : null;

  const header = h('header', { class: 'pf-mem-header' },
    contextChip ? [title, contextChip] : [title]
  );

  const panels = createMemoryPanels({
    memoryBubbles:    initialState.memoryBubbles    || [],
    loreBubbles:      initialState.loreBubbles      || [],
    memoryK:          initialState.memoryK          || 0,
    loreK:            initialState.loreK            || 0,
    expandedMemoryIds: initialState.expandedMemoryIds || new Set(),
    expandedLoreIds:   initialState.expandedLoreIds   || new Set(),
    lockedMemoryIds:   initialState.lockedMemoryIds   || new Set(),
    lockedLoreIds:     initialState.lockedLoreIds     || new Set(),
    deleteCount:      initialState.deleteCount      || 0,
    handlers,
  });

  // ---- footer ----

  const exportBtn = h('button', {
    type: 'button',
    class: 'pf-mem-btn pf-mem-btn-secondary',
    onClick: () => { if (typeof handlers.onExport === 'function') handlers.onExport(); },
  }, ['Export…']);

  const cancelBtn = h('button', {
    type: 'button',
    class: 'pf-mem-btn pf-mem-btn-neutral',
    onClick: () => {
      if (typeof handlers.onCancel === 'function') handlers.onCancel();
      else overlay.hide();
    },
  }, ['Cancel']);

  const saveBtn = h('button', {
    type: 'button',
    class: 'pf-mem-btn pf-mem-btn-primary',
    disabled: true,
    onClick: () => { if (typeof handlers.onSave === 'function') handlers.onSave(); },
  }, ['Save']);

  const footer = h('footer', { class: 'pf-mem-footer' }, [
    h('div', { class: 'pf-mem-footer-left' }, [exportBtn]),
    h('div', { class: 'pf-mem-footer-right' }, [cancelBtn, saveBtn]),
  ]);

  const wrapper = h('div', { class: 'pf-mem-window' }, [header, panels, footer]);

  const overlay = createOverlay({
    ariaLabel: 'Memory and Lore',
    children: [wrapper],
    onClose,
  });

  overlay.classList.add('pf-overlay-wide');

  overlay.updatePanels = (state) => panels.update(state);
  overlay.setSaveEnabled = (enabled) => { saveBtn.disabled = !enabled; };
  overlay.setSaveLabel = (label) => {
    if (typeof label === 'string') saveBtn.textContent = label;
  };

  return overlay;
}

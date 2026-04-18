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
// wires handlers for cancel/export/save and calls updatePanels() to
// re-render after stage mutations.

import { h } from '../utils/dom.js';
import { createOverlay } from './overlay.js';
import { createMemoryPanels } from './memory_panels.js';

/**
 * Create a Memory/Lore window populated with the given items.
 *
 * @param {{
 *   items: Array<import('../memory/stage.js').StageItem>,
 *   threadLabel?: string,     Rendered in the header as thread context
 *   deleteCount?: number,     Running count of items queued for delete
 *   handlers?: import('./memory_panels.js').PanelHandlers & {
 *     onSave?: () => void,
 *     onExport?: () => void,
 *     onCancel?: () => void,  Cancels without saving; defaults to close
 *   },
 *   onClose?: () => void,
 * }} opts
 * @returns {HTMLElement & {
 *   show: () => void,
 *   hide: () => void,
 *   updatePanels: (items, deleteCount) => void,
 *   setSaveEnabled: (enabled: boolean) => void,
 *   setSaveLabel: (label: string) => void,
 * }}
 */
export function createMemoryWindow({
  items = [],
  threadLabel = '',
  deleteCount = 0,
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
    items,
    deleteCount,
    handlers,
  });

  // ---- footer: Export (left), Cancel + Save (right) ----

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
    disabled: true,  // starts disabled — enabled when stage has changes
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

  // Tag the overlay so CSS can widen the content column for three panels.
  overlay.classList.add('pf-overlay-wide');

  overlay.updatePanels = (newItems, newDeleteCount) => {
    panels.update(newItems, newDeleteCount);
  };
  overlay.setSaveEnabled = (enabled) => {
    saveBtn.disabled = !enabled;
  };
  overlay.setSaveLabel = (label) => {
    if (typeof label === 'string') saveBtn.textContent = label;
  };

  return overlay;
}

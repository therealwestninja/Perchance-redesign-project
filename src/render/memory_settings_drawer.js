// render/memory_settings_drawer.js
//
// Small drawer that slides down from the Memory & Lore window header
// when the user clicks the gear icon. Holds tunable knobs for the
// bubble tool — currently just the rename-survival threshold, with
// room to add more as we expose internal heuristics.
//
// UX notes:
//   - Drawer collapses by default. Keeps the window chrome clean for
//     users who don't want to tune anything.
//   - Each row has a live label showing the current value, a slider,
//     and a short plain-English tip explaining what the knob does.
//   - Persists changes immediately (no Save button). Each row writes
//     through updateField() so the change fires the global settings
//     pub/sub and any live subscribers (notably the Memory window
//     itself) can re-render with the new value.
//   - Structured to grow — adding a second knob is one more row in
//     the drawer body.

import { h } from '../utils/dom.js';
import { loadSettings, updateField } from '../profile/settings_store.js';
import { SNAPSHOT_CAP_BOUNDS } from '../memory/snapshots.js';

/**
 * Build the gear toggle button + the drawer that it controls.
 *
 * Returns { gearButton, drawer, toggle(visible) } so the caller can
 * place the button in a header and the drawer below, and optionally
 * drive the visible state externally (we also handle the click
 * toggle internally so callers who don't care can ignore `toggle`).
 *
 * @param {{
 *   onChange?: (key: string, value: any) => void
 * }} [opts]
 */
export function createMemorySettingsDrawer({ onChange } = {}) {
  // ---- drawer body ----

  const settings = safeLoadSettings();
  const initialThreshold = readRenameThreshold(settings);

  // Rename threshold row: slider + live value + caption
  const thresholdValue = h('span', { class: 'pf-mem-set-val' }, [
    formatPct(initialThreshold),
  ]);

  const thresholdInput = h('input', {
    type: 'range',
    min: '0',
    max: '1',
    step: '0.05',
    value: String(initialThreshold),
    class: 'pf-mem-set-slider',
    'aria-label': 'Rename-survival threshold',
  });
  thresholdInput.addEventListener('input', () => {
    const v = Math.max(0, Math.min(1, parseFloat(thresholdInput.value) || 0.5));
    thresholdValue.textContent = formatPct(v);
    // Live caption echoes permissiveness in plain English as user drags.
    thresholdCaption.textContent = describeThreshold(v);
  });
  thresholdInput.addEventListener('change', () => {
    const v = Math.max(0, Math.min(1, parseFloat(thresholdInput.value) || 0.5));
    // Round to the slider step so we don't store floating-point
    // weirdness from imprecise drags ("0.5500000000001").
    const rounded = Math.round(v * 20) / 20;
    updateField('memory.tool.renameThreshold', rounded);
    if (typeof onChange === 'function') {
      try { onChange('renameThreshold', rounded); } catch { /* best-effort */ }
    }
  });

  const thresholdCaption = h('div', { class: 'pf-mem-set-caption' }, [
    describeThreshold(initialThreshold),
  ]);

  const thresholdRow = h('div', { class: 'pf-mem-set-row' }, [
    h('div', { class: 'pf-mem-set-row-header' }, [
      h('label', { class: 'pf-mem-set-label' }, ['Rename-survival threshold']),
      thresholdValue,
    ]),
    thresholdInput,
    thresholdCaption,
    h('div', { class: 'pf-mem-set-hint' }, [
      'How similar a bubble must still be to its original membership ' +
      'for your custom label to stick when memories are added or removed. ' +
      'Also applies to locked-bubble reconciliation.',
    ]),
  ]);

  // ---- Snapshot ring buffer size (#5) ----
  // Default 10 snapshots per thread. User-tunable in 5..25 range, step 5.
  // Read live from settings on every capture, so changes here take
  // effect on the very next save without needing to reload Perchance.
  const initialMaxSnapshots = readMaxSnapshots(settings);
  const maxSnapsValue = h('span', { class: 'pf-mem-set-val' }, [
    String(initialMaxSnapshots),
  ]);
  const maxSnapsInput = h('input', {
    type: 'range',
    min: String(SNAPSHOT_CAP_BOUNDS.min),
    max: String(SNAPSHOT_CAP_BOUNDS.max),
    step: '5',
    value: String(initialMaxSnapshots),
    class: 'pf-mem-set-slider',
    'aria-label': 'Maximum snapshots kept per thread',
  });
  maxSnapsInput.addEventListener('input', () => {
    const v = clampMaxSnapshots(parseInt(maxSnapsInput.value, 10));
    maxSnapsValue.textContent = String(v);
  });
  maxSnapsInput.addEventListener('change', () => {
    const v = clampMaxSnapshots(parseInt(maxSnapsInput.value, 10));
    updateField('memory.tool.maxSnapshots', v);
    if (typeof onChange === 'function') {
      try { onChange('maxSnapshots', v); } catch { /* best-effort */ }
    }
  });

  const maxSnapsRow = h('div', { class: 'pf-mem-set-row' }, [
    h('div', { class: 'pf-mem-set-row-header' }, [
      h('label', { class: 'pf-mem-set-label' }, ['Snapshots kept per thread']),
      maxSnapsValue,
    ]),
    maxSnapsInput,
    h('div', { class: 'pf-mem-set-hint' }, [
      'How many auto-snapshots to keep before the oldest gets pushed ' +
      'out. More snapshots = more "Restore" history at the cost of a ' +
      'bit more storage. Existing snapshots beyond your new cap fall ' +
      'off on the next save, not retroactively.',
    ]),
  ]);

  // ---- drawer root ----

  const drawer = h('div', {
    class: 'pf-mem-set-drawer',
    hidden: true,
    role: 'region',
    'aria-label': 'Memory tool settings',
  }, [
    h('div', { class: 'pf-mem-set-inner' }, [thresholdRow, maxSnapsRow]),
  ]);

  // ---- gear button ----

  let open = false;
  const gearButton = h('button', {
    type: 'button',
    class: 'pf-mem-gear-btn',
    'aria-label': 'Memory tool settings',
    'aria-expanded': 'false',
    title: 'Settings',
    onClick: () => setOpen(!open),
  }, ['⚙']);

  function setOpen(next) {
    open = !!next;
    drawer.hidden = !open;
    gearButton.setAttribute('aria-expanded', String(open));
    gearButton.classList.toggle('pf-mem-gear-btn-open', open);
  }

  return {
    gearButton,
    drawer,
    toggle: setOpen,
  };
}

// ---- helpers ----

function safeLoadSettings() {
  try { return loadSettings(); } catch { return null; }
}

function readRenameThreshold(settings) {
  const raw =
    (settings && settings.memory && settings.memory.tool &&
      settings.memory.tool.renameThreshold);
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0.5;
  return Math.max(0, Math.min(1, raw));
}

function formatPct(v) {
  return `${Math.round(v * 100)}%`;
}

function describeThreshold(v) {
  if (v <= 0.20) return 'Very permissive — renames stick through big reshuffles.';
  if (v <= 0.40) return 'Permissive — renames survive moderate membership changes.';
  if (v <= 0.60) return 'Balanced — renames stick when membership is largely the same.';
  if (v <= 0.80) return 'Strict — renames only stick to closely-matching bubbles.';
  return 'Very strict — renames require near-identical membership to survive.';
}

function readMaxSnapshots(settings) {
  const raw =
    (settings && settings.memory && settings.memory.tool &&
      settings.memory.tool.maxSnapshots);
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return SNAPSHOT_CAP_BOUNDS.default;
  return clampMaxSnapshots(raw);
}

function clampMaxSnapshots(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return SNAPSHOT_CAP_BOUNDS.default;
  // Round to step (5) for tidy storage values
  const stepped = Math.round(n / 5) * 5;
  return Math.max(SNAPSHOT_CAP_BOUNDS.min, Math.min(SNAPSHOT_CAP_BOUNDS.max, stepped));
}

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

  // ---- Usage histogram window (#5b) ----
  // Drives the "recently used" dot indicator on cards. Default 10 messages.
  const initialUsageWindow = readUsageWindow(settings);
  const usageWindowValue = h('span', { class: 'pf-mem-set-val' }, [String(initialUsageWindow)]);
  const usageWindowInput = h('input', {
    type: 'range', min: '5', max: '50', step: '5',
    value: String(initialUsageWindow),
    class: 'pf-mem-set-slider',
    'aria-label': 'Usage histogram window (last N messages)',
  });
  usageWindowInput.addEventListener('input', () => {
    const v = clampUsageWindow(parseInt(usageWindowInput.value, 10));
    usageWindowValue.textContent = String(v);
  });
  usageWindowInput.addEventListener('change', () => {
    const v = clampUsageWindow(parseInt(usageWindowInput.value, 10));
    updateField('memory.tool.usageWindow', v);
    if (typeof onChange === 'function') {
      try { onChange('usageWindow', v); } catch { /* best-effort */ }
    }
  });
  const usageWindowRow = h('div', { class: 'pf-mem-set-row' }, [
    h('div', { class: 'pf-mem-set-row-header' }, [
      h('label', { class: 'pf-mem-set-label' }, ['Usage histogram window']),
      usageWindowValue,
    ]),
    usageWindowInput,
    h('div', { class: 'pf-mem-set-hint' }, [
      'How many of the most-recent messages to look at when deciding which ' +
      'memories show the "recently used" dot. Larger window = more memories ' +
      'flagged as recently relevant. Takes effect on the next time you ' +
      'open the Memory tool.',
    ]),
  ]);

  // ---- Lock reconciliation threshold (#5c) ----
  // How similar a fresh-cluster bubble must be to its persisted-locked
  // counterpart for the lock to transfer. Decoupled from rename
  // threshold per ROADMAP. Default falls through to renameThreshold,
  // then to library default 0.5 if unset.
  const initialLockThresh = readLockReconcileThreshold(settings, initialThreshold);
  const lockThreshValue = h('span', { class: 'pf-mem-set-val' }, [formatPct(initialLockThresh)]);
  const lockThreshInput = h('input', {
    type: 'range', min: '0', max: '1', step: '0.05',
    value: String(initialLockThresh),
    class: 'pf-mem-set-slider',
    'aria-label': 'Lock reconciliation threshold',
  });
  lockThreshInput.addEventListener('input', () => {
    const v = Math.max(0, Math.min(1, parseFloat(lockThreshInput.value) || 0.5));
    lockThreshValue.textContent = formatPct(v);
  });
  lockThreshInput.addEventListener('change', () => {
    const v = Math.max(0, Math.min(1, parseFloat(lockThreshInput.value) || 0.5));
    const rounded = Math.round(v * 20) / 20;
    updateField('memory.tool.lockReconcileThreshold', rounded);
    if (typeof onChange === 'function') {
      try { onChange('lockReconcileThreshold', rounded); } catch { /* best-effort */ }
    }
  });
  const lockThreshRow = h('div', { class: 'pf-mem-set-row' }, [
    h('div', { class: 'pf-mem-set-row-header' }, [
      h('label', { class: 'pf-mem-set-label' }, ['Lock reconciliation threshold']),
      lockThreshValue,
    ]),
    lockThreshInput,
    h('div', { class: 'pf-mem-set-hint' }, [
      'How similar a re-clustered bubble must be to your previously-' +
      'locked one for the lock to transfer to it. Defaults to the rename ' +
      'threshold above, but you can decouple them here.',
    ]),
  ]);

  // ---- K-cluster preference (#5d) ----
  // Multiplier on recommendK output: < 1 means sparser bubbles (more,
  // smaller groups), > 1 means denser (fewer, bigger groups). Sanity
  // bounds [3, 15] still apply inside recommendK.
  const initialKPref = readKPrefMultiplier(settings);
  const kPrefValue = h('span', { class: 'pf-mem-set-val' }, [formatMultiplier(initialKPref)]);
  const kPrefInput = h('input', {
    type: 'range', min: '0.5', max: '2', step: '0.25',
    value: String(initialKPref),
    class: 'pf-mem-set-slider',
    'aria-label': 'Bubble grouping preference',
  });
  kPrefInput.addEventListener('input', () => {
    const v = clampKPref(parseFloat(kPrefInput.value));
    kPrefValue.textContent = formatMultiplier(v);
  });
  kPrefInput.addEventListener('change', () => {
    const v = clampKPref(parseFloat(kPrefInput.value));
    updateField('memory.tool.kPrefMultiplier', v);
    if (typeof onChange === 'function') {
      try { onChange('kPrefMultiplier', v); } catch { /* best-effort */ }
    }
  });
  const kPrefRow = h('div', { class: 'pf-mem-set-row' }, [
    h('div', { class: 'pf-mem-set-row-header' }, [
      h('label', { class: 'pf-mem-set-label' }, ['Bubble grouping preference']),
      kPrefValue,
    ]),
    kPrefInput,
    h('div', { class: 'pf-mem-set-hint' }, [
      'Tilts the auto-recommended K-value toward more groups (denser, >1×) ' +
      'or fewer groups (sparser, <1×). Sanity bounds still apply — K stays ' +
      'in [3, 15] regardless. Takes effect on the next Memory tool open.',
    ]),
  ]);

  // ---- drawer root ----

  const drawer = h('div', {
    class: 'pf-mem-set-drawer',
    hidden: true,
    role: 'region',
    'aria-label': 'Memory tool settings',
  }, [
    h('div', { class: 'pf-mem-set-inner' }, [
      thresholdRow,
      lockThreshRow,
      kPrefRow,
      usageWindowRow,
      maxSnapsRow,
    ]),
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

// ---- Usage window helpers (#5b) ----
// 5..50 step 5, default 10 messages.
function readUsageWindow(settings) {
  const raw = (settings && settings.memory && settings.memory.tool &&
    settings.memory.tool.usageWindow);
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 10;
  return clampUsageWindow(raw);
}
function clampUsageWindow(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 10;
  const stepped = Math.round(n / 5) * 5;
  return Math.max(5, Math.min(50, stepped));
}

// ---- Lock reconciliation threshold helpers (#5c) ----
// 0..1 step 0.05. Default falls through to the rename threshold so
// the user's pre-decoupling experience is preserved unless they
// explicitly set this slider.
function readLockReconcileThreshold(settings, fallbackThreshold) {
  const raw = (settings && settings.memory && settings.memory.tool &&
    settings.memory.tool.lockReconcileThreshold);
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.min(1, raw));
  }
  if (typeof fallbackThreshold === 'number' && Number.isFinite(fallbackThreshold)) {
    return Math.max(0, Math.min(1, fallbackThreshold));
  }
  return 0.5;
}

// ---- K-cluster preference multiplier helpers (#5d) ----
// 0.5x..2x step 0.25, default 1x. Sanity bounds [3, 15] still
// applied inside recommendK regardless of this multiplier.
function readKPrefMultiplier(settings) {
  const raw = (settings && settings.memory && settings.memory.tool &&
    settings.memory.tool.kPrefMultiplier);
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 1;
  return clampKPref(raw);
}
function clampKPref(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 1;
  // Round to step 0.25 for tidy storage
  const stepped = Math.round(n * 4) / 4;
  return Math.max(0.5, Math.min(2, stepped));
}
function formatMultiplier(v) {
  // 1.0 → "1×"; 1.25 → "1.25×"; trim trailing zeros for cleanness
  const fixed = (Math.round(v * 100) / 100).toString();
  return `${fixed}×`;
}

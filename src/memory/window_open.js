// memory/window_open.js
//
// Entry point for the Memory/Lore curation window. Glues db, stage,
// bubbles, and the window UI:
//
//   1. Probe schema → bail gracefully if upstream shifted
//   2. Load baseline from Dexie → createStage(baseline)
//   3. Compute initial bubbles (per-scope) via bubbleize()
//   4. Bind UI handlers:
//      - Entry-level: promote/demote/delete (mutate stage, refresh)
//      - Bubble-level: same, applied to every member
//      - k-change: ± for memory or lore, recluster that panel
//      - toggle-bubble: flip expand state
//      - save/cancel/export
//   5. Show overlay
//
// The module owns: stage, pending deletions, bubble state (k per scope,
// expanded set per scope, current bubble layouts).
// The window module owns: DOM.
// stage.js knows nothing about bubbles.

import { probeSchema, loadBaseline, commitDiff, formatDiffSummary } from './db.js';
import { createStage } from './stage.js';
import { bubbleize, rebucket } from './bubbles.js';
import { recommendK } from './clustering.js';
import { createOverrides, toggleLock } from './bubble_overrides.js';
import { createMemoryWindow } from '../render/memory_window.js';
import { createOverlay } from '../render/overlay.js';
import { h } from '../utils/dom.js';

// ---- entry-point exposure ----
if (typeof window !== 'undefined') {
  const ns = window.__perchance_fork__ || (window.__perchance_fork__ = {});
  if (typeof ns.openMemory !== 'function') {
    ns.openMemory = () => openMemoryWindow();
  }
}

/**
 * Open the Memory/Lore window.
 */
export async function openMemoryWindow() {
  // ---- schema probe ----
  const probe = probeSchema();
  if (!probe.ok) {
    showInertNotice(
      'Memory & Lore is unavailable',
      `The Memory/Lore tool can't run here: ${probe.reason}. ` +
      `Your Perchance version may not be supported, or the database isn't ready yet.`
    );
    return;
  }

  // ---- load baseline ----
  let baseline;
  try {
    baseline = await loadBaseline();
  } catch (err) {
    showInertNotice(
      'Could not load memories',
      `Something went wrong reading your thread: ${(err && err.message) || String(err)}`
    );
    return;
  }

  const threadLabel = await getActiveThreadLabel();

  // ---- stage + delete queue ----
  const stage = createStage(baseline);
  const pendingDeletions = new Map();

  // ---- bubble state (owned by this module) ----
  // k per scope: initialized by recommendK() on the baseline. User can ± via
  // the k-slider in the panel headers. Clamped to [1, entries-in-scope].
  // expandedIds: the user's click-open-bubble set. Bubble ids are stable
  // (bubble:0, bubble:1, ...) for a given k, but change if k changes.
  // We clear expanded set on k change since the ids no longer mean anything.
  //
  // Note: bubbleize() reads `.embedding` but our db adapter stores the
  // vector on `.__embedding` (passthrough convention). We adapt at this
  // boundary so bubbles.js stays clean of db-specific field names.
  const asBubbleEntry = (it) => ({ ...it, embedding: it.__embedding });

  const initialMemoryEntries = stage.getStaged().filter(it => it.scope === 'memory').map(asBubbleEntry);
  const initialLoreEntries   = stage.getStaged().filter(it => it.scope === 'lore').map(asBubbleEntry);

  let memoryK = recommendK(initialMemoryEntries.length);
  let loreK   = recommendK(initialLoreEntries.length);

  let memoryBubbles = bubbleize({ entries: initialMemoryEntries, k: memoryK });
  let loreBubbles   = bubbleize({ entries: initialLoreEntries,   k: loreK });

  const expandedMemoryIds = new Set();
  const expandedLoreIds   = new Set();

  // Override state (lock toggles, bubble order, cross-bubble assignments,
  // intra-bubble card order). Separate instance per scope — Memory and
  // Lore are independent bubble universes, so their overrides don't
  // share namespaces. Currently only lock toggles are wired (commit 7b);
  // the rest comes online in 7d.
  const memoryOverrides = createOverrides();
  const loreOverrides   = createOverrides();

  // ---- refresh: recompute from current stage + current k, re-render ----

  function currentEntriesPerScope() {
    const staged = stage.getStaged();
    return {
      memory: staged.filter(it => it.scope === 'memory').map(asBubbleEntry),
      lore:   staged.filter(it => it.scope === 'lore').map(asBubbleEntry),
    };
  }

  function recomputeBubbles({ resetMemoryK = false, resetLoreK = false } = {}) {
    const { memory: memE, lore: lorE } = currentEntriesPerScope();

    if (resetMemoryK) memoryK = recommendK(memE.length);
    if (resetLoreK)   loreK   = recommendK(lorE.length);

    // Clamp k to entry count so we don't attempt more clusters than entries
    memoryK = Math.max(1, Math.min(memoryK, Math.max(1, memE.length)));
    loreK   = Math.max(1, Math.min(loreK,   Math.max(1, lorE.length)));

    // Rebucket preserves prior labels when entry set is unchanged.
    // Forces fresh bubbleize when new entries appear or k changed.
    memoryBubbles = rebucket({ entries: memE, prior: memoryBubbles, k: memoryK });
    loreBubbles   = rebucket({ entries: lorE, prior: loreBubbles,   k: loreK });

    // Drop expanded ids that no longer correspond to an existing bubble.
    const memIds = new Set(memoryBubbles.map(b => b.id));
    const lorIds = new Set(loreBubbles.map(b => b.id));
    for (const id of expandedMemoryIds) if (!memIds.has(id)) expandedMemoryIds.delete(id);
    for (const id of expandedLoreIds)   if (!lorIds.has(id)) expandedLoreIds.delete(id);
  }

  function refresh({ resetMemoryK = false, resetLoreK = false } = {}) {
    recomputeBubbles({ resetMemoryK, resetLoreK });
    overlay.updatePanels({
      memoryBubbles, loreBubbles,
      memoryK, loreK,
      expandedMemoryIds, expandedLoreIds,
      lockedMemoryIds: memoryOverrides.lockedBubbles,
      lockedLoreIds:   loreOverrides.lockedBubbles,
      deleteCount: pendingDeletions.size,
    });
    overlay.setSaveEnabled(stage.hasChanges() || pendingDeletions.size > 0);
  }

  // ---- helpers used by bubble-batch handlers ----

  function queueForDeletion(id) {
    const item = stage.getStaged().find(it => String(it.id) === String(id));
    if (item) pendingDeletions.set(String(id), item);
  }

  // ---- handlers ----

  const handlers = {
    // Entry-level
    onPromote: (id) => { stage.promote(id); refresh(); },
    onDemote:  (id) => { stage.demote(id);  refresh(); },
    onDelete:  (id) => { queueForDeletion(id); stage.remove(id); refresh(); },

    // Bubble-level (batch the same op over all members)
    onBubblePromote: (entries) => {
      for (const e of entries) stage.promote(e.id);
      refresh();
    },
    onBubbleDemote: (entries) => {
      for (const e of entries) stage.demote(e.id);
      refresh();
    },
    onBubbleDelete: (entries) => {
      for (const e of entries) {
        queueForDeletion(e.id);
        stage.remove(e.id);
      }
      refresh();
    },

    // k-slider: ± per scope. When k changes, recluster fresh (not rebucket).
    onChangeK: (scope, dir) => {
      const step = Number(dir) || 0;
      if (scope === 'memory') {
        const { memory } = currentEntriesPerScope();
        const newK = Math.max(1, Math.min(memoryK + step, Math.max(1, memory.length)));
        if (newK === memoryK) return; // clamped, no change
        memoryK = newK;
        // Fresh re-bubble (don't preserve prior labels — user WANTED change)
        memoryBubbles = bubbleize({ entries: memory, k: memoryK });
        expandedMemoryIds.clear(); // ids no longer meaningful
        overlay.updatePanels({
          memoryBubbles, loreBubbles, memoryK, loreK,
          expandedMemoryIds, expandedLoreIds,
          lockedMemoryIds: memoryOverrides.lockedBubbles,
          lockedLoreIds:   loreOverrides.lockedBubbles,
          deleteCount: pendingDeletions.size,
        });
      } else if (scope === 'lore') {
        const { lore } = currentEntriesPerScope();
        const newK = Math.max(1, Math.min(loreK + step, Math.max(1, lore.length)));
        if (newK === loreK) return;
        loreK = newK;
        loreBubbles = bubbleize({ entries: lore, k: loreK });
        expandedLoreIds.clear();
        overlay.updatePanels({
          memoryBubbles, loreBubbles, memoryK, loreK,
          expandedMemoryIds, expandedLoreIds,
          lockedMemoryIds: memoryOverrides.lockedBubbles,
          lockedLoreIds:   loreOverrides.lockedBubbles,
          deleteCount: pendingDeletions.size,
        });
      }
    },

    // Expand/collapse — no stage mutation, just toggle the set + re-render
    onToggleBubble: (scope, bubbleId) => {
      const set = scope === 'memory' ? expandedMemoryIds : expandedLoreIds;
      if (set.has(bubbleId)) set.delete(bubbleId);
      else set.add(bubbleId);
      overlay.updatePanels({
        memoryBubbles, loreBubbles, memoryK, loreK,
        expandedMemoryIds, expandedLoreIds,
        lockedMemoryIds: memoryOverrides.lockedBubbles,
        lockedLoreIds:   loreOverrides.lockedBubbles,
        deleteCount: pendingDeletions.size,
      });
    },

    // Lock toggle — session-scoped. In 7b this only affects the visual
    // indicator; 7d wires it to actually prevent reorder operations.
    onToggleLock: (scope, bubbleId) => {
      const overrides = scope === 'memory' ? memoryOverrides : loreOverrides;
      toggleLock(overrides, bubbleId);
      overlay.updatePanels({
        memoryBubbles, loreBubbles, memoryK, loreK,
        expandedMemoryIds, expandedLoreIds,
        lockedMemoryIds: memoryOverrides.lockedBubbles,
        lockedLoreIds:   loreOverrides.lockedBubbles,
        deleteCount: pendingDeletions.size,
      });
    },

    // Footer actions
    onSave: async () => {
      const diff = stage.computeDiff();
      if (diff.totalChanges === 0) { alert('No changes to save.'); return; }
      const confirmed = window.confirm(
        formatDiffSummary(diff) + '\n\nThis action is permanent — there is no undo.'
      );
      if (!confirmed) return;

      overlay.setSaveLabel('Saving…');
      overlay.setSaveEnabled(false);

      const result = await commitDiff({ baselineItems: baseline, diff });
      if (!result.ok) {
        alert(`Save failed: ${result.error}\n\nYour edits are still staged — you can retry or Cancel.`);
        overlay.setSaveLabel('Save');
        overlay.setSaveEnabled(true);
        return;
      }
      overlay.hide();
    },
    onExport: () => {
      const state = {
        schema: 1,
        exportedAt: new Date().toISOString(),
        threadLabel,
        stagedItems: stage.getStaged(),
        pendingDeletions: Array.from(pendingDeletions.values()),
        baseline,
      };
      showExportDialog(JSON.stringify(state, null, 2));
    },
    onCancel: () => {
      if (stage.hasChanges() || pendingDeletions.size > 0) {
        const ok = window.confirm('Discard all unsaved changes?');
        if (!ok) return;
      }
      overlay.hide();
    },
  };

  // ---- window ----

  const overlay = createMemoryWindow({
    initialState: {
      memoryBubbles, loreBubbles,
      memoryK, loreK,
      expandedMemoryIds, expandedLoreIds,
      lockedMemoryIds: memoryOverrides.lockedBubbles,
      lockedLoreIds:   loreOverrides.lockedBubbles,
      deleteCount: 0,
    },
    threadLabel,
    handlers,
  });

  overlay.show();
}

// ---- helpers ----

async function getActiveThreadLabel() {
  try {
    const db = (typeof window !== 'undefined') ? window.db : null;
    const threadId = (typeof window !== 'undefined') ? window.activeThreadId : null;
    if (!db || !threadId) return '';
    const thread = await db.threads.get(threadId);
    return (thread && thread.name) ? String(thread.name) : '';
  } catch {
    return '';
  }
}

function showInertNotice(title, body) {
  const overlay = createOverlay({
    ariaLabel: title,
    children: [
      h('div', { class: 'pf-mem-notice' }, [
        h('h2', { class: 'pf-mem-notice-title' }, [title]),
        h('p',  { class: 'pf-mem-notice-body' },  [body]),
      ]),
    ],
  });
  overlay.show();
}

function showExportDialog(jsonText) {
  const textarea = h('textarea', {
    class: 'pf-mem-export-textarea',
    rows: '20',
    readonly: 'true',
    spellcheck: 'false',
    'aria-label': 'Exported state as JSON',
  });
  textarea.value = jsonText;

  const copyBtn = h('button', {
    type: 'button',
    class: 'pf-mem-btn pf-mem-btn-primary',
    onClick: async () => {
      try {
        await navigator.clipboard.writeText(jsonText);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy to clipboard'; }, 1500);
      } catch {
        textarea.focus();
        textarea.select();
      }
    },
  }, ['Copy to clipboard']);

  const overlay = createOverlay({
    ariaLabel: 'Export staged state',
    children: [
      h('div', { class: 'pf-mem-export' }, [
        h('h2', { class: 'pf-mem-title' }, ['Export']),
        h('p', { class: 'pf-mem-export-hint' }, [
          'Copy this JSON and save it to a file. If you cancel without ',
          'saving to the database, this export preserves what you\u2019ve staged.',
        ]),
        textarea,
        h('div', { class: 'pf-mem-export-actions' }, [copyBtn]),
      ]),
    ],
  });
  overlay.show();
}

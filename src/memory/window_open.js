// memory/window_open.js
//
// Entry point for the Memory/Lore curation window. Glues db, stage, and
// window UI:
//
//   1. Probe schema → bail gracefully if upstream shifted
//   2. Load baseline from Dexie → createStage(baseline)
//   3. Render window with initial items
//   4. Bind UI handlers (promote/demote/delete/save/export/cancel)
//      - Each UI action mutates the stage, then re-renders panels
//      - Save shows confirm with diff summary, then commitDiff
//      - Cancel discards staged edits and closes
//      - Export produces a JSON blob the user can copy to a file
//   5. Show overlay
//
// The window itself is stateless — this module owns the stage and the
// delete queue (items staged for removal).

import { probeSchema, loadBaseline, commitDiff, formatDiffSummary } from './db.js';
import { createStage } from './stage.js';
import { createMemoryWindow } from '../render/memory_window.js';
import { createOverlay } from '../render/overlay.js';
import { h } from '../utils/dom.js';

// ---- entry-point exposure ----
//
// openMemoryWindow is the surface the rest of the fork uses to open
// the curation tool. For this commit there's no in-UI button yet — we
// expose it on window.__perchance_fork__ so you can invoke it from the
// browser console while iterating:
//
//   window.__perchance_fork__.openMemory()
//
// The button-based entry point (probably a small control next to the
// chat input, or a link in our existing profile overlay) lands in the
// next commit once the window's basic flow is verified.
if (typeof window !== 'undefined') {
  const ns = window.__perchance_fork__ || (window.__perchance_fork__ = {});
  // Guard against the module being loaded twice (e.g. hot-reload)
  if (typeof ns.openMemory !== 'function') {
    ns.openMemory = () => openMemoryWindow();
  }
}

/**
 * Open the Memory/Lore window. Returns a Promise that resolves when the
 * window closes. Errors inside the flow produce an inert notice rather
 * than crashing the host page.
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

  // Get thread name for the header chip, best-effort.
  const threadLabel = await getActiveThreadLabel();

  // ---- stage + delete queue ----
  const stage = createStage(baseline);
  // Items the user has dropped into the Delete zone. These are REMOVED
  // from the stage (so they disappear from panels) but tracked here so
  // Save knows to call stage.remove() on them first / UI can show a tally.
  const pendingDeletions = new Map(); // id(str) → StageItem

  // ---- handlers ----

  function refresh() {
    overlay.updatePanels(stage.getStaged(), pendingDeletions.size);
    overlay.setSaveEnabled(stage.hasChanges() || pendingDeletions.size > 0);
  }

  const handlers = {
    onPromote: (id) => {
      stage.promote(id);
      refresh();
    },
    onDemote: (id) => {
      stage.demote(id);
      refresh();
    },
    onDelete: (id) => {
      // Find the staged item before removing it — we need its data
      // for later commit (the db adapter needs passthrough fields).
      const item = stage.getStaged().find(it => String(it.id) === String(id));
      if (item) pendingDeletions.set(String(id), item);
      stage.remove(id);
      refresh();
    },
    onSave: async () => {
      // Apply pending deletions to stage (stage.remove has already
      // happened for them, so they're absent from getStaged() — but
      // computeDiff needs them to appear in diff.deleted, which happens
      // naturally when they're in baseline but not in staged. Good.)
      const diff = stage.computeDiff();
      if (diff.totalChanges === 0) {
        alert('No changes to save.');
        return;
      }
      const confirmed = window.confirm(
        formatDiffSummary(diff) +
        '\n\nThis action is permanent — there is no undo.'
      );
      if (!confirmed) return;

      overlay.setSaveLabel('Saving…');
      overlay.setSaveEnabled(false);

      const result = await commitDiff({
        baselineItems: baseline,
        diff,
      });

      if (!result.ok) {
        alert(`Save failed: ${result.error}\n\nYour edits are still staged — you can retry or Cancel.`);
        overlay.setSaveLabel('Save');
        overlay.setSaveEnabled(true);
        return;
      }

      // Success — close the window.
      overlay.hide();
    },
    onExport: () => {
      const state = {
        schema: 1,
        exportedAt: new Date().toISOString(),
        threadLabel,
        stagedItems: stage.getStaged(),
        pendingDeletions: Array.from(pendingDeletions.values()),
        baseline,  // include so a future 'import' could reconstruct stage
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
    items: stage.getStaged(),
    threadLabel,
    deleteCount: 0,
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

/**
 * Show a small, inert notice overlay when we can't run the feature.
 * Uses the standard overlay component so close behavior is consistent.
 */
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

/**
 * Show a simple "here's your export as JSON" dialog. Textarea + close.
 * Matches the pattern the profile Backup section uses for Export.
 */
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

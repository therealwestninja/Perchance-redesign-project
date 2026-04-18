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

import { probeSchema, loadBaseline, loadUsageHistogram, commitDiff, formatDiffSummary } from './db.js';
import { createStage } from './stage.js';
import { bubbleize, rebucket, bubbleizeWithLocks, rebucketWithLocks } from './bubbles.js';
import { recommendK } from './clustering.js';
import { createOverrides, toggleLock, applyOverrides, moveBubbleBefore, moveCardBefore, forgetCard, assignCardToBubble } from './bubble_overrides.js';
import { loadLocks, persistLock, forgetLock, reconcileLocks } from './lock_persistence.js';
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

  // Usage histogram: which memories/lore have been referenced by the AI
  // across the last N messages. Drives the "recently used" dot indicator
  // on cards. Load failure is non-fatal — cards just render without dots.
  let usageHistogram = { memoryCounts: new Map(), loreCounts: new Map(), messagesScanned: 0 };
  try {
    usageHistogram = await loadUsageHistogram({ lastN: 10 });
  } catch { /* soft-fail — dots are a hint, not core functionality */ }

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
  // share namespaces.
  const memoryOverrides = createOverrides();
  const loreOverrides   = createOverrides();

  // Reconcile persisted Memory-scope locks against the initial clustering.
  // Lore locks aren't persisted (Lore has no lock UI that matters in
  // practice since Lore has no reorder, but we'd extend the same shape
  // here if we ever did).
  const activeThreadId = (typeof window !== 'undefined') ? window.activeThreadId : null;
  // Map from stable-id to its persisted lock record, needed so we can
  // forget a persisted lock when the user unlocks its current-session
  // counterpart. Populated during reconciliation below.
  const stableIdByCurrentBubble = new Map(); // bubbleId → stableId
  if (activeThreadId != null) {
    const persistedMemLocks = loadLocks(activeThreadId);
    const { lockedBubbleIds, transferredIds } = reconcileLocks(memoryBubbles, persistedMemLocks);
    for (const id of lockedBubbleIds) memoryOverrides.lockedBubbles.add(String(id));
    for (const t of transferredIds) {
      stableIdByCurrentBubble.set(String(t.newBubbleId), t.stableId);
    }
  }

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

    // Count entries that are NOT in locked bubbles — these are the only
    // ones k-means gets to cluster. If all entries are locked, k becomes
    // moot (clamped to at least 1).
    const memFreeCount = countFreeEntries(memE, memoryBubbles, memoryOverrides.lockedBubbles);
    const lorFreeCount = countFreeEntries(lorE, loreBubbles,   loreOverrides.lockedBubbles);

    if (resetMemoryK) memoryK = recommendK(memFreeCount);
    if (resetLoreK)   loreK   = recommendK(lorFreeCount);

    // k is the count of FREE bubbles (locked bubbles don't count). Clamp
    // against the number of free entries available, not the total.
    memoryK = Math.max(1, Math.min(memoryK, Math.max(1, memFreeCount)));
    loreK   = Math.max(1, Math.min(loreK,   Math.max(1, lorFreeCount)));

    // Lock-aware rebucket: frozen bubbles pass through untouched, free
    // entries get fresh clustering.
    memoryBubbles = rebucketWithLocks({
      entries: memE,
      prior: memoryBubbles,
      lockedBubbleIds: memoryOverrides.lockedBubbles,
      k: memoryK,
    });
    loreBubbles = rebucketWithLocks({
      entries: lorE,
      prior: loreBubbles,
      lockedBubbleIds: loreOverrides.lockedBubbles,
      k: loreK,
    });

    // Apply the user-override layer on top of the clustering output.
    // This reconciles: bubble-order assertions, intra-bubble card-order
    // assertions, cross-bubble membership assignments. Pure-logic tests
    // in test/bubble_overrides.test.mjs cover the reconciliation rules.
    memoryBubbles = applyOverrides(memoryOverrides, memoryBubbles);
    loreBubbles   = applyOverrides(loreOverrides,   loreBubbles);

    // Drop expanded ids that no longer correspond to an existing bubble.
    const memIds = new Set(memoryBubbles.map(b => b.id));
    const lorIds = new Set(loreBubbles.map(b => b.id));
    for (const id of expandedMemoryIds) if (!memIds.has(id)) expandedMemoryIds.delete(id);
    for (const id of expandedLoreIds)   if (!lorIds.has(id)) expandedLoreIds.delete(id);
  }

  // Helper used by recomputeBubbles: of the currently-staged entries, how
  // many are NOT members of any locked bubble?
  function countFreeEntries(entries, currentBubbles, lockedBubbleIds) {
    if (!lockedBubbleIds || lockedBubbleIds.size === 0) return entries.length;
    const frozenIds = new Set();
    for (const b of currentBubbles || []) {
      if (!lockedBubbleIds.has(String(b.id))) continue;
      for (const e of b.entries) frozenIds.add(String(e.id));
    }
    let count = 0;
    for (const e of entries) {
      if (!frozenIds.has(String(e.id))) count++;
    }
    return count;
  }

  /**
   * Build the state object that gets passed to overlay.updatePanels(...).
   * Centralized so every call site stays in sync — this is especially
   * important for things like usage histograms that were added after the
   * original design. Add new fields here once, not five times.
   */
  function panelsState() {
    return {
      memoryBubbles, loreBubbles,
      memoryK, loreK,
      expandedMemoryIds, expandedLoreIds,
      lockedMemoryIds: memoryOverrides.lockedBubbles,
      lockedLoreIds:   loreOverrides.lockedBubbles,
      deleteCount: pendingDeletions.size,
      memoryUsageCounts: usageHistogram.memoryCounts,
      loreUsageCounts:   usageHistogram.loreCounts,
    };
  }

  function refresh({ resetMemoryK = false, resetLoreK = false } = {}) {
    recomputeBubbles({ resetMemoryK, resetLoreK });
    overlay.updatePanels(panelsState());
    overlay.setSaveEnabled(stage.hasChanges() || pendingDeletions.size > 0);
  }

  // ---- helpers used by bubble-batch handlers ----

  /**
   * Returns true iff the user has applied any reorder action that would
   * affect on-disk storage:
   *   - A non-empty bubbleOrder (user manually ordered bubbles)
   *   - Any bubbleCardOrder entries (user reordered within a bubble)
   *   - Any cardToBubbleId entries (user moved a card cross-bubble)
   *
   * Locking alone does NOT count — lock is session-only.
   * Returns false when the rendered order is exactly what clustering
   * produced with no user intervention (save can skip remap step).
   */
  function hasReorderChanged() {
    if (memoryOverrides.bubbleOrder.length > 0) return true;
    if (memoryOverrides.bubbleCardOrder.size > 0) return true;
    if (memoryOverrides.cardToBubbleId.size > 0) return true;
    return false;
  }

  function queueForDeletion(id) {
    const item = stage.getStaged().find(it => String(it.id) === String(id));
    if (item) pendingDeletions.set(String(id), item);
  }

  /**
   * When a locked memory bubble is about to be destroyed (contents
   * promoted, demoted, or deleted), remove its stable-id from persisted
   * storage so the lock doesn't reappear next session on a different
   * bubble that happens to overlap.
   */
  function forgetPersistedLockForBubble(bubbleId) {
    if (activeThreadId == null) return;
    const stableId = stableIdByCurrentBubble.get(String(bubbleId));
    if (stableId) {
      forgetLock(activeThreadId, stableId);
      stableIdByCurrentBubble.delete(String(bubbleId));
    }
  }

  /**
   * Returns 'memory' | 'lore' | null based on which panel's current
   * bubble layout contains the given bubbleId. Used by onBubbleDelete
   * (which doesn't know the scope from its call site in the DOM).
   */
  function locatedBubbleScope(bubbleId) {
    if (!bubbleId) return null;
    const id = String(bubbleId);
    if (memoryBubbles.some(b => String(b.id) === id)) return 'memory';
    if (loreBubbles.some(b => String(b.id) === id)) return 'lore';
    return null;
  }

  /**
   * If the given bubble is locked in its scope's override set, prompt
   * the user for confirmation. Returns true if the action should proceed,
   * false if the user declined (or if we couldn't determine the scope).
   *
   * Returns true unconditionally when the bubble isn't locked (so callers
   * can wrap every bubble-batch handler in this without branches).
   */
  function confirmIfLocked(scope, bubbleId, message) {
    if (!bubbleId || !scope) return true;
    const overrides = scope === 'memory' ? memoryOverrides : loreOverrides;
    if (!overrides.lockedBubbles.has(String(bubbleId))) return true;
    return window.confirm(message);
  }

  // ---- handlers ----

  const handlers = {
    // Entry-level
    onPromote: (id) => {
      stage.promote(id);
      // Card moves to lore — forget its memory-side override
      forgetCard(memoryOverrides, id);
      refresh();
    },
    onDemote: (id) => {
      stage.demote(id);
      forgetCard(loreOverrides, id);
      refresh();
    },
    onDelete: (id) => {
      queueForDeletion(id);
      stage.remove(id);
      forgetCard(memoryOverrides, id);
      forgetCard(loreOverrides, id);
      refresh();
    },

    // Bubble-level (batch the same op over all members).
    //
    // If the bubble is LOCKED, the batch action is destructive of the
    // user's pinning decision — so we confirm first. Once confirmed, we
    // remove the lock BEFORE running the batch so that the next
    // recomputeBubbles() prunes the now-empty bubble naturally (empty
    // locked bubbles are preserved as shells; empty unlocked bubbles
    // are dropped).
    //
    // Individual card actions inside a locked bubble don't confirm — they
    // are explicitly one-at-a-time gestures and repeated prompts would be
    // tedious.
    onBubblePromote: (bubbleId, entries) => {
      if (!confirmIfLocked('memory', bubbleId, `Promote all contents of this pinned bubble to Lore? The bubble will also be unlocked.`)) return;
      if (bubbleId) {
        memoryOverrides.lockedBubbles.delete(String(bubbleId));
        forgetPersistedLockForBubble(bubbleId);
      }
      for (const e of entries) {
        stage.promote(e.id);
        forgetCard(memoryOverrides, e.id);
      }
      refresh();
    },
    onBubbleDemote: (bubbleId, entries) => {
      if (!confirmIfLocked('lore', bubbleId, `Demote all contents of this pinned bubble to Memory? The bubble will also be unlocked.`)) return;
      if (bubbleId) loreOverrides.lockedBubbles.delete(String(bubbleId));
      for (const e of entries) {
        stage.demote(e.id);
        forgetCard(loreOverrides, e.id);
      }
      refresh();
    },
    onBubbleDelete: (bubbleId, entries) => {
      const scope = locatedBubbleScope(bubbleId);
      if (!confirmIfLocked(scope, bubbleId, `Delete all ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} in this pinned bubble? The bubble itself will also be removed.`)) return;
      if (bubbleId) {
        memoryOverrides.lockedBubbles.delete(String(bubbleId));
        loreOverrides.lockedBubbles.delete(String(bubbleId));
        forgetPersistedLockForBubble(bubbleId);
      }
      for (const e of entries) {
        queueForDeletion(e.id);
        stage.remove(e.id);
        forgetCard(memoryOverrides, e.id);
        forgetCard(loreOverrides, e.id);
      }
      refresh();
    },

    // Reorder gestures (7d). Lore has no reorder at all — these handlers
    // short-circuit if called with scope='lore' (defense in depth; the
    // renderer already gates grip rendering to Memory).
    //
    // onReorderBubble: move bubble `bubbleId` to the position just before
    // `beforeBubbleId` (null = move to end). Locked bubbles resist — but
    // the grip is disabled on them so this is theoretical. We still
    // defensively refuse to reorder a locked bubble.
    onReorderBubble: (scope, bubbleId, beforeBubbleId) => {
      if (scope !== 'memory') return;
      if (memoryOverrides.lockedBubbles.has(String(bubbleId))) return;
      const currentOrder = memoryBubbles.map(b => b.id);
      moveBubbleBefore(memoryOverrides, bubbleId, beforeBubbleId, currentOrder);
      refresh();
    },

    // onReorderCard: move card `cardId` (which lives in `sourceBubbleId`)
    // to the position just before `beforeCardId` in `targetBubbleId`.
    //
    // 7d.1 was within-bubble only (source == target). 7d.2 allows
    // cross-bubble: when source != target, the card is RELOCATED to
    // the target bubble. The move is recorded as a user-assertion via
    // assignCardToBubble, so it survives re-clustering.
    //
    // Lock enforcement:
    //   - Source locked → refuse (can't lift cards out of a locked bubble).
    //     Normally the card has no grip inside a locked bubble, but
    //     belt-and-suspenders here.
    //   - Target locked → refuse. The UI normally doesn't render drop
    //     gaps in locked bubbles, but belt-and-suspenders.
    onReorderCard: (scope, sourceBubbleId, cardId, targetBubbleId, beforeCardId) => {
      if (scope !== 'memory') return;
      const sourceLocked = memoryOverrides.lockedBubbles.has(String(sourceBubbleId));
      const targetLocked = memoryOverrides.lockedBubbles.has(String(targetBubbleId));
      if (sourceLocked || targetLocked) return;

      const sameBubble = String(sourceBubbleId) === String(targetBubbleId);

      if (sameBubble) {
        // Within-bubble reorder (7d.1 path, unchanged)
        const source = memoryBubbles.find(b => String(b.id) === String(sourceBubbleId));
        if (!source) return;
        const currentCardOrder = source.entries.map(e => e.id);
        moveCardBefore(memoryOverrides, sourceBubbleId, cardId, beforeCardId, currentCardOrder);
      } else {
        // Cross-bubble relocation (7d.2)
        // 1. Assert the new membership — this is a user override that
        //    survives re-clustering.
        assignCardToBubble(memoryOverrides, cardId, targetBubbleId);

        // 2. Position it within the target bubble's card order.
        //    If the target had no user-order yet, we need to seed it
        //    with the current order + insert. moveCardBefore already
        //    handles the 'insert into current order' part — we just
        //    need to give it the target bubble's current card order
        //    (which does NOT yet include the incoming card, because
        //    the card still lives in the source at this point).
        const target = memoryBubbles.find(b => String(b.id) === String(targetBubbleId));
        if (target) {
          const currentTargetOrder = target.entries.map(e => e.id);
          moveCardBefore(memoryOverrides, targetBubbleId, cardId, beforeCardId, currentTargetOrder);
        }

        // 3. The card no longer belongs in the source's card-order list.
        //    moveCardBefore won't clean it up because it thinks it's
        //    ADDING the card to the target. Manually remove from source.
        if (memoryOverrides.bubbleCardOrder.has(String(sourceBubbleId))) {
          const srcOrder = memoryOverrides.bubbleCardOrder.get(String(sourceBubbleId));
          const cleaned = srcOrder.filter(id => String(id) !== String(cardId));
          if (cleaned.length === 0) memoryOverrides.bubbleCardOrder.delete(String(sourceBubbleId));
          else memoryOverrides.bubbleCardOrder.set(String(sourceBubbleId), cleaned);
        }
      }

      refresh();
    },

    // k-slider: ± per scope. k now counts ONLY free (non-locked) bubbles.
    // Clusters the free entries; locked bubbles pass through untouched.
    onChangeK: (scope, dir) => {
      const step = Number(dir) || 0;
      if (scope === 'memory') {
        const { memory } = currentEntriesPerScope();
        const memFreeCount = countFreeEntries(memory, memoryBubbles, memoryOverrides.lockedBubbles);
        const newK = Math.max(1, Math.min(memoryK + step, Math.max(1, memFreeCount)));
        if (newK === memoryK) return; // clamped, no change
        memoryK = newK;
        memoryBubbles = bubbleizeWithLocks({
          entries: memory,
          currentBubbles: memoryBubbles,
          lockedBubbleIds: memoryOverrides.lockedBubbles,
          k: memoryK,
        });
        memoryBubbles = applyOverrides(memoryOverrides, memoryBubbles);
        // Preserve expanded state for locked bubbles (their ids survive).
        // Free bubbles get new ids, so drop those from expanded.
        for (const id of expandedMemoryIds) {
          if (!memoryOverrides.lockedBubbles.has(String(id))) {
            expandedMemoryIds.delete(id);
          }
        }
        overlay.updatePanels(panelsState());
      } else if (scope === 'lore') {
        const { lore } = currentEntriesPerScope();
        const lorFreeCount = countFreeEntries(lore, loreBubbles, loreOverrides.lockedBubbles);
        const newK = Math.max(1, Math.min(loreK + step, Math.max(1, lorFreeCount)));
        if (newK === loreK) return;
        loreK = newK;
        loreBubbles = bubbleizeWithLocks({
          entries: lore,
          currentBubbles: loreBubbles,
          lockedBubbleIds: loreOverrides.lockedBubbles,
          k: loreK,
        });
        loreBubbles = applyOverrides(loreOverrides, loreBubbles);
        for (const id of expandedLoreIds) {
          if (!loreOverrides.lockedBubbles.has(String(id))) {
            expandedLoreIds.delete(id);
          }
        }
        overlay.updatePanels(panelsState());
      }
    },

    // Expand/collapse — no stage mutation, just toggle the set + re-render
    onToggleBubble: (scope, bubbleId) => {
      const set = scope === 'memory' ? expandedMemoryIds : expandedLoreIds;
      if (set.has(bubbleId)) set.delete(bubbleId);
      else set.add(bubbleId);
      overlay.updatePanels(panelsState());
    },

    // Lock toggle — session state is kept in memoryOverrides.lockedBubbles,
    // and for Memory scope only, mirrored to persistent per-thread storage.
    // Lore locks don't persist — Lore has no reorder semantics that care.
    onToggleLock: (scope, bubbleId) => {
      const overrides = scope === 'memory' ? memoryOverrides : loreOverrides;
      const nowLocked = toggleLock(overrides, bubbleId);

      // Persist (Memory scope only) — find the current bubble's members
      // and record the lock against their stable hash.
      if (scope === 'memory' && activeThreadId != null) {
        if (nowLocked) {
          const b = memoryBubbles.find(x => String(x.id) === String(bubbleId));
          if (b) {
            const memberIds = b.entries.map(e => String(e.id));
            const stableId = persistLock(activeThreadId, memberIds);
            stableIdByCurrentBubble.set(String(bubbleId), stableId);
          }
        } else {
          // Unlock — find the stable id that was recorded and forget it
          const stableId = stableIdByCurrentBubble.get(String(bubbleId));
          if (stableId) {
            forgetLock(activeThreadId, stableId);
            stableIdByCurrentBubble.delete(String(bubbleId));
          }
        }
      }

      overlay.updatePanels(panelsState());
    },

    // Footer actions
    onSave: async () => {
      const diff = stage.computeDiff();
      if (diff.totalChanges === 0 && !hasReorderChanged()) { alert('No changes to save.'); return; }

      // Build the user's desired final order of Memory entries: walk the
      // rendered bubbles top-to-bottom, collect entries with their lock
      // status. Locked-bubble entries keep their original messages on save
      // (the "locked-stays-put" carve-out). Only unlocked entries get
      // proportionally remapped across messages.
      const memoryOrder = [];
      for (const bubble of memoryBubbles) {
        const isBubbleLocked = memoryOverrides.lockedBubbles.has(String(bubble.id));
        for (const entry of bubble.entries) {
          memoryOrder.push({ id: entry.id, locked: isBubbleLocked });
        }
      }

      const summary = formatDiffSummary(diff);
      const reorderNote = hasReorderChanged()
        ? '\n\nMemory order will be saved (proportional message remap). Locked bubbles keep their original messages.'
        : '';
      const confirmed = window.confirm(
        summary + reorderNote + '\n\nThis action is permanent — there is no undo.'
      );
      if (!confirmed) return;

      overlay.setSaveLabel('Saving…');
      overlay.setSaveEnabled(false);

      const result = await commitDiff({
        baselineItems: baseline,
        diff,
        memoryOrder,
      });
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

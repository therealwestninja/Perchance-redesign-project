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

import { probeSchema, loadBaseline, loadUsageHistogram, commitDiff, formatDiffSummary, formatSaveStatsSummary } from './db.js';
import { createStage } from './stage.js';
import { bubbleize, rebucket, bubbleizeWithLocks, rebucketWithLocks } from './bubbles.js';
import { recommendK } from './clustering.js';
import { createOverrides, toggleLock, applyOverrides, moveBubbleBefore, moveCardBefore, forgetCard, assignCardToBubble, renameBubble } from './bubble_overrides.js';
import { loadLocks, persistLock, forgetLock, reconcileLocks } from './lock_persistence.js';
import { loadSnapshots, captureSnapshot, deleteSnapshot, findSnapshot, buildRestoreDiff, formatSnapshotSummary } from './snapshots.js';
import { createMemoryWindow } from '../render/memory_window.js';
import { createOverlay } from '../render/overlay.js';
import { h } from '../utils/dom.js';
import { bumpCounter } from '../stats/counters.js';
import { loadSettings } from '../profile/settings_store.js';
import { recordActivityForStreak } from '../stats/streaks.js';
import { openSpinOffDialog } from './spinoff_character.js';

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

  // Snapshot activeThreadId ONCE at the top so every per-thread
  // tagging downstream (counter bumps, lock reconcile, lore order)
  // attributes to the same thread even if the user rapidly switches
  // threads in upstream Perchance during this function's lifetime.
  // Without this snapshot, the line-65 counter bump and the
  // line-~150 lock-reconcile could read different values from
  // window.activeThreadId — small but real race.
  const sessionThreadId = (typeof window !== 'undefined') ? window.activeThreadId : null;

  // Count this as a successful bubble-tool open for the profile's
  // activity counters. Done after schema probe so we don't count
  // failed-to-open-for-reasons-outside-the-user's-control as usage.
  // Per-thread tally (#3) wired here too — opening the Memory tool
  // is naturally scoped to whatever thread is currently active.
  bumpCounter('memoryWindowOpens', 1, sessionThreadId);
  // Record today as an activity day for the streak system. Idempotent
  // within a day — multiple opens don't inflate the streak. If today
  // is consecutive with lastActiveDay, current streak advances; if
  // there's a gap, it resets to 1.
  try { recordActivityForStreak(); } catch { /* non-fatal */ }

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
    // Window is user-tunable via the gear-icon settings drawer
    // (settings.memory.tool.usageWindow). Defaults to 10. Read inline
    // here so changes take effect on the next window open.
    let usageWindow = 10;
    try {
      const s = (typeof loadSettings === 'function') ? loadSettings() : null;
      const raw = s && s.memory && s.memory.tool && s.memory.tool.usageWindow;
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        usageWindow = Math.max(5, Math.min(50, Math.round(raw)));
      }
    } catch { /* defensive */ }
    usageHistogram = await loadUsageHistogram({ lastN: usageWindow });
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

  // K-cluster preference (sparser/denser bubbles): drawer slider
  // 0.5x..2x, default 1x. Sanity bounds inside recommendK still
  // clamp the result to [3, 15].
  let kPrefMultiplier = 1;
  try {
    const s = loadSettings();
    const raw = s && s.memory && s.memory.tool && s.memory.tool.kPrefMultiplier;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      kPrefMultiplier = Math.max(0.5, Math.min(2, raw));
    }
  } catch { /* defensive */ }
  let memoryK = recommendK(initialMemoryEntries.length, kPrefMultiplier);
  let loreK   = recommendK(initialLoreEntries.length, kPrefMultiplier);

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
  // Reuses the sessionThreadId snapshot taken at the top of this
  // function — see comment there for why we don't re-read window.activeThreadId.
  const activeThreadId = sessionThreadId;
  // Map from stable-id to its persisted lock record, needed so we can
  // forget a persisted lock when the user unlocks its current-session
  // counterpart. Populated during reconciliation below.
  const stableIdByCurrentBubble = new Map(); // bubbleId → stableId
  if (activeThreadId != null) {
    const persistedMemLocks = loadLocks(activeThreadId);
    // Lock reconciliation threshold: how similar a fresh-cluster
    // bubble must be to its persisted-locked counterpart for the lock
    // to transfer. User-tunable via the gear-icon settings drawer
    // (settings.memory.tool.lockReconcileThreshold). Falls through to
    // the rename threshold if unset, then to library default 0.5 — so
    // existing users see no behavior change unless they explicitly set
    // it.
    let reconcileThreshold;
    try {
      const s = loadSettings();
      const tool = s && s.memory && s.memory.tool;
      const raw = tool && tool.lockReconcileThreshold;
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        reconcileThreshold = Math.max(0, Math.min(1, raw));
      } else {
        const rt = tool && tool.renameThreshold;
        reconcileThreshold = (typeof rt === 'number' && Number.isFinite(rt))
          ? Math.max(0, Math.min(1, rt))
          : undefined; // let reconcileLocks use its own default
      }
    } catch { /* defensive */ }
    const opts = (reconcileThreshold == null) ? undefined : { threshold: reconcileThreshold };
    const { lockedBubbleIds, transferredIds } = reconcileLocks(memoryBubbles, persistedMemLocks, opts);
    for (const id of lockedBubbleIds) memoryOverrides.lockedBubbles.add(String(id));
    for (const t of transferredIds) {
      stableIdByCurrentBubble.set(String(t.newBubbleId), t.stableId);
    }
  }

  // ---- scope dispatch ----
  //
  // Most handlers operate on EITHER memory or lore state. Previously
  // every handler had its own scope === 'memory' ? memoryX : loreX
  // ladder. Centralize that into `byScope(scope)` which returns a
  // bundle of per-scope accessors and setters. Handlers become short
  // and symmetric.
  //
  // The only scope-specific piece left after this refactor is
  // lock PERSISTENCE — memory locks persist via lock_persistence.js,
  // lore locks stay session-only. That asymmetry is called out at the
  // call site with an explicit `if (scope === 'memory')` guard.
  function byScope(scope) {
    if (scope === 'memory') {
      return {
        overrides: memoryOverrides,
        getBubbles: () => memoryBubbles,
        setBubbles: (b) => { memoryBubbles = b; },
        getK: () => memoryK,
        setK: (k) => { memoryK = k; },
        getEntries: () => currentEntriesPerScope().memory,
        expandedIds: expandedMemoryIds,
        locksPersist: true,
      };
    }
    if (scope === 'lore') {
      return {
        overrides: loreOverrides,
        getBubbles: () => loreBubbles,
        setBubbles: (b) => { loreBubbles = b; },
        getK: () => loreK,
        setK: (k) => { loreK = k; },
        getEntries: () => currentEntriesPerScope().lore,
        expandedIds: expandedLoreIds,
        locksPersist: false,
      };
    }
    return null;
  }

  // ---- refresh: recompute from current stage + current k, re-render ----

  function currentEntriesPerScope() {
    const staged = stage.getStaged();
    return {
      memory: staged.filter(it => it.scope === 'memory').map(asBubbleEntry),
      lore:   staged.filter(it => it.scope === 'lore').map(asBubbleEntry),
    };
  }

  function recomputeBubbles() {
    const { memory: memE, lore: lorE } = currentEntriesPerScope();

    // Count entries that are NOT in locked bubbles — these are the only
    // ones k-means gets to cluster. If all entries are locked, k becomes
    // moot (clamped to at least 1).
    const memFreeCount = countFreeEntries(memE, memoryBubbles, memoryOverrides.lockedBubbles);
    const lorFreeCount = countFreeEntries(lorE, loreBubbles,   loreOverrides.lockedBubbles);

    // k is the count of FREE bubbles (locked bubbles don't count). Clamp
    // against the number of free entries available, not the total.
    // k is otherwise sticky — initialized from recommendK at open time
    // (see below) and nudged only by the user's slider.
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
    //
    // renameThreshold is user-tunable via the gear-icon settings drawer.
    // Read fresh on every recompute so live slider drags update
    // reconciliation without a window close/reopen cycle.
    const renameThreshold = readRenameThreshold();
    memoryBubbles = applyOverrides(memoryOverrides, memoryBubbles, { renameThreshold });
    loreBubbles   = applyOverrides(loreOverrides,   loreBubbles,   { renameThreshold });

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

  function refresh() {
    recomputeBubbles();
    overlay.updatePanels(panelsState());
    overlay.setSaveEnabled(hasPersistentChanges());
  }

  // ---- helpers used by bubble-batch handlers ----

  /**
   * Returns true iff the user has made changes that would be persisted
   * to disk by Save. Drives Save button enablement.
   *
   * Included:
   *   - Stage mutations (add/edit/promote/demote from stage.hasChanges)
   *   - Pending deletions queue
   *   - Memory reorder (bubbleOrder / bubbleCardOrder / cardToBubbleId)
   *     — all feed the proportional remap at save time (7e).
   *
   * NOT included (session-only, no save pathway):
   *   - Memory locks (persisted immediately on toggle via
   *     lock_persistence.js — already saved, not "unsaved")
   *   - Memory rename (bubbleLabelsByStableId — session UI only)
   *   - Any Lore overrides (Lore has no save pathway for reorder;
   *     lore text edits DO feed stage, so stage.hasChanges catches those)
   */
  function hasPersistentChanges() {
    if (stage.hasChanges()) return true;
    if (pendingDeletions.size > 0) return true;
    if (memoryOverrides.bubbleOrder.length > 0) return true;
    if (memoryOverrides.bubbleCardOrder.size > 0) return true;
    if (memoryOverrides.cardToBubbleId.size > 0) return true;
    return false;
  }

  /**
   * Returns true iff the user has made ANY change that would be lost
   * on Cancel. Broader than hasPersistentChanges — includes session-
   * only work the user did curating bubbles (rename, Lore reorder).
   *
   * Drives the Cancel confirmation prompt. A user who's spent 5 minutes
   * renaming Memory bubbles expects a warning before that work
   * evaporates, even though rename doesn't itself flow through save.
   *
   * Locks are NOT included (they're curation aids, not authored content;
   * Memory locks persist anyway, Lore locks reset by design).
   */
  function hasAnyUnsavedChanges() {
    if (hasPersistentChanges()) return true;
    if (memoryOverrides.bubbleLabelsByStableId.size > 0) return true;
    if (loreOverrides.bubbleLabelsByStableId.size > 0) return true;
    if (loreOverrides.bubbleOrder.length > 0) return true;
    if (loreOverrides.bubbleCardOrder.size > 0) return true;
    if (loreOverrides.cardToBubbleId.size > 0) return true;
    return false;
  }

  // Alias for backward compat with one existing call site in onSave.
  // Using the new name in new code; this can go away after a sweep.
  const hasReorderChanged = hasPersistentChanges;

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

  /**
   * Shared body for the three batch-bubble handlers (promote/demote/
   * delete). Each follows the same recipe:
   *
   *   1. confirmIfLocked(scope, bubbleId, message) — bail if the user
   *      declines the pinned-bubble confirmation
   *   2. Unlock the bubble in the scope(s) the caller names and drop
   *      the persisted lock if requested
   *   3. For each entry in the bubble: run the per-entry action and
   *      forget the card from the override sets passed in
   *   4. refresh()
   *
   * The caller supplies exactly which overrides to clean, which mirrors
   * the pre-refactor behavior exactly — notably, demote does NOT touch
   * the persisted-lock map (Lore locks don't persist, and
   * stableIdByCurrentBubble isn't currently scope-namespaced, so a
   * Lore-bubble-id lookup could false-hit a Memory entry if the
   * bubble:N numbering collides across scopes). The refactor is
   * mechanical — same steps in the same order — not semantic.
   *
   * @param {object} opts
   * @param {string} opts.scope                   'memory' | 'lore' | null
   * @param {string} opts.bubbleId                the bubble being acted on (for lock confirm)
   * @param {Array}  opts.entries                 the bubble's entries
   * @param {string} opts.confirmMessage          message shown if the bubble is locked
   * @param {Array<object>} opts.unlockOverrides  session override set(s) to remove bubbleId from
   * @param {boolean} [opts.forgetPersistedLock]  whether to also drop the persisted lock
   * @param {(e) => void} opts.perEntry           per-entry mutation (stage.promote, etc.)
   * @param {Array<object>} opts.forgetCardsFromOverrides
   *   override collection(s) to run forgetCard against for each entry
   */
  function batchBubbleOp({
    scope,
    bubbleId,
    entries,
    confirmMessage,
    unlockOverrides,
    forgetPersistedLock = false,
    perEntry,
    forgetCardsFromOverrides,
  }) {
    if (!confirmIfLocked(scope, bubbleId, confirmMessage)) return;
    if (bubbleId) {
      for (const ov of unlockOverrides) ov.lockedBubbles.delete(String(bubbleId));
      if (forgetPersistedLock) forgetPersistedLockForBubble(bubbleId);
    }
    for (const e of entries) {
      perEntry(e);
      for (const ov of forgetCardsFromOverrides) forgetCard(ov, e.id);
    }
    refresh();
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
    onBubblePromote: (bubbleId, entries) => batchBubbleOp({
      scope: 'memory',
      bubbleId,
      entries,
      confirmMessage: `Promote all contents of this pinned bubble to Lore? The bubble will also be unlocked.`,
      unlockOverrides: [memoryOverrides],
      forgetPersistedLock: true,    // Memory locks persist; clear
      perEntry: (e) => stage.promote(e.id),
      forgetCardsFromOverrides: [memoryOverrides],
    }),
    onBubbleDemote: (bubbleId, entries) => batchBubbleOp({
      scope: 'lore',
      bubbleId,
      entries,
      confirmMessage: `Demote all contents of this pinned bubble to Memory? The bubble will also be unlocked.`,
      unlockOverrides: [loreOverrides],
      forgetPersistedLock: false,   // Lore locks don't persist; also
                                    // avoids a bubble-id collision hit
                                    // on the Memory persisted map (see
                                    // CD-2 note in docs/audit-findings.md)
      perEntry: (e) => stage.demote(e.id),
      forgetCardsFromOverrides: [loreOverrides],
    }),
    // Spin off a new character from a bubble. Non-mutating for the
    // source thread — the bubble's entries are COPIED out as seed
    // lore for the new character. Source memories remain intact.
    //
    // Opens a confirmation dialog with name + preview. User can edit
    // the name before creating. On successful creation, the character
    // shows up in the upstream character list; user can then chat
    // with them or tune lore further there.
    //
    // Bumps the charactersSpawned counter so the "Demiurge" tiered
    // achievement progresses.
    onSpinOffCharacter: (_scope, _bubbleId, entries, label) => {
      if (!Array.isArray(entries) || entries.length === 0) return;
      openSpinOffDialog({
        sourceLabel: label || '',
        entries,
        onCreated: ({ character, loreCount }) => {
          bumpCounter('charactersSpawned', 1, activeThreadId);
          // Brief confirmation. We don't re-render the Memory window
          // since the spin-off doesn't mutate source state.
          const name = (character && character.name) || 'the character';
          window.alert(
            `Created "${name}" with ${loreCount} ${loreCount === 1 ? 'lore item' : 'lore items'}.\n\n` +
            `You can find them in the upstream character list.`
          );
        },
      });
    },

    onBubbleDelete: (bubbleId, entries, sourceScope) => batchBubbleOp({
      // Use the scope the caller provides (derived from the drag
      // payload's source panel OR the button's containing panel).
      // Fall back to locatedBubbleScope as a defensive backup for
      // any older callers; NEW callers should always pass sourceScope
      // so we don't have to rely on the ambiguous Memory/Lore id
      // lookup (see CD-2a note).
      scope: sourceScope || locatedBubbleScope(bubbleId),
      bubbleId,
      entries,
      confirmMessage: `Delete all ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} in this pinned bubble? The bubble itself will also be removed.`,
      unlockOverrides: [memoryOverrides, loreOverrides],
      // Only drop the persisted-lock registration if the bubble being
      // deleted is actually Memory-scoped. Lore bubbles share the
      // same bubble:N id space and could false-hit a Memory persisted
      // lock if we weren't scope-aware here.
      forgetPersistedLock: (sourceScope || locatedBubbleScope(bubbleId)) === 'memory',
      perEntry: (e) => {
        queueForDeletion(e.id);
        stage.remove(e.id);
      },
      forgetCardsFromOverrides: [memoryOverrides, loreOverrides],
    }),

    // Reorder gestures (7d). Lore has no reorder at all — these handlers
    // onReorderBubble: move bubble `bubbleId` to the position just before
    // `beforeBubbleId` (null = move to end). Locked bubbles can't be
    // moved — the grip is disabled on them so this is theoretical, but
    // we defend in depth. Works for both Memory and Lore (Lore reorder
    // is visual-only inside the window; Dexie has no lore order field
    // so it doesn't persist across sessions, but same-session curation
    // is useful).
    onReorderBubble: (scope, bubbleId, beforeBubbleId) => {
      const s = byScope(scope);
      if (!s) return;
      if (s.overrides.lockedBubbles.has(String(bubbleId))) return;
      const currentOrder = s.getBubbles().map(b => b.id);
      moveBubbleBefore(s.overrides, bubbleId, beforeBubbleId, currentOrder);
      bumpCounter('bubblesReordered', 1, activeThreadId);
      refresh();
    },

    // onReorderCard: move card `cardId` (which lives in `sourceBubbleId`)
    // to the position just before `beforeCardId` in `targetBubbleId`.
    //
    // Within-bubble: pure order change.
    // Cross-bubble: relocate via assignCardToBubble so the assertion
    // survives re-clustering. Source's bubbleCardOrder is cleaned up.
    //
    // Lock enforcement: refuse if either source or target is locked.
    // (UI gates grip rendering and drop-gap rendering to unlocked
    // bubbles; this is belt-and-suspenders.)
    //
    // Works for both Memory and Lore scopes.
    onReorderCard: (scope, sourceBubbleId, cardId, targetBubbleId, beforeCardId) => {
      const s = byScope(scope);
      if (!s) return;
      const sourceLocked = s.overrides.lockedBubbles.has(String(sourceBubbleId));
      const targetLocked = s.overrides.lockedBubbles.has(String(targetBubbleId));
      if (sourceLocked || targetLocked) return;

      const sameBubble = String(sourceBubbleId) === String(targetBubbleId);
      const bubbles = s.getBubbles();

      if (sameBubble) {
        const source = bubbles.find(b => String(b.id) === String(sourceBubbleId));
        if (!source) return;
        const currentCardOrder = source.entries.map(e => e.id);
        moveCardBefore(s.overrides, sourceBubbleId, cardId, beforeCardId, currentCardOrder);
        bumpCounter('cardsReorderedInBubble', 1, activeThreadId);
      } else {
        // Cross-bubble: assert new membership, position within target,
        // then clean up source's card-order reference.
        assignCardToBubble(s.overrides, cardId, targetBubbleId);

        const target = bubbles.find(b => String(b.id) === String(targetBubbleId));
        if (target) {
          const currentTargetOrder = target.entries.map(e => e.id);
          moveCardBefore(s.overrides, targetBubbleId, cardId, beforeCardId, currentTargetOrder);
        }

        if (s.overrides.bubbleCardOrder.has(String(sourceBubbleId))) {
          const srcOrder = s.overrides.bubbleCardOrder.get(String(sourceBubbleId));
          const cleaned = srcOrder.filter(id => String(id) !== String(cardId));
          if (cleaned.length === 0) s.overrides.bubbleCardOrder.delete(String(sourceBubbleId));
          else s.overrides.bubbleCardOrder.set(String(sourceBubbleId), cleaned);
        }
        bumpCounter('cardsReorderedCrossBubble', 1, activeThreadId);
      }

      refresh();
    },

    // k-slider: ± per scope. k counts ONLY free (non-locked) bubbles.
    // Clusters the free entries; locked bubbles pass through untouched.
    onChangeK: (scope, dir) => {
      const step = Number(dir) || 0;
      const s = byScope(scope);
      if (!s) return;

      const entries = s.getEntries();
      const bubbles = s.getBubbles();
      const currentK = s.getK();
      const freeCount = countFreeEntries(entries, bubbles, s.overrides.lockedBubbles);
      const newK = Math.max(1, Math.min(currentK + step, Math.max(1, freeCount)));
      if (newK === currentK) return;

      s.setK(newK);
      const clustered = bubbleizeWithLocks({
        entries,
        currentBubbles: bubbles,
        lockedBubbleIds: s.overrides.lockedBubbles,
        k: newK,
      });
      s.setBubbles(applyOverrides(s.overrides, clustered, { renameThreshold: readRenameThreshold() }));

      // Preserve expanded state for locked bubbles (their ids survive
      // across k-changes); free bubbles get fresh ids so drop those.
      for (const id of s.expandedIds) {
        if (!s.overrides.lockedBubbles.has(String(id))) {
          s.expandedIds.delete(id);
        }
      }
      overlay.updatePanels(panelsState());
    },

    // Expand/collapse — no stage mutation, just toggle the set + re-render
    onToggleBubble: (scope, bubbleId) => {
      const s = byScope(scope);
      if (!s) return;
      if (s.expandedIds.has(bubbleId)) s.expandedIds.delete(bubbleId);
      else s.expandedIds.add(bubbleId);
      overlay.updatePanels(panelsState());
    },

    // Lock toggle — session state is kept in the scope's lockedBubbles.
    // For scopes where locksPersist is true (Memory), the lock is also
    // mirrored to per-thread storage via lock_persistence.js so it
    // survives window close/reopen. Lore locks stay session-only.
    onToggleLock: (scope, bubbleId) => {
      const s = byScope(scope);
      if (!s) return;
      const nowLocked = toggleLock(s.overrides, bubbleId);
      if (nowLocked) bumpCounter('bubblesLocked', 1, activeThreadId);

      if (s.locksPersist && activeThreadId != null) {
        if (nowLocked) {
          const b = s.getBubbles().find(x => String(x.id) === String(bubbleId));
          if (b) {
            const memberIds = b.entries.map(e => String(e.id));
            const stableId = persistLock(activeThreadId, memberIds);
            stableIdByCurrentBubble.set(String(bubbleId), stableId);
          }
        } else {
          const stableId = stableIdByCurrentBubble.get(String(bubbleId));
          if (stableId) {
            forgetLock(activeThreadId, stableId);
            stableIdByCurrentBubble.delete(String(bubbleId));
          }
        }
      }

      overlay.updatePanels(panelsState());
    },

    // Inline rename — user renamed a bubble via dblclick on the label
    // or via the Rename button in the bubble settings row. Rename is
    // keyed by the bubble's STABLE identity (hash of member ids) and
    // uses Jaccard-tolerant lookup, so it survives re-clusterings as
    // long as membership stays recognizable. Empty newLabel clears.
    //
    // Works for both Memory and Lore scopes.
    onRenameBubble: (scope, bubbleId, newLabel, memberIds) => {
      const s = byScope(scope);
      if (!s) return;
      if (!Array.isArray(memberIds) || memberIds.length === 0) return;
      renameBubble(s.overrides, memberIds, newLabel);
      bumpCounter('bubblesRenamed', 1, activeThreadId);
      refresh();
    },

    // Footer actions
    onSave: async () => {
      const diff = stage.computeDiff();
      if (diff.totalChanges === 0 && !hasReorderChanged()) { alert('No changes to save.'); return; }

      // Build the user's desired final order of Memory entries: walk the
      // rendered bubbles top-to-bottom, collect entries with their lock
      // status AND a 'userMoved' flag derived from memoryOverrides.
      // Locked-bubble entries keep their original messages on save
      // (the "locked-stays-put" carve-out). Among unlocked entries:
      //   userMoved=true  → user explicitly dragged this card; commitDiff
      //                     re-assigns it to its new proportional message
      //   userMoved=false → user never touched this card; commitDiff
      //                     preserves its original (messageId, level,
      //                     indexInLevel) tuple
      // The set of userMovedCardIds is populated by assignCardToBubble
      // (cross-bubble drop) and moveCardBefore (within-bubble drag) in
      // bubble_overrides.js. Cards re-clustered by k-means alone are
      // NOT in the set — they keep their on-disk position untouched.
      const memoryOrder = [];
      for (const bubble of memoryBubbles) {
        const isBubbleLocked = memoryOverrides.lockedBubbles.has(String(bubble.id));
        for (const entry of bubble.entries) {
          memoryOrder.push({
            id: entry.id,
            locked: isBubbleLocked,
            userMoved: memoryOverrides.userMovedCardIds.has(String(entry.id)),
          });
        }
      }

      // Lore order (#4): user's final flat lore sequence across all
      // lore bubbles, top-to-bottom. Persisted to settings (NOT to
      // upstream's lore table) by commitDiff so the order survives
      // across sessions. No locked/userMoved partitioning here — lore
      // doesn't have message slots to remap; it's just a display
      // order in our settings.
      const loreOrder = [];
      for (const bubble of loreBubbles) {
        for (const entry of bubble.entries) {
          loreOrder.push({ id: entry.id });
        }
      }

      // Build confirm message from actual state, not by concatenating
      // pieces that don't know about each other.
      //
      // formatDiffSummary produces stage-level phrasing ("Save: 2 edits.
      // Continue?"). It returns "No changes to save" when totalChanges
      // is 0 — which is correct for the stage portion but would make
      // the overall dialog contradict itself when the user's only
      // changes are reorders/cross-drags.
      const stageChanged = diff.totalChanges > 0;
      const reorderChanged = hasReorderChanged();

      let headline;
      if (stageChanged && reorderChanged) {
        // Both — lead with the stage summary (more specific), then
        // mention reorder as an additional saved action.
        const stageBits = formatDiffSummary(diff).replace(/\.\s*Continue\?$/, '');
        headline = `${stageBits}, plus memory reorder. Continue?`;
      } else if (stageChanged) {
        headline = formatDiffSummary(diff);
      } else {
        // Reorder only — no stage changes but user moved things around.
        // Phrase as a normal Save prompt so the dialog reads coherently.
        headline = 'Save: memory reorder. Continue?';
      }

      const reorderNote = reorderChanged
        ? '\n\nMemory order will be saved (proportional message remap). Locked bubbles keep their original messages.'
        : '';
      const snapshotNote = '\n\nA snapshot of the current state will be captured before saving. You can restore it from the Memory window if needed.';
      const confirmed = window.confirm(headline + reorderNote + snapshotNote);
      if (!confirmed) return;

      overlay.setSaveLabel('Saving…');
      overlay.setSaveEnabled(false);

      // Capture pre-save snapshot. This is a best-effort safety net —
      // if storage fails (full, quota, etc.), we still proceed with the
      // save. The user chose Save; we honor the intent either way.
      if (activeThreadId != null) {
        try {
          // Build a snapshot label that reflects ALL change kinds
          // (stage + reorder), so the Restore dialog shows a coherent
          // description like "Before save — 2 edits + reorder" instead
          // of "No changes to save" for reorder-only saves.
          let snapshotLabel;
          if (stageChanged && reorderChanged) {
            snapshotLabel = `Before save — ${formatDiffSummary(diff).replace(/\.\s*Continue\?$/, '')} + reorder`;
          } else if (stageChanged) {
            snapshotLabel = `Before save — ${formatDiffSummary(diff).replace(/\.\s*Continue\?$/, '')}`;
          } else {
            snapshotLabel = 'Before save — memory reorder';
          }
          captureSnapshot(activeThreadId, baseline, { label: snapshotLabel });
        } catch (e) {
          console.warn('[pf] snapshot capture failed, proceeding with save:', e && e.message);
        }
      }

      const result = await commitDiff({
        baselineItems: baseline,
        diff,
        memoryOrder,
        loreOrder,
      });
      if (!result.ok) {
        alert(`Save failed: ${result.error}\n\nYour edits are still staged — you can retry or Cancel.`);
        overlay.setSaveLabel('Save');
        overlay.setSaveEnabled(true);
        return;
      }

      bumpCounter('memorySaves', 1, activeThreadId);

      // Show a brief confirmation of what landed on disk. For reorder-
      // only saves the stats object has reorderedMemory/reorderedLore
      // counts; for edits/adds/deletes it has those specific counters.
      // If formatSaveStatsSummary returns null (shouldn't happen after
      // a successful save with changes), fall back to a generic message.
      const summary = formatSaveStatsSummary(result.stats) || 'Saved.';
      if (typeof overlay.showSaveBanner === 'function') {
        await overlay.showSaveBanner(summary);
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
      bumpCounter('backupsExported');
      showExportDialog(JSON.stringify(state, null, 2));
    },

    // Import: inverse of Export. Opens a paste dialog; on confirm,
    // parses the JSON and adds each memory/lore entry as a new
    // staged item in the current thread. Items arrive as ADDITIONS
    // (not replacements) so nothing is lost — existing stage is
    // preserved. User can Save to persist, or Cancel to discard.
    //
    // We import from BOTH `stagedItems` (unpersisted edits at time of
    // export) AND `baseline` (what was on disk at export time), so the
    // user doesn't have to care whether the source thread had pending
    // edits when they exported. Every unique text makes it through.
    onImport: () => {
      showImportDialog(async (jsonText) => {
        let parsed;
        try {
          parsed = JSON.parse(jsonText);
        } catch {
          return { ok: false, error: 'Not valid JSON — check for typos or missing braces.' };
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return { ok: false, error: 'Imported data must be an object.' };
        }
        // Accept both our schema (v1) and bare arrays of entries.
        // Future schema bumps should read parsed.schema and migrate.
        const sourceItems = [];
        if (Array.isArray(parsed.baseline)) sourceItems.push(...parsed.baseline);
        if (Array.isArray(parsed.stagedItems)) sourceItems.push(...parsed.stagedItems);
        if (sourceItems.length === 0) {
          return { ok: false, error: 'No memory or lore entries found in the imported data.' };
        }

        // Dedupe by (scope, text) so re-importing the same file from
        // export+stage doesn't create two copies of every line. Also
        // dedupe against the user's CURRENT stage so re-importing
        // into the same thread is a no-op.
        const existing = new Set(
          stage.getStaged().map(it => `${it.scope}|${(it.text || '').trim()}`)
        );
        let memAdded = 0, loreAdded = 0;
        for (const it of sourceItems) {
          if (!it || !it.text) continue;
          const scope = it.scope === 'lore' ? 'lore' : 'memory';
          const text = String(it.text).trim();
          if (!text) continue;
          const key = `${scope}|${text}`;
          if (existing.has(key)) continue;
          existing.add(key);
          stage.add({ scope, text });
          if (scope === 'lore') loreAdded++; else memAdded++;
        }

        if (memAdded === 0 && loreAdded === 0) {
          return { ok: false, error: 'Nothing new to import — all entries already in stage.' };
        }

        bumpCounter('backupsImported');
        refresh();
        const parts = [];
        if (memAdded > 0)  parts.push(`${memAdded} memory ${memAdded === 1 ? 'entry' : 'entries'}`);
        if (loreAdded > 0) parts.push(`${loreAdded} lore ${loreAdded === 1 ? 'entry' : 'entries'}`);
        return { ok: true, message: `Imported ${parts.join(' and ')}. Save to persist.` };
      });
    },

    onRestore: () => {
      if (activeThreadId == null) {
        alert('No active thread — cannot restore.');
        return;
      }
      const snaps = loadSnapshots(activeThreadId);
      if (snaps.length === 0) {
        alert(
          'No snapshots yet for this thread.\n\n' +
          'A snapshot is automatically captured before each Save. ' +
          'Once you\u2019ve saved at least once from this tool, restore points become available here.'
        );
        return;
      }
      showRestoreDialog(snaps, async (snapshotId) => {
        const snap = findSnapshot(activeThreadId, snapshotId);
        if (!snap) {
          alert('Snapshot not found. It may have been deleted.');
          return;
        }

        const restoreDiff = buildRestoreDiff(baseline, snap.items);
        if (restoreDiff.totalChanges === 0) {
          alert('This snapshot matches the current state — nothing to restore.');
          return;
        }

        const confirmed = window.confirm(
          `Restore to snapshot from ${formatSnapshotSummary(snap)}?\n\n` +
          `This will: add ${restoreDiff.added.length} entries, ` +
          `delete ${restoreDiff.deleted.length} entries.\n\n` +
          `Unsaved staged changes will be discarded. A new snapshot ` +
          `of the current state will be captured before restoring.`
        );
        if (!confirmed) return;

        // Capture CURRENT state before overwriting, so the user can
        // undo the restore itself if they change their mind.
        try {
          captureSnapshot(activeThreadId, baseline, {
            label: 'Before restore',
          });
        } catch (e) {
          console.warn('[pf] pre-restore snapshot failed:', e && e.message);
        }

        const result = await commitDiff({
          baselineItems: baseline,
          diff: restoreDiff,
        });
        if (!result.ok) {
          alert(`Restore failed: ${result.error}\n\nNo changes were applied.`);
          return;
        }
        bumpCounter('snapshotsRestored', 1, activeThreadId);
        alert('Restore complete. Re-open the Memory window to see the restored state.');
        overlay.hide();
      });
    },

    onCancel: () => {
      if (hasAnyUnsavedChanges()) {
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
    // Gear-drawer setting changed (e.g. rename threshold slider). Live-
    // reapply overrides so the user sees the effect of the new threshold
    // without closing/reopening the window. Uses the same recompute
    // path that every other override mutation uses — no special casing.
    onSettingsChange: (key, _value) => {
      if (key === 'renameThreshold') {
        refresh();
      }
    },
  });

  overlay.show();
}

// ---- helpers ----

/**
 * Read the rename-survival Jaccard threshold from settings. Clamps to
 * [0, 1]; falls back to 0.5 on missing/malformed input. Called on every
 * recompute so the setting is effectively hot-reloadable.
 */
function readRenameThreshold() {
  try {
    const s = loadSettings();
    const raw = (s && s.memory && s.memory.tool && s.memory.tool.renameThreshold);
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0.5;
    return Math.max(0, Math.min(1, raw));
  } catch {
    return 0.5;
  }
}

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

/**
 * Show a paste-in dialog for importing previously-exported JSON into
 * the current thread's stage. The `applyFn` callback receives the raw
 * pasted text and should return a Promise resolving to either
 * `{ ok: true, message }` (success — we close the dialog and the
 * caller has already applied the import) or `{ ok: false, error }`
 * (failure — we show the error inline and leave the dialog open so
 * the user can retry or edit their paste).
 */
function showImportDialog(applyFn) {
  const textarea = h('textarea', {
    class: 'pf-mem-export-textarea',
    rows: '20',
    spellcheck: 'false',
    placeholder: 'Paste previously-exported Memory & Lore JSON here…',
    'aria-label': 'Paste exported JSON to import',
  });

  const status = h('div', { class: 'pf-mem-import-status', hidden: true });

  let busy = false;

  const importBtn = h('button', {
    type: 'button',
    class: 'pf-mem-btn pf-mem-btn-primary',
    onClick: async () => {
      if (busy) return;
      const text = textarea.value || '';
      if (!text.trim()) {
        status.textContent = 'Paste your exported JSON first.';
        status.className = 'pf-mem-import-status pf-mem-import-status-warn';
        status.hidden = false;
        textarea.focus();
        return;
      }
      busy = true;
      importBtn.disabled = true;
      cancelBtn.disabled = true;
      importBtn.textContent = 'Importing…';
      try {
        const res = await applyFn(text);
        if (res && res.ok) {
          status.textContent = res.message || 'Imported.';
          status.className = 'pf-mem-import-status pf-mem-import-status-ok';
          status.hidden = false;
          // Briefly show success, then auto-close so the user sees
          // their new entries land in the stage.
          setTimeout(() => overlay.hide(), 900);
        } else {
          status.textContent = (res && res.error) || 'Import failed.';
          status.className = 'pf-mem-import-status pf-mem-import-status-err';
          status.hidden = false;
          busy = false;
          importBtn.disabled = false;
          cancelBtn.disabled = false;
          importBtn.textContent = 'Import';
        }
      } catch (e) {
        status.textContent = `Import failed: ${(e && e.message) || String(e)}`;
        status.className = 'pf-mem-import-status pf-mem-import-status-err';
        status.hidden = false;
        busy = false;
        importBtn.disabled = false;
        cancelBtn.disabled = false;
        importBtn.textContent = 'Import';
      }
    },
  }, ['Import']);

  const cancelBtn = h('button', {
    type: 'button',
    class: 'pf-mem-btn pf-mem-btn-neutral',
    onClick: () => { if (!busy) overlay.hide(); },
  }, ['Cancel']);

  const overlay = createOverlay({
    ariaLabel: 'Import saved state',
    children: [
      h('div', { class: 'pf-mem-export' }, [
        h('h2', { class: 'pf-mem-title' }, ['Import']),
        h('p', { class: 'pf-mem-export-hint' }, [
          'Paste the JSON from a previous Memory & Lore Export. Entries ',
          'will be added to your current stage as new items; existing ',
          'entries are preserved. Use Save to persist, or Cancel in the ',
          'main window to discard everything.',
        ]),
        textarea,
        status,
        h('div', { class: 'pf-mem-export-actions' }, [cancelBtn, importBtn]),
      ]),
    ],
  });
  overlay.show();
  setTimeout(() => textarea.focus(), 0);
}

/**
 * Show a list of snapshots; user picks one and we call onPick(snapshotId).
 * onPick is responsible for confirming and applying the restore — this
 * function just handles list + pick + delete UI.
 *
 * Scaffolding-quality UI: plain list, text buttons. Styling to be passed
 * over later.
 */
function showRestoreDialog(snapshots, onPick) {
  let overlay;
  const listHost = h('div', { class: 'pf-mem-restore-list' });

  function render() {
    const list = Array.isArray(snapshots) ? snapshots.slice() : [];
    const rows = list.length === 0
      ? [h('p', { class: 'pf-mem-notice-body' }, ['All snapshots have been deleted.'])]
      : list.map(snap => buildSnapshotRow(snap));
    while (listHost.firstChild) listHost.removeChild(listHost.firstChild);
    for (const r of rows) listHost.appendChild(r);
  }

  function buildSnapshotRow(snap) {
    const summary = formatSnapshotSummary(snap);
    const pickBtn = h('button', {
      type: 'button',
      class: 'pf-mem-btn pf-mem-btn-primary',
      onClick: () => {
        overlay.hide();
        if (typeof onPick === 'function') onPick(snap.id);
      },
    }, ['Restore']);

    const deleteBtn = h('button', {
      type: 'button',
      class: 'pf-mem-btn pf-mem-btn-neutral',
      title: 'Delete this snapshot',
      onClick: () => {
        const ok = window.confirm(`Delete snapshot "${summary}"?\n\nThis cannot be undone.`);
        if (!ok) return;
        const threadId = (typeof window !== 'undefined') ? window.activeThreadId : null;
        if (threadId != null) {
          deleteSnapshot(threadId, snap.id);
        }
        // Remove from local array and re-render list
        const idx = snapshots.findIndex(s => s.id === snap.id);
        if (idx >= 0) snapshots.splice(idx, 1);
        render();
      },
    }, ['Delete']);

    return h('div', { class: 'pf-mem-restore-row' }, [
      h('span', { class: 'pf-mem-restore-summary' }, [summary]),
      pickBtn,
      deleteBtn,
    ]);
  }

  render();

  overlay = createOverlay({
    ariaLabel: 'Restore from snapshot',
    children: [
      h('div', { class: 'pf-mem-restore' }, [
        h('h2', { class: 'pf-mem-title' }, ['Restore from snapshot']),
        h('p', { class: 'pf-mem-notice-body' }, [
          'Each save captures a snapshot of the pre-save state automatically. ',
          'Pick one to roll back to. The current state will be snapshotted before restoring, ',
          'so this action itself is also undoable.',
        ]),
        listHost,
      ]),
    ],
  });
  overlay.show();
}

// memory/snapshots.js
//
// Per-thread snapshot/restore for Memory & Lore state.
//
// Auto-captured before each successful Save. User can review recent
// snapshots and restore any of them to undo a regrettable save.
//
// Storage shape:
//   settings.memory.snapshotsByThread: {
//     [threadId]: SnapshotRecord[]       // newest first, capped to MAX
//   }
//
// SnapshotRecord: {
//   id: string,                 // uuid-ish, for identification
//   createdAt: number,          // Date.now() at capture
//   label: string | null,       // optional user-assigned label
//   memoryCount: number,        // for quick summary in UI
//   loreCount: number,
//   items: StageItem[]          // the baseline contents at capture time
// }
//
// Ring buffer: capped to MAX_SNAPSHOTS per thread to bound storage.
// Oldest drops off when a new snapshot is pushed.

import { loadSettings, updateField } from '../profile/settings_store.js';

const MAX_SNAPSHOTS = 10;
const SETTINGS_PATH = 'memory.snapshotsByThread';

/**
 * Load the snapshot list for a thread, newest first.
 *
 * @param {string|number} threadId
 * @returns {Array<import('./snapshots.js').SnapshotRecord>}
 */
export function loadSnapshots(threadId) {
  if (threadId == null) return [];
  try {
    const s = loadSettings();
    const all = (s && s.memory && s.memory.snapshotsByThread) || {};
    const forThread = all[String(threadId)];
    return Array.isArray(forThread) ? forThread : [];
  } catch {
    return [];
  }
}

/**
 * Replace the full snapshot list for a thread.
 */
export function saveSnapshots(threadId, snapshots) {
  if (threadId == null) return;
  try {
    const s = loadSettings();
    const all = (s && s.memory && s.memory.snapshotsByThread) || {};
    all[String(threadId)] = Array.isArray(snapshots) ? snapshots : [];
    updateField(SETTINGS_PATH, all);
  } catch { /* best-effort */ }
}

/**
 * Capture a new snapshot of the given items (baseline-shaped).
 * Prepends to the list; oldest-over-cap entries drop.
 *
 * @param {string|number} threadId
 * @param {Array} items  baseline-shaped items
 * @param {{ label?: string | null }} [opts]
 * @returns {string} the new snapshot id
 */
export function captureSnapshot(threadId, items, { label = null } = {}) {
  if (threadId == null) return '';
  const memoryCount = items.filter(i => i && i.scope === 'memory').length;
  const loreCount = items.filter(i => i && i.scope === 'lore').length;

  const record = {
    id: 'snap_' + Math.random().toString(36).slice(2) + Date.now().toString(36),
    createdAt: Date.now(),
    label,
    memoryCount,
    loreCount,
    items: cloneItems(items),
  };

  const list = loadSnapshots(threadId);
  list.unshift(record);
  // Trim to cap; drop oldest (highest index).
  while (list.length > MAX_SNAPSHOTS) list.pop();
  saveSnapshots(threadId, list);
  return record.id;
}

/**
 * Delete a single snapshot by id.
 */
export function deleteSnapshot(threadId, snapshotId) {
  if (threadId == null || !snapshotId) return;
  const list = loadSnapshots(threadId);
  const filtered = list.filter(s => s && s.id !== snapshotId);
  if (filtered.length !== list.length) {
    saveSnapshots(threadId, filtered);
  }
}

/**
 * Clear all snapshots for a thread. Useful if the list gets stale or
 * the user wants a fresh start.
 */
export function clearSnapshots(threadId) {
  saveSnapshots(threadId, []);
}

/**
 * Find a snapshot by id. Returns null if missing.
 */
export function findSnapshot(threadId, snapshotId) {
  if (threadId == null || !snapshotId) return null;
  const list = loadSnapshots(threadId);
  return list.find(s => s && s.id === snapshotId) || null;
}

/**
 * Build a restore diff: given the current baseline and a target
 * snapshot, produce a StageDiff that would transform current → target.
 *
 * Strategy: text-based match. Items with identical text on both sides
 * are kept in place. Current-only items (not in snapshot) are deleted.
 * Snapshot-only items (not in current) are added.
 *
 * IMPORTANT LIMITATIONS:
 *   - We match on text only, not semantic equivalence. If you edited a
 *     word between snapshot and now, that counts as deleted+added, not
 *     edited. Close enough for the restore use-case (user wants the
 *     exact text back).
 *   - Reorder is not preserved — memory positions will be re-derived by
 *     commitDiff's proportional remap on apply.
 *   - Scope changes (promote/demote) between snapshot and now show up
 *     as delete+add pairs with the same text, which is correct.
 *
 * @param {Array} currentBaseline
 * @param {Array} snapshotItems
 * @returns {{
 *   added:     Array,
 *   deleted:   Array,
 *   edited:    Array,     // always empty under this strategy
 *   reordered: Array,     // always empty
 *   totalChanges: number
 * }}
 */
export function buildRestoreDiff(currentBaseline, snapshotItems) {
  const current = Array.isArray(currentBaseline) ? currentBaseline : [];
  const target = Array.isArray(snapshotItems) ? snapshotItems : [];

  // Key by (scope, text) for equality comparison. If a user had two
  // identical-text memories, both sides will see two entries with the
  // same key — we use a multiset (count-based) comparison.
  const currentKeys = new Map(); // key → [items...]
  for (const it of current) {
    if (!it || !it.scope || typeof it.text !== 'string') continue;
    const k = `${it.scope}||${it.text}`;
    const bucket = currentKeys.get(k) || [];
    bucket.push(it);
    currentKeys.set(k, bucket);
  }

  const targetKeys = new Map();
  for (const it of target) {
    if (!it || !it.scope || typeof it.text !== 'string') continue;
    const k = `${it.scope}||${it.text}`;
    const bucket = targetKeys.get(k) || [];
    bucket.push(it);
    targetKeys.set(k, bucket);
  }

  const added = [];
  const deleted = [];

  // For each target-key: items beyond what's currently present must be
  // added. Conversely, current-key overage must be deleted.
  const allKeys = new Set([...currentKeys.keys(), ...targetKeys.keys()]);
  for (const key of allKeys) {
    const curBucket = currentKeys.get(key) || [];
    const tgtBucket = targetKeys.get(key) || [];
    if (tgtBucket.length > curBucket.length) {
      // Add the extras from target
      for (let i = curBucket.length; i < tgtBucket.length; i++) {
        added.push(cloneItem(tgtBucket[i]));
      }
    } else if (curBucket.length > tgtBucket.length) {
      // Delete the overages from current
      for (let i = tgtBucket.length; i < curBucket.length; i++) {
        deleted.push({
          id: curBucket[i].id,
          scope: curBucket[i].scope,
          text: curBucket[i].text,
        });
      }
    }
  }

  return {
    added,
    deleted,
    edited: [],
    reordered: [],
    totalChanges: added.length + deleted.length,
  };
}

/**
 * Format a snapshot record into a user-readable one-line summary for
 * use in a list UI.
 *
 * @param {import('./snapshots.js').SnapshotRecord} snap
 * @returns {string}
 */
export function formatSnapshotSummary(snap) {
  if (!snap || !snap.createdAt) return 'Invalid snapshot';
  const age = formatAge(Date.now() - snap.createdAt);
  const parts = [
    age,
    `${snap.memoryCount || 0} memor${snap.memoryCount === 1 ? 'y' : 'ies'}`,
    `${snap.loreCount || 0} lore`,
  ];
  if (snap.label) parts.push(`— ${snap.label}`);
  return parts.join(' · ');
}

function formatAge(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

// ---- private ----

function cloneItems(items) {
  return (items || []).map(cloneItem);
}

function cloneItem(item) {
  if (!item || typeof item !== 'object') return null;
  // Shallow clone with passthrough of __-prefixed fields (embedding, etc.)
  // Embedding is a Float32Array / array — doesn't survive JSON in every
  // browser. We store as plain array if present.
  const out = {
    id: item.id,
    scope: item.scope,
    text: item.text,
  };
  for (const k of Object.keys(item)) {
    if (k.startsWith('__')) {
      const v = item[k];
      if (v && ArrayBuffer.isView(v)) {
        out[k] = Array.from(v);
      } else {
        out[k] = v;
      }
    }
  }
  return out;
}

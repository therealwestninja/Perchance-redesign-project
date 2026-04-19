// memory/lore_order.js
//
// Per-book lore ordering, OUR-TOOL-ONLY.
//
// Upstream Perchance's lore schema has no `order` column. Adding one
// would mean our writes include a field upstream silently ignores —
// fine for cosmetic sorting, weird for anything that round-trips
// through upstream's editors.
//
// This module sidesteps the divergence by storing the order in OUR
// settings.loreOrderByBookId rather than in upstream's lore table.
// Upstream remains untouched. Our tool reads + sorts. If the user
// ever uninstalls our tool, the lore data is exactly what they
// started with — no orphan field.
//
// Storage shape:
//   settings.loreOrderByBookId = {
//     '<bookId>': ['<loreId>', '<loreId>', '<loreId>', ...],
//     ...
//   };
//
// IDs are stringified for storage-key safety. Reads coerce back as
// needed. Empty / missing → no override (lore loads in upstream's
// natural order, which is insertion order).
//
// Best-effort: errors swallowed (logged at debug level).

import { loadSettings, saveSettings } from '../profile/settings_store.js';

const LORE_ORDER_NS = 'loreOrderByBookId';

/**
 * Read the persisted lore order for `bookId`. Returns an array of
 * stringified ids, or empty array if no persisted order exists.
 *
 * @param {number|string} bookId
 * @returns {string[]}
 */
export function loadLoreOrder(bookId) {
  if (bookId == null) return [];
  try {
    const settings = loadSettings();
    const map = (settings && settings[LORE_ORDER_NS]) || {};
    const order = map[String(bookId)];
    if (!Array.isArray(order)) return [];
    return order.map(String);
  } catch {
    return [];
  }
}

/**
 * Persist the lore order for `bookId`. Pass an array of lore ids
 * in the desired display order. Safe to call with an empty array
 * (will clear the persisted order for this book).
 *
 * @param {number|string} bookId
 * @param {Array<number|string>} orderedIds
 */
export function persistLoreOrder(bookId, orderedIds) {
  if (bookId == null) return;
  if (!Array.isArray(orderedIds)) return;
  try {
    const settings = loadSettings();
    if (!settings[LORE_ORDER_NS] || typeof settings[LORE_ORDER_NS] !== 'object') {
      settings[LORE_ORDER_NS] = {};
    }
    if (orderedIds.length === 0) {
      // Empty → clear the entry rather than store [] (smaller payload,
      // and 'empty' is semantically the same as 'no override').
      delete settings[LORE_ORDER_NS][String(bookId)];
    } else {
      settings[LORE_ORDER_NS][String(bookId)] = orderedIds.map(String);
    }
    saveSettings(settings);
  } catch { /* best-effort */ }
}

/**
 * Sort `loreItems` by the persisted order for `bookId`. Items present
 * in the persisted order list land first, in that order. Items NOT in
 * the list (newer entries, externally added) land at the end, in
 * their original input order (stable).
 *
 * Pure function — does not mutate input. Returns a new array.
 *
 * @param {Array<{id: number|string}>} loreItems
 * @param {number|string} bookId
 * @returns {Array}
 */
export function sortLoreByPersistedOrder(loreItems, bookId) {
  if (!Array.isArray(loreItems) || loreItems.length === 0) return [];
  const order = loadLoreOrder(bookId);
  if (order.length === 0) return [...loreItems];

  const rank = new Map();
  for (let i = 0; i < order.length; i++) rank.set(order[i], i);

  // Stable partition: in-list (sorted by rank) followed by not-in-list
  // (preserved input order).
  const inList = [];
  const notInList = [];
  for (const item of loreItems) {
    if (!item || item.id == null) continue;
    if (rank.has(String(item.id))) inList.push(item);
    else notInList.push(item);
  }
  inList.sort((a, b) => rank.get(String(a.id)) - rank.get(String(b.id)));
  return [...inList, ...notInList];
}

/**
 * Drop a lore id from the persisted order for `bookId`. Called when
 * the user deletes a lore entry — keeps the persisted list from
 * accumulating dead ids over time.
 *
 * @param {number|string} bookId
 * @param {number|string} loreId
 */
export function forgetLoreFromOrder(bookId, loreId) {
  if (bookId == null || loreId == null) return;
  try {
    const settings = loadSettings();
    const map = settings && settings[LORE_ORDER_NS];
    if (!map || typeof map !== 'object') return;
    const arr = map[String(bookId)];
    if (!Array.isArray(arr)) return;
    const filtered = arr.filter(id => String(id) !== String(loreId));
    if (filtered.length === 0) {
      delete map[String(bookId)];
    } else {
      map[String(bookId)] = filtered;
    }
    saveSettings(settings);
  } catch { /* best-effort */ }
}

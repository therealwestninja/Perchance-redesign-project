// stats/queries.js
//
// Pure functions that compute derived stats from IndexedDB record arrays.
// Input: plain arrays of records (characters, threads, messages, lore).
// Output: plain stat objects. No side effects, no storage access.
//
// This layer is deliberately isolated from IndexedDB access so it can be
// unit-tested in Node without a browser environment.

/**
 * @typedef {Object} Stats
 * @property {number} characterCount
 * @property {number} threadCount
 * @property {number} messageCount
 * @property {number} userMessageCount
 * @property {number} wordsWritten           Approx word count of user-authored messages
 * @property {number} loreCount
 * @property {number} daysActive             Distinct days on which user sent at least one message
 * @property {number} longestThread          Max message count in any single thread
 * @property {number|null} firstActivityTime Earliest user message timestamp (ms since epoch)
 * @property {number|null} lastActivityTime  Latest user message timestamp
 */

/**
 * Count words in a string. Whitespace-separated tokens; empty/null returns 0.
 */
export function countWordsInText(text) {
  if (text == null) return 0;
  const s = String(text).trim();
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}

/**
 * Compute a stats bundle from raw record arrays. All inputs optional;
 * missing arrays are treated as empty.
 *
 * @param {{characters?:Array, threads?:Array, messages?:Array, lore?:Array}} data
 * @returns {Stats}
 */
export function computeStats({ characters = [], threads = [], messages = [], lore = [] } = {}) {
  const userMessages = messages.filter(m => m && m.author === 'user');

  // Words across user-authored messages. Supports both `content` and `message`
  // field names for forward-compat with message-object variants.
  let wordsWritten = 0;
  for (const m of userMessages) {
    wordsWritten += countWordsInText(m.content != null ? m.content : m.message);
  }

  // Thread size distribution — longest thread = most messages in a single thread
  const threadSizes = new Map();
  for (const m of messages) {
    if (!m) continue;
    const tid = m.threadId;
    if (tid == null) continue;
    threadSizes.set(tid, (threadSizes.get(tid) || 0) + 1);
  }
  const longestThread = threadSizes.size ? Math.max(...threadSizes.values()) : 0;

  // Distinct days with user activity, plus first/last timestamps
  const activeDays = new Set();
  let firstActivityTime = null;
  let lastActivityTime = null;
  for (const m of userMessages) {
    const t = m.creationTime;
    if (typeof t !== 'number' || !Number.isFinite(t)) continue;
    activeDays.add(Math.floor(t / 86_400_000));
    if (firstActivityTime === null || t < firstActivityTime) firstActivityTime = t;
    if (lastActivityTime === null || t > lastActivityTime) lastActivityTime = t;
  }

  return {
    characterCount: characters.length,
    threadCount: threads.length,
    messageCount: messages.length,
    userMessageCount: userMessages.length,
    wordsWritten,
    loreCount: lore.length,
    daysActive: activeDays.size,
    longestThread,
    firstActivityTime,
    lastActivityTime,
  };
}

/**
 * Shortcut: a fully-zero stats bundle. Useful as a default before IDB loads.
 */
export function emptyStats() {
  return computeStats({});
}

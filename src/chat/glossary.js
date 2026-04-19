// chat/glossary.js
//
// Dynamic glossary / context-aware lore injection. Only injects
// definitions into the AI's prompt when their keywords appear in
// recent messages — saves tokens vs. cramming everything into
// the lorebook.
//
// Core algorithm (getGlossaryContext) adapted verbatim from FurAI's
// MIT-licensed implementation. Storage + UI are our own.
//
// Glossary format (one entry per line):
//   keyword, alias = definition
//   Red Dragon, dragon = A fearsome beast that breathes fire
//
// Storage: settings.glossaryByThread[threadId] = "keyword = def\n..."
// Per-thread, same pattern as our other per-thread settings.
//
// Injection: the aiTextPlugin monkey-patch (stop_generating.js)
// calls getGlossaryBlock() before passing the request to the
// original function. The block is appended to systemMessage.

import { loadSettings, saveSettings } from '../profile/settings_store.js';

const GLOSSARY_NS = 'glossaryByThread';
const SCAN_LAST_N = 8; // only scan last 8 messages for keywords

// ---- Pure keyword-matching engine (from FurAI, MIT) ----

/**
 * Scan `textToScan` for keywords defined in `glossaryText`.
 * Returns a formatted block of matched definitions, or empty string
 * if no matches.
 *
 * @param {string} textToScan  recent message text concatenated
 * @param {string} glossaryText  raw glossary (one entry per line)
 * @returns {string}  formatted block or ""
 */
export function getGlossaryContext(textToScan, glossaryText) {
  if (!glossaryText || !textToScan) return '';

  const lines = glossaryText.split('\n');
  const dictionary = {};
  const allKeywords = [];

  // 1. Parse: keyword, alias = definition
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const keysPart = line.substring(0, eqIndex);
    const valPart = line.substring(eqIndex + 1).trim();
    if (!valPart) continue;

    const keys = keysPart.split(',');
    const primaryKey = keys[0].trim();

    for (let j = 0; j < keys.length; j++) {
      const k = keys[j].trim();
      if (k) {
        const lowerK = k.toLowerCase();
        dictionary[lowerK] = { primary: primaryKey, val: valPart };
        allKeywords.push(k.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'));
      }
    }
  }

  if (allKeywords.length === 0) return '';

  // 2. Sort by length descending (catches "Red Dragon" before "Dragon")
  allKeywords.sort((a, b) => b.length - a.length);

  // 3. Single-pass regex scan
  const giantRegex = new RegExp(
    `(?:^|[^a-zA-Z0-9_])(${allKeywords.join('|')})(?![a-zA-Z0-9_])`, 'gi'
  );

  const foundEntries = new Set();
  let match;
  while ((match = giantRegex.exec(textToScan)) !== null) {
    const matchedWord = match[1].toLowerCase();
    const data = dictionary[matchedWord];
    if (data) {
      foundEntries.add(`- ${data.primary}: ${data.val}`);
    }
  }

  if (foundEntries.size === 0) return '';
  return `\n[DYNAMIC GLOSSARY]\n${Array.from(foundEntries).join('\n')}\n`;
}

// ---- Storage ----

/**
 * Load the glossary text for a thread. Returns empty string if none.
 */
export function loadGlossary(threadId) {
  if (threadId == null) return '';
  try {
    const s = loadSettings();
    const map = (s && s[GLOSSARY_NS]) || {};
    return String(map[String(threadId)] || '');
  } catch {
    return '';
  }
}

/**
 * Save the glossary text for a thread.
 */
export function saveGlossary(threadId, text) {
  if (threadId == null) return;
  try {
    const s = loadSettings();
    if (!s[GLOSSARY_NS] || typeof s[GLOSSARY_NS] !== 'object') {
      s[GLOSSARY_NS] = {};
    }
    const trimmed = (text || '').trim();
    if (trimmed) {
      s[GLOSSARY_NS][String(threadId)] = trimmed;
    } else {
      delete s[GLOSSARY_NS][String(threadId)];
    }
    saveSettings(s);
  } catch { /* best-effort */ }
}

/**
 * Build the glossary block to inject into the AI prompt. Scans
 * the last SCAN_LAST_N messages in #chatMessagesEl for keyword
 * matches against the current thread's glossary.
 *
 * Returns empty string if no glossary exists or no keywords match.
 * Called from the aiTextPlugin monkey-patch on every generation.
 */
export function buildGlossaryBlock() {
  try {
    const threadId = (typeof window !== 'undefined') ? window.currentChatId : null;
    if (threadId == null) return '';

    const glossaryText = loadGlossary(threadId);
    if (!glossaryText) return '';

    // Scan recent messages from the DOM
    const chatEl = document.getElementById('chatMessagesEl');
    if (!chatEl) return '';
    const messages = chatEl.querySelectorAll('.message');
    const recent = Array.from(messages)
      .filter(m => !m.id.startsWith('typing-') && m.id !== 'personality-selector-message')
      .slice(-SCAN_LAST_N);
    const scanText = recent
      .map(m => (m.querySelector('.content') || {}).innerText || '')
      .join('\n');

    return getGlossaryContext(scanText, glossaryText);
  } catch {
    return '';
  }
}

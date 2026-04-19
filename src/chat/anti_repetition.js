// chat/anti_repetition.js
//
// Anti-repetition system: per-thread word/phrase banlists that are
// injected into the AI prompt to prevent repetitive phrasing.
//
// This directly addresses the #1 user complaint on Lemmy/Reddit:
// AI "tunnel vision" where it latches onto specific words, phrases,
// or themes and repeats them endlessly in long conversations.
//
// Two layers of protection:
// 1. BANLIST: User-defined words/phrases to never use. Injected
//    as "Do NOT use these words/phrases: ..." in the system message.
// 2. AUTO-DETECT: Scans the last N messages for repeated phrases
//    and automatically adds them to a temporary anti-repetition
//    instruction. No user action needed.
//
// Storage: settings.banlistByThread[threadId] = "word1\nword2\n..."
//
// Injection: via the aiTextPlugin monkey-patch (same hook as
// glossary and summary).
//
// Bootstrap: call initAntiRepetition() from start(). Idempotent.

import { loadSettings, saveSettings } from '../profile/settings_store.js';

const BANLIST_KEY = 'banlistByThread';
const AUTO_DETECT_LAST_N = 6; // scan last 6 messages
const REPEAT_THRESHOLD = 3;   // phrase appears 3+ times = flagged

function getBanlist(threadId) {
  try {
    const s = loadSettings();
    const map = (s && s[BANLIST_KEY]) || {};
    return String(map[String(threadId)] || '');
  } catch { return ''; }
}

function saveBanlist(threadId, text) {
  try {
    const s = loadSettings();
    if (!s[BANLIST_KEY]) s[BANLIST_KEY] = {};
    const trimmed = (text || '').trim();
    if (trimmed) s[BANLIST_KEY][String(threadId)] = trimmed;
    else delete s[BANLIST_KEY][String(threadId)];
    saveSettings(s);
  } catch {}
}

/**
 * Auto-detect repeated phrases in recent messages.
 * Returns a list of phrases that appear >= REPEAT_THRESHOLD times.
 */
function detectRepeatedPhrases() {
  try {
    const chatEl = document.getElementById('chatMessagesEl');
    if (!chatEl) return [];

    const messages = Array.from(chatEl.querySelectorAll('.message.ai'))
      .filter(m => !m.id.startsWith('typing-'))
      .slice(-AUTO_DETECT_LAST_N);

    const allText = messages
      .map(m => (m.querySelector('.content') || {}).innerText || '')
      .join(' ')
      .toLowerCase();

    // Extract 2-4 word phrases and count occurrences
    const words = allText.split(/\s+/).filter(w => w.length > 2);
    const phraseCounts = {};

    for (let len = 2; len <= 4; len++) {
      for (let i = 0; i <= words.length - len; i++) {
        const phrase = words.slice(i, i + len).join(' ');
        // Skip very short or common phrases
        if (phrase.length < 8) continue;
        phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
      }
    }

    return Object.entries(phraseCounts)
      .filter(([, count]) => count >= REPEAT_THRESHOLD)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([phrase]) => phrase);
  } catch { return []; }
}

/**
 * Build the anti-repetition block for injection into the prompt.
 * Called from the aiTextPlugin monkey-patch.
 */
export function buildAntiRepetitionBlock() {
  try {
    const threadId = window.currentChatId;
    if (threadId == null) return '';

    const parts = [];

    // User-defined banlist
    const banlist = getBanlist(threadId);
    if (banlist) {
      const words = banlist.split('\n').map(w => w.trim()).filter(Boolean);
      if (words.length > 0) {
        parts.push(`BANNED WORDS/PHRASES (never use these): ${words.join(', ')}`);
      }
    }

    // Auto-detected repetitions
    const repeated = detectRepeatedPhrases();
    if (repeated.length > 0) {
      parts.push(`OVERUSED PHRASES (avoid repeating): ${repeated.join(', ')}`);
    }

    if (parts.length === 0) return '';
    return `\n[ANTI-REPETITION]\n${parts.join('\n')}\nVary your word choice and sentence structure. Avoid repeating phrases from recent messages.\n`;
  } catch { return ''; }
}

/**
 * Initialize the anti-repetition system. Adds a 🚫 button for
 * editing the banlist. Idempotent.
 */
export function initAntiRepetition() {
  if (initAntiRepetition._done) return;
  initAntiRepetition._done = true;

  // ---- Modal (reuse glossary modal styles) ----
  const overlay = document.createElement('div');
  overlay.className = 'pf-glossary-overlay';
  overlay.hidden = true;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const modal = document.createElement('div');
  modal.className = 'pf-glossary-modal';

  const title = document.createElement('h3');
  title.className = 'pf-glossary-title';
  title.textContent = 'Anti-Repetition Banlist';

  const hint = document.createElement('p');
  hint.className = 'pf-glossary-hint';
  hint.textContent = 'One word or phrase per line. The AI will be instructed to never use these. '
    + 'Repeated phrases are also auto-detected from recent messages.';

  const textarea = document.createElement('textarea');
  textarea.className = 'pf-glossary-textarea';
  textarea.rows = 8;
  textarea.placeholder = 'delicate\nshiver ran down\na mix of\nwithout missing a beat';
  textarea.spellcheck = false;

  const actions = document.createElement('div');
  actions.className = 'pf-glossary-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save';
  saveBtn.className = 'pf-glossary-save';
  saveBtn.addEventListener('click', () => {
    const threadId = window.currentChatId;
    if (threadId != null) saveBanlist(threadId, textarea.value);
    try { bumpCounter("banlistEdits"); } catch {}
    close();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.className = 'pf-glossary-cancel';
  cancelBtn.addEventListener('click', close);

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  modal.appendChild(title);
  modal.appendChild(hint);
  modal.appendChild(textarea);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  function open() {
    const threadId = window.currentChatId;
    textarea.value = threadId != null ? getBanlist(threadId) : '';
    overlay.hidden = false;
    textarea.focus();
  }

  function close() { overlay.hidden = true; }

  // ---- Button ----
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-presets-btn';
  btn.textContent = '🚫';
  btn.title = 'Anti-repetition banlist';
  btn.addEventListener('click', open);

  const inputArea = document.getElementById('chatInputEl') ||
                    document.getElementById('inputBarEl') ||
                    document.querySelector('.chat-input-container') ||
                    document.querySelector('.input-bar');
  if (inputArea) {
    (inputArea.parentElement || inputArea).appendChild(btn);
  }
}

// chat/auto_summary.js
//
// Auto-summary: when the conversation exceeds a threshold, older
// messages are compressed into a summary that's injected into the
// AI's context. This extends effective memory without eating raw
// tokens for old messages.
//
// The summary is stored per-thread in settings and injected via
// the existing aiTextPlugin monkey-patch (same hook as glossary).
//
// Trigger: after each AI response, if the thread has more than
// SUMMARY_THRESHOLD messages, summarize the oldest batch.
//
// Bootstrap: call initAutoSummary() from start(). Idempotent.

import { loadSettings, saveSettings } from '../profile/settings_store.js';

const SUMMARY_KEY = 'threadSummaries';
const SUMMARY_THRESHOLD = 20; // start summarizing after 20 messages
const BATCH_SIZE = 10; // summarize 10 oldest messages at a time

function getSummary(threadId) {
  try {
    const s = loadSettings();
    const map = (s && s[SUMMARY_KEY]) || {};
    return String(map[String(threadId)] || '');
  } catch { return ''; }
}

function setSummary(threadId, text) {
  try {
    const s = loadSettings();
    if (!s[SUMMARY_KEY] || typeof s[SUMMARY_KEY] !== 'object') s[SUMMARY_KEY] = {};
    if (text) s[SUMMARY_KEY][String(threadId)] = text;
    else delete s[SUMMARY_KEY][String(threadId)];
    saveSettings(s);
  } catch {}
}

/**
 * Build the summary block to inject into the AI prompt.
 * Returns empty string if no summary exists for the current thread.
 * Called from the aiTextPlugin monkey-patch.
 */
export function buildSummaryBlock() {
  try {
    const threadId = window.currentChatId;
    if (threadId == null) return '';
    const summary = getSummary(threadId);
    if (!summary) return '';
    return `\n[CONVERSATION SUMMARY (older messages)]\n${summary}\n`;
  } catch { return ''; }
}

/**
 * Check if the current thread needs summarization and trigger it
 * if so. Called after each message via MutationObserver.
 */
async function maybeSummarize() {
  try {
    const threadId = window.currentChatId;
    if (threadId == null) return;
    if (!window.root || typeof window.root.aiTextPlugin !== 'function') return;

    const chatEl = document.getElementById('chatMessagesEl');
    if (!chatEl) return;

    const messages = Array.from(chatEl.querySelectorAll('.message'))
      .filter(m => !m.id.startsWith('typing-') && m.id !== 'personality-selector-message');

    if (messages.length < SUMMARY_THRESHOLD) return;

    // Check if we already summarized recently (cooldown via flag)
    const existing = getSummary(threadId);
    const lastCount = parseInt(localStorage.getItem(`pf:sum-count:${threadId}`) || '0', 10);
    if (messages.length - lastCount < BATCH_SIZE) return; // not enough new messages

    // Take the oldest BATCH_SIZE messages to summarize
    const oldest = messages.slice(0, BATCH_SIZE);
    const context = oldest.map(m => {
      const isUser = m.classList.contains('user');
      const nameEl = m.querySelector('.chat-username');
      const name = nameEl ? nameEl.textContent.trim() : (isUser ? 'User' : 'AI');
      const text = (m.querySelector('.content') || {}).innerText || '';
      return `[${name}]: ${text}`;
    }).join('\n\n');

    // Generate summary
    const result = await window.root.aiTextPlugin({
      instruction: [
        'Summarize the following conversation excerpt into a concise paragraph.',
        'Preserve key facts, character actions, plot points, and emotional beats.',
        'Write in third person, past tense. Keep it under 150 words.',
        'Reply with ONLY the summary, nothing else.',
        existing ? `\nPrevious summary to build upon:\n${existing}` : '',
        '\nMessages to summarize:',
        context,
      ].join('\n'),
      stopSequences: ['\n\n\n'],
    });

    const summary = (result && result.text) ? result.text.trim() : '';
    if (summary) {
      setSummary(threadId, summary);
      localStorage.setItem(`pf:sum-count:${threadId}`, String(messages.length));
    }
  } catch (e) {
    console.warn('[pf] auto-summary failed:', e && e.message);
  }
}

export function initAutoSummary() {
  if (initAutoSummary._done) return;
  initAutoSummary._done = true;

  const chatEl = document.getElementById('chatMessagesEl');
  if (!chatEl) return;

  // Watch for new messages, debounce summary check
  const observer = new MutationObserver(() => {
    clearTimeout(maybeSummarize._t);
    maybeSummarize._t = setTimeout(maybeSummarize, 5000); // 5s delay after last mutation
  });
  observer.observe(chatEl, { childList: true, subtree: false });
}

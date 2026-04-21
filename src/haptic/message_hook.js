// haptic/message_hook.js
//
// MutationObserver that watches for new AI messages in the chat,
// runs the haptic tag parser on their content, renders inline
// glyphs, and feeds parsed blocks to the scheduler.
//
// This is the bridge between the upstream chat UI and the haptic
// subsystem. It follows the same pattern as message_controls.js:
//   - MutationObserver on #chatMessagesEl (childList, subtree: false)
//   - Process each new .message.ai element
//   - Idempotent — safe to call multiple times
//
// When haptics are disabled (no character haptics, global off, no
// consent), this module is inert — it observes but does not process.

import { createParser } from './parser.js';
import { enqueueBlock, setCharacterConfig } from './scheduler.js';
import { renderGlyphs, clearGlyphs } from '../render/haptic_glyphs.js';
import { normalizeHaptics } from './schema.js';
import { isHapticReady } from './backend.js';
import { loadHapticSettings } from './settings.js';
import { saveMessageEdits, loadMessageEdits } from './settings.js';

let _observer = null;
let _initialized = false;
let _hapticEnabled = false;    // current character has haptics
let _characterHaptics = null;  // normalized haptics config
let _glyphTheme = {};

/**
 * Initialize the message hook. Call once after chat DOM is ready.
 * Idempotent.
 */
export function initMessageHook() {
  if (_initialized) return;

  const chatEl = document.getElementById('chatMessagesEl');
  if (!chatEl) return;

  _initialized = true;

  // Load glyph theme from settings
  loadHapticSettings().then(s => {
    _glyphTheme = (s && s.glyphTheme) || {};
  }).catch(() => {});

  // Observe new messages
  _observer = new MutationObserver(mutations => {
    if (!_hapticEnabled) return;
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType === 1 && node.classList && node.classList.contains('message')) {
          if (node.classList.contains('ai')) {
            processAiMessage(node);
          }
        }
      }
    }
  });
  _observer.observe(chatEl, { childList: true, subtree: false });

  // Process existing AI messages on first load
  chatEl.querySelectorAll('.message.ai').forEach(processAiMessage);
}

/**
 * Set the current character's haptic configuration.
 * Called when a thread/character loads.
 *
 * @param {Object|null} characterHaptics - character.haptics field
 */
export function setActiveCharacterHaptics(characterHaptics) {
  _characterHaptics = normalizeHaptics(characterHaptics);
  _hapticEnabled = !!(_characterHaptics && _characterHaptics.enabled);

  // Push config to the scheduler
  if (_hapticEnabled) {
    setCharacterConfig(_characterHaptics);
  }
}

/**
 * Disable haptic processing (character switch, disconnect).
 */
export function disableHapticProcessing() {
  _hapticEnabled = false;
  _characterHaptics = null;
}

/**
 * Check if haptic message processing is currently active.
 */
export function isHapticProcessingActive() {
  return _hapticEnabled;
}

// ---- Message processing ----

/**
 * Process a single AI message element.
 * Extracts text, runs the parser, renders glyphs, feeds scheduler.
 */
function processAiMessage(messageEl) {
  if (!_hapticEnabled || !_characterHaptics) return;
  if (messageEl.dataset.hapticProcessed === 'true') return;

  // Extract the raw text content (before any glyph injection)
  const contentEl = messageEl.querySelector('.message-text')
                 || messageEl.querySelector('.msg-text')
                 || messageEl.querySelector('.content')
                 || messageEl;

  const rawText = contentEl.textContent || '';
  if (!rawText.trim()) return;

  // Check if this message has haptic tags at all (fast path)
  if (!/<(vibe|stroke|rotate|intensity|stop|pattern)\b/i.test(rawText)) {
    messageEl.dataset.hapticProcessed = 'true';
    return;
  }

  // Parse the message
  const tags = [];
  const blocks = [];
  const parser = createParser({
    defaults: _characterHaptics.defaults,
    onTag: (tag) => tags.push(tag),
    onBlock: (block) => blocks.push(block),
  });

  parser.push(rawText);
  parser.flush();

  if (tags.length === 0) {
    messageEl.dataset.hapticProcessed = 'true';
    return;
  }

  // Mark as processed
  messageEl.dataset.hapticProcessed = 'true';

  // Render inline glyphs
  renderGlyphs(messageEl, tags, {
    glyphTheme: _glyphTheme,
    onDelete: (tagIndex) => {
      handleTagDelete(messageEl, tagIndex, tags);
    },
    onEdit: (tagIndex, newTag) => {
      handleTagEdit(messageEl, tagIndex, newTag, tags);
    },
  });

  // Feed blocks to scheduler (only if backend is connected)
  if (isHapticReady()) {
    for (const block of blocks) {
      enqueueBlock(block);
    }
  }
}

/**
 * Re-process a message after edits (tag delete/modify).
 * Clears existing glyphs and re-renders with updated tags.
 */
function reprocessMessage(messageEl, updatedTags) {
  clearGlyphs(messageEl);
  delete messageEl.dataset.hapticProcessed;
  delete messageEl.dataset.hapticGlyphs;

  if (updatedTags.length > 0) {
    messageEl.dataset.hapticProcessed = 'true';
    renderGlyphs(messageEl, updatedTags, {
      glyphTheme: _glyphTheme,
      onDelete: (idx) => handleTagDelete(messageEl, idx, updatedTags),
      onEdit: (idx, newTag) => handleTagEdit(messageEl, idx, newTag, updatedTags),
    });
  }
}

// ---- Tag editing ----

function handleTagDelete(messageEl, tagIndex, tags) {
  const msgId = getMessageId(messageEl);
  if (!msgId) return;

  // Record the edit
  const edit = { tagIndex, action: 'delete', originalTag: tags[tagIndex] };
  persistEdit(msgId, messageEl, edit);

  // Remove from tag array and re-render
  const updated = tags.filter((_, i) => i !== tagIndex);
  reprocessMessage(messageEl, updated);
}

function handleTagEdit(messageEl, tagIndex, newTag, tags) {
  const msgId = getMessageId(messageEl);
  if (!msgId) return;

  const edit = { tagIndex, action: 'edit', originalTag: tags[tagIndex], editedTag: newTag };
  persistEdit(msgId, messageEl, edit);

  tags[tagIndex] = { ...tags[tagIndex], ...newTag };
  reprocessMessage(messageEl, tags);
}

function persistEdit(msgId, messageEl, edit) {
  // Get thread ID from the DOM or window globals
  const threadId = (typeof window !== 'undefined' && window.currentThreadId) || 'unknown';

  // Load existing edits and append
  loadMessageEdits(msgId).then(existing => {
    const edits = (existing && existing.edits) || [];
    edits.push(edit);
    saveMessageEdits(msgId, threadId, edits);
  }).catch(() => {});
}

function getMessageId(messageEl) {
  // Upstream messages usually have an id attribute or data-message-id
  return messageEl.id || messageEl.dataset.messageId || null;
}

// ---- Streaming integration ----

/**
 * Hook for streaming AI responses. Call this with each chunk
 * as the AI generates it. This enables real-time glyph rendering
 * and pipelined scheduling during generation (not just after).
 *
 * For M4 this is a placeholder — the full streaming hook requires
 * deeper upstream integration (injecting into the onChunk callback).
 *
 * @param {string} chunk - streaming text chunk
 * @param {HTMLElement} messageEl - the message being streamed into
 */
export function onStreamChunk(chunk, messageEl) {
  // TODO: M4+ — connect to upstream's streaming pipeline
  // For now, messages are processed after completion via MutationObserver
}

/**
 * Tear down the observer (for cleanup/tests).
 */
export function destroyMessageHook() {
  if (_observer) {
    _observer.disconnect();
    _observer = null;
  }
  _initialized = false;
  _hapticEnabled = false;
  _characterHaptics = null;
}

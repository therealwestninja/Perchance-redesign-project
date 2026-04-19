// chat/reasoning_toggle.js
//
// Toggle to show/hide AI reasoning/thinking blocks in messages.
// Some AI responses contain thinking blocks (wrapped in <think>,
// <!--thinking-->, or similar tags). This module adds a toggle
// that reveals or hides them.
//
// Also watches for code blocks containing "reasoning" or "thinking"
// content and toggles their visibility.
//
// Bootstrap: call initReasoningToggle() from start(). Idempotent.

import { loadSettings, saveSettings } from '../profile/settings_store.js';

export function initReasoningToggle() {
  if (initReasoningToggle._done) return;
  initReasoningToggle._done = true;

  // Read initial state from settings
  let showReasoning = false;
  try {
    const s = loadSettings();
    showReasoning = !!s.showReasoning;
  } catch {}

  // ---- Toggle button in header ----
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-export-btn'; // reuse header button style
  btn.title = 'Toggle AI reasoning visibility';
  updateBtn();

  btn.addEventListener('click', () => {
    showReasoning = !showReasoning;
    try {
      const s = loadSettings();
      s.showReasoning = showReasoning;
      saveSettings(s);
    } catch {}
    updateBtn();
    applyVisibility();
  });

  function updateBtn() {
    btn.textContent = showReasoning ? '🧠' : '💭';
  }

  const header = document.querySelector('.chat-header-right') ||
                 document.querySelector('.chat-header');
  if (header) header.appendChild(btn);

  // ---- Apply visibility ----
  function applyVisibility() {
    const chatEl = document.getElementById('chatMessagesEl');
    if (!chatEl) return;

    // Find thinking/reasoning blocks: <think>, <details> with
    // "thinking" summary, or elements with specific classes
    const selectors = [
      'think',
      '.thinking',
      '.reasoning',
      'details[data-thinking]',
      '[data-reasoning]',
    ];

    for (const sel of selectors) {
      try {
        chatEl.querySelectorAll(sel).forEach(el => {
          el.style.display = showReasoning ? '' : 'none';
        });
      } catch {}
    }

    // Also look for HTML comments like <!--thinking--> content <!--/thinking-->
    // These are rendered by some models but hidden by default
    chatEl.querySelectorAll('.message .content').forEach(content => {
      const html = content.innerHTML;
      if (!html.includes('thinking') && !html.includes('reasoning')) return;
      // Toggle visibility of any hidden thinking wrappers
      content.querySelectorAll('.pf-thinking-block').forEach(el => {
        el.style.display = showReasoning ? '' : 'none';
      });
    });
  }

  // Initial apply
  applyVisibility();

  // Re-apply on new messages
  const chatEl = document.getElementById('chatMessagesEl');
  if (chatEl) {
    const observer = new MutationObserver(() => {
      clearTimeout(applyVisibility._t);
      applyVisibility._t = setTimeout(applyVisibility, 300);
    });
    observer.observe(chatEl, { childList: true, subtree: true });
  }
}

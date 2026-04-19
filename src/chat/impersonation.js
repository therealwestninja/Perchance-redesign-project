// chat/impersonation.js
//
// "Write for me" — AI generates a message as the user character.
// Useful in RP when the user doesn't know what to say next or
// wants to skip ahead. The generated text is placed in the input
// box for review before sending (not auto-sent).
//
// Uses the existing aiTextPlugin (via window.root.aiTextPlugin)
// to generate text with a system instruction that says "write
// the next message as the user."
//
// Adapted from URV-AI's generateUserImpersonation concept (MIT).
//
// Bootstrap: call initImpersonation() from start(). Idempotent.

/**
 * Initialize impersonation. Adds a "Write for me" button near
 * the chat input. Idempotent.
 */
export function initImpersonation() {
  if (initImpersonation._done) return;

  if (!window.root || typeof window.root.aiTextPlugin !== 'function') return;

  initImpersonation._done = true;

  // ---- Button ----
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-impersonate-btn';
  btn.textContent = '✍';
  btn.title = 'Write for me (AI writes as you)';
  let isGenerating = false;

  btn.addEventListener('click', async () => {
    if (isGenerating) return;

    // Find the chat input textarea
    const inputEl = document.querySelector('#messageInputEl') ||
                    document.querySelector('.chat-input textarea') ||
                    document.querySelector('textarea[placeholder]');
    if (!inputEl) return;

    // Build context from recent messages
    const chatEl = document.getElementById('chatMessagesEl');
    if (!chatEl) return;

    const messages = Array.from(chatEl.querySelectorAll('.message'))
      .filter(m => !m.id.startsWith('typing-') && m.id !== 'personality-selector-message')
      .slice(-8);

    const context = messages.map(m => {
      const isUser = m.classList.contains('user');
      const nameEl = m.querySelector('.chat-username');
      const name = nameEl ? nameEl.textContent.trim() : (isUser ? 'User' : 'AI');
      const text = (m.querySelector('.content') || {}).innerText || '';
      return `[${name}]: ${text}`;
    }).join('\n\n');

    // Generate
    isGenerating = true;
    btn.textContent = '⏳';
    btn.disabled = true;

    try {
      const result = await window.root.aiTextPlugin({
        instruction: [
          'You are ghostwriting the next message for the USER character in this roleplay.',
          'Write a short, in-character reply as the user would. Stay consistent with their personality and the scene.',
          'Reply with ONLY the message text — no quotation marks, no "User:" prefix, no meta-commentary.',
          '',
          'Recent conversation:',
          context,
        ].join('\n'),
        stopSequences: ['\n\n'],
      });

      const text = (result && result.text) ? result.text.trim() : '';
      if (text) {
        // Place in input for review (don't auto-send)
        inputEl.value = text;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.focus();
      }
    } catch (e) {
      console.warn('[pf] impersonation failed:', e && e.message);
    } finally {
      isGenerating = false;
      btn.textContent = '✍';
      btn.disabled = false;
    }
  });

  // Inject near chat input
  const inputArea = document.getElementById('chatInputEl') ||
                    document.getElementById('inputBarEl') ||
                    document.querySelector('.chat-input-container') ||
                    document.querySelector('.input-bar');
  if (inputArea) {
    const parent = inputArea.parentElement || inputArea;
    parent.appendChild(btn);
  }
}

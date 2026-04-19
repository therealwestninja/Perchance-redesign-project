// chat/narration.js
//
// Generate scene narration on demand. Adds a "Narrate" button
// that generates a third-person scene description based on the
// current conversation context. The narration is inserted as a
// system-style message visible to both the user and the AI.
//
// Useful for:
//   - Setting the scene between RP exchanges
//   - Transitioning between locations or time skips
//   - Adding atmospheric descriptions
//
// Adapted from URV-AI's generateNarration concept (MIT).
//
// Bootstrap: call initNarration() from start(). Idempotent.

/**
 * Initialize narration. Adds a 🎬 button near the chat input.
 * Idempotent.
 */
export function initNarration() {
  if (initNarration._done) return;

  if (!window.root || typeof window.root.aiTextPlugin !== 'function') return;

  initNarration._done = true;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-narrate-btn';
  btn.textContent = '🎬';
  btn.title = 'Generate scene narration';
  let isNarrating = false;

  btn.addEventListener('click', async () => {
    if (isNarrating) return;

    const chatEl = document.getElementById('chatMessagesEl');
    if (!chatEl) return;

    // Build context from recent messages
    const messages = Array.from(chatEl.querySelectorAll('.message'))
      .filter(m => !m.id.startsWith('typing-') && m.id !== 'personality-selector-message')
      .slice(-6);

    const context = messages.map(m => {
      const isUser = m.classList.contains('user');
      const nameEl = m.querySelector('.chat-username');
      const name = nameEl ? nameEl.textContent.trim() : (isUser ? 'User' : 'AI');
      const text = (m.querySelector('.content') || {}).innerText || '';
      return `[${name}]: ${text}`;
    }).join('\n\n');

    isNarrating = true;
    btn.textContent = '⏳';
    btn.disabled = true;

    try {
      const result = await window.root.aiTextPlugin({
        instruction: [
          'You are the narrator of a roleplay scene.',
          'Based on the recent conversation, write a brief third-person',
          'scene narration that describes:',
          '  - The current atmosphere and setting',
          '  - What just happened (summarize the recent exchange)',
          '  - Set up what might happen next',
          'Write 2-3 vivid sentences. Use present tense.',
          'Reply with ONLY the narration, nothing else.',
          '',
          'Recent conversation:',
          context,
        ].join('\n'),
        stopSequences: ['\n\n\n'],
      });

      const narration = (result && result.text) ? result.text.trim() : '';
      if (narration && typeof window.sendMessage === 'function') {
        // Send as a system/narrator message by creating a message
        // with the narrator format. The upstream supports this via
        // oc.thread.messages API but we use sendMessage for simplicity.
        // Place narration in input and let user review.
        const inputEl = document.querySelector('#messageInputEl') ||
                        document.querySelector('.chat-input textarea') ||
                        document.querySelector('textarea[placeholder]');
        if (inputEl) {
          inputEl.value = `*${narration}*`;
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          inputEl.focus();
        }
      }
    } catch (e) {
      console.warn('[pf] narration failed:', e && e.message);
    } finally {
      isNarrating = false;
      btn.textContent = '🎬';
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

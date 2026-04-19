// chat/recap.js
//
// "Previously on..." — generates a narrative recap of the current
// conversation. Unlike auto-summary (which injects silently into
// AI context), this shows the recap to the USER as a visible
// message so they can re-orient after returning to a long chat.
//
// Uses the same aiTextPlugin to generate the recap, but displays
// it as a system message rather than injecting it.
//
// Adds a 📜 button to the tools area.
//
// Bootstrap: call initRecap() from start(). Idempotent.

export function initRecap() {
  if (initRecap._done) return;
  initRecap._done = true;

  let isGenerating = false;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-presets-btn';
  btn.textContent = '📜';
  btn.title = '"Previously on..." — get a recap of this conversation';

  btn.addEventListener('click', async () => {
    if (isGenerating) return;
    if (!window.root || typeof window.root.aiTextPlugin !== 'function') return;

    const chatEl = document.getElementById('chatMessagesEl');
    if (!chatEl) return;

    const messages = Array.from(chatEl.querySelectorAll('.message'))
      .filter(m => !m.id.startsWith('typing-') && m.id !== 'personality-selector-message');

    if (messages.length < 4) {
      insertRecapMessage('Not enough conversation to recap yet. Keep chatting!');
      return;
    }

    isGenerating = true;
    btn.textContent = '⏳';
    btn.disabled = true;

    try {
      // Take up to 20 recent messages for context
      const recent = messages.slice(-20);
      const context = recent.map(m => {
        const isUser = m.classList.contains('user');
        const nameEl = m.querySelector('.chat-username');
        const name = nameEl ? nameEl.textContent.trim() : (isUser ? 'User' : 'AI');
        const text = (m.querySelector('.content') || {}).innerText || '';
        return `[${name}]: ${text}`;
      }).join('\n\n');

      const result = await window.root.aiTextPlugin({
        instruction: [
          'Write a brief "Previously on..." recap of this conversation.',
          'Summarize the key events, character actions, emotional beats, and current situation.',
          'Write in third person, present tense, like a TV show recap.',
          'Keep it under 100 words. Start with "Previously on..."',
          'Reply with ONLY the recap text.',
          '',
          'Conversation:',
          context,
        ].join('\n'),
        stopSequences: ['\n\n\n'],
      });

      const recap = (result && result.text) ? result.text.trim() : '';
      if (recap) {
        insertRecapMessage(recap);
      }
    } catch (e) {
      console.warn('[pf] recap failed:', e && e.message);
    } finally {
      isGenerating = false;
      btn.textContent = '📜';
      btn.disabled = false;
    }
  });

  function insertRecapMessage(text) {
    const chatEl = document.getElementById('chatMessagesEl');
    if (!chatEl) return;

    const msg = document.createElement('div');
    msg.className = 'message pf-recap-message';

    const label = document.createElement('div');
    label.className = 'pf-recap-label';
    label.textContent = '📜 PREVIOUSLY ON...';

    const content = document.createElement('div');
    content.className = 'pf-recap-content';
    content.textContent = text;

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'pf-recap-dismiss';
    dismiss.textContent = '✕';
    dismiss.addEventListener('click', () => msg.remove());

    msg.appendChild(dismiss);
    msg.appendChild(label);
    msg.appendChild(content);
    chatEl.appendChild(msg);
    msg.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  const inputArea = document.getElementById('chatInputEl') ||
                    document.getElementById('inputBarEl') ||
                    document.querySelector('.chat-input-container') ||
                    document.querySelector('.input-bar');
  if (inputArea) {
    (inputArea.parentElement || inputArea).appendChild(btn);
  }
}

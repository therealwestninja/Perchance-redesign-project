// chat/writing_enhancer.js
//
// "Magic Wand" writing enhancer — rewrites/polishes the user's
// draft text in the input box before they send it. The user types
// a rough draft, clicks the wand ✨, and gets a more descriptive,
// in-character version placed back in the input for review.
//
// Uses aiTextPlugin to rewrite. The enhancement instruction asks
// the AI to expand the text into vivid RP prose while preserving
// the original intent.
//
// Adapted from FurAI's enhanceText concept (MIT).
//
// Bootstrap: SUPERSEDED — enhance is now a mode inside the AI Writer
// (ai_writer.js). This standalone module is no longer bundled or
// called from start().

/**
 * Initialize the writing enhancer. Adds a ✨ button near the
 * chat input. Idempotent.
 */
export function initWritingEnhancer() {
  if (initWritingEnhancer._done) return;

  if (!window.root || typeof window.root.aiTextPlugin !== 'function') return;

  initWritingEnhancer._done = true;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-enhance-btn';
  btn.textContent = '✨';
  btn.title = 'Enhance your message (rewrite with more detail)';
  let isEnhancing = false;

  btn.addEventListener('click', async () => {
    if (isEnhancing) return;

    // Find the chat input
    const inputEl = document.querySelector('#messageInputEl') ||
                    document.querySelector('.chat-input textarea') ||
                    document.querySelector('textarea[placeholder]');
    if (!inputEl) return;

    const draft = (inputEl.value || '').trim();
    if (!draft) return; // nothing to enhance

    isEnhancing = true;
    btn.textContent = '⏳';
    btn.disabled = true;

    try {
      const result = await window.root.aiTextPlugin({
        instruction: [
          'You are a writing enhancer for a roleplay chat.',
          'The user has written a rough draft of their message.',
          'Rewrite it to be more vivid, descriptive, and in-character.',
          'Keep the same intent, actions, and dialogue, but add:',
          '  - Sensory details (what they see, hear, feel)',
          '  - Body language and subtle expressions',
          '  - Atmospheric descriptions',
          'Keep it concise — enhance, don\'t pad. Match the tone.',
          'Reply with ONLY the enhanced message, nothing else.',
          '',
          'Draft to enhance:',
          draft,
        ].join('\n'),
        stopSequences: ['\n\n\n'],
      });

      const enhanced = (result && result.text) ? result.text.trim() : '';
      if (enhanced && enhanced !== draft) {
        inputEl.value = enhanced;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.focus();
      }
    } catch (e) {
      console.warn('[pf] enhance failed:', e && e.message);
    } finally {
      isEnhancing = false;
      btn.textContent = '✨';
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

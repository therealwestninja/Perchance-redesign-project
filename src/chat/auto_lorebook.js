// chat/auto_lorebook.js
//
// Auto-lorebook: AI automatically generates glossary entries from
// the conversation context. Inspired by SillyTavern's WorldInfo
// Recommender extension.
//
// Adds a 🔮 button that, when clicked, scans recent messages and
// asks the AI to extract key characters, locations, items, and
// concepts that should be tracked. The results are merged into
// the thread's glossary (same storage as glossary.js).
//
// This is a one-shot action (not automatic) — the user clicks
// the button when they want to update their world info.
//
// Bootstrap: call initAutoLorebook() from start(). Idempotent.

import { loadGlossary, saveGlossary } from './glossary.js';

export function initAutoLorebook() {
  if (initAutoLorebook._done) return;

  if (!window.root || typeof window.root.aiTextPlugin !== 'function') return;

  initAutoLorebook._done = true;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-presets-btn';
  btn.textContent = '🔮';
  btn.title = 'Auto-generate glossary from conversation';
  let isGenerating = false;

  btn.addEventListener('click', async () => {
    if (isGenerating) return;

    const threadId = window.currentChatId;
    if (threadId == null) return;

    const chatEl = document.getElementById('chatMessagesEl');
    if (!chatEl) return;

    // Gather recent messages
    const messages = Array.from(chatEl.querySelectorAll('.message'))
      .filter(m => !m.id.startsWith('typing-') && m.id !== 'personality-selector-message')
      .slice(-12);

    const context = messages.map(m => {
      const isUser = m.classList.contains('user');
      const nameEl = m.querySelector('.chat-username');
      const name = nameEl ? nameEl.textContent.trim() : (isUser ? 'User' : 'AI');
      const text = (m.querySelector('.content') || {}).innerText || '';
      return `[${name}]: ${text}`;
    }).join('\n\n');

    if (!context.trim()) return;

    isGenerating = true;
    btn.textContent = '⏳';
    btn.disabled = true;

    try {
      const existing = loadGlossary(threadId);

      const result = await window.root.aiTextPlugin({
        instruction: [
          'Analyze this conversation and extract key world-building details.',
          'For each important character, location, item, faction, or concept,',
          'create a glossary entry in this exact format (one per line):',
          '',
          'keyword, alias = short definition (under 30 words)',
          '',
          'Examples:',
          'Elara, the healer = A wandering healer with silver hair who carries a staff of oak',
          'Mossford, the town = A small river town known for its moss-covered bridges',
          'Moonstone = A glowing gem that grants limited night-vision to its holder',
          '',
          'Only include entries for things actually mentioned in the conversation.',
          'Skip generic things. Focus on names, places, and unique concepts.',
          'Reply with ONLY the glossary entries, nothing else.',
          existing ? `\nExisting entries (update or add to these, don't duplicate):\n${existing}` : '',
          '\nConversation to analyze:',
          context,
        ].join('\n'),
        stopSequences: ['\n\n\n'],
      });

      const generated = (result && result.text) ? result.text.trim() : '';
      if (generated) {
        // Merge with existing glossary
        const merged = existing
          ? existing + '\n' + generated
          : generated;

        // Deduplicate by primary keyword
        const seen = new Set();
        const deduped = merged.split('\n').filter(line => {
          const eqIdx = line.indexOf('=');
          if (eqIdx === -1) return false;
          const key = line.substring(0, eqIdx).split(',')[0].trim().toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).join('\n');

        saveGlossary(threadId, deduped);

        // Notify
        const count = deduped.split('\n').filter(l => l.includes('=')).length;
        try { bumpCounter("autoLorebookUses"); } catch {}
        showToast(`Glossary updated: ${count} entries. Open 📖 to review.`);
      }
    } catch (e) {
      console.warn('[pf] auto-lorebook failed:', e && e.message);
    } finally {
      isGenerating = false;
      btn.textContent = '🔮';
      btn.disabled = false;
    }
  });

  const inputArea = document.getElementById('chatInputEl') ||
                    document.getElementById('inputBarEl') ||
                    document.querySelector('.chat-input-container') ||
                    document.querySelector('.input-bar');
  if (inputArea) {
    (inputArea.parentElement || inputArea).appendChild(btn);
  }
}

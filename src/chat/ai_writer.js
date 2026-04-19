// chat/ai_writer.js
//
// Unified AI Writer tool — combines four "click → AI generates text"
// tools into a single button with a mode picker:
//
//   ✍  Impersonate — AI writes as your character
//   🎬 Narrate     — AI generates scene narration
//   ✨ Enhance     — AI rewrites your message with more detail
//   📜 Recap       — "Previously on..." conversation summary
//
// Each mode shares the same UX: click → loading → result inserted.
// The old standalone modules still exist and can init independently,
// but this provides a cleaner single-entry-point for the tools menu.
//
// Bootstrap: call initAiWriter() from start(). Idempotent.

export function initAiWriter() {
  if (initAiWriter._done) return;
  initAiWriter._done = true;

  if (!window.root || typeof window.root.aiTextPlugin !== 'function') return;

  const chatEl = document.getElementById('chatMessagesEl');
  const inputEl = document.querySelector('#messageInputEl') ||
                  document.querySelector('.chat-input textarea') ||
                  document.querySelector('textarea[placeholder]');
  if (!chatEl) return;

  const MODES = [
    { id: 'impersonate', icon: '✍', label: 'Impersonate', desc: 'AI writes as you' },
    { id: 'narrate',     icon: '🎬', label: 'Narrate',     desc: 'Scene narration' },
    { id: 'enhance',     icon: '✨', label: 'Enhance',     desc: 'Rewrite with detail' },
    { id: 'recap',       icon: '📜', label: 'Recap',       desc: '"Previously on..."' },
  ];

  let currentMode = 'impersonate';
  let isGenerating = false;

  // ---- Dropdown ----
  const container = document.createElement('div');
  container.className = 'pf-presets-container';
  container.style.position = 'relative';
  container.style.display = 'inline-block';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-presets-btn';
  btn.textContent = '✍';
  btn.title = 'AI Writer';

  const dropdown = document.createElement('div');
  dropdown.className = 'pf-presets-dropdown pf-aiw-dropdown';
  dropdown.hidden = true;

  // Mode buttons
  for (const mode of MODES) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'pf-preset-item pf-aiw-mode';
    item.dataset.mode = mode.id;

    const icon = document.createElement('span');
    icon.className = 'pf-aiw-mode-icon';
    icon.textContent = mode.icon;

    const text = document.createElement('span');
    text.className = 'pf-aiw-mode-text';

    const label = document.createElement('span');
    label.className = 'pf-aiw-mode-label';
    label.textContent = mode.label;

    const desc = document.createElement('span');
    desc.className = 'pf-aiw-mode-desc';
    desc.textContent = mode.desc;

    text.appendChild(label);
    text.appendChild(desc);
    item.appendChild(icon);
    item.appendChild(text);

    item.addEventListener('click', () => {
      currentMode = mode.id;
      btn.textContent = mode.icon;
      btn.title = `AI Writer: ${mode.label}`;
      dropdown.hidden = true;
      runMode(mode.id);
    });
    dropdown.appendChild(item);
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.hidden = !dropdown.hidden;
  });
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) dropdown.hidden = true;
  });

  container.appendChild(btn);
  container.appendChild(dropdown);

  const inputArea = document.getElementById('chatInputEl') ||
                    document.getElementById('inputBarEl') ||
                    document.querySelector('.chat-input-container') ||
                    document.querySelector('.input-bar');
  if (inputArea) {
    (inputArea.parentElement || inputArea).appendChild(container);
  }

  // ---- Mode execution ----
  async function runMode(mode) {
    if (isGenerating) return;
    isGenerating = true;
    btn.textContent = '⏳';
    btn.disabled = true;

    try {
      const messages = Array.from(chatEl.querySelectorAll('.message'))
        .filter(m => !m.id.startsWith('typing-') && m.id !== 'personality-selector-message');

      const recent = messages.slice(-8);
      const context = recent.map(m => {
        const isUser = m.classList.contains('user');
        const nameEl = m.querySelector('.chat-username');
        const name = nameEl ? nameEl.textContent.trim() : (isUser ? 'User' : 'AI');
        const text = (m.querySelector('.content') || {}).innerText || '';
        return `[${name}]: ${text}`;
      }).join('\n\n');

      let instruction = '';
      switch (mode) {
        case 'impersonate':
          instruction = [
            'Write the next message as the USER character, continuing the conversation naturally.',
            'Match the user\'s established voice, style, and personality.',
            'Write in first person. Reply with ONLY the message text.',
            '\nConversation:\n' + context,
          ].join('\n');
          break;
        case 'narrate':
          instruction = [
            'Write a brief third-person narration describing the current scene.',
            'Focus on atmosphere, body language, and environment.',
            'Keep it under 80 words. Reply with ONLY the narration.',
            '\nConversation:\n' + context,
          ].join('\n');
          break;
        case 'enhance':
          const draft = inputEl ? inputEl.value.trim() : '';
          if (!draft) { showToast('Type a message first, then click Enhance.'); return; }
          instruction = [
            'Rewrite this message with more vivid detail, better word choice, and stronger voice.',
            'Keep the same meaning and character. Reply with ONLY the rewritten text.',
            '\nOriginal:\n' + draft,
          ].join('\n');
          break;
        case 'recap':
          if (messages.length < 4) { showToast('Not enough conversation to recap yet.'); return; }
          instruction = [
            'Write a brief "Previously on..." recap of this conversation.',
            'Summarize key events, actions, emotional beats, current situation.',
            'Third person, present tense, under 100 words. Start with "Previously on..."',
            '\nConversation:\n' + context,
          ].join('\n');
          break;
      }

      const result = await window.root.aiTextPlugin({
        instruction,
        stopSequences: ['\n\n\n'],
      });

      const text = (result && result.text) ? result.text.trim() : '';
      if (!text) return;

      if (mode === 'enhance' && inputEl) {
        inputEl.value = text;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.focus();
      } else if (mode === 'recap') {
        insertSystemMessage('📜 PREVIOUSLY ON...', text);
      } else if (mode === 'narrate') {
        insertSystemMessage('🎬 NARRATION', text);
      } else if (mode === 'impersonate' && inputEl) {
        inputEl.value = text;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.focus();
      }

      try { bumpCounter(mode + 'Uses'); } catch {}
    } catch (e) {
      console.warn('[pf] ai-writer failed:', e && e.message);
    } finally {
      isGenerating = false;
      const m = MODES.find(m => m.id === currentMode);
      btn.textContent = m ? m.icon : '✍';
      btn.disabled = false;
    }
  }

  function insertSystemMessage(label, text) {
    const msg = document.createElement('div');
    msg.className = 'message pf-recap-message';

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'pf-recap-dismiss';
    dismiss.textContent = '✕';
    dismiss.addEventListener('click', () => msg.remove());

    const labelEl = document.createElement('div');
    labelEl.className = 'pf-recap-label';
    labelEl.textContent = label;

    const content = document.createElement('div');
    content.className = 'pf-recap-content';
    content.textContent = text;

    msg.appendChild(dismiss);
    msg.appendChild(labelEl);
    msg.appendChild(content);
    chatEl.appendChild(msg);
    msg.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }
}

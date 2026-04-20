// chat/quick_reminder.js
//
// Quick reminder editor — edit the current character's
// reminderMessage from a small modal without opening the
// full character editor. The reminder is the text that's
// always injected right before the AI's response.
//
// Reads/writes via window.db.characters (upstream Dexie DB).
//
// Bootstrap: SUPERSEDED — reminder editing is now handled by the
// Context Editor (context_editor.js) reminder tab. This standalone
// module is no longer bundled or called from start().

export function initQuickReminder() {
  if (initQuickReminder._done) return;
  initQuickReminder._done = true;

  // ---- Modal ----
  const overlay = document.createElement('div');
  overlay.className = 'pf-glossary-overlay'; // reuse glossary overlay style
  overlay.hidden = true;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const modal = document.createElement('div');
  modal.className = 'pf-glossary-modal'; // reuse glossary modal style

  const title = document.createElement('h3');
  title.className = 'pf-glossary-title';
  title.textContent = 'Quick Reminder';

  const hint = document.createElement('p');
  hint.className = 'pf-glossary-hint';
  hint.textContent = 'This text is injected before every AI response. Use it to reinforce character behavior.';

  const textarea = document.createElement('textarea');
  textarea.className = 'pf-glossary-textarea';
  textarea.rows = 8;
  textarea.placeholder = 'e.g. Stay in character. Use vivid descriptions.';

  const actions = document.createElement('div');
  actions.className = 'pf-glossary-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save';
  saveBtn.className = 'pf-glossary-save';
  saveBtn.addEventListener('click', async () => {
    await saveReminder(textarea.value);
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

  async function loadReminder() {
    try {
      const charId = window.currentCharacterId || window.currentChatId;
      if (!charId || !window.db || !window.db.characters) return '';
      const char = await window.db.characters.get(charId);
      return (char && char.reminderMessage) || '';
    } catch { return ''; }
  }

  async function saveReminder(text) {
    try {
      const charId = window.currentCharacterId || window.currentChatId;
      if (!charId || !window.db || !window.db.characters) return;
      await window.db.characters.update(charId, { reminderMessage: text });
    } catch (e) { console.warn('[pf] save reminder failed:', e && e.message); }
  }

  async function open() {
    textarea.value = await loadReminder();
    overlay.hidden = false;
    textarea.focus();
  }

  function close() { overlay.hidden = true; }

  // ---- Trigger button ----
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-presets-btn'; // reuse preset button style
  btn.textContent = '📌';
  btn.title = 'Edit quick reminder';
  btn.addEventListener('click', open);

  const inputArea = document.getElementById('chatInputEl') ||
                    document.getElementById('inputBarEl') ||
                    document.querySelector('.chat-input-container') ||
                    document.querySelector('.input-bar');
  if (inputArea) {
    (inputArea.parentElement || inputArea).appendChild(btn);
  }
}

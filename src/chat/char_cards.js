// chat/char_cards.js
//
// Character card import/export. Export characters as JSON files
// compatible with SillyTavern's character card format. Import
// character cards from JSON files.
//
// SillyTavern uses PNG files with embedded JSON, but for simplicity
// we start with plain JSON export/import. The JSON schema matches
// SillyTavern's spec so cards can be round-tripped.
//
// Adds import/export buttons to the character browser modal.
// Also adds a standalone 📥📤 button in the header.
//
// Bootstrap: call initCharCards() from start(). Idempotent.

export function initCharCards() {
  if (initCharCards._done) return;
  if (!window.db || !window.db.characters) return;
  initCharCards._done = true;

  // ---- Export current character ----
  async function exportChar() {
    try {
      const charId = window.currentCharacterId;
      if (!charId) { alert('No active character to export.'); return; }

      const char = await window.db.characters.get(charId);
      if (!char) { alert('Character not found.'); return; }

      // Map to SillyTavern-compatible format
      const card = {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
          name: char.name || 'Unknown',
          description: char.roleInstruction || '',
          personality: '',
          scenario: char.scene ? JSON.stringify(char.scene) : '',
          first_mes: Array.isArray(char.initialMessages) && char.initialMessages[0]
            ? char.initialMessages[0].content || '' : '',
          mes_example: '',
          system_prompt: char.systemMessage || '',
          post_history_instructions: char.reminderMessage || '',
          tags: [],
          creator: 'Perchance Fork Export',
          creator_notes: char.tagline || '',
          character_version: '1.0',
          extensions: {
            perchance: {
              modelName: char.modelName,
              temperature: char.temperature,
              maxTokensPerMessage: char.maxTokensPerMessage,
              imagePromptPrefix: char.imagePromptPrefix,
              imagePromptSuffix: char.imagePromptSuffix,
              customCode: char.customCode,
            }
          }
        }
      };

      if (char.avatar && char.avatar.url) {
        card.data.avatar = char.avatar.url;
      }

      const blob = new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(char.name || 'character').replace(/[^a-zA-Z0-9]/g, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('[pf] export failed:', e && e.message);
    }
  }

  // ---- Import character card ----
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const card = JSON.parse(text);
      const data = card.data || card;

      // Map from SillyTavern format to Perchance character
      const newChar = {
        name: data.name || 'Imported Character',
        roleInstruction: data.description || data.personality || '',
        systemMessage: data.system_prompt || '',
        reminderMessage: data.post_history_instructions || '',
        tagline: data.creator_notes || '',
        initialMessages: [],
        modelName: 'perchance-ai',
        temperature: 0.8,
        streamingResponse: true,
        avatar: {},
      };

      if (data.first_mes) {
        newChar.initialMessages.push({
          author: 'ai',
          content: data.first_mes,
        });
      }

      if (data.avatar) {
        newChar.avatar = { url: data.avatar, size: 1, shape: 'square' };
      }

      // Import Perchance-specific extensions if present
      if (data.extensions && data.extensions.perchance) {
        const ext = data.extensions.perchance;
        if (ext.modelName) newChar.modelName = ext.modelName;
        if (ext.temperature) newChar.temperature = ext.temperature;
        if (ext.customCode) newChar.customCode = ext.customCode;
      }

      const id = await window.db.characters.add(newChar);
      alert(`Imported "${newChar.name}" (ID: ${id}). Start a new chat to use them.`);
    } catch (e) {
      alert('Failed to import: ' + (e && e.message));
    }

    fileInput.value = '';
  });

  function importChar() {
    fileInput.click();
  }

  // ---- Buttons ----
  const container = document.createElement('div');
  container.className = 'pf-presets-container';
  container.style.cssText = 'position:relative;display:inline-block;';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-export-btn';
  btn.textContent = '🃏';
  btn.title = 'Character cards (import/export)';

  const dropdown = document.createElement('div');
  dropdown.className = 'pf-presets-dropdown';
  dropdown.hidden = true;

  const expBtn = document.createElement('button');
  expBtn.type = 'button';
  expBtn.className = 'pf-preset-item';
  expBtn.textContent = '📤 Export current character';
  expBtn.addEventListener('click', () => { dropdown.hidden = true; exportChar(); });

  const impBtn = document.createElement('button');
  impBtn.type = 'button';
  impBtn.className = 'pf-preset-item';
  impBtn.textContent = '📥 Import character card (.json)';
  impBtn.addEventListener('click', () => { dropdown.hidden = true; importChar(); });

  dropdown.appendChild(expBtn);
  dropdown.appendChild(impBtn);
  container.appendChild(btn);
  container.appendChild(dropdown);

  btn.addEventListener('click', () => { dropdown.hidden = !dropdown.hidden; });
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) dropdown.hidden = true;
  });

  const header = document.querySelector('.chat-header-right') ||
                 document.querySelector('.chat-header');
  if (header) header.appendChild(container);
}

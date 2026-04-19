// chat/prompt_presets.js
//
// Prompt presets: save and reuse common message templates.
// A small 📋 button near the input opens a dropdown of saved
// presets. Clicking one fills the input box. Users can also
// save the current input as a new preset.
//
// Storage: settings.promptPresets = [{name, text}, ...]
//
// Bootstrap: call initPromptPresets() from start(). Idempotent.

import { loadSettings, saveSettings } from '../profile/settings_store.js';

const PRESETS_KEY = 'promptPresets';
const DEFAULT_PRESETS = [
  { name: 'Continue the scene', text: '*continues*' },
  { name: 'Describe the surroundings', text: 'Describe what I see around me in detail.' },
  { name: 'Time skip', text: '*Some time passes...*' },
];

function getPresets() {
  try {
    const s = loadSettings();
    return Array.isArray(s[PRESETS_KEY]) ? s[PRESETS_KEY] : DEFAULT_PRESETS;
  } catch { return DEFAULT_PRESETS; }
}

function setPresets(presets) {
  try {
    const s = loadSettings();
    s[PRESETS_KEY] = presets;
    saveSettings(s);
  } catch {}
}

export function initPromptPresets() {
  if (initPromptPresets._done) return;
  initPromptPresets._done = true;

  // Find input
  const inputEl = document.querySelector('#messageInputEl') ||
                  document.querySelector('.chat-input textarea') ||
                  document.querySelector('textarea[placeholder]');

  const inputArea = document.getElementById('chatInputEl') ||
                    document.getElementById('inputBarEl') ||
                    document.querySelector('.chat-input-container') ||
                    document.querySelector('.input-bar');
  if (!inputArea) return;
  const parent = inputArea.parentElement || inputArea;

  // ---- Dropdown ----
  const container = document.createElement('div');
  container.className = 'pf-presets-container';
  container.style.position = 'relative';
  container.style.display = 'inline-block';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-presets-btn';
  btn.textContent = '📋';
  btn.title = 'Prompt presets';

  const dropdown = document.createElement('div');
  dropdown.className = 'pf-presets-dropdown';
  dropdown.hidden = true;

  container.appendChild(btn);
  container.appendChild(dropdown);
  parent.appendChild(container);

  function renderDropdown() {
    const presets = getPresets();
    dropdown.innerHTML = '';

    for (const p of presets) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'pf-preset-item';
      item.textContent = p.name;
      item.title = p.text;
      item.addEventListener('click', () => {
        if (inputEl) {
          inputEl.value = p.text;
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          inputEl.focus();
        }
        dropdown.hidden = true;
      });

      const delBtn = document.createElement('span');
      delBtn.className = 'pf-preset-del';
      delBtn.textContent = '✕';
      delBtn.title = 'Delete preset';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const updated = getPresets().filter(x => x.name !== p.name || x.text !== p.text);
        setPresets(updated);
        renderDropdown();
      });
      item.appendChild(delBtn);
      dropdown.appendChild(item);
    }

    // Save current input as preset
    const saveItem = document.createElement('button');
    saveItem.type = 'button';
    saveItem.className = 'pf-preset-item pf-preset-save';
    saveItem.textContent = '+ Save current as preset';
    saveItem.addEventListener('click', () => {
      const text = inputEl ? (inputEl.value || '').trim() : '';
      if (!text) return;
      const name = prompt('Preset name:', text.substring(0, 40));
      if (!name) return;
      const presets = getPresets();
      presets.push({ name, text });
      setPresets(presets);
      renderDropdown();
    });
    dropdown.appendChild(saveItem);
  }

  btn.addEventListener('click', () => {
    dropdown.hidden = !dropdown.hidden;
    if (!dropdown.hidden) renderDropdown();
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) dropdown.hidden = true;
  });
}

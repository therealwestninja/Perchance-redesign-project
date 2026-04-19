// chat/context_editor.js
//
// Context Editor — a single tabbed modal that combines four
// "edit text → inject into AI context" tools:
//
//   📖 Glossary  — keyword→definition pairs
//   🚫 Banlist   — anti-repetition word/phrase list
//   📌 Reminder  — persistent instruction before every AI reply
//   👤 Persona   — user character name + description
//
// Each tab has a textarea (or form fields) and a Save button.
// All four share the same modal shell, same visual design.
// The old standalone modules still exist; this provides a
// unified entry point.
//
// Bootstrap: call initContextEditor() from start(). Idempotent.

import { loadSettings, saveSettings } from '../profile/settings_store.js';
import { loadGlossary, saveGlossary } from './glossary.js';

const TABS = [
  { id: 'glossary', icon: '📖', label: 'Glossary',
    hint: 'One entry per line: keyword, alias = definition. Keywords are auto-injected when they appear in chat.',
    placeholder: 'dragon = a fire-breathing reptile\nElara, the healer = A wandering healer with silver hair' },
  { id: 'banlist', icon: '🚫', label: 'Banlist',
    hint: 'One word or phrase per line. The AI will be told never to use these.',
    placeholder: 'delicate\nshiver ran down\na mix of\nwithout missing a beat' },
  { id: 'reminder', icon: '📌', label: 'Reminder',
    hint: 'This text is injected before every AI reply. Use it to reinforce character behavior.',
    placeholder: 'Stay in character. Never break the fourth wall. Keep responses under 300 words.' },
  { id: 'persona', icon: '👤', label: 'Persona',
    hint: 'Define who YOU are in the RP. This info is sent to the AI with every message.',
    placeholder: '' },
];

export function initContextEditor() {
  if (initContextEditor._done) return;
  initContextEditor._done = true;

  let activeTab = 'glossary';

  // ---- Overlay ----
  const overlay = document.createElement('div');
  overlay.className = 'pf-glossary-overlay';
  overlay.hidden = true;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const modal = document.createElement('div');
  modal.className = 'pf-glossary-modal';
  modal.style.maxWidth = '520px';

  // ---- Tab bar ----
  const tabBar = document.createElement('div');
  tabBar.className = 'pf-cxe-tabbar';

  const tabBtns = {};
  for (const tab of TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pf-cxe-tab';
    btn.dataset.tab = tab.id;
    btn.title = tab.label;
    btn.textContent = tab.icon;
    btn.addEventListener('click', () => switchTab(tab.id));
    tabBar.appendChild(btn);
    tabBtns[tab.id] = btn;
  }

  // ---- Content area ----
  const hintEl = document.createElement('p');
  hintEl.className = 'pf-glossary-hint';

  const textareaWrap = document.createElement('div');
  textareaWrap.className = 'pf-cxe-content';

  const textarea = document.createElement('textarea');
  textarea.className = 'pf-glossary-textarea';
  textarea.rows = 8;
  textarea.spellcheck = false;

  // Persona has name + description fields instead of textarea
  const personaFields = document.createElement('div');
  personaFields.className = 'pf-cxe-persona-fields';
  personaFields.hidden = true;

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'pf-field-input';
  nameInput.placeholder = 'Your character name';
  nameInput.style.marginBottom = '8px';

  const descInput = document.createElement('textarea');
  descInput.className = 'pf-glossary-textarea';
  descInput.rows = 4;
  descInput.placeholder = 'A tall half-elf ranger with a scar across their left cheek...';

  const nameLabel = document.createElement('label');
  nameLabel.className = 'pf-field-label';
  nameLabel.textContent = 'Name';
  nameLabel.style.display = 'block';
  nameLabel.style.marginBottom = '4px';

  const descLabel = document.createElement('label');
  descLabel.className = 'pf-field-label';
  descLabel.textContent = 'Description';
  descLabel.style.display = 'block';
  descLabel.style.marginBottom = '4px';

  personaFields.appendChild(nameLabel);
  personaFields.appendChild(nameInput);
  personaFields.appendChild(descLabel);
  personaFields.appendChild(descInput);

  textareaWrap.appendChild(textarea);
  textareaWrap.appendChild(personaFields);

  // ---- Actions ----
  const actions = document.createElement('div');
  actions.className = 'pf-glossary-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.className = 'pf-glossary-cancel';
  cancelBtn.addEventListener('click', close);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save';
  saveBtn.className = 'pf-glossary-save';
  saveBtn.addEventListener('click', save);

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);

  modal.appendChild(tabBar);
  modal.appendChild(hintEl);
  modal.appendChild(textareaWrap);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  function switchTab(tabId) {
    activeTab = tabId;
    for (const t of TABS) {
      tabBtns[t.id].classList.toggle('pf-cxe-tab-active', t.id === tabId);
    }
    const tab = TABS.find(t => t.id === tabId);
    hintEl.textContent = tab ? tab.hint : '';

    // Show/hide persona fields vs textarea
    if (tabId === 'persona') {
      textarea.hidden = true;
      personaFields.hidden = false;
      loadPersona();
    } else {
      textarea.hidden = false;
      personaFields.hidden = true;
      textarea.placeholder = tab ? tab.placeholder : '';
      loadTabData(tabId);
    }
  }

  function loadTabData(tabId) {
    const threadId = window.currentChatId;
    if (tabId === 'glossary') {
      textarea.value = threadId != null ? loadGlossary(threadId) : '';
    } else if (tabId === 'banlist') {
      try {
        const s = loadSettings();
        const map = (s && s.banlistByThread) || {};
        textarea.value = String(map[String(threadId)] || '');
      } catch { textarea.value = ''; }
    } else if (tabId === 'reminder') {
      try {
        const s = loadSettings();
        const map = (s && s.quickReminders) || {};
        textarea.value = String(map[String(threadId)] || '');
      } catch { textarea.value = ''; }
    }
  }

  function loadPersona() {
    try {
      const s = loadSettings();
      const p = (s && s.profile && s.profile.userPersona) || {};
      nameInput.value = p.name || '';
      descInput.value = p.description || '';
    } catch {}
  }

  function save() {
    const threadId = window.currentChatId;
    try {
      const s = loadSettings();
      if (activeTab === 'glossary' && threadId != null) {
        saveGlossary(threadId, textarea.value);
        try { bumpCounter('glossaryEdits'); } catch {}
      } else if (activeTab === 'banlist' && threadId != null) {
        if (!s.banlistByThread) s.banlistByThread = {};
        const text = textarea.value.trim();
        if (text) s.banlistByThread[String(threadId)] = text;
        else delete s.banlistByThread[String(threadId)];
        saveSettings(s);
        try { bumpCounter('banlistEdits'); } catch {}
      } else if (activeTab === 'reminder' && threadId != null) {
        if (!s.quickReminders) s.quickReminders = {};
        const text = textarea.value.trim();
        if (text) s.quickReminders[String(threadId)] = text;
        else delete s.quickReminders[String(threadId)];
        saveSettings(s);
      } else if (activeTab === 'persona') {
        if (!s.profile) s.profile = {};
        s.profile.userPersona = {
          name: nameInput.value.trim(),
          description: descInput.value.trim(),
        };
        saveSettings(s);
        try { bumpCounter('personaEdits'); } catch {}
      }
    } catch {}
    close();
  }

  function open() {
    switchTab(activeTab);
    overlay.hidden = false;
  }

  function close() { overlay.hidden = true; }

  // ---- Trigger button ----
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-presets-btn';
  btn.textContent = '📝';
  btn.title = 'Context Editor (glossary, banlist, reminder, persona)';
  btn.addEventListener('click', open);

  const inputArea = document.getElementById('chatInputEl') ||
                    document.getElementById('inputBarEl') ||
                    document.querySelector('.chat-input-container') ||
                    document.querySelector('.input-bar');
  if (inputArea) {
    (inputArea.parentElement || inputArea).appendChild(btn);
  }
}

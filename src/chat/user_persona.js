// chat/user_persona.js
//
// User persona editor: define YOUR character (name, description,
// avatar URL) in a dedicated modal. The persona data is injected
// into the AI context so the AI knows who it's talking to.
//
// Upstream has basic userCharacter support but no standalone
// editor. This module provides one and injects the persona
// into every generation via the monkey-patch.
//
// Storage: settings.userPersona = {name, description, avatarUrl}
//
// Bootstrap: call initUserPersona() from start(). Idempotent.

import { loadSettings, saveSettings } from '../profile/settings_store.js';

const PERSONA_KEY = 'userPersona';

function getPersona() {
  try {
    const s = loadSettings();
    return (s && s[PERSONA_KEY]) || {};
  } catch { return {}; }
}

function setPersona(persona) {
  try {
    const s = loadSettings();
    s[PERSONA_KEY] = persona;
    saveSettings(s);
  } catch {}
}

/**
 * Build the persona block for AI context injection.
 * Called from the aiTextPlugin monkey-patch.
 */
export function buildPersonaBlock() {
  try {
    const p = getPersona();
    if (!p.name && !p.description) return '';
    const parts = [];
    if (p.name) parts.push(`Name: ${p.name}`);
    if (p.description) parts.push(`Description: ${p.description}`);
    return `\n[USER CHARACTER]\n${parts.join('\n')}\n`;
  } catch { return ''; }
}

export function initUserPersona() {
  if (initUserPersona._done) return;
  initUserPersona._done = true;

  // ---- Modal (reuse glossary modal styles) ----
  const overlay = document.createElement('div');
  overlay.className = 'pf-glossary-overlay';
  overlay.hidden = true;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const modal = document.createElement('div');
  modal.className = 'pf-glossary-modal';

  const title = document.createElement('h3');
  title.className = 'pf-glossary-title';
  title.textContent = 'Your Character';

  const hint = document.createElement('p');
  hint.className = 'pf-glossary-hint';
  hint.textContent = 'Define who you are in the RP. This info is sent to the AI with every message.';

  // Name field
  const nameLabel = document.createElement('label');
  nameLabel.style.cssText = 'font-size:12px;opacity:0.7;display:block;margin-top:8px;';
  nameLabel.textContent = 'Name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'pf-chat-search-input';
  nameInput.placeholder = 'Your character name';
  nameInput.style.marginBottom = '8px';

  // Description
  const descLabel = document.createElement('label');
  descLabel.style.cssText = 'font-size:12px;opacity:0.7;display:block;';
  descLabel.textContent = 'Description';
  const descInput = document.createElement('textarea');
  descInput.className = 'pf-glossary-textarea';
  descInput.rows = 5;
  descInput.placeholder = 'A tall half-elf ranger with a scar across their left cheek...';

  const actions = document.createElement('div');
  actions.className = 'pf-glossary-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save';
  saveBtn.className = 'pf-glossary-save';
  saveBtn.addEventListener('click', () => {
    setPersona({
      name: nameInput.value.trim(),
      description: descInput.value.trim(),
    });
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
  modal.appendChild(nameLabel);
  modal.appendChild(nameInput);
  modal.appendChild(descLabel);
  modal.appendChild(descInput);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  function open() {
    const p = getPersona();
    nameInput.value = p.name || '';
    descInput.value = p.description || '';
    overlay.hidden = false;
    nameInput.focus();
  }

  function close() { overlay.hidden = true; }

  // ---- Button ----
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-export-btn';
  btn.textContent = '👤';
  btn.title = 'Edit your character persona';
  btn.addEventListener('click', open);

  const header = document.querySelector('.chat-header-right') ||
                 document.querySelector('.chat-header');
  if (header) header.appendChild(btn);
}

// chat/glossary_editor.js
//
// User-facing editor for the dynamic glossary. Opens a simple
// textarea modal where the user can add/edit keyword→definition
// entries for the current thread. Entries use the format:
//   keyword, alias = definition
//
// Injected as a small 📖 button near the chat input area.
//
// Bootstrap: call initGlossaryEditor() from start(). Idempotent.

import { loadGlossary, saveGlossary } from './glossary.js';

/**
 * Initialize the glossary editor. Injects a button and builds
 * the modal overlay. Idempotent.
 */
export function initGlossaryEditor() {
  if (initGlossaryEditor._done) return;
  initGlossaryEditor._done = true;

  // ---- Build the modal ----
  const overlay = document.createElement('div');
  overlay.className = 'pf-glossary-overlay';
  overlay.hidden = true;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const modal = document.createElement('div');
  modal.className = 'pf-glossary-modal';

  const title = document.createElement('h3');
  title.className = 'pf-glossary-title';
  title.textContent = 'Dynamic Glossary';

  const hint = document.createElement('p');
  hint.className = 'pf-glossary-hint';
  hint.textContent = 'One entry per line: keyword, alias = definition. '
    + 'Only entries whose keywords appear in recent messages are injected.';

  const textarea = document.createElement('textarea');
  textarea.className = 'pf-glossary-textarea';
  textarea.rows = 12;
  textarea.placeholder = 'dragon, wyrm = A fearsome fire-breathing beast\n'
    + 'Elara = The protagonist, a wandering healer\n'
    + 'moonstone = A glowing gem that grants night-vision';
  textarea.spellcheck = false;

  const actions = document.createElement('div');
  actions.className = 'pf-glossary-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save';
  saveBtn.className = 'pf-glossary-save';
  saveBtn.addEventListener('click', () => {
    const threadId = window.currentChatId;
    if (threadId != null) {
      saveGlossary(threadId, textarea.value);
    }
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

  // ---- Open/close ----
  function open() {
    const threadId = window.currentChatId;
    textarea.value = threadId != null ? loadGlossary(threadId) : '';
    overlay.hidden = false;
    textarea.focus();
  }

  function close() {
    overlay.hidden = true;
  }

  // ---- Trigger button ----
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-glossary-trigger';
  btn.textContent = '📖';
  btn.title = 'Edit glossary for this chat';
  btn.addEventListener('click', open);

  // Inject near the chat input
  const inputArea = document.getElementById('chatInputEl') ||
                    document.getElementById('inputBarEl') ||
                    document.querySelector('.chat-input-container') ||
                    document.querySelector('.input-bar');
  if (inputArea) {
    const parent = inputArea.parentElement || inputArea;
    parent.appendChild(btn);
  } else {
    document.body.appendChild(btn);
  }
}

// chat/doc_analysis.js
//
// Document analysis: upload a text file and chat about its
// contents. The file's text is injected into the AI context
// so the AI can answer questions about it.
//
// Supports: .txt, .md, .json, .csv, .html (text-based files).
// For other formats, shows a "not supported" message.
//
// Adds a 📎 button near the chat input. Clicking it opens a
// file picker. The file content is stored in memory (per-session)
// and injected via the aiTextPlugin monkey-patch.
//
// Bootstrap: call initDocAnalysis() from start(). Idempotent.

let activeDocContent = '';
let activeDocName = '';

/**
 * Get the active document context block for injection.
 * Called from the aiTextPlugin monkey-patch.
 */
export function buildDocumentBlock() {
  if (!activeDocContent) return '';
  // Truncate to ~6000 chars to leave room for chat context
  const truncated = activeDocContent.length > 6000
    ? activeDocContent.substring(0, 6000) + '\n[...truncated]'
    : activeDocContent;
  return `\n[UPLOADED DOCUMENT: ${activeDocName}]\n${truncated}\n`;
}

export function initDocAnalysis() {
  if (initDocAnalysis._done) return;
  initDocAnalysis._done = true;

  // ---- File input (hidden) ----
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.txt,.md,.json,.csv,.html,.xml,.log,.js,.py,.ts,.css';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  // ---- Status indicator ----
  const status = document.createElement('div');
  status.className = 'pf-doc-status';
  status.hidden = true;

  // ---- Button ----
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-presets-btn';
  btn.textContent = '📎';
  btn.title = 'Upload a document to chat about';

  btn.addEventListener('click', () => {
    if (activeDocContent) {
      // Already have a doc — offer to clear
      if (confirm(`Document "${activeDocName}" is loaded. Clear it?`)) {
        activeDocContent = '';
        activeDocName = '';
        status.hidden = true;
        btn.textContent = '📎';
      }
    } else {
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      activeDocContent = text;
      activeDocName = file.name;
      status.textContent = `📄 ${file.name} (${Math.round(text.length / 1000)}k chars)`;
      status.hidden = false;
      btn.textContent = '📄';
      btn.title = `Document loaded: ${file.name}. Click to clear.`;
    } catch (e) {
      console.warn('[pf] doc read failed:', e && e.message);
    }

    fileInput.value = ''; // reset for re-upload
  });

  // Inject
  const inputArea = document.getElementById('chatInputEl') ||
                    document.getElementById('inputBarEl') ||
                    document.querySelector('.chat-input-container') ||
                    document.querySelector('.input-bar');
  if (inputArea) {
    const parent = inputArea.parentElement || inputArea;
    parent.appendChild(btn);
    parent.appendChild(status);
  }
}

// chat/chat_export.js
//
// Export the current chat thread as a downloadable text or JSON file.
// Adds an export button to the chat header area.
//
// Reads messages from the DOM (#chatMessagesEl .message elements),
// formats them as a readable text transcript, and triggers a
// browser download.
//
// Bootstrap: call initChatExport() from start(). Idempotent.

/**
 * Initialize chat export. Adds an export button near the chat
 * header. Idempotent.
 */
export function initChatExport() {
  if (initChatExport._done) return;
  initChatExport._done = true;

  // ---- Export button ----
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-export-btn';
  btn.textContent = '⬇';
  btn.title = 'Export this chat';
  btn.addEventListener('click', exportChat);

  // Inject near the chat header
  const header = document.querySelector('.chat-header-right') ||
                 document.querySelector('.chat-header');
  if (header) {
    header.appendChild(btn);
  }

  function exportChat() {
    const chatEl = document.getElementById('chatMessagesEl');
    if (!chatEl) return;

    const messages = chatEl.querySelectorAll('.message');
    const lines = [];

    // Get the chat title
    const titleEl = document.getElementById('chatTitleEl');
    const title = (titleEl ? titleEl.textContent : 'Chat').trim();
    lines.push(`=== ${title} ===`);
    lines.push(`Exported: ${new Date().toLocaleString()}`);
    lines.push('');

    for (const msg of messages) {
      if (msg.id.startsWith('typing-')) continue;
      if (msg.id === 'personality-selector-message') continue;

      // Determine author
      let author = 'System';
      if (msg.classList.contains('user')) author = 'You';
      else if (msg.classList.contains('ai')) {
        const nameEl = msg.querySelector('.chat-username');
        author = nameEl ? nameEl.textContent.trim() : 'AI';
      }

      // Get content
      const contentEl = msg.querySelector('.content');
      const text = contentEl ? contentEl.innerText.trim() : '';
      if (!text) continue;

      lines.push(`[${author}]`);
      lines.push(text);
      lines.push('');
    }

    // Trigger download
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = title.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'chat';
    a.download = `${safeTitle}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

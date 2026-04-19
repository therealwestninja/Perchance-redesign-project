// chat/timestamps.js
//
// Message timestamps: show when each message was sent. Adds a
// small timestamp to each message element via MutationObserver.
//
// For existing messages, uses the message's position as a rough
// estimate. For new messages, stamps the current time.
//
// Bootstrap: call initTimestamps() from start(). Idempotent.

export function initTimestamps() {
  if (initTimestamps._done) return;

  const chatEl = document.getElementById('chatMessagesEl');
  if (!chatEl) return;

  initTimestamps._done = true;

  function addTimestamp(messageEl, isNew) {
    if (!messageEl) return;
    if (messageEl.querySelector('.pf-timestamp')) return;
    if (messageEl.id.startsWith('typing-')) return;
    if (messageEl.id === 'personality-selector-message') return;

    const ts = document.createElement('span');
    ts.className = 'pf-timestamp';

    if (isNew) {
      ts.textContent = formatTime(new Date());
    } else {
      // For pre-existing messages, don't show a time (we don't know when they were sent)
      ts.textContent = '';
      ts.style.display = 'none';
    }

    // Insert into the message
    const nameEl = messageEl.querySelector('.chat-username');
    if (nameEl) {
      nameEl.parentElement.appendChild(ts);
    } else {
      messageEl.appendChild(ts);
    }
  }

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Stamp existing messages (hidden — no timestamp data)
  chatEl.querySelectorAll('.message').forEach(m => addTimestamp(m, false));

  // Watch for new messages
  const observer = new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType === 1 && node.classList.contains('message')) {
          addTimestamp(node, true);
        }
      }
    }
  });
  observer.observe(chatEl, { childList: true, subtree: false });
}

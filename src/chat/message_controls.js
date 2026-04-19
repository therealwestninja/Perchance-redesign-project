// chat/message_controls.js
//
// Injects per-message control buttons (copy, edit, delete, regenerate)
// into the upstream Perchance chat UI. Adapted from FurAI's MIT-licensed
// implementation (MutationObserver + delegated click handler pattern).
//
// Architecture:
//   - MutationObserver watches #chatMessagesEl for new .message nodes
//   - A single delegated click handler on the container routes all
//     button clicks (efficient: no per-button listeners)
//   - Hooks into upstream's window.editMessage, window.deleteMessage,
//     window.sendMessage globals (already exist on the Perchance page)
//   - Uses simple Unicode glyphs (no icon font dependency)
//
// Bootstrap:
//   Call initMessageControls() from start() after the chat DOM is
//   available. Safe to call multiple times (idempotent via guard).

/**
 * Initialize message controls. Finds #chatMessagesEl, sets up the
 * observer and delegated handler. Idempotent.
 */
export function initMessageControls() {
  if (initMessageControls._done) return;

  const chatEl = document.getElementById('chatMessagesEl');
  if (!chatEl) {
    // Chat DOM not ready yet — caller can retry later.
    return;
  }
  initMessageControls._done = true;

  // ---- Delegated click handler ----
  // Single listener on the container handles all control-btn clicks.
  // Adapted from FurAI's "Master Event Listener" pattern.
  chatEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.pf-msg-ctrl-btn');
    if (!btn) return;

    const message = btn.closest('.message');
    if (!message) return;

    // Copy
    if (btn.dataset.action === 'copy') {
      const text = (message.querySelector('.content') || {}).innerText || '';
      if (!text) return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          // Fallback for sandboxed iframes
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:absolute;left:-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = '⎘'; }, 1000);
      } catch { /* clipboard blocked */ }
    }

    // Edit
    else if (btn.dataset.action === 'edit') {
      if (typeof window.editMessage === 'function') {
        window.editMessage(message);
      }
    }

    // Delete
    else if (btn.dataset.action === 'delete') {
      if (typeof window.deleteMessage === 'function') {
        window.deleteMessage(message);
      }
    }

    // Regenerate (AI messages only)
    else if (btn.dataset.action === 'regen') {
      // Adapted from FurAI's regenerate logic:
      // 1. Find the message index (excluding typing indicators)
      // 2. For group RP, lock in the specific bot via profile lookup
      // 3. Delete the message, then resend with regenerate flag
      const allMessages = Array.from(
        chatEl.querySelectorAll('.message')
      ).filter(m =>
        !m.id.startsWith('typing-') &&
        m.id !== 'personality-selector-message'
      );
      const index = allMessages.indexOf(message);

      // Group RP bot lock-in (from FurAI FIX 2)
      let forcedIndex = null;
      const nameEl = message.querySelector('.chat-username');
      const currentId = window.currentChatId;
      if (nameEl && currentId) {
        const botName = (nameEl.innerText || '').trim();
        try {
          const profile = typeof window.getChatProfile === 'function'
            ? window.getChatProfile(currentId)
            : null;
          if (profile && profile.bots) {
            const found = profile.bots.findIndex(b => b.name === botName);
            if (found !== -1) forcedIndex = found;
          }
        } catch { /* non-fatal */ }
      }

      if (typeof window.deleteMessage === 'function') {
        window.deleteMessage(message);
      }
      if (typeof window.sendMessage === 'function') {
        window.sendMessage({
          regenerate: true,
          insertIndex: index,
          forceBotIndex: forcedIndex,
        });
      }
    }
  });

  // ---- Button injection ----
  // Adds control buttons to a .message element. Skips system messages
  // and messages that already have controls.
  function addControls(messageEl) {
    if (!messageEl) return;
    if (messageEl.querySelector('.pf-msg-ctrls')) return;
    if (messageEl.classList.contains('system')) return;
    if (messageEl.id === 'personality-selector-message') return;
    if (messageEl.id.startsWith('typing-')) return;

    const bar = document.createElement('div');
    bar.className = 'pf-msg-ctrls';

    // Regen — AI messages only, first in the row
    if (messageEl.classList.contains('ai')) {
      const regen = makeBtn('↺', 'regen', 'Regenerate');
      bar.appendChild(regen);
    }

    bar.appendChild(makeBtn('⎘', 'copy', 'Copy'));
    bar.appendChild(makeBtn('✎', 'edit', 'Edit'));
    bar.appendChild(makeBtn('✕', 'delete', 'Delete'));

    messageEl.appendChild(bar);
  }

  function makeBtn(glyph, action, title) {
    const btn = document.createElement('button');
    btn.className = 'pf-msg-ctrl-btn';
    btn.dataset.action = action;
    btn.title = title;
    btn.textContent = glyph;
    btn.type = 'button';
    return btn;
  }

  // ---- MutationObserver ----
  // Watches for new messages added to the chat. subtree:false is
  // important — only watch direct children of chatMessagesEl, not
  // every DOM mutation inside each message bubble.
  const observer = new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType === 1 && node.classList.contains('message')) {
          addControls(node);
        }
      }
    }
  });
  observer.observe(chatEl, { childList: true, subtree: false });

  // Inject into existing messages on first load
  chatEl.querySelectorAll('.message').forEach(addControls);
}

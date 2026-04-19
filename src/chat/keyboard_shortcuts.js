// chat/keyboard_shortcuts.js
//
// Global keyboard shortcuts for the chat interface.
//
// Shortcuts:
//   Ctrl+N / Cmd+N      — New chat (clicks the new-chat button)
//   Ctrl+/ / Cmd+/      — Focus the chat search input
//   Ctrl+Shift+E        — Export current chat
//   Escape              — Close any open overlay/modal
//
// Bootstrap: call initKeyboardShortcuts() from start(). Idempotent.

/**
 * Initialize keyboard shortcuts. Idempotent.
 */
export function initKeyboardShortcuts() {
  if (initKeyboardShortcuts._done) return;
  initKeyboardShortcuts._done = true;

  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;

    // Don't intercept when typing in an input/textarea (unless Escape)
    const tag = (e.target.tagName || '').toLowerCase();
    const isInput = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;

    // Escape — close overlays
    if (e.key === 'Escape') {
      // Close glossary overlay
      const glossaryOverlay = document.querySelector('.pf-glossary-overlay:not([hidden])');
      if (glossaryOverlay) { glossaryOverlay.hidden = true; e.preventDefault(); return; }

      // Close share viewer
      const shareViewer = document.getElementById('pf-share-viewer');
      if (shareViewer) { shareViewer.remove(); e.preventDefault(); return; }

      // Close profile overlay
      const profileOverlay = document.querySelector('.pf-overlay');
      if (profileOverlay) {
        const closeBtn = profileOverlay.querySelector('.pf-close-btn, [data-close]');
        if (closeBtn) { closeBtn.click(); e.preventDefault(); return; }
      }
      return;
    }

    // All other shortcuts require Ctrl/Cmd and should not fire in inputs
    if (!ctrl || isInput) return;

    // Ctrl+N — New chat
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      // Look for the upstream's new-chat button
      const newChatBtn = document.querySelector('[onclick*="startNewChat"]') ||
                         document.querySelector('[onclick*="newChat"]') ||
                         document.querySelector('.sidebar-action-row');
      if (newChatBtn) newChatBtn.click();
      return;
    }

    // Ctrl+/ — Focus search
    if (e.key === '/') {
      e.preventDefault();
      const searchInput = document.querySelector('.pf-chat-search-input');
      if (searchInput) searchInput.focus();
      return;
    }

    // Ctrl+Shift+E — Export chat
    if ((e.key === 'e' || e.key === 'E') && e.shiftKey) {
      e.preventDefault();
      const exportBtn = document.querySelector('.pf-export-btn');
      if (exportBtn) exportBtn.click();
      return;
    }
  });
}

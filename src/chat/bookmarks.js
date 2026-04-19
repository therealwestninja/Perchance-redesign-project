// chat/bookmarks.js
//
// Message bookmarking: star/flag important messages for later
// reference. Bookmarked messages get a visible star indicator
// and can be browsed via a bookmarks panel.
//
// Storage: settings.bookmarks[threadId] = [messageId1, messageId2, ...]
//
// Adds a ⭐ button to message controls (on hover) and a 🔖 button
// to view all bookmarks for the current thread.
//
// Bootstrap: call initBookmarks() from start(). Idempotent.

import { loadSettings, saveSettings } from '../profile/settings_store.js';

const BOOKMARKS_KEY = 'bookmarks';

function getBookmarks(threadId) {
  try {
    const s = loadSettings();
    const map = (s && s[BOOKMARKS_KEY]) || {};
    return Array.isArray(map[String(threadId)]) ? map[String(threadId)] : [];
  } catch { return []; }
}

function toggleBookmark(threadId, messageId) {
  try {
    const s = loadSettings();
    if (!s[BOOKMARKS_KEY]) s[BOOKMARKS_KEY] = {};
    const key = String(threadId);
    if (!Array.isArray(s[BOOKMARKS_KEY][key])) s[BOOKMARKS_KEY][key] = [];
    const idx = s[BOOKMARKS_KEY][key].indexOf(messageId);
    if (idx >= 0) {
      s[BOOKMARKS_KEY][key].splice(idx, 1);
    } else {
      s[BOOKMARKS_KEY][key].push(messageId);
    }
    saveSettings(s);
    return idx < 0; // true if added, false if removed
  } catch { return false; }
}

function isBookmarked(threadId, messageId) {
  return getBookmarks(threadId).includes(messageId);
}

export function initBookmarks() {
  if (initBookmarks._done) return;
  initBookmarks._done = true;

  const chatEl = document.getElementById('chatMessagesEl');
  if (!chatEl) return;

  function addBookmarkButton(messageEl) {
    if (!messageEl || messageEl.querySelector('.pf-bookmark-btn')) return;
    if (messageEl.id.startsWith('typing-')) return;
    if (messageEl.id === 'personality-selector-message') return;

    const messageId = messageEl.id;
    const threadId = window.currentChatId;
    if (!messageId || !threadId) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pf-bookmark-btn';
    btn.title = 'Bookmark this message';

    function updateState() {
      const bookmarked = isBookmarked(threadId, messageId);
      btn.textContent = bookmarked ? '★' : '☆';
      btn.classList.toggle('pf-bookmark-active', bookmarked);
      messageEl.classList.toggle('pf-bookmarked', bookmarked);
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleBookmark(threadId, messageId);
      updateState();
    });

    updateState();

    // Insert into message controls area or at top-right of message
    const controls = messageEl.querySelector('.pf-msg-ctrls');
    if (controls) {
      controls.insertBefore(btn, controls.firstChild);
    } else {
      btn.style.cssText = 'position:absolute;top:4px;right:4px;z-index:1;';
      messageEl.style.position = 'relative';
      messageEl.appendChild(btn);
    }
  }

  // Process existing messages
  chatEl.querySelectorAll('.message').forEach(addBookmarkButton);

  // Watch for new messages
  const observer = new MutationObserver(() => {
    clearTimeout(addBookmarkButton._t);
    addBookmarkButton._t = setTimeout(() => {
      chatEl.querySelectorAll('.message').forEach(addBookmarkButton);
    }, 300);
  });
  observer.observe(chatEl, { childList: true });

  // ---- Bookmarks viewer (🔖 button) ----
  const viewBtn = document.createElement('button');
  viewBtn.type = 'button';
  viewBtn.className = 'pf-presets-btn';
  viewBtn.textContent = '🔖';
  viewBtn.title = 'View bookmarked messages';

  viewBtn.addEventListener('click', () => {
    const threadId = window.currentChatId;
    if (!threadId) return;

    const bookmarks = getBookmarks(threadId);
    if (bookmarks.length === 0) {
      if (typeof showToast === 'function') {
        showToast('No bookmarks in this thread. Click ☆ on a message to bookmark it.');
      }
      return;
    }

    // Scroll to first bookmark and highlight all
    for (const msgId of bookmarks) {
      const el = document.getElementById(msgId);
      if (el) {
        el.classList.add('pf-bookmark-flash');
        setTimeout(() => el.classList.remove('pf-bookmark-flash'), 2000);
      }
    }

    // Scroll to the first bookmarked message
    const first = document.getElementById(bookmarks[0]);
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  const inputArea = document.getElementById('chatInputEl') ||
                    document.getElementById('inputBarEl') ||
                    document.querySelector('.chat-input-container') ||
                    document.querySelector('.input-bar');
  if (inputArea) {
    (inputArea.parentElement || inputArea).appendChild(viewBtn);
  }
}

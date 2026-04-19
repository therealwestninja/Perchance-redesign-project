// chat/branching.js
//
// Conversation branching: when a message is regenerated, the old
// version is preserved. Users can navigate between alternative
// versions of a message via ◀ 1/3 ▶ buttons.
//
// Storage: settings.branches[threadId][messageId] = [text1, text2, ...]
// The current displayed text is always the last in the array.
// Navigating cycles through alternatives.
//
// Integration: hooks into the existing message_controls.js regen
// flow by monkey-patching window.deleteMessage to capture the
// content before deletion.
//
// Bootstrap: call initBranching() from start(). Idempotent.

import { loadSettings, saveSettings } from '../profile/settings_store.js';

const BRANCH_KEY = 'branches';

function getBranches(threadId, messageId) {
  try {
    const s = loadSettings();
    const map = (s && s[BRANCH_KEY]) || {};
    const threadMap = map[String(threadId)] || {};
    return Array.isArray(threadMap[String(messageId)]) ? threadMap[String(messageId)] : [];
  } catch { return []; }
}

function saveBranch(threadId, messageId, text) {
  try {
    const s = loadSettings();
    if (!s[BRANCH_KEY]) s[BRANCH_KEY] = {};
    if (!s[BRANCH_KEY][String(threadId)]) s[BRANCH_KEY][String(threadId)] = {};
    const key = String(messageId);
    if (!Array.isArray(s[BRANCH_KEY][String(threadId)][key])) {
      s[BRANCH_KEY][String(threadId)][key] = [];
    }
    s[BRANCH_KEY][String(threadId)][key].push(text);
    // Cap at 10 alternatives per message
    if (s[BRANCH_KEY][String(threadId)][key].length > 10) {
      s[BRANCH_KEY][String(threadId)][key].shift();
    }
    saveSettings(s);
  } catch {}
}

export function initBranching() {
  if (initBranching._done) return;
  initBranching._done = true;

  const chatEl = document.getElementById('chatMessagesEl');
  if (!chatEl) return;

  // ---- Monkey-patch deleteMessage to capture content before deletion ----
  const originalDelete = window.deleteMessage;
  if (typeof originalDelete === 'function') {
    window.deleteMessage = function patchedDeleteMessage(messageEl) {
      // Capture content before the upstream deletes it
      try {
        const threadId = window.currentChatId;
        const messageId = messageEl && messageEl.id;
        const content = messageEl && messageEl.querySelector('.content');
        const text = content ? content.innerText.trim() : '';
        if (threadId && messageId && text) {
          saveBranch(threadId, messageId, text);
        }
      } catch {}
      return originalDelete.apply(this, arguments);
    };
  }

  // ---- Branch navigation UI ----
  // For messages that have stored alternatives, show a small nav bar
  function addBranchNav(messageEl) {
    if (!messageEl || messageEl.querySelector('.pf-branch-nav')) return;
    const messageId = messageEl.id;
    const threadId = window.currentChatId;
    if (!messageId || !threadId) return;

    const branches = getBranches(threadId, messageId);
    if (branches.length === 0) return;

    // Current content is the "live" version (not stored in branches)
    const content = messageEl.querySelector('.content');
    const currentText = content ? content.innerText.trim() : '';
    const allVersions = [...branches];
    if (currentText && !allVersions.includes(currentText)) {
      allVersions.push(currentText);
    }
    if (allVersions.length < 2) return;

    let currentIndex = allVersions.length - 1; // show current (last)

    const nav = document.createElement('div');
    nav.className = 'pf-branch-nav';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.textContent = '◀';
    prevBtn.className = 'pf-branch-btn';

    const label = document.createElement('span');
    label.className = 'pf-branch-label';

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.textContent = '▶';
    nextBtn.className = 'pf-branch-btn';

    function updateNav() {
      label.textContent = `${currentIndex + 1}/${allVersions.length}`;
      prevBtn.disabled = currentIndex === 0;
      nextBtn.disabled = currentIndex === allVersions.length - 1;
    }

    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentIndex > 0) {
        currentIndex--;
        if (content) content.innerText = allVersions[currentIndex];
        updateNav();
      }
    });

    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentIndex < allVersions.length - 1) {
        currentIndex++;
        if (content) content.innerText = allVersions[currentIndex];
        updateNav();
      }
    });

    nav.appendChild(prevBtn);
    nav.appendChild(label);
    nav.appendChild(nextBtn);
    updateNav();

    // Insert after the message content
    const wrapper = messageEl.querySelector('.message-content-wrapper') || messageEl;
    wrapper.appendChild(nav);
  }

  // Process existing messages
  chatEl.querySelectorAll('.message').forEach(addBranchNav);

  // Watch for new messages
  const observer = new MutationObserver(() => {
    clearTimeout(addBranchNav._t);
    addBranchNav._t = setTimeout(() => {
      chatEl.querySelectorAll('.message').forEach(addBranchNav);
    }, 300);
  });
  observer.observe(chatEl, { childList: true, subtree: false });
}

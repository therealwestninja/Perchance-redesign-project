// chat/thread_archive.js
//
// Thread archiving: hide old threads from the sidebar without
// deleting them. Archived threads move to a collapsible "Archived"
// section at the bottom of the thread list.
//
// Storage: settings.archivedThreadIds = ['id1', 'id2', ...]
// We don't touch the upstream Dexie DB — archived state lives
// in our localStorage-based settings only. If the user uninstalls
// the fork, all threads reappear (safe).
//
// Implementation:
//   - MutationObserver on #chatThreads watches for DOM changes
//   - On each mutation, walks .thread elements and hides any whose
//     data-thread-id is in the archived set
//   - Injects an "Archive" button into each thread's context area
//     (via the same hover-controls pattern as message_controls.js)
//   - A collapsible "Archived (N)" section at the bottom toggles
//     visibility of archived threads
//
// Bootstrap: call initThreadArchive() from start(). Idempotent.

import { loadSettings, saveSettings } from '../profile/settings_store.js';

const ARCHIVE_KEY = 'archivedThreadIds';

function getArchivedIds() {
  try {
    const s = loadSettings();
    return Array.isArray(s[ARCHIVE_KEY]) ? new Set(s[ARCHIVE_KEY]) : new Set();
  } catch { return new Set(); }
}

function setArchivedIds(idSet) {
  try {
    const s = loadSettings();
    s[ARCHIVE_KEY] = Array.from(idSet);
    saveSettings(s);
  } catch { /* best-effort */ }
}

export function initThreadArchive() {
  if (initThreadArchive._done) return;

  const chatThreads = document.getElementById('chatThreads');
  if (!chatThreads) return;

  initThreadArchive._done = true;

  let archivedIds = getArchivedIds();
  let showingArchived = false;

  // ---- Archived section toggle ----
  const section = document.createElement('div');
  section.className = 'pf-archive-section';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'pf-archive-toggle';
  updateToggleLabel();
  toggle.addEventListener('click', () => {
    showingArchived = !showingArchived;
    applyArchiveState();
    updateToggleLabel();
  });

  section.appendChild(toggle);
  chatThreads.parentElement.appendChild(section);

  function updateToggleLabel() {
    const count = archivedIds.size;
    if (count === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';
    toggle.textContent = showingArchived
      ? `▾ Archived (${count})`
      : `▸ Archived (${count})`;
  }

  // ---- Archive/unarchive a thread ----
  function archiveThread(threadId) {
    archivedIds.add(String(threadId));
    setArchivedIds(archivedIds);
    applyArchiveState();
    updateToggleLabel();
  }

  function unarchiveThread(threadId) {
    archivedIds.delete(String(threadId));
    setArchivedIds(archivedIds);
    applyArchiveState();
    updateToggleLabel();
  }

  // ---- Apply archive state to DOM ----
  function applyArchiveState() {
    const threads = chatThreads.querySelectorAll('.thread[data-thread-id]');
    for (const el of threads) {
      const id = el.dataset.threadId;
      if (archivedIds.has(id)) {
        el.style.display = showingArchived ? '' : 'none';
        el.classList.add('pf-archived');
      } else {
        el.style.display = '';
        el.classList.remove('pf-archived');
      }
    }
  }

  // ---- Inject archive buttons ----
  function addArchiveBtn(threadEl) {
    if (!threadEl || threadEl.querySelector('.pf-archive-btn')) return;
    const id = threadEl.dataset.threadId;
    if (!id) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pf-archive-btn';
    btn.title = archivedIds.has(id) ? 'Unarchive' : 'Archive';
    btn.textContent = archivedIds.has(id) ? '📤' : '📥';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (archivedIds.has(id)) {
        unarchiveThread(id);
        btn.textContent = '📥';
        btn.title = 'Archive';
      } else {
        archiveThread(id);
        btn.textContent = '📤';
        btn.title = 'Unarchive';
      }
    });

    threadEl.appendChild(btn);
  }

  // ---- MutationObserver ----
  const observer = new MutationObserver(() => {
    clearTimeout(applyArchiveState._timer);
    applyArchiveState._timer = setTimeout(() => {
      applyArchiveState();
      chatThreads.querySelectorAll('.thread[data-thread-id]').forEach(addArchiveBtn);
    }, 100);
  });
  observer.observe(chatThreads, { childList: true, subtree: false });

  // Initial pass
  applyArchiveState();
  chatThreads.querySelectorAll('.thread[data-thread-id]').forEach(addArchiveBtn);
}

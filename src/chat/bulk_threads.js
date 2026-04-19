// chat/bulk_threads.js
//
// Bulk thread operations: multi-select threads in the sidebar
// then delete or archive them all at once.
//
// Adds a "Select" toggle button above the thread list. When
// active, threads show checkboxes. A floating action bar appears
// with "Delete selected" and "Archive selected" buttons.
//
// Bootstrap: call initBulkThreads() from start(). Idempotent.

export function initBulkThreads() {
  if (initBulkThreads._done) return;

  const chatThreads = document.getElementById('chatThreads');
  if (!chatThreads) return;
  const parent = chatThreads.parentElement;
  if (!parent) return;

  initBulkThreads._done = true;

  let selectMode = false;
  const selected = new Set();

  // ---- Toggle button ----
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'pf-bulk-toggle';
  toggleBtn.textContent = '☐ Select';
  toggleBtn.title = 'Toggle multi-select mode';

  // Insert near the search bar if present, otherwise before threads
  const searchBar = parent.querySelector('.pf-chat-search-bar');
  if (searchBar) {
    searchBar.appendChild(toggleBtn);
  } else {
    parent.insertBefore(toggleBtn, chatThreads);
  }

  // ---- Action bar ----
  const actionBar = document.createElement('div');
  actionBar.className = 'pf-bulk-bar';
  actionBar.hidden = true;

  const countLabel = document.createElement('span');
  countLabel.className = 'pf-bulk-count';

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.textContent = '🗑 Delete';
  delBtn.className = 'pf-bulk-action pf-bulk-del';
  delBtn.addEventListener('click', () => {
    if (selected.size === 0) return;
    const count = selected.size;
    if (!confirm(`Delete ${count} thread${count > 1 ? 's' : ''}? This cannot be undone.`)) return;
    for (const id of selected) {
      try {
        if (window.db && window.db.threads) window.db.threads.delete(Number(id) || id);
      } catch {}
    }
    selected.clear();
    // Trigger upstream re-render
    try { if (typeof window.renderThreadList === 'function') window.renderThreadList(); } catch {}
    exitSelectMode();
  });

  const archBtn = document.createElement('button');
  archBtn.type = 'button';
  archBtn.textContent = '📥 Archive';
  archBtn.className = 'pf-bulk-action';
  archBtn.addEventListener('click', () => {
    if (selected.size === 0) return;
    // Use the thread_archive module's storage if available
    try {
      const { loadSettings, saveSettings } = { loadSettings: window.__pfLoadSettings, saveSettings: window.__pfSaveSettings };
      // Fallback: directly manipulate localStorage
      const raw = localStorage.getItem('pf:settings');
      const s = raw ? JSON.parse(raw) : {};
      if (!Array.isArray(s.archivedThreadIds)) s.archivedThreadIds = [];
      for (const id of selected) {
        if (!s.archivedThreadIds.includes(String(id))) {
          s.archivedThreadIds.push(String(id));
        }
      }
      localStorage.setItem('pf:settings', JSON.stringify(s));
    } catch {}
    selected.clear();
    exitSelectMode();
    // Force re-apply archive state
    location.reload();
  });

  actionBar.appendChild(countLabel);
  actionBar.appendChild(archBtn);
  actionBar.appendChild(delBtn);
  parent.appendChild(actionBar);

  // ---- Select mode logic ----
  function enterSelectMode() {
    selectMode = true;
    selected.clear();
    toggleBtn.textContent = '✓ Done';
    addCheckboxes();
    updateBar();
  }

  function exitSelectMode() {
    selectMode = false;
    selected.clear();
    toggleBtn.textContent = '☐ Select';
    actionBar.hidden = true;
    removeCheckboxes();
  }

  toggleBtn.addEventListener('click', () => {
    if (selectMode) exitSelectMode();
    else enterSelectMode();
  });

  function addCheckboxes() {
    chatThreads.querySelectorAll('.thread[data-thread-id]').forEach(el => {
      if (el.querySelector('.pf-bulk-cb')) return;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'pf-bulk-cb';
      cb.addEventListener('change', () => {
        const id = el.dataset.threadId;
        if (cb.checked) selected.add(id);
        else selected.delete(id);
        updateBar();
      });
      el.insertBefore(cb, el.firstChild);
    });
  }

  function removeCheckboxes() {
    chatThreads.querySelectorAll('.pf-bulk-cb').forEach(cb => cb.remove());
  }

  function updateBar() {
    actionBar.hidden = selected.size === 0;
    countLabel.textContent = `${selected.size} selected `;
  }
}

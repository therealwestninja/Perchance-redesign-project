// chat/chat_search.js
//
// Sidebar thread search. Injects a search input above the thread list
// (#chatThreads) that filters threads by name as the user types.
// Adapted from FurAI's enableSearchMode/disableSearchMode pattern.
//
// Architecture:
//   - Finds #chatThreads in the DOM
//   - Injects a search bar above it (inside its parent)
//   - On input, walks .thread elements and toggle display based on
//     whether the thread's .name span matches the query
//   - Esc key or clear button dismisses search
//
// Bootstrap:
//   Call initChatSearch() from start(). Idempotent.

/**
 * Initialize the chat search bar. Finds #chatThreads, injects a
 * search input above it. Idempotent.
 */
export function initChatSearch() {
  if (initChatSearch._done) return;

  const chatThreads = document.getElementById('chatThreads');
  if (!chatThreads) return;
  const parent = chatThreads.parentElement;
  if (!parent) return;

  initChatSearch._done = true;

  // ---- Build the search bar ----
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search chats…';
  input.className = 'pf-chat-search-input';
  input.setAttribute('aria-label', 'Search chats');

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'pf-chat-search-clear';
  clearBtn.textContent = '✕';
  clearBtn.title = 'Clear search';
  clearBtn.style.display = 'none';
  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    filterThreads('');
    input.focus();
  });

  const bar = document.createElement('div');
  bar.className = 'pf-chat-search-bar';
  bar.appendChild(input);
  bar.appendChild(clearBtn);

  // Insert before the thread list
  parent.insertBefore(bar, chatThreads);

  // ---- Filter logic ----
  function filterThreads(query) {
    const q = (query || '').trim().toLowerCase();
    const threads = chatThreads.querySelectorAll('.thread');
    const folders = chatThreads.querySelectorAll('.threadFolder');

    for (const el of threads) {
      if (!q) {
        el.style.display = '';
        continue;
      }
      const nameEl = el.querySelector('.name');
      const name = (nameEl ? nameEl.textContent : '').toLowerCase();
      el.style.display = name.includes(q) ? '' : 'none';
    }

    // Show folders if they contain any visible threads, hide if all
    // their threads are hidden. Simple heuristic — walks the next
    // siblings until the next folder or end-of-list.
    for (const folder of folders) {
      if (!q) {
        folder.style.display = '';
        continue;
      }
      // Check if any sibling .thread between this folder and the next
      // folder (or end) is visible.
      let hasVisible = false;
      let sib = folder.nextElementSibling;
      while (sib && !sib.classList.contains('threadFolder')) {
        if (sib.classList.contains('thread') && sib.style.display !== 'none') {
          hasVisible = true;
          break;
        }
        sib = sib.nextElementSibling;
      }
      folder.style.display = hasVisible ? '' : 'none';
    }
  }

  // ---- Event wiring ----
  input.addEventListener('input', () => {
    const val = input.value;
    clearBtn.style.display = val ? '' : 'none';
    filterThreads(val);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      clearBtn.style.display = 'none';
      filterThreads('');
      input.blur();
    }
  });
}

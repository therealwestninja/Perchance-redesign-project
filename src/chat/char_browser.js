// chat/char_browser.js
//
// Character browser: a searchable grid of all characters in the
// user's collection. Opens as an overlay when the user clicks the
// 👥 button. Clicking a character starts a new chat with them.
//
// Reads from window.db.characters (upstream Dexie table).
//
// Bootstrap: call initCharBrowser() from start(). Idempotent.

export function initCharBrowser() {
  if (initCharBrowser._done) return;
  if (!window.db || !window.db.characters) return;
  initCharBrowser._done = true;

  // ---- Overlay ----
  const overlay = document.createElement('div');
  overlay.className = 'pf-glossary-overlay';
  overlay.hidden = true;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const modal = document.createElement('div');
  modal.className = 'pf-glossary-modal';
  modal.style.maxWidth = '600px';
  modal.style.maxHeight = '85vh';

  const title = document.createElement('h3');
  title.className = 'pf-glossary-title';
  title.textContent = 'Characters';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search characters…';
  searchInput.className = 'pf-chat-search-input';
  searchInput.style.margin = '8px 0';

  const grid = document.createElement('div');
  grid.className = 'pf-char-grid';
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;overflow-y:auto;flex:1;padding:4px;';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Close';
  closeBtn.className = 'pf-glossary-cancel';
  closeBtn.style.alignSelf = 'flex-end';
  closeBtn.addEventListener('click', close);

  modal.appendChild(title);
  modal.appendChild(searchInput);
  modal.appendChild(grid);
  modal.appendChild(closeBtn);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  let allChars = [];

  async function open() {
    try {
      allChars = await window.db.characters.toArray();
    } catch { allChars = []; }
    renderGrid('');
    overlay.hidden = false;
    searchInput.value = '';
    searchInput.focus();
  }

  function close() { overlay.hidden = true; }

  function renderGrid(query) {
    const q = (query || '').toLowerCase();
    grid.innerHTML = '';
    const filtered = q
      ? allChars.filter(c => (c.name || '').toLowerCase().includes(q) ||
                             (c.tagline || '').toLowerCase().includes(q))
      : allChars;

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'opacity:0.5;text-align:center;padding:20px;';
      empty.textContent = 'No characters found';
      grid.innerHTML = '';
      grid.appendChild(empty);
      return;
    }

    for (const char of filtered) {
      const card = document.createElement('div');
      card.className = 'pf-char-card';
      card.title = char.tagline || char.name || '';

      const avatar = document.createElement('div');
      avatar.className = 'pf-char-avatar';
      if (char.avatar && char.avatar.url) {
        avatar.style.backgroundImage = `url(${char.avatar.url})`;
        avatar.style.backgroundSize = 'cover';
        avatar.style.backgroundPosition = 'center';
      } else {
        avatar.textContent = (char.name || '?')[0].toUpperCase();
        avatar.style.display = 'flex';
        avatar.style.alignItems = 'center';
        avatar.style.justifyContent = 'center';
        avatar.style.fontSize = '24px';
        avatar.style.opacity = '0.5';
      }

      const name = document.createElement('div');
      name.className = 'pf-char-name';
      name.textContent = char.name || 'Unnamed';

      card.appendChild(avatar);
      card.appendChild(name);

      card.addEventListener('click', () => {
        close();
        // Start a new chat with this character
        try {
          if (typeof window.startChatWithCharacter === 'function') {
            window.startChatWithCharacter(char.id);
          } else if (typeof window.addThread === 'function') {
            window.addThread({ characterId: char.id });
          } else {
            // Fallback: navigate via URL hash
            window.location.hash = JSON.stringify({ addThread: { characterId: char.id } });
          }
        } catch (e) { console.warn('[pf] start chat failed:', e && e.message); }
      });

      grid.appendChild(card);
    }
  }

  searchInput.addEventListener('input', () => renderGrid(searchInput.value));

  // ---- Trigger button ----
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-export-btn';
  btn.textContent = '👥';
  btn.title = 'Browse characters';
  btn.addEventListener('click', open);

  const header = document.querySelector('.chat-header-right') ||
                 document.querySelector('.chat-header');
  if (header) header.appendChild(btn);
}

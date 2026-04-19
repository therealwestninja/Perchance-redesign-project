// chat/custom_bg.js
//
// Custom chat background. Adds a small 🏞 button that opens a
// popover where the user can enter an image URL or pick a preset
// background. Applied as a CSS background-image on the chat
// messages area.
//
// Storage: settings.chatBackground (URL string or preset name)
//
// Bootstrap: call initCustomBg() from start(). Idempotent.

import { loadSettings, saveSettings } from '../profile/settings_store.js';

const PRESET_BGS = [
  { name: 'None', value: '' },
  { name: 'Stars', value: 'linear-gradient(to bottom, #0a0a2e 0%, #1a1a3e 50%, #0a0a2e 100%)' },
  { name: 'Forest', value: 'linear-gradient(to bottom, #0d1f0d 0%, #1a3a1a 50%, #0d1f0d 100%)' },
  { name: 'Ocean', value: 'linear-gradient(to bottom, #0a1a2e 0%, #1a3a5e 50%, #0a1a2e 100%)' },
  { name: 'Sunset', value: 'linear-gradient(to bottom, #2e1a0a 0%, #5e3a1a 30%, #3e1a2a 70%, #1a0a2e 100%)' },
  { name: 'Cozy', value: 'linear-gradient(to bottom, #1a1510 0%, #2e2518 50%, #1a1510 100%)' },
];

export function initCustomBg() {
  if (initCustomBg._done) return;
  initCustomBg._done = true;

  let bgValue = '';
  try {
    const s = loadSettings();
    bgValue = s.chatBackground || '';
  } catch {}
  applyBg(bgValue);

  // ---- Popover ----
  const container = document.createElement('div');
  container.className = 'pf-presets-container';
  container.style.position = 'relative';
  container.style.display = 'inline-block';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-export-btn';
  btn.textContent = '🏞';
  btn.title = 'Chat background';

  const dropdown = document.createElement('div');
  dropdown.className = 'pf-presets-dropdown';
  dropdown.hidden = true;
  dropdown.style.minWidth = '180px';

  // Presets
  for (const p of PRESET_BGS) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'pf-preset-item';
    item.textContent = p.name;
    item.addEventListener('click', () => {
      bgValue = p.value;
      save();
      applyBg(bgValue);
      dropdown.hidden = true;
    });
    dropdown.appendChild(item);
  }

  // Custom URL input
  const sep = document.createElement('div');
  sep.style.cssText = 'border-top:1px solid rgba(255,255,255,0.06); margin:4px 0; padding:4px 8px 2px; font-size:11px; opacity:0.5;';
  sep.textContent = 'Custom image URL';
  dropdown.appendChild(sep);

  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.placeholder = 'https://example.com/bg.jpg';
  urlInput.className = 'pf-chat-search-input';
  urlInput.style.margin = '4px';
  urlInput.style.width = 'calc(100% - 8px)';
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      bgValue = `url(${urlInput.value.trim()})`;
      save();
      applyBg(bgValue);
      dropdown.hidden = true;
    }
  });
  dropdown.appendChild(urlInput);

  container.appendChild(btn);
  container.appendChild(dropdown);

  const header = document.querySelector('.chat-header-right') ||
                 document.querySelector('.chat-header');
  if (header) header.appendChild(container);

  btn.addEventListener('click', () => { dropdown.hidden = !dropdown.hidden; });
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) dropdown.hidden = true;
  });

  function save() {
    try {
      const s = loadSettings();
      s.chatBackground = bgValue;
      saveSettings(s);
    } catch {}
  }
}

function applyBg(value) {
  const chatEl = document.getElementById('chatMessagesEl');
  if (!chatEl) return;
  if (!value) {
    chatEl.style.backgroundImage = '';
    chatEl.style.backgroundColor = '';
    return;
  }
  if (value.startsWith('url(') || value.startsWith('http')) {
    chatEl.style.backgroundImage = value.startsWith('url(') ? value : `url(${value})`;
    chatEl.style.backgroundSize = 'cover';
    chatEl.style.backgroundPosition = 'center';
    chatEl.style.backgroundAttachment = 'fixed';
  } else {
    // gradient
    chatEl.style.backgroundImage = value;
  }
}

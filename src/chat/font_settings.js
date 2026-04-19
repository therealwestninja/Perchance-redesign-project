// chat/font_settings.js
//
// Font customization: change the chat's font family and size.
// Settings persist via our settings store. Applied via CSS
// custom properties on the document root.
//
// Bootstrap: call initFontSettings() from start(). Idempotent.

import { loadSettings, saveSettings } from '../profile/settings_store.js';

const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'Sans-serif', value: 'system-ui, -apple-system, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Monospace', value: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
  { label: 'Dyslexic-friendly', value: '"Comic Sans MS", "Comic Sans", cursive' },
];

const FONT_SIZES = [
  { label: 'Small', value: '13px' },
  { label: 'Medium', value: '15px' },
  { label: 'Large', value: '17px' },
  { label: 'X-Large', value: '20px' },
];

export function initFontSettings() {
  if (initFontSettings._done) return;
  initFontSettings._done = true;

  // Load saved settings and apply immediately
  let fontFamily = '';
  let fontSize = '';
  try {
    const s = loadSettings();
    fontFamily = s.fontFamily || '';
    fontSize = s.fontSize || '';
  } catch {}
  applyFont(fontFamily, fontSize);

  // ---- Button + dropdown ----
  const container = document.createElement('div');
  container.className = 'pf-presets-container'; // reuse positioning
  container.style.position = 'relative';
  container.style.display = 'inline-block';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-export-btn';
  btn.textContent = 'Aa';
  btn.title = 'Font settings';
  btn.style.fontSize = '14px';
  btn.style.fontWeight = '700';

  const dropdown = document.createElement('div');
  dropdown.className = 'pf-presets-dropdown';
  dropdown.hidden = true;
  dropdown.style.minWidth = '180px';

  // Font family selector
  const famLabel = document.createElement('div');
  famLabel.textContent = 'Font';
  famLabel.style.cssText = 'font-size:11px;opacity:0.5;padding:4px 8px 2px;';
  dropdown.appendChild(famLabel);

  for (const f of FONT_FAMILIES) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'pf-preset-item';
    item.textContent = f.label;
    item.style.fontFamily = f.value || 'inherit';
    item.addEventListener('click', () => {
      fontFamily = f.value;
      save();
      applyFont(fontFamily, fontSize);
    });
    dropdown.appendChild(item);
  }

  // Font size selector
  const sizeLabel = document.createElement('div');
  sizeLabel.textContent = 'Size';
  sizeLabel.style.cssText = 'font-size:11px;opacity:0.5;padding:8px 8px 2px;border-top:1px solid rgba(255,255,255,0.06);';
  dropdown.appendChild(sizeLabel);

  for (const s of FONT_SIZES) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'pf-preset-item';
    item.textContent = s.label;
    item.addEventListener('click', () => {
      fontSize = s.value;
      save();
      applyFont(fontFamily, fontSize);
    });
    dropdown.appendChild(item);
  }

  container.appendChild(btn);
  container.appendChild(dropdown);

  const header = document.querySelector('.chat-header-right') ||
                 document.querySelector('.chat-header');
  if (header) header.appendChild(container);

  btn.addEventListener('click', () => {
    dropdown.hidden = !dropdown.hidden;
  });
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) dropdown.hidden = true;
  });

  function save() {
    try {
      const s = loadSettings();
      s.fontFamily = fontFamily;
      s.fontSize = fontSize;
      saveSettings(s);
    } catch {}
  }
}

function applyFont(family, size) {
  const root = document.documentElement;
  if (family) root.style.setProperty('--pf-font-family', family);
  else root.style.removeProperty('--pf-font-family');
  if (size) root.style.setProperty('--pf-font-size', size);
  else root.style.removeProperty('--pf-font-size');

  // Apply to chat messages area
  const chatEl = document.getElementById('chatMessagesEl');
  if (chatEl) {
    if (family) chatEl.style.fontFamily = family;
    else chatEl.style.fontFamily = '';
    if (size) chatEl.style.fontSize = size;
    else chatEl.style.fontSize = '';
  }
}

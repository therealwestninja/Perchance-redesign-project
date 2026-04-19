// chat/theme_toggle.js
//
// Dark/light theme toggle. Adds a button in the chat header that
// switches between dark and light modes by toggling CSS variables
// on the document root.
//
// The default Perchance chat is dark-themed. This module adds a
// light theme option by overriding key CSS variables.
//
// Persists via settings.themeMode ('dark' or 'light').
//
// Bootstrap: call initThemeToggle() from start(). Idempotent.

import { loadSettings, saveSettings } from '../profile/settings_store.js';

const LIGHT_OVERRIDES = {
  '--bg-color': '#f5f5f5',
  '--box-color': '#ffffff',
  '--text-color': '#1a1a1a',
  '--border-color': 'rgba(0, 0, 0, 0.1)',
  '--sidebar-hover': 'rgba(0, 0, 0, 0.04)',
};

export function initThemeToggle() {
  if (initThemeToggle._done) return;
  initThemeToggle._done = true;

  let mode = 'dark';
  try {
    const s = loadSettings();
    if (s.themeMode === 'light') mode = 'light';
  } catch {}

  applyTheme(mode);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-export-btn';
  btn.title = 'Toggle light/dark theme';
  updateBtn();

  btn.addEventListener('click', () => {
    mode = mode === 'dark' ? 'light' : 'dark';
    applyTheme(mode);
    updateBtn();
    try {
      const s = loadSettings();
      s.themeMode = mode;
      saveSettings(s);
    } catch {}
  });

  function updateBtn() {
    btn.textContent = mode === 'dark' ? '☀' : '🌙';
  }

  const header = document.querySelector('.chat-header-right') ||
                 document.querySelector('.chat-header');
  if (header) header.appendChild(btn);
}

function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'light') {
    for (const [prop, val] of Object.entries(LIGHT_OVERRIDES)) {
      root.style.setProperty(prop, val);
    }
    document.body.classList.add('pf-light-theme');
  } else {
    for (const prop of Object.keys(LIGHT_OVERRIDES)) {
      root.style.removeProperty(prop);
    }
    document.body.classList.remove('pf-light-theme');
  }
}

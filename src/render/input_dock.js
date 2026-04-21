// render/input_dock.js
//
// Vertical button dock to the left of the chat input bar.
// Houses the "Widgets" (tools menu) and "Options" (chat settings)
// buttons in a stacked layout:
//
//   |_________|
//   | Widgets |  ← opens tools popup
//   |---------|
//   | Options |  ← opens settings panel
//   |_________|  [ chat input ............... ]
//
// Consolidates discovery: users find all tools and settings from
// two clearly labeled buttons rather than scattered icon buttons.
//
// Bootstrap: call initInputDock() from start() AFTER initToolsMenu().

import { h } from '../utils/dom.js';

let _dock = null;
let _settingsOverlay = null;

/**
 * Initialize the input dock. Finds the chat input area and
 * injects the dock to its left. Idempotent.
 */
export function initInputDock() {
  if (_dock) return;
  if (typeof document === 'undefined') return;

  const inputArea = document.getElementById('chatInputEl')
                 || document.getElementById('inputBarEl')
                 || document.querySelector('.chat-input-container')
                 || document.querySelector('.input-bar')
                 || document.querySelector('textarea[placeholder]');

  if (!inputArea) {
    // Retry — input might not be ready yet
    setTimeout(() => initInputDock(), 2000);
    return;
  }

  const parent = inputArea.parentElement;
  if (!parent) return;

  // Build the dock
  _dock = h('div', { class: 'pf-input-dock' });

  // ---- Widgets button ----
  const widgetsBtn = h('button', {
    type: 'button',
    class: 'pf-dock-btn',
    title: 'Widgets & tools',
    onClick: (e) => {
      e.stopPropagation();
      toggleWidgetsPopup();
    },
  }, [
    h('span', { class: 'pf-dock-btn-icon' }, ['⚙']),
    h('span', { class: 'pf-dock-btn-label' }, ['Widgets']),
  ]);

  // ---- Options button ----
  const optionsBtn = h('button', {
    type: 'button',
    class: 'pf-dock-btn',
    title: 'Chat settings',
    onClick: (e) => {
      e.stopPropagation();
      toggleSettingsPanel();
    },
  }, [
    h('span', { class: 'pf-dock-btn-icon' }, ['◈']),
    h('span', { class: 'pf-dock-btn-label' }, ['Options']),
  ]);

  _dock.appendChild(widgetsBtn);
  _dock.appendChild(optionsBtn);

  // Insert dock as a flex sibling to the left of the input
  // Wrap the input + dock in a flex container if needed
  if (!parent.classList.contains('pf-input-row')) {
    // Make parent flex-aware
    parent.style.display = 'flex';
    parent.style.alignItems = 'flex-end';
    parent.style.gap = '0';
    parent.insertBefore(_dock, inputArea);
  } else {
    parent.insertBefore(_dock, parent.firstChild);
  }

  // Absorb the existing tools container if it exists
  _absorbToolsContainer();
  // Also try again after tools menu has time to init
  setTimeout(_absorbToolsContainer, 4000);
}

// ---- Widgets popup (absorbs tools menu) ----

let _widgetsPopup = null;
let _widgetsOpen = false;

/**
 * Find the existing pf-tools-container created by tools_menu.js
 * and relocate its popup to anchor from our dock instead.
 */
function _absorbToolsContainer() {
  if (_widgetsPopup) return; // already absorbed

  const existing = document.querySelector('.pf-tools-container');
  if (!existing) return;

  // Find the popup inside the tools container
  const popup = existing.querySelector('.pf-tools-popup');
  if (!popup) return;

  // Steal the popup — move it into our dock's coordinate space
  _widgetsPopup = popup;

  // Hide the original trigger (we replace it with our dock button)
  const oldTrigger = existing.querySelector('.pf-tools-trigger');
  if (oldTrigger) oldTrigger.style.display = 'none';

  // Move the popup to be a child of the dock (for positioning)
  _dock.appendChild(_widgetsPopup);
  _widgetsPopup.hidden = true;

  // Update popup positioning to open above the dock
  _widgetsPopup.style.position = 'absolute';
  _widgetsPopup.style.bottom = 'calc(100% + 8px)';
  _widgetsPopup.style.left = '0';
  _widgetsPopup.style.right = 'auto';
}

function toggleWidgetsPopup() {
  if (!_widgetsPopup) {
    _absorbToolsContainer();
  }

  if (_widgetsPopup) {
    _widgetsOpen = !_widgetsOpen;
    _widgetsPopup.hidden = !_widgetsOpen;
  }
}

// ---- Settings panel ----

function toggleSettingsPanel() {
  if (_settingsOverlay && _settingsOverlay.parentNode) {
    _settingsOverlay.hidden = !_settingsOverlay.hidden;
    return;
  }

  // createChatSettingsPanel is in the same IIFE scope (bundle)
  if (typeof createChatSettingsPanel !== 'function') return;

  createChatSettingsPanel().then(panel => {
    _settingsOverlay = h('div', { class: 'pf-haptic-settings-overlay' });

    const closeBtn = h('button', {
      class: 'pf-haptic-settings-close', type: 'button',
      onClick: () => { _settingsOverlay.hidden = true; },
    }, ['×']);

    const wrapper = h('div', { class: 'pf-haptic-settings-wrapper' }, [closeBtn, panel]);
    _settingsOverlay.appendChild(wrapper);

    _settingsOverlay.addEventListener('click', (e) => {
      if (e.target === _settingsOverlay) _settingsOverlay.hidden = true;
    });

    document.body.appendChild(_settingsOverlay);
  }).catch(() => {});
}

// Close widgets popup on outside click
if (typeof document !== 'undefined') {
  document.addEventListener('click', () => {
    if (_widgetsOpen && _widgetsPopup) {
      _widgetsOpen = false;
      _widgetsPopup.hidden = true;
    }
  });
}

// chat/tools_menu.js
//
// Consolidates all the scattered chat tool buttons into a single
// "Tools" popup menu. Runs AFTER all other modules have initialized
// and injected their buttons.
//
// Approach: find all .pf-presets-btn and .pf-export-btn elements
// in the input area and header, move them into a grid popup, and
// replace them with a single trigger button.
//
// Buttons that should stay outside the menu (stop-generating, send)
// are excluded by checking for specific classes/ids.
//
// Bootstrap: call initToolsMenu() from start() — MUST be last.

export function initToolsMenu() {
  if (initToolsMenu._done) return;
  initToolsMenu._done = true;

  // Delay slightly to ensure all other modules have injected their buttons
  setTimeout(collectButtons, 500);
}

function collectButtons() {
  // ---- Gather input-area tool buttons ----
  const inputArea = document.getElementById('chatInputEl') ||
                    document.getElementById('inputBarEl') ||
                    document.querySelector('.chat-input-container') ||
                    document.querySelector('.input-bar');
  const inputParent = inputArea ? (inputArea.parentElement || inputArea) : null;

  // ---- Gather header tool buttons ----
  const header = document.querySelector('.chat-header-right') ||
                 document.querySelector('.chat-header');

  if (!inputParent && !header) return;

  // Collect buttons from both areas
  const inputBtns = inputParent
    ? Array.from(inputParent.querySelectorAll('.pf-presets-btn, .pf-export-btn'))
        .filter(b => !b.classList.contains('pf-stop-gen-btn') &&
                     !b.classList.contains('pf-tools-trigger'))
    : [];

  const headerBtns = header
    ? Array.from(header.querySelectorAll('.pf-export-btn, .pf-presets-btn'))
        .filter(b => !b.classList.contains('pf-tools-trigger'))
    : [];

  // Also collect any presets containers (dropdown wrappers)
  const inputContainers = inputParent
    ? Array.from(inputParent.querySelectorAll('.pf-presets-container'))
    : [];
  const headerContainers = header
    ? Array.from(header.querySelectorAll('.pf-presets-container'))
    : [];

  const allItems = [
    ...inputBtns,
    ...inputContainers,
    ...headerBtns,
    ...headerContainers,
  ];

  // If fewer than 4 buttons, not worth consolidating
  if (allItems.length < 4) return;

  // ---- Build the popup grid ----
  const grid = document.createElement('div');
  grid.className = 'pf-tools-grid';

  // ---- Build the popup ----
  const popup = document.createElement('div');
  popup.className = 'pf-tools-popup';
  popup.hidden = true;

  // Header label
  const popupLabel = document.createElement('div');
  popupLabel.className = 'pf-tools-popup-label';
  popupLabel.textContent = 'TOOLS';
  popup.appendChild(popupLabel);
  popup.appendChild(grid);

  // Move buttons into the grid
  for (const item of allItems) {
    // Create a grid cell wrapper
    const cell = document.createElement('div');
    cell.className = 'pf-tools-cell';
    cell.title = item.title || '';

    // Move the element into the cell
    item.parentElement.removeChild(item);

    // For container wrappers (like presets dropdown), extract just the trigger button
    if (item.classList.contains('pf-presets-container')) {
      const innerBtn = item.querySelector('.pf-presets-btn, .pf-export-btn');
      if (innerBtn) {
        cell.appendChild(item); // keep the whole container for dropdown behavior
      } else {
        cell.appendChild(item);
      }
    } else {
      // Strip existing classes and re-style for grid
      item.classList.add('pf-tools-item');
      cell.appendChild(item);
    }

    grid.appendChild(cell);
  }

  // ---- Trigger button ----
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'pf-tools-trigger';
  trigger.title = `Tools (${allItems.length})`;
  const triggerIcon = document.createElement('span');
  triggerIcon.className = 'pf-tools-trigger-icon';
  triggerIcon.textContent = '⚙';
  const triggerLabel = document.createElement('span');
  triggerLabel.className = 'pf-tools-trigger-label';
  triggerLabel.textContent = 'Tools';
  trigger.appendChild(triggerIcon);
  trigger.appendChild(triggerLabel);

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    popup.hidden = !popup.hidden;
    trigger.classList.toggle('pf-tools-trigger-open', !popup.hidden);
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!popup.contains(e.target) && e.target !== trigger && !trigger.contains(e.target)) {
      popup.hidden = true;
      trigger.classList.remove('pf-tools-trigger-open');
    }
  });

  // ---- Container ----
  const container = document.createElement('div');
  container.className = 'pf-tools-container';
  container.appendChild(trigger);
  container.appendChild(popup);

  // Insert into the input area (preferred) or header
  if (inputParent) {
    inputParent.appendChild(container);
  } else if (header) {
    header.appendChild(container);
  }
}

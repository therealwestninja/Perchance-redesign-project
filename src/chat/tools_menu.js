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

  // Run after all other modules have had time to inject their buttons.
  // Many modules use 1500-3000ms fallback timers, so we wait longer.
  setTimeout(() => {
    if (!collectButtons()) {
      // Retry once more — some modules may still be initializing
      setTimeout(collectButtons, 3000);
    }
  }, 3500);
}

function collectButtons() {
  const inputArea = document.getElementById('chatInputEl') ||
                    document.getElementById('inputBarEl') ||
                    document.querySelector('.chat-input-container') ||
                    document.querySelector('.input-bar');
  const inputParent = inputArea ? (inputArea.parentElement || inputArea) : null;

  const header = document.querySelector('.chat-header-right') ||
                 document.querySelector('.chat-header');

  if (!inputParent && !header) return false;

  // Collect all tool buttons from both areas
  const allItems = [];
  const seen = new Set();

  function gather(parent) {
    if (!parent) return;
    const btns = parent.querySelectorAll('.pf-presets-btn, .pf-export-btn, .pf-presets-container');
    for (const b of btns) {
      if (b.classList.contains('pf-stop-gen-btn') || b.classList.contains('pf-tools-trigger')) continue;
      if (seen.has(b)) continue;
      seen.add(b);
      allItems.push(b);
    }
  }
  gather(inputParent);
  gather(header);

  if (allItems.length < 3) return false;

  // Categorize by title/content
  const CATEGORIES = [
    { label: 'AI', match: t => /writer|impersonate|narrate|enhance|recap|✍|🎬|✨|📜/i.test(t) },
    { label: 'Context', match: t => /glossary|banlist|reminder|persona|context.*editor|📖|🚫|📌|👤|📝/i.test(t) },
    { label: 'World', match: t => /dice|document|lorebook|🎲|📎|🔮/i.test(t) },
    { label: 'Chat', match: t => /export|archive|bookmark|search|⬇|📥|🔖|☐/i.test(t) },
    { label: 'View', match: t => /theme|font|fullscreen|background|reasoning|token|☀|🌙|Aa|⛶|🏞|🧠|💭/i.test(t) },
    { label: 'Characters', match: t => /character|browse|card|import|👥|🃏/i.test(t) },
  ];

  function categorize(item) {
    const text = (item.title || '') + ' ' + (item.textContent || '');
    for (const cat of CATEGORIES) {
      if (cat.match(text)) return cat.label;
    }
    return 'Other';
  }

  // Group items
  const groups = {};
  for (const item of allItems) {
    const cat = categorize(item);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }

  // ---- Build popup ----
  const popup = document.createElement('div');
  popup.className = 'pf-tools-popup';
  popup.hidden = true;

  const popupLabel = document.createElement('div');
  popupLabel.className = 'pf-tools-popup-label';
  popupLabel.textContent = 'TOOLS';
  popup.appendChild(popupLabel);

  // Render each category
  const categoryOrder = ['AI', 'Context', 'World', 'Chat', 'Characters', 'View', 'Other'];
  for (const catName of categoryOrder) {
    const items = groups[catName];
    if (!items || items.length === 0) continue;

    const section = document.createElement('div');
    section.className = 'pf-tools-section';

    const sectionLabel = document.createElement('div');
    sectionLabel.className = 'pf-tools-section-label';
    sectionLabel.textContent = catName;
    section.appendChild(sectionLabel);

    const grid = document.createElement('div');
    grid.className = 'pf-tools-grid';

    for (const item of items) {
      const cell = document.createElement('div');
      cell.className = 'pf-tools-cell';
      cell.title = item.title || '';
      item.parentElement.removeChild(item);

      if (item.classList.contains('pf-presets-container')) {
        cell.appendChild(item);
      } else {
        item.classList.add('pf-tools-item');
        cell.appendChild(item);
      }
      grid.appendChild(cell);
    }

    section.appendChild(grid);
    popup.appendChild(section);
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
  return true;
}

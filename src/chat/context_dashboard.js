// chat/context_dashboard.js
//
// Context dashboard: a small collapsible panel above the chat input
// that shows everything currently being injected into the AI prompt.
// Gives users visibility into the "invisible" work happening behind
// the scenes: glossary matches, summary, persona, anti-repetition,
// document, gen settings, and quick reminder.
//
// Updates live — each injection source reports its status, and the
// dashboard refreshes on a timer.
//
// Bootstrap: call initContextDashboard() from start(). Idempotent.

export function initContextDashboard() {
  if (initContextDashboard._done) return;
  initContextDashboard._done = true;

  const inputArea = document.getElementById('chatInputEl') ||
                    document.getElementById('inputBarEl') ||
                    document.querySelector('.chat-input-container') ||
                    document.querySelector('.input-bar');
  if (!inputArea) return;
  const parent = inputArea.parentElement || inputArea;

  // ---- Dashboard container ----
  const dashboard = document.createElement('div');
  dashboard.className = 'pf-ctx-dashboard';
  dashboard.hidden = true;

  const header = document.createElement('div');
  header.className = 'pf-ctx-header';
  const headerLabel = document.createElement('span');
  headerLabel.className = 'pf-ctx-title';
  headerLabel.textContent = 'CONTEXT';
  header.appendChild(headerLabel);

  const body = document.createElement('div');
  body.className = 'pf-ctx-body';

  dashboard.appendChild(header);
  dashboard.appendChild(body);

  // ---- Toggle button ----
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'pf-ctx-toggle';
  toggle.textContent = '📊';
  toggle.title = 'Context dashboard — see what\'s injected into the AI prompt';
  toggle.addEventListener('click', () => {
    dashboard.hidden = !dashboard.hidden;
    if (!dashboard.hidden) refresh();
  });

  parent.insertBefore(dashboard, inputArea);
  parent.appendChild(toggle);

  // ---- Refresh logic ----
  function refresh() {
    const items = [];

    // Glossary
    try {
      const block = typeof buildGlossaryBlock === 'function' ? buildGlossaryBlock() : '';
      if (block) {
        const count = (block.match(/^- /gm) || []).length;
        items.push({ icon: '📖', label: 'Glossary', detail: `${count} entries matched`, active: true });
      } else {
        items.push({ icon: '📖', label: 'Glossary', detail: 'no matches', active: false });
      }
    } catch { items.push({ icon: '📖', label: 'Glossary', detail: 'unavailable', active: false }); }

    // Summary
    try {
      const block = typeof buildSummaryBlock === 'function' ? buildSummaryBlock() : '';
      items.push({ icon: '📝', label: 'Summary', detail: block ? `${block.length} chars` : 'none', active: !!block });
    } catch { items.push({ icon: '📝', label: 'Summary', detail: 'unavailable', active: false }); }

    // Persona
    try {
      const block = typeof buildPersonaBlock === 'function' ? buildPersonaBlock() : '';
      items.push({ icon: '👤', label: 'Persona', detail: block ? 'active' : 'not set', active: !!block });
    } catch { items.push({ icon: '👤', label: 'Persona', detail: 'unavailable', active: false }); }

    // Anti-repetition
    try {
      const block = typeof buildAntiRepetitionBlock === 'function' ? buildAntiRepetitionBlock() : '';
      if (block) {
        const banned = (block.match(/BANNED/i) ? 'banlist' : '') + (block.match(/OVERUSED/i) ? '+auto' : '');
        items.push({ icon: '🚫', label: 'Anti-rep', detail: banned || 'active', active: true });
      } else {
        items.push({ icon: '🚫', label: 'Anti-rep', detail: 'clean', active: false });
      }
    } catch { items.push({ icon: '🚫', label: 'Anti-rep', detail: 'unavailable', active: false }); }

    // Document
    try {
      const block = typeof buildDocumentBlock === 'function' ? buildDocumentBlock() : '';
      items.push({ icon: '📎', label: 'Document', detail: block ? `loaded` : 'none', active: !!block });
    } catch { items.push({ icon: '📎', label: 'Document', detail: 'unavailable', active: false }); }

    // Gen settings
    try {
      const overrides = typeof getGenOverrides === 'function' ? getGenOverrides() : {};
      const parts = [];
      if (overrides.temperature != null) parts.push(`temp=${overrides.temperature}`);
      if (overrides.maxTokens != null) parts.push(`max=${overrides.maxTokens}`);
      items.push({ icon: '⚙', label: 'Gen', detail: parts.length ? parts.join(', ') : 'defaults', active: parts.length > 0 });
    } catch { items.push({ icon: '⚙', label: 'Gen', detail: 'unavailable', active: false }); }

    // Render
    body.innerHTML = '';
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'pf-ctx-row' + (item.active ? ' pf-ctx-row-active' : '');

      const icon = document.createElement('span');
      icon.className = 'pf-ctx-icon';
      icon.textContent = item.icon;

      const label = document.createElement('span');
      label.className = 'pf-ctx-label';
      label.textContent = item.label;

      const detail = document.createElement('span');
      detail.className = 'pf-ctx-detail';
      detail.textContent = item.detail;

      row.appendChild(icon);
      row.appendChild(label);
      row.appendChild(detail);
      body.appendChild(row);
    }
  }

  // Auto-refresh when visible — cleans up if dashboard is removed from DOM
  const refreshInterval = setInterval(() => {
    if (!dashboard.isConnected) {
      clearInterval(refreshInterval);
      return;
    }
    if (!dashboard.hidden) refresh();
  }, 3000);
}

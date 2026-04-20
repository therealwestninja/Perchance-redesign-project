// chat/token_display.js
//
// Displays a token count estimate in the chat interface so users
// have awareness of how much context window they're using.
//
// Reads window.idealMaxContextTokens (set by upstream at boot) for
// the max. Estimates current usage from visible messages in the DOM
// using a ~4 chars/token heuristic. Updates on MutationObserver
// events (new messages, edits, deletions).
//
// The estimate is deliberately rough — exact tokenization requires
// the model's tokenizer which isn't available client-side. The
// display is informational ("~2.1k / 8k tokens"), not precise.
//
// Bootstrap: call initTokenDisplay() from start(). Idempotent.

const CHARS_PER_TOKEN = 4; // rough heuristic; GPT-family models average ~3.5-4

/**
 * Initialize the token count display. Injects a small indicator
 * into the chat header. Idempotent.
 */
export function initTokenDisplay() {
  if (initTokenDisplay._done) return;

  const chatEl = document.getElementById('chatMessagesEl');
  if (!chatEl) return;

  initTokenDisplay._done = true;

  const maxTokens = Number(window.idealMaxContextTokens) || 8000;

  // ---- Build the display element ----
  const display = document.createElement('div');
  display.className = 'pf-token-display';
  display.title = 'Estimated token usage (approximate)';

  // Try to inject into the chat header; fall back to above the chat
  const header = document.querySelector('.chat-header') ||
                 document.querySelector('.chat-header-right');
  if (header) {
    header.appendChild(display);
  } else {
    const parent = chatEl.parentElement;
    if (parent) parent.insertBefore(display, chatEl);
  }

  // ---- Estimation logic ----
  function estimateTokens() {
    const messages = chatEl.querySelectorAll('.message');
    let totalChars = 0;
    for (const msg of messages) {
      if (msg.id.startsWith('typing-')) continue;
      if (msg.id === 'personality-selector-message') continue;
      const content = msg.querySelector('.content');
      if (content) totalChars += (content.innerText || '').length;
    }
    return Math.round(totalChars / CHARS_PER_TOKEN);
  }

  function formatTokens(n) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  function update() {
    const used = estimateTokens();
    const pct = Math.min(100, Math.round((used / maxTokens) * 100));
    display.textContent = `~${formatTokens(used)} / ${formatTokens(maxTokens)} tokens`;
    // Tint the display based on usage level
    if (pct > 85) {
      display.style.color = 'var(--pf-palette-danger, #e06060)';
    } else if (pct > 65) {
      display.style.color = 'var(--pf-accent, #d8a040)';
    } else {
      display.style.color = ''; // default muted
    }
  }

  // Initial update
  update();

  // Re-estimate on message changes
  const observer = new MutationObserver(() => {
    // Debounce — messages can arrive in rapid succession during streaming
    clearTimeout(update._timer);
    update._timer = setTimeout(update, 300);
  });
  observer.observe(chatEl, { childList: true, subtree: true, characterData: true });
}

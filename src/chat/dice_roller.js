// chat/dice_roller.js
//
// Dice roller for TTRPG-style play. Intercepts /roll commands in
// the chat input and replaces them with dice results. Also adds
// a 🎲 button that rolls a d20 and inserts the result.
//
// Syntax: /roll XdY (e.g. /roll 2d6, /roll 1d20+5)
//
// Bootstrap: call initDiceRoller() from start(). Idempotent.

export function initDiceRoller() {
  if (initDiceRoller._done) return;
  initDiceRoller._done = true;

  const inputEl = document.querySelector('#messageInputEl') ||
                  document.querySelector('.chat-input textarea') ||
                  document.querySelector('textarea[placeholder]');

  // ---- /roll command interception ----
  // Watch for Enter key on the input and intercept /roll commands
  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      const val = (inputEl.value || '').trim();
      if (!val.startsWith('/roll')) return;

      e.preventDefault();
      e.stopPropagation();

      const result = parseAndRoll(val);
      inputEl.value = result;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));

      // Auto-send after a tick
      setTimeout(() => {
        const sendBtn = document.querySelector('.send-button') ||
                        document.querySelector('[onclick*="sendMessage"]') ||
                        document.querySelector('button[title*="Send"]');
        if (sendBtn) sendBtn.click();
      }, 50);
    });
  }

  // ---- 🎲 button ----
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-presets-btn';
  btn.textContent = '🎲';
  btn.title = 'Roll dice (d20)';
  btn.addEventListener('click', () => {
    const roll = Math.floor(Math.random() * 20) + 1;
    const crit = roll === 20 ? ' ⭐ CRITICAL!' : roll === 1 ? ' 💀 FUMBLE!' : '';
    if (inputEl) {
      inputEl.value = `🎲 *rolls a d20* → **${roll}**${crit}`;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.focus();
    }
  });

  const inputArea = document.getElementById('chatInputEl') ||
                    document.getElementById('inputBarEl') ||
                    document.querySelector('.chat-input-container') ||
                    document.querySelector('.input-bar');
  if (inputArea) {
    (inputArea.parentElement || inputArea).appendChild(btn);
  }
}

function parseAndRoll(command) {
  // Parse: /roll 2d6+3, /roll d20, /roll 4d8-2
  const match = command.match(/\/roll\s+(\d*)d(\d+)([+-]\d+)?/i);
  if (!match) {
    // Simple random number
    const n = Math.floor(Math.random() * 20) + 1;
    return `🎲 *rolls* → **${n}**`;
  }

  const count = parseInt(match[1] || '1', 10);
  const sides = parseInt(match[2], 10);
  const modifier = parseInt(match[3] || '0', 10);

  if (count < 1 || count > 20 || sides < 2 || sides > 100) {
    return `🎲 Invalid dice: ${count}d${sides}`;
  }

  const rolls = [];
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1);
  }

  const sum = rolls.reduce((a, b) => a + b, 0) + modifier;
  const modStr = modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : '';
  const rollsStr = count > 1 ? ` (${rolls.join(', ')})` : '';

  return `🎲 *rolls ${count}d${sides}${modStr}*${rollsStr} → **${sum}**`;
}

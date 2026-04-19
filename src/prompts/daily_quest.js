// prompts/daily_quest.js
//
// AI-generated daily quest with a "click to reveal" sealed-card mechanic.
//
// How it works:
//   1. A sealed quest card appears in the Prompts section each day
//   2. User clicks "Reveal today's quest" → seal-break animation plays
//   3. While animating, aiTextPlugin generates a quest from a date-seeded theme
//   4. Quest text streams in as the seal opens
//   5. Result is cached in localStorage so re-opening shows the same quest
//
// Date seeding:
//   The date determines a THEME from a fixed list (deterministic hash).
//   The AI then generates a specific quest within that theme. The AI
//   output may vary per-user, but the theme is consistent globally.
//
// Quest completion:
//   Completing a quest bumps the 'questsCompleted' counter and is
//   tracked in the prompts completion system under the day key.

import { getCurrentDayKey } from './scheduler.js';

// 30 quest themes — the date hash picks one per day.
const THEMES = [
  { seed: 'stranger',    prompt: 'Write a scene where your character meets a complete stranger who changes their perspective.' },
  { seed: 'secret',      prompt: 'Your character discovers a secret about someone they trust. Write their reaction.' },
  { seed: 'storm',       prompt: 'A sudden storm forces your character to take shelter somewhere unexpected.' },
  { seed: 'memory',      prompt: 'Your character finds an object that triggers a powerful memory. Write the scene.' },
  { seed: 'rival',       prompt: 'Your character encounters a rival. Write the confrontation — it doesn\'t have to be hostile.' },
  { seed: 'silence',     prompt: 'Write a scene where the most important thing is what ISN\'T said.' },
  { seed: 'gift',        prompt: 'Someone gives your character an unexpected gift. What is it, and what does it mean?' },
  { seed: 'crossroads',  prompt: 'Your character reaches a literal or metaphorical crossroads. Which path do they take?' },
  { seed: 'wound',       prompt: 'Your character tends to a wound — physical or emotional. Write the quiet aftermath.' },
  { seed: 'festival',    prompt: 'Your character attends a celebration they weren\'t invited to.' },
  { seed: 'midnight',    prompt: 'Something happens at midnight that only your character witnesses.' },
  { seed: 'letter',      prompt: 'Your character writes or receives a letter that changes everything.' },
  { seed: 'threshold',   prompt: 'Your character stands at a door they\'re afraid to open. What\'s on the other side?' },
  { seed: 'mask',        prompt: 'Your character puts on a mask — literal or figurative. Who do they become?' },
  { seed: 'bargain',     prompt: 'Your character makes a deal they might regret. Write the negotiation.' },
  { seed: 'echo',        prompt: 'Your character hears something from the past — a voice, a song, a phrase. Write what it stirs.' },
  { seed: 'compass',     prompt: 'Your character is lost. Not geographically — in a deeper way. Who or what guides them back?' },
  { seed: 'forge',       prompt: 'Your character creates something — an object, a plan, a promise. Write the act of making.' },
  { seed: 'trespass',    prompt: 'Your character enters a place where they don\'t belong. What do they find?' },
  { seed: 'debt',        prompt: 'Someone calls in an old debt. Your character must repay it — but not with money.' },
  { seed: 'mirror',      prompt: 'Your character sees their reflection and doesn\'t recognize who\'s looking back.' },
  { seed: 'hunger',      prompt: 'Your character craves something they can\'t have. Write the wanting.' },
  { seed: 'bridge',      prompt: 'Two people who have been apart meet again on a bridge. Write the reunion.' },
  { seed: 'omen',        prompt: 'Your character notices an omen — a sign that something is about to change.' },
  { seed: 'trade',       prompt: 'Your character must give up one thing to gain another. What do they choose?' },
  { seed: 'sanctuary',   prompt: 'Your character finds a place of absolute safety. What makes it sacred to them?' },
  { seed: 'shadow',      prompt: 'Your character confronts their shadow self — the version of them they try to hide.' },
  { seed: 'lantern',     prompt: 'In complete darkness, your character finds a single light. Write toward it.' },
  { seed: 'oath',        prompt: 'Your character swears an oath they intend to keep. Write the moment.' },
  { seed: 'tide',        prompt: 'Something returns that your character thought was gone forever.' },
];

const CACHE_KEY = 'pf:daily-quest';

/** Hash a string to a number (deterministic). */
function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Get today's theme (deterministic from date). */
function getTodayTheme(dayKey) {
  const idx = hashStr(dayKey) % THEMES.length;
  return THEMES[idx];
}

/** Load cached quest for today, or null. */
function loadCachedQuest(dayKey) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (cached && cached.day === dayKey && cached.text) return cached;
    return null;
  } catch { return null; }
}

/** Cache quest result. */
function cacheQuest(dayKey, text, theme) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ day: dayKey, text, theme, ts: Date.now() }));
  } catch {}
}

/**
 * Create the daily quest card element.
 * Returns a DOM element to be inserted into the prompts section.
 */
export function createDailyQuestCard() {
  const dayKey = getCurrentDayKey();
  const theme = getTodayTheme(dayKey);
  const cached = loadCachedQuest(dayKey);

  // ---- Outer card ----
  const card = document.createElement('div');
  card.className = 'pf-dq-card';

  // ---- Header ----
  const header = document.createElement('div');
  header.className = 'pf-dq-header';

  const icon = document.createElement('span');
  icon.className = 'pf-dq-icon';
  icon.textContent = '✦';

  const title = document.createElement('span');
  title.className = 'pf-dq-title';
  title.textContent = 'DAILY QUEST';

  const date = document.createElement('span');
  date.className = 'pf-dq-date';
  date.textContent = dayKey;

  header.appendChild(icon);
  header.appendChild(title);
  header.appendChild(date);
  card.appendChild(header);

  if (cached) {
    // Already revealed — show the quest
    renderRevealed(card, cached.text, theme, dayKey);
  } else {
    // Sealed — show the reveal button
    renderSealed(card, theme, dayKey);
  }

  return card;
}

function renderSealed(card, theme, dayKey) {
  const seal = document.createElement('div');
  seal.className = 'pf-dq-seal';

  const sealIcon = document.createElement('div');
  sealIcon.className = 'pf-dq-seal-icon';
  sealIcon.textContent = '?';

  const sealLabel = document.createElement('div');
  sealLabel.className = 'pf-dq-seal-label';
  sealLabel.textContent = 'Click to reveal today\'s quest';

  const sealHint = document.createElement('div');
  sealHint.className = 'pf-dq-seal-hint';
  sealHint.textContent = `Theme: ${theme.seed}`;

  seal.appendChild(sealIcon);
  seal.appendChild(sealLabel);
  seal.appendChild(sealHint);
  card.appendChild(seal);

  seal.addEventListener('click', async () => {
    // Start break animation
    seal.classList.add('pf-dq-seal-breaking');
    sealIcon.textContent = '✦';
    sealLabel.textContent = 'Generating your quest...';

    // Generate quest via AI
    let questText = theme.prompt; // fallback if AI unavailable
    try {
      if (window.root && typeof window.root.aiTextPlugin === 'function') {
        const result = await window.root.aiTextPlugin({
          instruction: [
            `Today's theme: "${theme.seed}".`,
            'Generate a creative writing quest for a roleplay chat user.',
            'The quest should be a specific, actionable challenge they can do in their next chat.',
            'Write it as a single paragraph, under 60 words.',
            'Make it evocative and inspiring. Start with a verb.',
            'Reply with ONLY the quest text, nothing else.',
            '',
            `Base prompt: ${theme.prompt}`,
          ].join('\n'),
          stopSequences: ['\n\n'],
        });
        if (result && result.text) {
          questText = result.text.trim();
        }
      }
    } catch (e) {
      console.warn('[pf] daily quest generation failed:', e && e.message);
    }

    // Cache the result
    cacheQuest(dayKey, questText, theme.seed);
    try { bumpCounter('questsRevealed'); } catch {}

    // Remove seal, show quest with reveal animation
    setTimeout(() => {
      seal.remove();
      renderRevealed(card, questText, theme, dayKey);
    }, 600); // matches CSS animation duration
  }, { once: true });
}

function renderRevealed(card, questText, theme, dayKey) {
  const body = document.createElement('div');
  body.className = 'pf-dq-body pf-dq-body-reveal';

  const themeLabel = document.createElement('div');
  themeLabel.className = 'pf-dq-theme';
  themeLabel.textContent = `✦ ${theme.seed.toUpperCase()}`;

  const text = document.createElement('div');
  text.className = 'pf-dq-text';
  text.textContent = questText;

  const completeBtn = document.createElement('button');
  completeBtn.type = 'button';
  completeBtn.className = 'pf-dq-complete';

  // Check if already completed today
  const completedKey = `pf:dq-done:${dayKey}`;
  const isDone = localStorage.getItem(completedKey) === '1';

  if (isDone) {
    completeBtn.textContent = '✓ Completed';
    completeBtn.disabled = true;
    completeBtn.classList.add('pf-dq-done');
  } else {
    completeBtn.textContent = 'Mark as complete';
    completeBtn.addEventListener('click', () => {
      localStorage.setItem(completedKey, '1');
      completeBtn.textContent = '✓ Completed';
      completeBtn.disabled = true;
      completeBtn.classList.add('pf-dq-done');
      try { bumpCounter('questsCompleted'); } catch {}
    }, { once: true });
  }

  body.appendChild(themeLabel);
  body.appendChild(text);
  body.appendChild(completeBtn);
  card.appendChild(body);
}

/**
 * Initialize daily quest — injects the card into the prompts section
 * or near the chat input if prompts section isn't visible.
 */
export function initDailyQuest() {
  if (initDailyQuest._done) return;
  initDailyQuest._done = true;

  const card = createDailyQuestCard();

  // Try to insert into the prompts section
  const promptsList = document.querySelector('.pf-prompts-list');
  if (promptsList) {
    promptsList.parentElement.insertBefore(card, promptsList);
    return;
  }

  // Fallback: insert near the chat messages
  const chatEl = document.getElementById('chatMessagesEl');
  if (chatEl && chatEl.parentElement) {
    chatEl.parentElement.insertBefore(card, chatEl);
    return;
  }
}

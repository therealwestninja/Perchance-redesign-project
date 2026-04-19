// prompts/daily_quest.js
//
// AI-generated daily quests with sealed-card "prize" reveal mechanic.
//
// Shows 3 sealed quest cards per day. Each card:
//   1. Displays a sealed "?" with a theme hint
//   2. On click → seal-break animation (1.2s) plays
//   3. During animation → AI generates a unique quest
//   4. After seal breaks → quest text types in character-by-character
//   5. Result cached so re-visits show the same quest
//
// The animation is deliberately long enough to cover the AI response
// time, so the user experiences a smooth "unwrapping" rather than
// a loading spinner.

import { getCurrentDayKey } from './scheduler.js';

// 30 quest themes — 3 are picked per day via date hash.
const THEMES = [
  { seed: 'stranger',    icon: '👤', prompt: 'a scene where your character meets a complete stranger who changes their perspective' },
  { seed: 'secret',      icon: '🤫', prompt: 'your character discovering a secret about someone they trust' },
  { seed: 'storm',       icon: '⛈',  prompt: 'a sudden storm forcing your character to take shelter somewhere unexpected' },
  { seed: 'memory',      icon: '💭', prompt: 'your character finding an object that triggers a powerful memory' },
  { seed: 'rival',       icon: '⚔',  prompt: 'your character encountering a rival — the confrontation doesn\'t have to be hostile' },
  { seed: 'silence',     icon: '🤐', prompt: 'a scene where the most important thing is what ISN\'T said' },
  { seed: 'gift',        icon: '🎁', prompt: 'someone giving your character an unexpected gift' },
  { seed: 'crossroads',  icon: '🔀', prompt: 'your character reaching a literal or metaphorical crossroads' },
  { seed: 'wound',       icon: '🩹', prompt: 'your character tending to a wound — physical or emotional' },
  { seed: 'festival',    icon: '🎭', prompt: 'your character attending a celebration they weren\'t invited to' },
  { seed: 'midnight',    icon: '🌙', prompt: 'something happening at midnight that only your character witnesses' },
  { seed: 'letter',      icon: '✉',  prompt: 'your character writing or receiving a letter that changes everything' },
  { seed: 'threshold',   icon: '🚪', prompt: 'your character standing at a door they\'re afraid to open' },
  { seed: 'mask',        icon: '🎭', prompt: 'your character putting on a mask — literal or figurative' },
  { seed: 'bargain',     icon: '🤝', prompt: 'your character making a deal they might regret' },
  { seed: 'echo',        icon: '🔔', prompt: 'your character hearing something from the past — a voice, a song, a phrase' },
  { seed: 'compass',     icon: '🧭', prompt: 'your character being lost — not geographically, but in a deeper way' },
  { seed: 'forge',       icon: '🔨', prompt: 'your character creating something — an object, a plan, a promise' },
  { seed: 'trespass',    icon: '⚠',  prompt: 'your character entering a place where they don\'t belong' },
  { seed: 'debt',        icon: '📜', prompt: 'someone calling in an old debt — not repayable with money' },
  { seed: 'mirror',      icon: '🪞', prompt: 'your character seeing their reflection and not recognizing who\'s looking back' },
  { seed: 'hunger',      icon: '🔥', prompt: 'your character craving something they can\'t have' },
  { seed: 'bridge',      icon: '🌉', prompt: 'two people who have been apart meeting again' },
  { seed: 'omen',        icon: '✨', prompt: 'your character noticing a sign that something is about to change' },
  { seed: 'trade',       icon: '⚖',  prompt: 'your character giving up one thing to gain another' },
  { seed: 'sanctuary',   icon: '🏠', prompt: 'your character finding a place of absolute safety' },
  { seed: 'shadow',      icon: '👥', prompt: 'your character confronting the version of themselves they try to hide' },
  { seed: 'lantern',     icon: '🏮', prompt: 'your character finding a single light in complete darkness' },
  { seed: 'oath',        icon: '🤞', prompt: 'your character swearing an oath they intend to keep' },
  { seed: 'tide',        icon: '🌊', prompt: 'something returning that your character thought was gone forever' },
];

const QUESTS_PER_DAY = 3;
const CACHE_PREFIX = 'pf:dq:';

/** Deterministic hash. */
function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Pick N themes for today (deterministic, no repeats). */
function getTodayThemes(dayKey, count) {
  // Seeded shuffle of indices
  const indices = Array.from({ length: THEMES.length }, (_, i) => i);
  const seed = hashStr(dayKey);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = (hashStr(`${seed}:${i}`) % (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, count).map(i => THEMES[i]);
}

/** Load cached quest result, or null. */
function loadCached(dayKey, idx) {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${dayKey}:${idx}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

/** Cache quest result. */
function saveCache(dayKey, idx, text, theme) {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${dayKey}:${idx}`,
      JSON.stringify({ text, theme, ts: Date.now() }));
  } catch {}
}

/** Typewriter effect — reveals text character by character. */
function typewrite(el, text, speed = 20) {
  el.textContent = '';
  let i = 0;
  const tick = () => {
    if (i < text.length) {
      el.textContent += text[i++];
      setTimeout(tick, speed);
    }
  };
  tick();
}

/** Generate quest text via AI, with fallback. */
async function generateQuest(theme) {
  try {
    if (window.root && typeof window.root.aiTextPlugin === 'function') {
      const result = await window.root.aiTextPlugin({
        instruction: [
          `Theme: "${theme.seed}" — ${theme.prompt}.`,
          '',
          'Write a single creative writing quest for a roleplay chat user.',
          'It should be a specific, actionable challenge they can do in their next conversation.',
          'Be evocative and specific. Start with an action verb. Under 50 words.',
          'Reply with ONLY the quest text.',
        ].join('\n'),
        stopSequences: ['\n\n'],
      });
      const text = result && (result.text || (typeof result === 'string' ? result : ''));
      if (text && text.trim().length > 10) return text.trim();
    }
  } catch (e) {
    console.warn('[pf] quest AI generation failed:', e && e.message);
  }

  // AI unavailable — generate a themed fallback locally
  const verbs = ['Write', 'Describe', 'Create', 'Explore', 'Imagine', 'Craft', 'Develop', 'Show us'];
  const verb = verbs[hashStr(theme.seed) % verbs.length];
  return `${verb} ${theme.prompt}. Make it personal to your character — what would they feel, do, or say?`;
}

/**
 * Build a single sealed quest card.
 */
function createQuestCard(theme, dayKey, idx) {
  const cached = loadCached(dayKey, idx);

  const card = document.createElement('div');
  card.className = 'pf-dq-card';

  // Header
  const header = document.createElement('div');
  header.className = 'pf-dq-header';

  const headerIcon = document.createElement('span');
  headerIcon.className = 'pf-dq-icon';
  headerIcon.textContent = theme.icon;

  const headerTitle = document.createElement('span');
  headerTitle.className = 'pf-dq-title';
  headerTitle.textContent = `QUEST ${idx + 1}`;

  const headerDate = document.createElement('span');
  headerDate.className = 'pf-dq-date';
  headerDate.textContent = dayKey;

  header.appendChild(headerIcon);
  header.appendChild(headerTitle);
  header.appendChild(headerDate);
  card.appendChild(header);

  if (cached && cached.text) {
    renderRevealed(card, cached.text, theme, dayKey, idx, false);
  } else {
    renderSealed(card, theme, dayKey, idx);
  }

  return card;
}

/** Render the sealed "?" state. */
function renderSealed(card, theme, dayKey, idx) {
  const seal = document.createElement('div');
  seal.className = 'pf-dq-seal';

  const sealIcon = document.createElement('div');
  sealIcon.className = 'pf-dq-seal-icon';
  sealIcon.textContent = '?';

  const sealLabel = document.createElement('div');
  sealLabel.className = 'pf-dq-seal-label';
  sealLabel.textContent = 'Click to reveal';

  const sealHint = document.createElement('div');
  sealHint.className = 'pf-dq-seal-hint';
  sealHint.textContent = theme.seed;

  seal.appendChild(sealIcon);
  seal.appendChild(sealLabel);
  seal.appendChild(sealHint);
  card.appendChild(seal);

  let clicked = false;
  seal.addEventListener('click', async () => {
    if (clicked) return;
    clicked = true;

    // Phase 1: seal-break animation (1.2s)
    seal.classList.add('pf-dq-seal-breaking');
    sealIcon.textContent = theme.icon;
    sealLabel.textContent = '...';
    sealHint.textContent = '';

    // Phase 2: AI generates quest during animation
    const questText = await generateQuest(theme);

    // Cache result
    saveCache(dayKey, idx, questText, theme.seed);
    try { bumpCounter('questsRevealed'); } catch {}

    // Phase 3: remove seal after animation, typewrite the quest
    setTimeout(() => {
      seal.remove();
      renderRevealed(card, questText, theme, dayKey, idx, true);
    }, 1200);
  });
}

/** Render the revealed quest. */
function renderRevealed(card, questText, theme, dayKey, idx, animate) {
  const body = document.createElement('div');
  body.className = 'pf-dq-body' + (animate ? ' pf-dq-body-reveal' : '');

  const themeLabel = document.createElement('div');
  themeLabel.className = 'pf-dq-theme';
  themeLabel.textContent = `${theme.icon} ${theme.seed.toUpperCase()}`;

  const text = document.createElement('div');
  text.className = 'pf-dq-text';

  const completeBtn = document.createElement('button');
  completeBtn.type = 'button';
  completeBtn.className = 'pf-dq-complete';

  const completedKey = `pf:dq-done:${dayKey}:${idx}`;
  const isDone = localStorage.getItem(completedKey) === '1';

  if (isDone) {
    completeBtn.textContent = '✓ Done';
    completeBtn.disabled = true;
    completeBtn.classList.add('pf-dq-done');
  } else {
    completeBtn.textContent = 'Complete';
    completeBtn.addEventListener('click', () => {
      localStorage.setItem(completedKey, '1');
      completeBtn.textContent = '✓ Done';
      completeBtn.disabled = true;
      completeBtn.classList.add('pf-dq-done');
      try { bumpCounter('questsCompleted'); } catch {}
    }, { once: true });
  }

  body.appendChild(themeLabel);
  body.appendChild(text);
  body.appendChild(completeBtn);
  card.appendChild(body);

  // Typewrite effect on reveal, instant on cached
  if (animate) {
    typewrite(text, questText, 18);
  } else {
    text.textContent = questText;
  }
}

/**
 * Initialize daily quests. Creates 3 sealed quest cards and
 * injects them into the prompts section or near chat messages.
 */
export function initDailyQuest() {
  if (initDailyQuest._done) return;
  initDailyQuest._done = true;

  const dayKey = getCurrentDayKey();
  const themes = getTodayThemes(dayKey, QUESTS_PER_DAY);

  // Container for all quest cards
  const container = document.createElement('div');
  container.className = 'pf-dq-container';

  // Section header
  const sectionHeader = document.createElement('div');
  sectionHeader.className = 'pf-dq-section-header';
  sectionHeader.textContent = 'DAILY QUESTS';
  container.appendChild(sectionHeader);

  // Create quest cards
  for (let i = 0; i < themes.length; i++) {
    container.appendChild(createQuestCard(themes[i], dayKey, i));
  }

  // Insert into the page
  const promptsList = document.querySelector('.pf-prompts-list');
  if (promptsList && promptsList.parentElement) {
    promptsList.parentElement.insertBefore(container, promptsList);
    return;
  }

  const chatEl = document.getElementById('chatMessagesEl');
  if (chatEl && chatEl.parentElement) {
    chatEl.parentElement.insertBefore(container, chatEl);
    return;
  }

  // Last resort: append to body
  document.body.appendChild(container);
}

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
import { loadSettings, updateField } from '../profile/settings_store.js';

// 30 built-in quest themes — 3 are picked per day via date hash.
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

/**
 * Return the active theme pool — user's custom themes if they've
 * edited them, otherwise the built-in THEMES.
 */
function getEffectiveThemes() {
  try {
    const s = loadSettings();
    const custom = s && s.prompts && s.prompts.customQuestThemes;
    if (Array.isArray(custom) && custom.length >= QUESTS_PER_DAY) {
      return custom;
    }
  } catch { /* fall back */ }
  return THEMES;
}

/** Pick N themes for today (deterministic, no repeats). */
function getTodayThemes(dayKey, count) {
  const pool = getEffectiveThemes();
  // Seeded shuffle of indices
  const indices = Array.from({ length: pool.length }, (_, i) => i);
  const seed = hashStr(dayKey);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = (hashStr(`${seed}:${i}`) % (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, count).map(i => pool[i]);
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
  // Only mount when the profile's prompts section exists. At boot
  // time this element doesn't exist (profile isn't open), so the
  // call is a no-op. The profile overlay calls initDailyQuest()
  // after building the prompts section, at which point
  // .pf-prompts-list exists and mounting succeeds.
  const promptsList = document.querySelector('.pf-prompts-list');
  if (!promptsList || !promptsList.parentElement) return;

  // Skip if already mounted in THIS overlay instance (prevents
  // double-mount if called twice during the same profile session).
  if (promptsList.parentElement.querySelector('.pf-dq-container')) return;

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

  promptsList.parentElement.insertBefore(container, promptsList);
}

// ================================================================
// Edit Prompts modal — lets users customize the daily quest themes
// ================================================================
//
// Format: one theme per line, as "icon seed = prompt description".
// Uses the same glossary-modal CSS for visual consistency.

/**
 * Serialize the effective theme pool to editable text.
 * Format: "🔥 hunger = your character craving something they can't have"
 */
function themesToText(themes) {
  return themes.map(t => `${t.icon} ${t.seed} = ${t.prompt}`).join('\n');
}

/**
 * Parse editable text back into theme objects.
 * Skips blank lines and lines without "=". Tolerates missing icons.
 */
function textToThemes(text) {
  const themes = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || !line.includes('=')) continue;

    const eqIdx = line.indexOf('=');
    const left = line.slice(0, eqIdx).trim();
    const prompt = line.slice(eqIdx + 1).trim();
    if (!prompt) continue;

    // Left side: optional emoji + seed word
    // Try to split "🔥 hunger" → icon + seed
    const parts = left.split(/\s+/);
    let icon = '✦';
    let seed = '';
    if (parts.length >= 2) {
      // First token might be emoji or text
      const first = parts[0];
      // Simple emoji detection: single char or surrogate pair
      if (first.length <= 2 || /^\p{Emoji}/u.test(first)) {
        icon = first;
        seed = parts.slice(1).join(' ');
      } else {
        seed = left;
      }
    } else {
      seed = left;
    }

    if (!seed) seed = prompt.slice(0, 20).replace(/\s+/g, '-').toLowerCase();

    themes.push({ seed, icon, prompt });
  }
  return themes;
}

/**
 * Open the Edit Prompts modal. Shows current themes as editable text,
 * with Save / Reset / Cancel actions.
 */
export function openEditPrompts() {
  // ---- Overlay + modal shell (reuses glossary-modal styles) ----
  const overlay = document.createElement('div');
  overlay.className = 'pf-glossary-overlay';
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const modal = document.createElement('div');
  modal.className = 'pf-glossary-modal';

  const title = document.createElement('h3');
  title.className = 'pf-glossary-title';
  title.textContent = 'Edit Quest Themes';

  const hint = document.createElement('div');
  hint.className = 'pf-glossary-hint';
  hint.textContent = 'One theme per line:  icon seed = prompt description';

  const textarea = document.createElement('textarea');
  textarea.className = 'pf-glossary-textarea';
  textarea.rows = 16;
  textarea.spellcheck = false;

  // Load current themes
  const current = getEffectiveThemes();
  textarea.value = themesToText(current);

  // ---- Status line ----
  const status = document.createElement('div');
  status.className = 'pf-dq-edit-status';

  function updateStatus() {
    const parsed = textToThemes(textarea.value);
    const n = parsed.length;
    if (n < QUESTS_PER_DAY) {
      status.textContent = `${n} theme${n !== 1 ? 's' : ''} — need at least ${QUESTS_PER_DAY}`;
      status.style.color = 'var(--pf-palette-danger, #e06060)';
    } else {
      status.textContent = `${n} theme${n !== 1 ? 's' : ''}`;
      status.style.color = 'var(--pf-silver, #8b95a3)';
    }
  }
  textarea.addEventListener('input', updateStatus);
  updateStatus();

  // ---- Button row ----
  const btnRow = document.createElement('div');
  btnRow.className = 'pf-dq-edit-buttons';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'pf-dq-edit-btn pf-dq-edit-btn-primary';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () => {
    const parsed = textToThemes(textarea.value);
    if (parsed.length < QUESTS_PER_DAY) {
      status.textContent = `Need at least ${QUESTS_PER_DAY} themes to save.`;
      status.style.color = 'var(--pf-palette-danger, #e06060)';
      return;
    }
    updateField('prompts.customQuestThemes', parsed);
    try { bumpCounter('questThemeEdits'); } catch {}
    close();
  });

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'pf-dq-edit-btn';
  resetBtn.textContent = 'Reset to defaults';
  resetBtn.addEventListener('click', () => {
    textarea.value = themesToText(THEMES);
    updateField('prompts.customQuestThemes', null);
    updateStatus();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'pf-dq-edit-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', close);

  btnRow.appendChild(saveBtn);
  btnRow.appendChild(resetBtn);
  btnRow.appendChild(cancelBtn);

  modal.appendChild(title);
  modal.appendChild(hint);
  modal.appendChild(textarea);
  modal.appendChild(status);
  modal.appendChild(btnRow);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.hidden = false;
  textarea.focus();

  function close() {
    overlay.remove();
  }
}

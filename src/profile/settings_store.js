// profile/settings_store.js
//
// localStorage-backed store for the user's profile inputs and the
// collapse/blur display state of each section on the hero page.
//
// Single key: 'pf:settings'. Old schema ('pf:profile' = { displayName, avatarUrl })
// migrated automatically on first load.

const KEY = 'pf:settings';
const OLD_KEY = 'pf:profile';

const SECTION_IDS = ['about', 'details', 'prompts', 'archive', 'chronicle', 'style', 'achievements', 'backup'];

/**
 * Default shape. Every read path falls back through this, so any missing
 * field in stored data (after an app update that added new fields) just
 * uses the default.
 */
export function defaultSettings() {
  return {
    profile: {
      displayName: '',
      avatarUrl: null,
      titleOverride: '',
      bio: '',
      username: '',
      ageRange: '',                       // '' | 'under-18' | '18-24' | '25-34' | '35-44' | '45-54' | '55+' | 'prefer-not-say'
      genderPos: { x01: 0.5, y01: 0.5 },  // normalized position on the 2D square, (0..1, 0..1)
      genderCustom: '',
    },
    display: {
      sections: {
        about:        { collapsed: false, blurred: false },
        details:      { collapsed: false, blurred: true   }, // private by default
        prompts:      { collapsed: false, blurred: false },
        archive:      { collapsed: true,  blurred: false }, // review tool — collapsed by default
        chronicle:    { collapsed: false, blurred: false },
        style:        { collapsed: false, blurred: false },
        achievements: { collapsed: false, blurred: false },
        backup:       { collapsed: true,  blurred: false }, // utility — collapsed by default
      },
    },
    notifications: {
      // Achievements the user has been shown (opened the profile at least
      // once while they were unlocked). Anything unlocked but not listed
      // here counts as "pending" and triggers the mini-card pulse.
      seenAchievements: [],
      // Prevents new deployments from pulsing for every pre-existing
      // achievement. See notifications.js#initSeenOnFirstRun.
      hasInitialized: false,
      // Event IDs the user has been shown during their current active
      // window. Auto-GC'd to the currently-active set on each acknowledgment
      // so next year's window re-announces.
      seenEventIds: [],
    },
    prompts: {
      // Per-week record of which prompts the user marked done.
      //   { '2026-W16': ['p-quiet-moment', 'p-apology'], ... }
      completedByWeek: {},
      // Lifetime sums preserved when GC prunes old completedByWeek
      // entries. Added to the current-entries sum when computing stats
      // so achievements don't regress across the retention boundary.
      historicalTotals: { total: 0, weeksActive: 0 },
      // Last week the user opened the profile. Drives the "new week"
      // pulse on the mini-card.
      lastSeenWeek: null,
      // Prevents the first-ever load of the prompts feature from pulsing.
      hasInitialized: false,
      // Cadence: 'weekly' shows 4 prompts at a time that rotate each
      // Monday. 'daily' shows 1 prompt per day. Switching is free and
      // doesn't affect completion history — completions are always
      // bucketed by containing-week under the hood.
      cadence: 'weekly',
    },
    memory: {
      // Per-thread pin map: { [threadId]: { [entryId]: { label, createdAt, policy } } }
      // Pinned memories are exempt from prune. See src/memory/pins.js for
      // the API. Pins round-trip through backup/import automatically.
      pinsByThread: {},
    },
  };
}

/**
 * Deep-merge `src` onto a fresh copy of `dst`. Objects merge recursively;
 * arrays and primitives replace. Used to layer stored partial data onto
 * current defaults so new fields get default values.
 */
function mergeDeep(dst, src) {
  if (src == null || typeof src !== 'object') return dst;
  const out = Array.isArray(dst) ? dst.slice() : { ...dst };
  for (const k of Object.keys(src)) {
    const a = out[k];
    const b = src[k];
    if (a && typeof a === 'object' && !Array.isArray(a) &&
        b && typeof b === 'object' && !Array.isArray(b)) {
      out[k] = mergeDeep(a, b);
    } else if (b !== undefined) {
      out[k] = b;
    }
  }
  return out;
}

/**
 * Read settings. Never throws. Migrates the old schema if present.
 */
export function loadSettings() {
  const base = defaultSettings();

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return mergeDeep(base, parsed);
    }
  } catch { /* fall through */ }

  // Migrate from the old key if still around
  try {
    const oldRaw = localStorage.getItem(OLD_KEY);
    if (oldRaw) {
      const oldParsed = JSON.parse(oldRaw);
      if (oldParsed && typeof oldParsed === 'object') {
        const migrated = mergeDeep(base, { profile: oldParsed });
        try { localStorage.setItem(KEY, JSON.stringify(migrated)); } catch {}
        try { localStorage.removeItem(OLD_KEY); } catch {}
        return migrated;
      }
    }
  } catch { /* fall through */ }

  return base;
}

/**
 * Write settings. Never throws. Notifies listeners so live UI (mini-card,
 * splash) can refresh without waiting for the 30s refresh tick.
 */
export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage full or disabled — we can't do anything useful; silently drop.
  }
  notifyListeners();
}

// ---- change-notification ----

const listeners = new Set();

/**
 * Subscribe to settings changes. Returns a function to unsubscribe.
 * The callback receives no arguments — call loadSettings() to read fresh data.
 *
 * @param {() => void} fn
 * @returns {() => void}
 */
export function onSettingsChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function notifyListeners() {
  for (const fn of listeners) {
    try { fn(); } catch { /* keep other listeners alive */ }
  }
}

/**
 * Convenience: update a single field by dotted path and persist.
 * Returns the merged settings object.
 *   updateField('profile.bio', 'new bio text')
 *   updateField('display.sections.details.blurred', false)
 */
export function updateField(pathStr, value) {
  const settings = loadSettings();
  const parts = pathStr.split('.');
  let cursor = settings;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cursor[parts[i]] !== 'object' || cursor[parts[i]] === null) {
      cursor[parts[i]] = {};
    }
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
  saveSettings(settings);
  return settings;
}

export const AGE_RANGE_OPTIONS = Object.freeze([
  { value: '',               label: '— select —' },
  { value: 'under-18',       label: 'under 18' },
  { value: '18-24',          label: '18–24' },
  { value: '25-34',          label: '25–34' },
  { value: '35-44',          label: '35–44' },
  { value: '45-54',          label: '45–54' },
  { value: '55+',            label: '55+' },
  { value: 'prefer-not-say', label: 'prefer not to say' },
]);

export { SECTION_IDS };

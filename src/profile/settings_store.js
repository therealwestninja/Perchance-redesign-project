// profile/settings_store.js
//
// localStorage-backed store for the user's profile inputs and the
// collapse/blur display state of each section on the hero page.
//
// Single key: 'pf:settings'. Old schema ('pf:profile' = { displayName, avatarUrl })
// migrated automatically on first load.

const KEY = 'pf:settings';
const OLD_KEY = 'pf:profile';

const SECTION_IDS = ['about', 'details', 'chronicle', 'achievements'];

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
        chronicle:    { collapsed: false, blurred: false },
        achievements: { collapsed: false, blurred: false },
      },
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
 * Write settings. Never throws.
 */
export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage full or disabled — we can't do anything useful; silently drop.
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

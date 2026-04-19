// achievements/categories.js
//
// Groups achievements into navigable categories so the grid doesn't
// dump all 58 cards at once. Organization takes cues from RPG-style
// achievement UIs (Diablo III's career tabs, MagicaVoxel's left
// rail) — a summary view by default, then click a category to see
// its achievements.
//
// Category assignment lives here so we can test it independently of
// the rendering. Tier families stay together inside their category
// (Curator — Bronze/Silver/Gold appear as three sequential cards
// under Curation, so the progression is visible at a glance).
//
// When a new achievement is added to registry.js, update matches()
// below to sort it into the right bucket. Achievements that don't
// match any explicit rule fall into 'other' — useful during
// development; the rendered grid surfaces that bucket only when
// non-empty so it's visible as a bug rather than silently hidden.

export const CATEGORIES = Object.freeze([
  {
    id: 'writing',
    label: 'Writing',
    icon: '✎',
    description: 'Word counts and prose volume.',
  },
  {
    id: 'stories',
    label: 'Stories',
    icon: '❧',
    description: 'Characters, threads, and worldbuilding.',
  },
  {
    id: 'prompts',
    label: 'Prompts',
    icon: '❝',
    description: 'Prompt completions and exploration.',
  },
  {
    id: 'consistency',
    label: 'Consistency',
    icon: '🔥',
    description: 'Active periods and streaks.',
  },
  {
    id: 'curation',
    label: 'Curation',
    icon: '⚙',
    description: 'Memory tool use: organizing, renaming, reordering.',
  },
  {
    id: 'preservation',
    label: 'Preservation',
    icon: '💾',
    description: 'Snapshots, backups, and restoration.',
  },
  {
    id: 'creation',
    label: 'Creation',
    icon: '✨',
    description: 'Characters spun off from memory.',
  },
  {
    id: 'events',
    label: 'Events',
    icon: '🎉',
    description: 'Holiday and event participation.',
  },
]);

// Rules for sorting each achievement into exactly one category. Order
// within each bucket is preserved from registry.js order (common →
// epic → legendary tends to be the natural reading order there).
//
// Each rule is a predicate over the achievement id prefix or full id.
// Evaluated in order; first match wins.
const RULES = [
  { cat: 'writing',      match: id => (
    ['first_word', 'hundred_words', 'thousand_words', 'ten_thousand_words', 'fifty_thousand_words'].includes(id)
  )},
  { cat: 'stories',      match: id => (
    ['first_character', 'long_conversation', 'epic_arc',
     'cast_of_five', 'cast_of_twenty', 'cartographer', 'worldbuilder'].includes(id)
  )},
  { cat: 'prompts',      match: id => (
    id.startsWith('first_prompt') || id.startsWith('prompt_') || id === 'weekly_regular'
  )},
  { cat: 'consistency',  match: id => (
    id.startsWith('active_') || id === 'dedicated' || id.startsWith('streak_')
  )},
  { cat: 'preservation', match: id => (
    id.startsWith('preservationist_') || id.startsWith('restorer_') || id.startsWith('archivist_')
  )},
  { cat: 'curation',     match: id => (
    id.startsWith('curator_') || id.startsWith('namer_') ||
    id.startsWith('organizer_') || id.startsWith('shuffler_') ||
    id.startsWith('sorter_') || id.startsWith('regular_')
  )},
  { cat: 'creation',     match: id => id.startsWith('demiurge_') },
  { cat: 'events',       match: id => id.startsWith('celebrant_') },
];

/**
 * Return the category id for the given achievement id. Falls back
 * to 'other' if no rule matches (surfaces mis-categorization in
 * the UI rather than silently hiding the achievement).
 *
 * @param {string} achievementId
 * @returns {string} category id
 */
export function getCategoryFor(achievementId) {
  if (typeof achievementId !== 'string') return 'other';
  for (const rule of RULES) {
    if (rule.match(achievementId)) return rule.cat;
  }
  return 'other';
}

/**
 * Bucket a list of achievement objects by category id. Returns an
 * object with category ids as keys and arrays of achievements as
 * values. Categories with zero matches are included as empty arrays
 * so renderers can show "0 / N unlocked — none yet" for uncompleted
 * areas.
 *
 * @param {Array<object>} achievements
 * @returns {Object<string, Array<object>>}
 */
export function groupByCategory(achievements) {
  const out = {};
  for (const cat of CATEGORIES) out[cat.id] = [];
  out.other = [];
  for (const a of achievements || []) {
    if (!a || typeof a.id !== 'string') continue;
    const cat = getCategoryFor(a.id);
    if (!out[cat]) out[cat] = [];
    out[cat].push(a);
  }
  return out;
}

/**
 * For each category, compute (unlocked, total). Useful for the
 * Summary view's progress bars.
 *
 * @param {Array<object>} achievements   full ACHIEVEMENTS registry
 * @param {Set<string>} unlockedSet       unlocked id set
 * @returns {Array<{ category: object, unlocked: number, total: number }>}
 */
export function computeCategoryProgress(achievements, unlockedSet) {
  const byCat = groupByCategory(achievements);
  const rows = [];
  for (const cat of CATEGORIES) {
    const list = byCat[cat.id] || [];
    const unlockedN = list.reduce((n, a) => (unlockedSet.has(a.id) ? n + 1 : n), 0);
    rows.push({ category: cat, unlocked: unlockedN, total: list.length });
  }
  // "other" only if non-empty, and only tacked on so devs see it
  if ((byCat.other || []).length > 0) {
    const list = byCat.other;
    const unlockedN = list.reduce((n, a) => (unlockedSet.has(a.id) ? n + 1 : n), 0);
    rows.push({
      category: { id: 'other', label: 'Other', icon: '?' },
      unlocked: unlockedN,
      total: list.length,
    });
  }
  return rows;
}

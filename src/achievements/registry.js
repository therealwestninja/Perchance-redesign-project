// achievements/registry.js
//
// Declarative list of achievements.
//
// Each entry has:
//   - id:          stable identifier (DO NOT rename after release — used as storage key)
//   - name:        user-facing name
//   - description: what the user did to earn it
//   - tier:        'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
//   - criteria:    pure (stats) => boolean. If true, achievement is unlocked.
//
// Rules for editing this file:
//   - Add new achievements at the END of the list.
//   - Renaming an id breaks users' unlock state. Don't do it.
//   - Removing an achievement is fine — users with it unlocked will just no longer see it.
//   - Keep criteria pure and cheap. They run on every stats recompute.

export const ACHIEVEMENTS = Object.freeze([
  // --- First-time milestones ---
  {
    id: 'first_word',
    name: 'First Word',
    description: 'Send your first message to a character.',
    tier: 'common',
    criteria: (s) => (s.userMessageCount || 0) >= 1,
  },
  {
    id: 'first_character',
    name: 'First Character',
    description: 'Create your first character.',
    tier: 'common',
    criteria: (s) => (s.characterCount || 0) >= 1,
  },

  // --- Writing volume ---
  {
    id: 'hundred_words',
    name: 'Wordsmith',
    description: 'Write 100 words across your chats.',
    tier: 'common',
    criteria: (s) => (s.wordsWritten || 0) >= 100,
  },
  {
    id: 'thousand_words',
    name: 'Scribe',
    description: 'Write 1,000 words.',
    tier: 'uncommon',
    criteria: (s) => (s.wordsWritten || 0) >= 1_000,
  },
  {
    id: 'ten_thousand_words',
    name: 'Chronicler',
    description: 'Write 10,000 words.',
    tier: 'rare',
    criteria: (s) => (s.wordsWritten || 0) >= 10_000,
  },
  {
    id: 'fifty_thousand_words',
    name: 'Master of the Quill',
    description: 'Write 50,000 words — the length of a short novel.',
    tier: 'epic',
    criteria: (s) => (s.wordsWritten || 0) >= 50_000,
  },

  // --- Thread depth ---
  {
    id: 'long_conversation',
    name: 'The Long March',
    description: 'Carry a single thread past 100 messages.',
    tier: 'uncommon',
    criteria: (s) => (s.longestThread || 0) >= 100,
  },
  {
    id: 'epic_arc',
    name: 'Epic Arc',
    description: 'Carry a single thread past 500 messages.',
    tier: 'rare',
    criteria: (s) => (s.longestThread || 0) >= 500,
  },

  // --- Cast breadth ---
  {
    id: 'cast_of_five',
    name: 'Ensemble Cast',
    description: 'Create 5 characters.',
    tier: 'uncommon',
    criteria: (s) => (s.characterCount || 0) >= 5,
  },
  {
    id: 'cast_of_twenty',
    name: 'Troupe Leader',
    description: 'Create 20 characters.',
    tier: 'rare',
    criteria: (s) => (s.characterCount || 0) >= 20,
  },

  // --- Worldbuilding ---
  {
    id: 'cartographer',
    name: 'Cartographer',
    description: 'Build a world with 10 or more lore entries.',
    tier: 'uncommon',
    criteria: (s) => (s.loreCount || 0) >= 10,
  },
  {
    id: 'worldbuilder',
    name: 'Worldbuilder',
    description: 'Build a world with 50 or more lore entries.',
    tier: 'rare',
    criteria: (s) => (s.loreCount || 0) >= 50,
  },

  // --- Sustained engagement (days with activity, NOT sessions/time-on-site) ---
  {
    id: 'active_week',
    name: 'A Good Week',
    description: 'Write in your chats on 7 different days.',
    tier: 'common',
    criteria: (s) => (s.daysActive || 0) >= 7,
  },
  {
    id: 'active_month',
    name: 'A Good Month',
    description: 'Write in your chats on 30 different days.',
    tier: 'uncommon',
    criteria: (s) => (s.daysActive || 0) >= 30,
  },
  {
    id: 'dedicated',
    name: 'Dedicated',
    description: 'Write in your chats on 100 different days.',
    tier: 'rare',
    criteria: (s) => (s.daysActive || 0) >= 100,
  },

  // --- Prompt engagement (weekly writing prompts — self-reported) ---
  {
    id: 'first_prompt',
    name: 'First Prompt',
    description: 'Completed your first writing prompt.',
    tier: 'common',
    criteria: (s) => (s.promptsCompletedTotal || 0) >= 1,
  },
  {
    id: 'prompt_curious',
    name: 'Prompt Curious',
    description: 'Tried 5 writing prompts.',
    tier: 'common',
    criteria: (s) => (s.promptsCompletedTotal || 0) >= 5,
  },
  {
    id: 'prompt_seasoned',
    name: 'Prompt Seasoned',
    description: 'Tried 25 writing prompts.',
    tier: 'uncommon',
    criteria: (s) => (s.promptsCompletedTotal || 0) >= 25,
  },
  {
    id: 'prompt_explorer',
    name: 'Prompt Explorer',
    description: 'Tried 50 writing prompts.',
    tier: 'rare',
    criteria: (s) => (s.promptsCompletedTotal || 0) >= 50,
  },
  {
    // Non-consecutive, deliberately. We do NOT reward streaks — showing up
    // over time on your own schedule is what matters, not a chain that can
    // guilt-trip you when broken.
    id: 'weekly_regular',
    name: 'Weekly Regular',
    description: 'Tried a prompt in 10 different weeks (no streak required).',
    tier: 'uncommon',
    criteria: (s) => (s.promptsWeeksActive || 0) >= 10,
  },

  // --- Counter-backed tiered achievements (bubble tool + profile usage) ---
  //
  // Each logical achievement becomes three achievement rows: bronze,
  // silver, gold. Thresholds defined in the tieredCounter helper below.
  // User sees each tier as a separate unlock, but the narrative is
  // "you unlocked the silver badge for renames" etc.
  //
  // These achievements read `stats.counters.*` which is injected by the
  // call site (full_page.js / index.js) before passing stats to
  // computeUnlockedIds. See the counters module (stats/counters.js).
  ...tieredCounter({
    baseId: 'curator',
    baseName: 'Curator',
    what: 'memory saves',
    counterKey: 'memorySaves',
    thresholds: { bronze: 3, silver: 15, gold: 50 },
  }),
  ...tieredCounter({
    baseId: 'namer',
    baseName: 'Namer',
    what: 'bubble renames',
    counterKey: 'bubblesRenamed',
    thresholds: { bronze: 1, silver: 10, gold: 50 },
  }),
  ...tieredCounter({
    baseId: 'organizer',
    baseName: 'Organizer',
    what: 'bubble reorders',
    counterKey: 'bubblesReordered',
    thresholds: { bronze: 1, silver: 10, gold: 50 },
  }),
  ...tieredCounter({
    baseId: 'shuffler',
    baseName: 'Shuffler',
    what: 'card reorders',
    counterKey: 'cardsReorderedInBubble',
    thresholds: { bronze: 5, silver: 25, gold: 100 },
  }),
  ...tieredCounter({
    baseId: 'sorter',
    baseName: 'Sorter',
    what: 'cross-bubble moves',
    counterKey: 'cardsReorderedCrossBubble',
    thresholds: { bronze: 3, silver: 15, gold: 50 },
  }),
  ...tieredCounter({
    baseId: 'preservationist',
    baseName: 'Preservationist',
    what: 'bubble locks',
    counterKey: 'bubblesLocked',
    thresholds: { bronze: 1, silver: 5, gold: 20 },
  }),
  ...tieredCounter({
    baseId: 'restorer',
    baseName: 'Restorer',
    what: 'snapshot restores',
    counterKey: 'snapshotsRestored',
    thresholds: { bronze: 1, silver: 3, gold: 10 },
  }),
  ...tieredCounter({
    baseId: 'archivist',
    baseName: 'Archivist',
    what: 'backup exports',
    counterKey: 'backupsExported',
    thresholds: { bronze: 1, silver: 5, gold: 20 },
  }),
  ...tieredCounter({
    baseId: 'regular',
    baseName: 'Regular',
    what: 'memory tool opens',
    counterKey: 'memoryWindowOpens',
    thresholds: { bronze: 5, silver: 25, gold: 100 },
  }),
  ...tieredCounter({
    baseId: 'demiurge',
    baseName: 'Demiurge',
    what: 'characters spun off from bubbles',
    counterKey: 'charactersSpawned',
    thresholds: { bronze: 1, silver: 5, gold: 20 },
  }),

  // --- Streak-based achievements ---
  //
  // These unlock based on consecutive-day activity tracked by
  // stats/streaks.js. Reaching a given streak length unlocks
  // permanently — breaking the streak afterwards doesn't lock it
  // again. Criteria read stats.streaks.current and stats.streaks.longest;
  // we gate on `max(current, longest)` so users who had a long
  // streak but broke it still keep the achievement.
  {
    id: 'streak_3day',
    name: 'Three-Day Groove',
    description: 'Active 3 days in a row.',
    tier: 'common',
    criteria: (s) => maxStreak(s) >= 3,
  },
  {
    id: 'streak_7day',
    name: 'Weekly Rhythm',
    description: 'Active 7 days in a row.',
    tier: 'uncommon',
    criteria: (s) => maxStreak(s) >= 7,
  },
  {
    id: 'streak_14day',
    name: 'Fortnight',
    description: 'Active 14 days in a row.',
    tier: 'rare',
    criteria: (s) => maxStreak(s) >= 14,
  },
  {
    id: 'streak_30day',
    name: 'Month Maker',
    description: 'Active 30 days in a row.',
    tier: 'epic',
    criteria: (s) => maxStreak(s) >= 30,
  },
  {
    id: 'streak_100day',
    name: 'Centurion',
    description: 'Active 100 days in a row.',
    tier: 'legendary',
    criteria: (s) => maxStreak(s) >= 100,
  },
]);

/**
 * Read the best (current or longest) streak length from a stats bundle.
 * Used by streak-based achievement criteria. Users who set a PR and
 * then broke the streak keep their achievement — longest is a career
 * record, current is reachable again tomorrow.
 */
function maxStreak(s) {
  if (!s || !s.streaks) return 0;
  const cur = Number(s.streaks.current) || 0;
  const longest = Number(s.streaks.longest) || 0;
  return Math.max(cur, longest);
}

/**
 * Generate a bronze/silver/gold triple of achievements gated on a
 * single counter value. Each tier maps to the progression levels
 * users expect (common → rare → epic).
 *
 * Criteria read `stats.counters[counterKey]`, so the caller must
 * augment `stats` with a `counters` field before calling
 * computeUnlockedIds. See profile/full_page.js for the call-site
 * pattern.
 *
 * @param {{
 *   baseId: string,
 *   baseName: string,
 *   what: string,          // e.g. 'bubble renames' — used in description
 *   counterKey: string,
 *   thresholds: { bronze: number, silver: number, gold: number },
 * }} opts
 */
function tieredCounter({ baseId, baseName, what, counterKey, thresholds }) {
  const read = (s) => Number((s && s.counters && s.counters[counterKey]) || 0);
  return [
    {
      id: `${baseId}_bronze`,
      name: `${baseName} — Bronze`,
      description: `Reach ${thresholds.bronze} ${what}.`,
      tier: 'common',
      criteria: (s) => read(s) >= thresholds.bronze,
    },
    {
      id: `${baseId}_silver`,
      name: `${baseName} — Silver`,
      description: `Reach ${thresholds.silver} ${what}.`,
      tier: 'rare',
      criteria: (s) => read(s) >= thresholds.silver,
    },
    {
      id: `${baseId}_gold`,
      name: `${baseName} — Gold`,
      description: `Reach ${thresholds.gold} ${what}.`,
      tier: 'epic',
      criteria: (s) => read(s) >= thresholds.gold,
    },
  ];
}

/**
 * Convenience lookup by id. Returns null if not found.
 */
export function getAchievementById(id) {
  return ACHIEVEMENTS.find(a => a.id === id) || null;
}

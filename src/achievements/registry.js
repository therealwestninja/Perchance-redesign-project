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
]);

/**
 * Convenience lookup by id. Returns null if not found.
 */
export function getAchievementById(id) {
  return ACHIEVEMENTS.find(a => a.id === id) || null;
}

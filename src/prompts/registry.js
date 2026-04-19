// prompts/registry.js
//
// The pool of story prompts the weekly scheduler draws from. These are
// genre-agnostic creative-writing invitations, not task-completion gates.
//
// IDs use slugs (not array indices) so we can reorder or add new ones
// without invalidating existing users' completion history. Once an ID
// is shipped, it should never change or be removed (or old completion
// records orphan). Deprecations: comment out the entry but leave the ID
// reservation in a comment.
//
// Each prompt carries a `category` — one of five buckets (character,
// dialogue, atmosphere, craft, connection). Categories unlock variety
// achievements ("Well-Rounded" tier family) and can surface a user's
// favorite prompt type. Once assigned, a prompt's category should not
// change (breaks per-category completion stats for existing users).

/**
 * Prompt categories, in render order. Each has:
 *   - id: stable slug used in stats/achievement criteria
 *   - label: user-facing short name
 *   - description: short explainer shown in UI contexts where space allows
 */
export const PROMPT_CATEGORIES = Object.freeze([
  {
    id: 'character',
    label: 'Character',
    description: 'Inner life, contradictions, change of heart, self-discovery.',
  },
  {
    id: 'dialogue',
    label: 'Dialogue',
    description: 'Conversations, revelations, arguments, apologies.',
  },
  {
    id: 'atmosphere',
    label: 'Atmosphere',
    description: 'Quiet moments, places, weather, mood-first scenes.',
  },
  {
    id: 'craft',
    label: 'Craft',
    description: 'Structural challenges — real-time, object-focused, framing.',
  },
  {
    id: 'connection',
    label: 'Connection',
    description: 'Between-characters moments — reunions, kindness, strangers.',
  },
]);

export const PROMPTS = Object.freeze([
  { id: 'p-new-character',         category: 'craft',      text: 'Write a scene with a character you haven\'t used before.' },
  { id: 'p-unexpected-turn',       category: 'dialogue',   text: 'Let a conversation go somewhere unexpected.' },
  { id: 'p-contradiction',         category: 'character',  text: 'Give a character a contradiction — something they say they believe versus what they actually do.' },
  { id: 'p-quiet-moment',          category: 'atmosphere', text: 'Write a moment of quiet. Nothing dramatic. Just atmosphere.' },
  { id: 'p-new-setting',           category: 'craft',      text: 'Spend a session in a setting you haven\'t explored.' },
  { id: 'p-unresolved-disagreement', category: 'dialogue', text: 'Have two characters disagree, and don\'t resolve it.' },
  { id: 'p-dramatic-lie',          category: 'dialogue',   text: 'Write a scene where someone lies, and the reader knows it.' },
  { id: 'p-minor-spotlight',       category: 'connection', text: 'Let a minor character steal the scene.' },
  { id: 'p-place-by-absence',      category: 'atmosphere', text: 'Describe a place through what\'s missing from it.' },
  { id: 'p-happy-goodbye',         category: 'connection', text: 'Write a goodbye that isn\'t sad.' },
  { id: 'p-changed-mind',          category: 'character',  text: 'Let a character change their mind about something.' },
  { id: 'p-real-time',             category: 'craft',      text: 'Write a scene that takes place in about ten minutes of real time.' },
  { id: 'p-mid-argument',          category: 'dialogue',   text: 'Start a scene in the middle of an argument.' },
  { id: 'p-stranger-moment',       category: 'connection', text: 'Write a brief moment between strangers.' },
  { id: 'p-admission',             category: 'character',  text: 'Have a character admit they were wrong about something.' },
  { id: 'p-self-surprise',         category: 'character',  text: 'Let a character surprise themselves.' },
  { id: 'p-a-meal',                category: 'atmosphere', text: 'Write a meal — grand feast, quiet breakfast, anything in between.' },
  { id: 'p-story-within',          category: 'craft',      text: 'Let a character tell a story within the story.' },
  { id: 'p-nothing-happens',       category: 'atmosphere', text: 'Write a scene where nothing much happens, and let that be okay.' },
  { id: 'p-unexpected-skill',      category: 'character',  text: 'Give a character an unexpected skill.' },
  { id: 'p-before-change',         category: 'craft',      text: 'Write the moment just before something changes forever.' },
  { id: 'p-shared-silence',        category: 'atmosphere', text: 'Have two characters share a silence.' },
  { id: 'p-small-fear',            category: 'character',  text: 'Let a character be afraid of something small.' },
  { id: 'p-a-promise',             category: 'dialogue',   text: 'Write a promise — kept or broken, your call.' },
  { id: 'p-worst-timing',          category: 'connection', text: 'Set a scene at the worst possible time for one of the characters.' },
  { id: 'p-forgotten-rediscovery', category: 'connection', text: 'Let a character rediscover something they\'d forgotten.' },
  { id: 'p-apology',               category: 'dialogue',   text: 'Write an apology.' },
  { id: 'p-wrong-about',           category: 'character',  text: 'Let a character be wrong about another character.' },
  { id: 'p-reunion',               category: 'connection', text: 'Write a reunion.' },
  { id: 'p-revelation',            category: 'dialogue',   text: 'Have a character reveal something they\'ve been hiding.' },
  { id: 'p-bad-news',              category: 'dialogue',   text: 'Write a scene where someone gets bad news.' },
  { id: 'p-out-of-character',      category: 'character',  text: 'Let a character do something out of character.' },
  { id: 'p-small-kindness',        category: 'connection', text: 'Write a moment of kindness between people who barely know each other.' },
  { id: 'p-object-focused',        category: 'craft',      text: 'Set a scene that revolves around a specific object.' },
  { id: 'p-graceful-failure',      category: 'character',  text: 'Let a character fail gracefully.' },
  { id: 'p-weather-matters',       category: 'atmosphere', text: 'Write a scene where the weather matters.' },
  { id: 'p-small-notice',          category: 'character',  text: 'Have a character notice something small but important.' },
  { id: 'p-first-meeting-twist',   category: 'craft',      text: 'Write a first meeting that isn\'t what it seems.' },
  { id: 'p-genuine-happiness',     category: 'character',  text: 'Let a character be genuinely happy.' },
  { id: 'p-a-question',            category: 'dialogue',   text: 'Write a scene that ends on a question.' },
]);

/**
 * Look up a prompt by ID. Returns null if not found (e.g., deprecated ID
 * still sitting in a user's old completion list).
 */
export function getPromptById(id) {
  return PROMPTS.find(p => p.id === id) || null;
}

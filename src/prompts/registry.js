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

export const PROMPTS = Object.freeze([
  { id: 'p-new-character',         text: 'Write a scene with a character you haven\'t used before.' },
  { id: 'p-unexpected-turn',       text: 'Let a conversation go somewhere unexpected.' },
  { id: 'p-contradiction',         text: 'Give a character a contradiction — something they say they believe versus what they actually do.' },
  { id: 'p-quiet-moment',          text: 'Write a moment of quiet. Nothing dramatic. Just atmosphere.' },
  { id: 'p-new-setting',           text: 'Spend a session in a setting you haven\'t explored.' },
  { id: 'p-unresolved-disagreement', text: 'Have two characters disagree, and don\'t resolve it.' },
  { id: 'p-dramatic-lie',          text: 'Write a scene where someone lies, and the reader knows it.' },
  { id: 'p-minor-spotlight',       text: 'Let a minor character steal the scene.' },
  { id: 'p-place-by-absence',      text: 'Describe a place through what\'s missing from it.' },
  { id: 'p-happy-goodbye',         text: 'Write a goodbye that isn\'t sad.' },
  { id: 'p-changed-mind',          text: 'Let a character change their mind about something.' },
  { id: 'p-real-time',             text: 'Write a scene that takes place in about ten minutes of real time.' },
  { id: 'p-mid-argument',          text: 'Start a scene in the middle of an argument.' },
  { id: 'p-stranger-moment',       text: 'Write a brief moment between strangers.' },
  { id: 'p-admission',             text: 'Have a character admit they were wrong about something.' },
  { id: 'p-self-surprise',         text: 'Let a character surprise themselves.' },
  { id: 'p-a-meal',                text: 'Write a meal — grand feast, quiet breakfast, anything in between.' },
  { id: 'p-story-within',          text: 'Let a character tell a story within the story.' },
  { id: 'p-nothing-happens',       text: 'Write a scene where nothing much happens, and let that be okay.' },
  { id: 'p-unexpected-skill',      text: 'Give a character an unexpected skill.' },
  { id: 'p-before-change',         text: 'Write the moment just before something changes forever.' },
  { id: 'p-shared-silence',        text: 'Have two characters share a silence.' },
  { id: 'p-small-fear',            text: 'Let a character be afraid of something small.' },
  { id: 'p-a-promise',             text: 'Write a promise — kept or broken, your call.' },
  { id: 'p-worst-timing',          text: 'Set a scene at the worst possible time for one of the characters.' },
  { id: 'p-forgotten-rediscovery', text: 'Let a character rediscover something they\'d forgotten.' },
  { id: 'p-apology',               text: 'Write an apology.' },
  { id: 'p-wrong-about',           text: 'Let a character be wrong about another character.' },
  { id: 'p-reunion',               text: 'Write a reunion.' },
  { id: 'p-revelation',            text: 'Have a character reveal something they\'ve been hiding.' },
  { id: 'p-bad-news',              text: 'Write a scene where someone gets bad news.' },
  { id: 'p-out-of-character',      text: 'Let a character do something out of character.' },
  { id: 'p-small-kindness',        text: 'Write a moment of kindness between people who barely know each other.' },
  { id: 'p-object-focused',        text: 'Set a scene that revolves around a specific object.' },
  { id: 'p-graceful-failure',      text: 'Let a character fail gracefully.' },
  { id: 'p-weather-matters',       text: 'Write a scene where the weather matters.' },
  { id: 'p-small-notice',          text: 'Have a character notice something small but important.' },
  { id: 'p-first-meeting-twist',   text: 'Write a first meeting that isn\'t what it seems.' },
  { id: 'p-genuine-happiness',     text: 'Let a character be genuinely happy.' },
  { id: 'p-a-question',            text: 'Write a scene that ends on a question.' },
]);

/**
 * Look up a prompt by ID. Returns null if not found (e.g., deprecated ID
 * still sitting in a user's old completion list).
 */
export function getPromptById(id) {
  return PROMPTS.find(p => p.id === id) || null;
}

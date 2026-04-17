// events/registry.js
//
// Calendar of events, most occurring on a single day, some spanning a
// short window. Dates are MM-DD, year-agnostic — each event recurs every year.
//
// This is deliberately an eclectic calendar: popular observances mixed
// with quirky or affectionate ones (Arbor Day, Flag Day, Betty White's
// birthday). Not trying to be a world calendar — just a handful of days
// with personality.
//
// An event is essentially a "bonus themed prompt pack" that shows up during
// its window. Event prompt IDs are namespaced with `e-<event>-<slug>` so
// they don't collide with regular weekly prompts (`p-<slug>`).
//
// Rules:
//   - Never rename an event id after shipping (breaks user's seen-set).
//   - Never rename a prompt id after shipping (breaks user's completion history).
//   - Windows must not cross a year boundary. If you need something spanning
//     Dec 31 → Jan 1, split it into two events.

export const EVENTS = Object.freeze([
  {
    id: 'e-new-year',
    name: 'New Year\'s Day',
    icon: '✨',
    tagline: 'Fresh starts, in whatever form they come.',
    startMonth: 1, startDay: 1,
    endMonth: 1,   endDay: 1,
    prompts: [
      { id: 'e-new-year-fresh-start',    text: 'Write a character beginning something.' },
      { id: 'e-new-year-changed-mind',   text: 'Write a scene where someone decides to change.' },
      { id: 'e-new-year-old-self',       text: 'Write a character reflecting on who they used to be.' },
    ],
  },
  {
    id: 'e-betty-white',
    name: 'Betty White\'s Birthday',
    icon: '🌷',
    tagline: 'A character who is loved for being exactly who they are.',
    startMonth: 1, startDay: 17,
    endMonth: 1,   endDay: 17,
    prompts: [
      { id: 'e-betty-white-unexpected-warmth', text: 'Write a character who is unexpectedly warm.' },
      { id: 'e-betty-white-gentle-humor',      text: 'Write a scene with gentle, kind humor.' },
      { id: 'e-betty-white-beloved',           text: 'Write someone who is beloved — and let the reader feel why.' },
    ],
  },
  {
    id: 'e-valentines',
    name: 'Valentine\'s Day',
    icon: '❤️',
    tagline: 'Love in any of its forms.',
    startMonth: 2, startDay: 14,
    endMonth: 2,   endDay: 14,
    prompts: [
      { id: 'e-valentines-complicated-love', text: 'Write a love that\'s complicated.' },
      { id: 'e-valentines-friendship',       text: 'Write a friendship as deep as any romance.' },
      { id: 'e-valentines-quiet-affection',  text: 'Write affection without anyone saying it out loud.' },
    ],
  },
  {
    id: 'e-pi-day',
    name: 'Pi Day',
    icon: '🥧',
    tagline: 'Patterns, obsession, and the beauty of the particular.',
    startMonth: 3, startDay: 14,
    endMonth: 3,   endDay: 14,
    prompts: [
      { id: 'e-pi-day-obsession',   text: 'Write a character with an obsession.' },
      { id: 'e-pi-day-patterns',    text: 'Write a scene about noticing a pattern.' },
      { id: 'e-pi-day-beauty',      text: 'Write a character who finds beauty in something others overlook.' },
    ],
  },
  {
    id: 'e-poetry-day',
    name: 'World Poetry Day',
    icon: '📜',
    tagline: 'Attention to rhythm and the weight of small words.',
    startMonth: 3, startDay: 21,
    endMonth: 3,   endDay: 21,
    prompts: [
      { id: 'e-poetry-day-rhythm',   text: 'Write a scene paying attention to the rhythm of speech.' },
      { id: 'e-poetry-day-plain',    text: 'Write a moment where someone speaks plainly from the heart.' },
      { id: 'e-poetry-day-one-thing',text: 'Describe one thing thoroughly, as if it were a poem.' },
    ],
  },
  {
    id: 'e-arbor-day',
    name: 'Around Arbor Day',
    icon: '🌳',
    tagline: 'Trees. Slow growth. Things that outlast us.',
    // Arbor Day is traditionally the last Friday of April; pinning to
    // a short window to catch it regardless of year.
    startMonth: 4, startDay: 24,
    endMonth: 4,   endDay: 26,
    prompts: [
      { id: 'e-arbor-day-under-tree',  text: 'Write a scene under or involving a tree.' },
      { id: 'e-arbor-day-slow-growth', text: 'Write about something that grows slowly over time.' },
      { id: 'e-arbor-day-planting',    text: 'Write a character who plants something — literally or figuratively.' },
    ],
  },
  {
    id: 'e-star-wars-day',
    name: 'Star Wars Day',
    icon: '⚔️',
    tagline: 'Epic scale, small moments of destiny.',
    startMonth: 5, startDay: 4,
    endMonth: 5,   endDay: 4,
    prompts: [
      { id: 'e-star-wars-day-destiny',  text: 'Write a moment that feels like destiny.' },
      { id: 'e-star-wars-day-mentor',   text: 'Write a mentor and the moment a student surpasses them.' },
      { id: 'e-star-wars-day-larger',   text: 'Write a scene that feels bigger than its setting.' },
    ],
  },
  {
    id: 'e-flag-day',
    name: 'Flag Day',
    icon: '🚩',
    tagline: 'Symbols, identity, and what a character stands for.',
    startMonth: 6, startDay: 14,
    endMonth: 6,   endDay: 14,
    prompts: [
      { id: 'e-flag-day-stands-for',    text: 'Write a scene about what a character stands for.' },
      { id: 'e-flag-day-symbol',        text: 'Write about a symbol that means different things to different people.' },
      { id: 'e-flag-day-chosen-id',     text: 'Write a character choosing who they want to be.' },
    ],
  },
  {
    id: 'e-literacy-day',
    name: 'International Literacy Day',
    icon: '📖',
    tagline: 'The power of reading and writing.',
    startMonth: 9, startDay: 8,
    endMonth: 9,   endDay: 8,
    prompts: [
      { id: 'e-literacy-day-changed-by-book', text: 'Write a scene where someone reads something that changes them.' },
      { id: 'e-literacy-day-learning',        text: 'Write a character learning to write.' },
      { id: 'e-literacy-day-about-a-book',    text: 'Write a conversation about a book.' },
    ],
  },
  {
    id: 'e-pirate-day',
    name: 'Talk Like a Pirate Day',
    icon: '🏴‍☠️',
    tagline: 'Distinctive voice. Speech as character.',
    startMonth: 9, startDay: 19,
    endMonth: 9,   endDay: 19,
    prompts: [
      { id: 'e-pirate-day-voice',       text: 'Write a scene where each character has a distinct speech pattern.' },
      { id: 'e-pirate-day-accent',      text: 'Write a character whose accent tells you where they\'re from.' },
      { id: 'e-pirate-day-tone-carries',text: 'Write a scene where tone carries the meaning.' },
    ],
  },
  {
    id: 'e-halloween',
    name: 'Halloween Week',
    icon: '🎃',
    tagline: 'Something just slightly wrong. The thin veil.',
    startMonth: 10, startDay: 27,
    endMonth: 11,   endDay: 1,
    prompts: [
      { id: 'e-halloween-slightly-off', text: 'Write a scene where something is subtly wrong, and the characters can feel it.' },
      { id: 'e-halloween-ghost',        text: 'Write a ghost story — literal or otherwise.' },
      { id: 'e-halloween-unknown',      text: 'Write about fear of what can\'t quite be named.' },
    ],
  },
  {
    id: 'e-kindness-day',
    name: 'World Kindness Day',
    icon: '🕊️',
    tagline: 'Small decencies between people.',
    startMonth: 11, startDay: 13,
    endMonth: 11,   endDay: 13,
    prompts: [
      { id: 'e-kindness-day-strangers',  text: 'Write a small act of kindness between strangers.' },
      { id: 'e-kindness-day-gratitude',  text: 'Write a moment of gratitude that surprises the one receiving it.' },
      { id: 'e-kindness-day-patience',   text: 'Write a character choosing patience when they could have chosen otherwise.' },
    ],
  },
  {
    id: 'e-winter-solstice',
    name: 'Winter Solstice',
    icon: '🌌',
    tagline: 'The longest night. Quiet. Waiting.',
    startMonth: 12, startDay: 21,
    endMonth: 12,   endDay: 21,
    prompts: [
      { id: 'e-winter-solstice-cold-quiet', text: 'Write a scene set in deep cold or deep quiet.' },
      { id: 'e-winter-solstice-long-night', text: 'Write about the longest night of something — a season, a relationship, a feeling.' },
      { id: 'e-winter-solstice-stillness',  text: 'Write a moment of stillness before a change.' },
    ],
  },
  {
    id: 'e-year-end',
    name: 'Year\'s End',
    icon: '🔔',
    tagline: 'Endings, reflection, gatherings of all kinds.',
    startMonth: 12, startDay: 25,
    endMonth: 12,   endDay: 31,
    prompts: [
      { id: 'e-year-end-ending',        text: 'Write a scene about an ending.' },
      { id: 'e-year-end-looking-back',  text: 'Write a character looking back over a long stretch of time.' },
      { id: 'e-year-end-gathering',     text: 'Write a gathering — any kind, any scale.' },
    ],
  },
]);

/**
 * Look up an event by id.
 */
export function getEventById(id) {
  return EVENTS.find(e => e.id === id) || null;
}

/**
 * Look up an event prompt by id across all events (O(n*m) but n*m is small).
 */
export function getEventPromptById(promptId) {
  for (const ev of EVENTS) {
    for (const p of ev.prompts) {
      if (p.id === promptId) return { event: ev, prompt: p };
    }
  }
  return null;
}

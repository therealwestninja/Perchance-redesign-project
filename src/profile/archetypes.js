// profile/archetypes.js
//
// User archetype classification. Identifies which "player style" a
// user best matches based on patterns across many signals, as opposed
// to the tiered-counter achievements which reward heavy use of a
// SINGLE signal.
//
// Archetypes:
//   - Casual        — opens occasionally, small totals
//   - Twice-weekly  — steadier rhythm, moderate totals
//   - Daily         — frequent, active streak, high counters
//   - RP            — character-heavy, active characters, in-character
//                     writing patterns (short replies)
//   - Storyteller   — long-form writing (long average message),
//                     multi-session continuity, rename/curation activity
//
// Each archetype has a `score(stats)` function that returns a number
// in [0, 1] roughly indicating how well the user fits that archetype.
// The HIGHEST-SCORING archetype is declared the user's primary.
// Ties broken by the order below (Storyteller > RP > Daily > Twice-
// weekly > Casual) on the assumption that more "specific" archetypes
// should win ties over general ones.
//
// A minimum threshold applies: if every archetype scores < 0.15, the
// user is considered unclassified (new) and we report "Newcomer" so
// they don't get stuck as "Casual" on first visit.
//
// Classification is PURE — depends only on the input stats bundle
// (which should include counters + streaks). No storage here; the
// caller decides whether/where to persist.

/**
 * Score each archetype in [0, 1] and return the results sorted by
 * score descending. Highest-scoring wins.
 *
 * @param {object} stats augmented stats bundle (counters + streaks)
 * @returns {Array<{ id, label, description, score }>}
 */
export function scoreArchetypes(stats) {
  const s = stats || {};
  return ARCHETYPES
    .map(a => ({
      id: a.id,
      label: a.label,
      description: a.description,
      score: clamp01(a.score(s)),
    }))
    .sort((x, y) => y.score - x.score);
}

/**
 * Return the primary archetype — the highest-scoring one, or the
 * "Newcomer" sentinel if no archetype scores above the minimum.
 *
 * @param {object} stats
 * @returns {{ id, label, description, score }}
 */
export function getPrimaryArchetype(stats) {
  const scored = scoreArchetypes(stats);
  const top = scored[0];
  if (!top || top.score < 0.15) {
    return {
      id: 'newcomer',
      label: 'Newcomer',
      description: 'Keep exploring — your style is still emerging.',
      score: top ? top.score : 0,
    };
  }
  return top;
}

// ---- archetype definitions ----

const ARCHETYPES = [
  {
    id: 'storyteller',
    label: 'Storyteller',
    description:
      'Long-form writer. Extended messages, multi-session continuity, ' +
      'active memory curation.',
    score: (s) => {
      const wordsPerMsg = (s.userMessageCount || 0) > 0
        ? (s.wordsWritten || 0) / s.userMessageCount
        : 0;
      // Signals:
      //   - High words-per-message (the defining signal): full at 50
      //   - Uses memory tool aggressively: full at 50 saves
      //   - Renames bubbles often: full at 20
      //   - Has a long thread (>= 100 msgs): 0 or 1
      const longProse = satNorm(wordsPerMsg, 50);
      const curator   = satNorm((s.counters && s.counters.memorySaves) || 0, 50);
      const namer     = satNorm((s.counters && s.counters.bubblesRenamed) || 0, 20);
      const continuity = (s.longestThread || 0) >= 100 ? 1 : (s.longestThread || 0) / 100;
      return weighted([
        [longProse,  0.40],
        [curator,    0.25],
        [namer,      0.20],
        [continuity, 0.15],
      ]);
    },
  },
  {
    id: 'rp',
    label: 'Roleplayer',
    description:
      'Character-driven. Many characters, active in multiple threads, ' +
      'short-to-medium replies that keep scenes flowing.',
    score: (s) => {
      const wordsPerMsg = (s.userMessageCount || 0) > 0
        ? (s.wordsWritten || 0) / s.userMessageCount
        : 0;
      // Signals:
      //   - Many characters created: full at 8
      //   - Moderate words-per-message (not massive, not tiny)
      //     sweet spot ~15–30 words per reply
      //   - Uses threads to keep scenes going: full at 10 threads
      //   - Spawns characters from bubbles (Demiurge behavior)
      const charsSignal  = satNorm(s.characterCount || 0, 8);
      const convoPace    = bellish(wordsPerMsg, 20, 15); // peaks at ~20 wpm
      const threadsUsed  = satNorm(s.threadCount || 0, 10);
      const demiurgeSig  = satNorm((s.counters && s.counters.charactersSpawned) || 0, 5);
      return weighted([
        [charsSignal,  0.35],
        [convoPace,    0.25],
        [threadsUsed,  0.25],
        [demiurgeSig,  0.15],
      ]);
    },
  },
  {
    id: 'daily',
    label: 'Daily User',
    description:
      'Shows up every day. Active streaks, frequent tool use, ' +
      'steady engagement.',
    score: (s) => {
      // Signals:
      //   - Current streak (present-day engagement): full at 14
      //   - Longest streak (proves the pattern): full at 30
      //   - Memory tool opens (routine use): full at 50
      //   - Many distinct active days: full at 60
      const currentStreak = satNorm((s.streaks && s.streaks.current) || 0, 14);
      const longestStreak = satNorm((s.streaks && s.streaks.longest) || 0, 30);
      const toolUse       = satNorm(
        (s.counters && s.counters.memoryWindowOpens) || 0, 50);
      const daysActive    = satNorm(s.daysActive || 0, 60);
      return weighted([
        [currentStreak, 0.40],
        [longestStreak, 0.25],
        [toolUse,       0.20],
        [daysActive,    0.15],
      ]);
    },
  },
  {
    id: 'twice_weekly',
    label: 'Regular',
    description:
      'Comes back steadily without the daily grind. Moderate totals, ' +
      'consistent patterns.',
    score: (s) => {
      // Signals:
      //   - Moderate daysActive: peak ~20–40 days, lower at extremes
      //   - Moderate streak (not null, not huge)
      //   - Some tool use
      //   - Some message volume
      const daysActive = bellish(s.daysActive || 0, 30, 20);
      const modStreak  = bellish((s.streaks && s.streaks.longest) || 0, 7, 4);
      const toolUse    = satNorm(
        (s.counters && s.counters.memoryWindowOpens) || 0, 20);
      const msgs       = satNorm(s.userMessageCount || 0, 100);
      return weighted([
        [daysActive, 0.35],
        [modStreak,  0.25],
        [toolUse,    0.20],
        [msgs,       0.20],
      ]);
    },
  },
  {
    id: 'casual',
    label: 'Casual',
    description:
      'Drops in once in a while. Smaller totals, shorter streaks, ' +
      'occasional exploration.',
    score: (s) => {
      // Casual scores higher for LOW totals — it's a negative-fit
      // archetype. We compute the complement of "heavy use" signals
      // so it wins when the heavy-use archetypes score poorly.
      const notManyMsgs   = 1 - satNorm(s.userMessageCount || 0, 50);
      const notManyDays   = 1 - satNorm(s.daysActive || 0, 14);
      const notManyStreak = 1 - satNorm((s.streaks && s.streaks.longest) || 0, 5);
      // But there has to be SOME engagement — we don't want to
      // classify a zero-activity user as "Casual". Minimum floor:
      // the user must have at least one message.
      if ((s.userMessageCount || 0) < 1) return 0;
      return weighted([
        [notManyMsgs,   0.40],
        [notManyDays,   0.30],
        [notManyStreak, 0.30],
      ]);
    },
  },
];

// ---- helpers ----

/** Clamp to [0, 1]. */
function clamp01(x) {
  const n = Number(x) || 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Saturating normalize: value / peak, clamped to [0, 1]. At value=peak
 * returns 1; value>peak still returns 1 (no bonus for overshooting).
 */
function satNorm(value, peak) {
  if (peak <= 0) return 0;
  return clamp01(value / peak);
}

/**
 * Bell-curve-ish score: peaks at `center`, falls off with radius `r`.
 * Returns 1 at center, ~0.5 at center±r, tail at center±2r.
 * Used for archetypes where "moderate" is better than "high"
 * (e.g., "twice-weekly" — too many days active becomes "daily").
 */
function bellish(value, center, r) {
  if (r <= 0) return value === center ? 1 : 0;
  const dist = Math.abs((Number(value) || 0) - center);
  const score = 1 - (dist / (2 * r));
  return clamp01(score);
}

/**
 * Weighted average. Weights should sum to 1.
 *
 * @param {Array<[number, number]>} pairs [score01, weight] pairs
 */
function weighted(pairs) {
  let sum = 0;
  for (const [s, w] of pairs) sum += clamp01(s) * w;
  return clamp01(sum);
}

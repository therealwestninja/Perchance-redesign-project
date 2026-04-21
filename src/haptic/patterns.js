// haptic/patterns.js
//
// Built-in haptic pattern library — pre-authored timeline patterns
// available to all characters. Authors can reference these by name
// in their character cards, or the AI can emit <pattern name=X>.
//
// Pattern format matches the character.haptics.patterns schema:
//   { description, defaultTrack, tracks: { [trackName]: [{t, i, d}] }, totalDuration }
//
// Generator helpers (sample, sine, ramp, blend) adapted from the
// Adaptive Session Studio project (MIT license, scrapped).

// ---- Generator helpers ----

/** Clamp intensity to [0, 1] */
const clamp01 = v => Math.max(0, Math.min(1, v));

/**
 * Build a timeline track by sampling a function at regular intervals.
 * @param {function} fn - (t: 0–1) → intensity 0–1
 * @param {number} durMs - total duration in ms
 * @param {number} stepMs - sampling interval (default 200ms)
 * @returns {Array<{t: number, i: number, d: number}>}
 */
function sample(fn, durMs, stepMs = 200) {
  const points = [];
  for (let t = 0; t <= durMs; t += stepMs) {
    points.push({ t, i: clamp01(fn(t / durMs)), d: stepMs });
  }
  return points;
}

/** Sine oscillation between lo and hi with given period in ms */
function sine(lo, hi, periodMs) {
  const amp = (hi - lo) / 2;
  const mid = lo + amp;
  return t => mid + amp * Math.sin((t * 2 * Math.PI * 60000) / periodMs);
}

/** Linear ramp from start to end over [0, 1] */
function ramp(start, end) {
  return t => start + (end - start) * t;
}

/** Blend two functions with a weight */
function blend(fnA, fnB, weight = 0.5) {
  return t => fnA(t) * (1 - weight) + fnB(t) * weight;
}

/** Exponential curve application */
function applyCurve(t, curve) {
  if (curve === 'exponential') return t * t;
  if (curve === 'sine') return 0.5 - 0.5 * Math.cos(Math.PI * t);
  return t; // linear
}

// ---- Pattern definitions ----
// Adapted from Adaptive Session Studio's funscript-patterns.js.
// Converted from position (0-100) to intensity (0-1).

export const BUILTIN_PATTERNS = {

  // ── Steady patterns ──────────────────────────────────────────
  'slow-pulse': {
    description: 'Smooth, unhurried oscillation. Good baseline for long sessions.',
    defaultTrack: 'vibe',
    tracks: {
      vibe: sample(t => {
        return sine(0.1, 0.9, 4000)(t);
      }, 12000, 200),
    },
    totalDuration: 12000,
  },

  'steady-rhythm': {
    description: 'Medium-pace consistent rhythm. Predictable and reliable.',
    defaultTrack: 'vibe',
    tracks: {
      vibe: sample(t => sine(0.15, 0.85, 1800)(t), 8000, 150),
    },
    totalDuration: 8000,
  },

  // ── Escalating patterns ──────────────────────────────────────
  'slow-build': {
    description: 'Starts subtle, widens and quickens over time.',
    defaultTrack: 'vibe',
    tracks: {
      vibe: sample(t => {
        const lo = 0.5 - (0.4 * t);
        const hi = 0.5 + (0.4 * t);
        const period = 5000 - (3200 * t);
        const amp = (hi - lo) / 2;
        const mid = lo + amp;
        return mid + amp * Math.sin((t * 2 * Math.PI * 20000) / Math.max(period, 100));
      }, 20000, 200),
    },
    totalDuration: 20000,
  },

  'tease': {
    description: 'Climbs toward peak, retreats before the top, then climbs again. Sustained tension.',
    defaultTrack: 'vibe',
    tracks: {
      vibe: (() => {
        const points = [];
        const cycleDur = 3000;
        for (let t = 0; t <= 12000; t += 50) {
          const phase = (t % cycleDur) / cycleDur;
          let i;
          if (phase < 0.40) i = 0.1 + (phase / 0.40) * 0.8;
          else if (phase < 0.50) i = 0.9 - ((phase - 0.40) / 0.10) * 0.55;
          else if (phase < 0.80) i = 0.35 + ((phase - 0.50) / 0.30) * 0.50;
          else i = 0.85 - ((phase - 0.80) / 0.20) * 0.75;
          points.push({ t, i: clamp01(i), d: 50 });
        }
        return points;
      })(),
    },
    totalDuration: 12000,
  },

  'buildup': {
    description: 'Cascading peaks that accelerate over time. High energy.',
    defaultTrack: 'vibe',
    tracks: {
      vibe: (() => {
        const points = [];
        for (let t = 0; t <= 15000; t += 50) {
          const progress = t / 15000;
          const period = Math.max(600, 2200 - progress * 1600);
          const phase = (t % period) / period;
          let i;
          if (phase < 0.35) i = phase / 0.35 * 0.95;
          else if (phase < 0.55) i = 0.95 - (phase - 0.35) / 0.20 * 0.85;
          else i = 0.10 + (phase - 0.55) / 0.45 * 0.10;
          points.push({ t, i: clamp01(i), d: 50 });
        }
        return points;
      })(),
    },
    totalDuration: 15000,
  },

  'edge': {
    description: 'Builds to near-peak then drops suddenly, repeating in waves.',
    defaultTrack: 'vibe',
    tracks: {
      vibe: sample(t => {
        const cycle = (t % 0.2) / 0.2;
        if (cycle < 0.7) return sine(0.1, 0.9, 8400)(t);
        return sine(0.1, 0.3, 3600)(t);
      }, 12000, 50),
    },
    totalDuration: 12000,
  },

  // ── Natural patterns ─────────────────────────────────────────
  'wave': {
    description: 'Two overlapping waves creating an organic, surging rhythm.',
    defaultTrack: 'vibe',
    tracks: {
      vibe: sample(t => {
        const slow = sine(0.2, 0.8, 6000)(t);
        const fast = sine(0, 0.4, 1600)(t);
        return slow * 0.65 + fast * 0.35;
      }, 12000, 100),
    },
    totalDuration: 12000,
  },

  'heartbeat': {
    description: 'Double-beat pulse with rest. Intimate and tension-building.',
    defaultTrack: 'vibe',
    tracks: {
      vibe: (() => {
        const cycleDur = 900;
        const points = [];
        for (let t = 0; t <= 10000; t += 25) {
          const phase = (t % (cycleDur * 2.5)) / cycleDur;
          let i;
          if (phase < 0.15) i = phase / 0.15 * 0.9;
          else if (phase < 0.30) i = 0.9 - (phase - 0.15) / 0.15 * 0.7;
          else if (phase < 0.45) i = 0.2 + (phase - 0.30) / 0.15 * 0.8;
          else if (phase < 0.65) i = 1.0 - (phase - 0.45) / 0.20 * 0.9;
          else i = 0.1;
          points.push({ t, i: clamp01(i), d: 25 });
        }
        return points;
      })(),
    },
    totalDuration: 10000,
  },

  // ── Calming patterns ─────────────────────────────────────────
  'breath': {
    description: 'Matches a 6-second breathing cycle. Grounding and meditative.',
    defaultTrack: 'vibe',
    tracks: {
      vibe: (() => {
        const cycleDur = 6000;
        const points = [];
        for (let t = 0; t <= 12000; t += 100) {
          const phase = (t % cycleDur) / cycleDur;
          let i;
          if (phase < 0.45) i = 0.15 + (phase / 0.45) * 0.65;
          else if (phase < 0.55) i = 0.80;
          else i = 0.80 - ((phase - 0.55) / 0.45) * 0.65;
          points.push({ t, i: clamp01(i), d: 100 });
        }
        return points;
      })(),
    },
    totalDuration: 12000,
  },

  'descent': {
    description: 'Starts at full intensity and slowly winds down. Good for recovery.',
    defaultTrack: 'vibe',
    tracks: {
      vibe: sample(t => {
        const base = ramp(0.85, 0.15)(t);
        const osc = sine(-0.2, 0.2, 3000)(t);
        return base + osc;
      }, 15000, 100),
    },
    totalDuration: 15000,
  },

  'afterglow': {
    description: 'Starts intense then fades in diminishing tremors.',
    defaultTrack: 'vibe',
    tracks: {
      vibe: sample(t => {
        const decay = Math.exp(-t * 3);
        const tremor = sine(0, 1, 800)(t) * decay;
        return Math.max(0.05, tremor);
      }, 15000, 60),
    },
    totalDuration: 15000,
  },

  'feather': {
    description: 'Barely-there sensations. Extremely gentle — ideal for warm-up.',
    defaultTrack: 'vibe',
    tracks: {
      vibe: sample(t => {
        const drift = sine(0.05, 0.25, 4000)(t);
        const micro = sine(0, 0.08, 700)(t);
        return drift + micro;
      }, 10000, 50),
    },
    totalDuration: 10000,
  },

  // ── Special patterns ─────────────────────────────────────────
  'storm': {
    description: 'Rapid overlapping waves at peak intensity. Maximum energy.',
    defaultTrack: 'vibe',
    tracks: {
      vibe: sample(t => {
        const a = sine(0.3, 1.0, 900)(t);
        const b = sine(0, 0.7, 600)(t);
        const c = sine(0.2, 0.8, 1400)(t);
        return a * 0.5 + b * 0.3 + c * 0.2;
      }, 8000, 50),
    },
    totalDuration: 8000,
  },

  'plateau': {
    description: 'Rises quickly then holds at a steady level with slight tremor.',
    defaultTrack: 'vibe',
    tracks: {
      vibe: sample(t => {
        const rise = Math.min(1, t * 5);
        const waver = sine(0.6, 0.75, 1800)(t) * 0.15;
        return rise * 0.8 + waver;
      }, 10000, 40),
    },
    totalDuration: 10000,
  },

  'staccato': {
    description: 'Sharp short bursts with pauses. Rhythmic and percussive.',
    defaultTrack: 'vibe',
    tracks: {
      vibe: sample(t => {
        const phase = (t % 0.02) / 0.02;
        return phase < 0.4 ? 0.9 - phase * 0.3 : 0.1;
      }, 6000, 25),
    },
    totalDuration: 6000,
  },

  'pendulum': {
    description: 'Full-range pendulum with hypnotic even tempo.',
    defaultTrack: 'vibe',
    tracks: {
      vibe: sample(t => {
        return 0.5 + 0.48 * Math.cos(t * Math.PI * 2 * 4);
      }, 12000, 60),
    },
    totalDuration: 12000,
  },

  'syncopated': {
    description: 'Off-beat rhythm — two quick, one slow. Musical and surprising.',
    defaultTrack: 'vibe',
    tracks: {
      vibe: sample(t => {
        const beat = (t % 0.067) / 0.067;
        if (beat < 0.2) return 0.85;
        if (beat < 0.35) return 0.15;
        if (beat < 0.55) return 0.90;
        if (beat < 0.65) return 0.10;
        if (beat < 0.9) return 0.80;
        return 0.15;
      }, 8000, 40),
    },
    totalDuration: 8000,
  },
};

/**
 * Get a pattern by name. Checks built-in library first, then
 * the character's custom patterns.
 *
 * @param {string} name
 * @param {Object} characterPatterns - character.haptics.patterns
 * @returns {Object|null} pattern definition
 */
export function getPattern(name, characterPatterns) {
  if (!name) return null;
  const lower = name.toLowerCase().replace(/[\s_-]+/g, '-');
  // Character patterns take priority (author overrides built-in)
  if (characterPatterns && characterPatterns[name]) return characterPatterns[name];
  if (characterPatterns && characterPatterns[lower]) return characterPatterns[lower];
  // Built-in library
  if (BUILTIN_PATTERNS[name]) return BUILTIN_PATTERNS[name];
  if (BUILTIN_PATTERNS[lower]) return BUILTIN_PATTERNS[lower];
  return null;
}

/**
 * List all available patterns (built-in + character).
 */
export function listPatterns(characterPatterns) {
  const all = {};
  // Built-in first
  for (const [name, pattern] of Object.entries(BUILTIN_PATTERNS)) {
    all[name] = { ...pattern, source: 'builtin' };
  }
  // Character patterns override
  if (characterPatterns) {
    for (const [name, pattern] of Object.entries(characterPatterns)) {
      all[name] = { ...pattern, source: 'character' };
    }
  }
  return all;
}

/**
 * Generate the AI instruction snippet listing available patterns.
 * Sent in the system prompt when haptics are enabled.
 */
export function generatePatternInstructionSnippet(characterPatterns, clamps) {
  const patterns = listPatterns(characterPatterns);
  const names = Object.keys(patterns);
  if (names.length === 0) return '';

  const lines = [
    'Available haptic tags: <vibe intensity=0..1 duration=Ns>, <stroke speed=0..1 duration=Ns>, <rotate speed=0..1 duration=Ns>, <intensity level=0..1 duration=Ns>, <stop>',
    `Available patterns: ${names.map(n => `<pattern name=${n}>`).join(', ')}`,
    `Pattern descriptions: ${names.map(n => `${n}: ${patterns[n].description || 'no description'}`).join('; ')}`,
  ];

  if (clamps) {
    lines.push(`Limits: max intensity ${clamps.intensityCeiling}, max duration ${clamps.durationCeiling / 1000}s, max ${clamps.tagsPerMessageCap} tags per message.`);
  }

  return lines.join('\n');
}

// Export generator helpers for pattern authoring
export { sample, sine, ramp, blend, clamp01, applyCurve };

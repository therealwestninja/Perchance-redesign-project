// haptic/hallucination.js
//
// Hallucination resolution ladder (§3.5).
//
// When the AI emits unknown pattern names or tag types, this module
// attempts to resolve them through a layered fallback:
//
//   1. Exact match — known atomic tag or pattern. Fine.
//   2. Fuzzy pattern-name match (Levenshtein ≤ 2) → auto-resolve.
//   3. Unknown tag type → map to abstract intensity.
//   4. Semantic value mapping (intensity=medium → 0.5).
//   5. Out-of-range → clamp (handled by resolver).
//   6. Malformed → [!] glyph with error details.
//
// Also tracks unknown names across a conversation and generates
// a self-correcting feedback snippet when 3+ unknowns accumulate.

import { getPattern, BUILTIN_PATTERNS } from './patterns.js';

// ---- Levenshtein distance ----

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return matrix[b.length][a.length];
}

// ---- Resolution state (per-conversation) ----

let _unknownNames = [];     // track unknown names for feedback loop
let _resolvedAliases = {};  // { unknownName: resolvedName } — auto-resolved this session

/**
 * Reset hallucination tracking for a new conversation/message.
 */
export function resetHallucinationState() {
  _unknownNames = [];
  _resolvedAliases = {};
}

/**
 * Get the list of unknown names encountered so far.
 */
export function getUnknownNames() {
  return [..._unknownNames];
}

/**
 * Get resolved aliases from this session.
 */
export function getResolvedAliases() {
  return { ..._resolvedAliases };
}

// ---- Resolution ladder ----

/**
 * Attempt to resolve an unknown pattern name through the ladder.
 *
 * @param {string} name - the AI-generated pattern name
 * @param {Object} characterPatterns - character.haptics.patterns
 * @param {Object} aliases - character.haptics.aliases (pinned resolutions)
 * @returns {{ resolved: string|null, method: string, annotation: Object|null }}
 */
export function resolvePatternName(name, characterPatterns, aliases) {
  if (!name) return { resolved: null, method: 'none', annotation: null };

  const lower = name.toLowerCase().trim();

  // Step 1: Exact match (builtin or character)
  if (getPattern(lower, characterPatterns)) {
    return { resolved: lower, method: 'exact', annotation: null };
  }

  // Step 1b: Check pinned aliases
  if (aliases && aliases[lower]) {
    const target = aliases[lower];
    if (getPattern(target, characterPatterns)) {
      return {
        resolved: target,
        method: 'alias',
        annotation: {
          type: 'alias',
          text: `pinned alias: "${lower}" → "${target}"`,
        },
      };
    }
  }

  // Step 1c: Check session auto-resolved aliases
  if (_resolvedAliases[lower]) {
    return {
      resolved: _resolvedAliases[lower],
      method: 'cached-fuzzy',
      annotation: {
        type: 'fuzzy-match',
        text: `auto-resolved: "${lower}" → "${_resolvedAliases[lower]}"`,
      },
    };
  }

  // Step 2: Fuzzy match (Levenshtein ≤ 2)
  const allNames = [
    ...Object.keys(BUILTIN_PATTERNS),
    ...Object.keys(characterPatterns || {}),
  ];

  let bestMatch = null;
  let bestDist = Infinity;

  for (const candidate of allNames) {
    const dist = levenshtein(lower, candidate.toLowerCase());
    if (dist <= 2 && dist < bestDist) {
      bestDist = dist;
      bestMatch = candidate;
    }
  }

  if (bestMatch) {
    _resolvedAliases[lower] = bestMatch;
    return {
      resolved: bestMatch,
      method: 'fuzzy',
      annotation: {
        type: 'fuzzy-match',
        text: `auto-resolved: "${lower}" → "${bestMatch}" (distance: ${bestDist})`,
      },
    };
  }

  // Step 3: No match at all — track as unknown
  if (!_unknownNames.includes(lower)) {
    _unknownNames.push(lower);
  }

  return {
    resolved: null,
    method: 'unknown',
    annotation: {
      type: 'unknown-pattern',
      text: `unknown pattern "${lower}" — mapped to default intensity`,
    },
  };
}

// ---- Self-correcting feedback (§3.5) ----

/**
 * Generate a feedback snippet for the AI instruction when 3+
 * unknown pattern names or tag types have been emitted.
 *
 * @param {Object} characterPatterns - available patterns
 * @returns {string|null} snippet to append, or null if no correction needed
 */
export function generateCorrectionSnippet(characterPatterns) {
  if (_unknownNames.length < 3) return null;

  const availableNames = [
    ...Object.keys(BUILTIN_PATTERNS),
    ...Object.keys(characterPatterns || {}),
  ];

  return `Note: you used undefined patterns — ${_unknownNames.join(', ')}. Available: ${availableNames.slice(0, 15).join(', ')}${availableNames.length > 15 ? '...' : ''}.`;
}

// ---- AI-awareness injection (§3 step 4) ----

/**
 * Generate an AI-awareness injection for pause events.
 * Prepended to the user's next message when haptic session pauses.
 *
 * @param {string} reason - pause reason from control bus
 * @param {Object} opts
 * @param {boolean} opts.includeState - include device state details
 * @returns {string} system message to prepend
 */
export function generatePauseInjection(reason, opts = {}) {
  const reasonMap = {
    'user-pause': 'user paused the haptic session',
    'device-disconnected': 'haptic device disconnected',
    'ws-disconnect': 'device connection lost',
    'connect-failed': 'device connection failed',
    'stream-error': 'stream error occurred',
    'idle-timeout': 'idle timeout — no activity',
    'backend-error': 'device error occurred',
  };

  const desc = reasonMap[reason] || `haptic session paused (${reason})`;
  return `[System: ${desc}]`;
}

// Export levenshtein for testing
export { levenshtein };

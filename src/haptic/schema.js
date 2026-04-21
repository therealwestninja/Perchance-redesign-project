// haptic/schema.js
//
// Data shapes for the haptic subsystem. Defines the character-card
// `haptics` field, the `voice` field, and their defaults. All fields
// are optional — absent fields fall back to defaults. Characters
// without haptic data behave identically to upstream ai-character-chat.
//
// Schema version is embedded in the payload so future migrations can
// detect and upgrade older exports.

export const HAPTIC_SCHEMA_VERSION = 1;

/**
 * Default haptic configuration for a character card.
 * Merged over by any values present in `character.haptics`.
 */
export function defaultHaptics() {
  return {
    enabled: false,
    schemaVersion: HAPTIC_SCHEMA_VERSION,
    defaults: {
      atomicDuration: 3000,       // ms — default duration for tags without explicit duration
      atomicIntensity: 0.5,       // 0..1
      defaultTrack: 'vibe',       // 'vibe' | 'stroke' | 'rotate' | 'intensity'
    },
    patterns: {},                  // { [name]: PatternDef }
    ambientPattern: null,          // string | null — pattern name for tagless blocks
    instructionSnippet: null,      // string | null — custom AI instruction override
    clampOverrides: null,          // partial ClampConfig | null — merged via min() with user clamps
    aliases: {},                   // { [aiGeneratedName]: patternName } — pinned fuzzy-match resolutions
  };
}

/**
 * Default voice configuration for a character card (§8).
 */
export function defaultVoice() {
  return {
    enabled: false,
    preferredVoiceName: null,
    rate: 1.0,
    pitch: 1.0,
    split: null,                   // { enabled, dialogVoice, narrationVoice, splitRegex } | null
  };
}

/**
 * Default user-adjustable clamp values (§2.5).
 * These are hard ceilings on AI output — applied before the user's
 * personal intensity slider.
 */
export function defaultClamps() {
  return {
    intensityCeiling: 0.8,          // max value for intensity/level/speed params
    durationCeiling: 20000,         // ms — max duration per single tag
    tagsPerMessageCap: 8,           // max tags parsed per AI message
    patternDurationCeiling: 60000,  // ms — max total duration of a named pattern
    minTagGap: 0,                   // ms — minimum gap between consecutive tag events
    blockCooldown: 0,               // ms — mandatory pause after each executed block (0 = off)
  };
}

/**
 * Default global haptic settings (stored in IndexedDB, single row).
 */
export function defaultHapticSettings() {
  return {
    id: 'global',
    // Device
    deviceType: 'vibe',             // primary device-type toggle
    intensitySlider: 1.0,           // 0..1.5 — personal preference multiplier at dispatch
    // Clamps
    clamps: defaultClamps(),
    // Bridging (§3.6)
    decayHalfLife: 2000,            // ms — exponential tail after explicit duration
    taglessBlockMode: 'silent',     // 'silent' | 'baseline' | 'ambient'
    baselineIntensity: 0.15,        // 0..0.3 — floor when mode='baseline'
    // Safety
    idleTimeout: 0,                 // ms — 0 = off
    safewordKey: null,              // key binding string | null
    // AI awareness (§3 step 4)
    aiAwarenessDefault: false,      // default for new characters
    // Author mode
    authorMode: false,
    // Glyph theming
    glyphTheme: {},                 // { [tagOrPatternName]: glyphString }
    // Active backend
    activeBackendId: 'buttplug',
  };
}

/**
 * Shape of a pattern definition inside character.haptics.patterns.
 *
 * @typedef {Object} PatternDef
 * @property {string} description - one-line description for AI instruction
 * @property {string} defaultTrack - 'vibe' | 'stroke' | 'rotate'
 * @property {Object<string, Array<{t:number, i:number, d:number}>>} tracks
 *   Map of track name → timeline events. Each event:
 *     t = time offset (ms), i = intensity (0..1), d = duration (ms)
 * @property {number} totalDuration - total length in ms
 */

/**
 * Validate and fill in defaults for a character's haptics field.
 * Non-destructive: returns a new object, never mutates input.
 */
export function normalizeHaptics(raw) {
  const defaults = defaultHaptics();
  if (!raw || typeof raw !== 'object') return defaults;
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : defaults.enabled,
    schemaVersion: raw.schemaVersion || defaults.schemaVersion,
    defaults: { ...defaults.defaults, ...(raw.defaults || {}) },
    patterns: (raw.patterns && typeof raw.patterns === 'object') ? raw.patterns : {},
    ambientPattern: raw.ambientPattern || null,
    instructionSnippet: raw.instructionSnippet || null,
    clampOverrides: raw.clampOverrides || null,
    aliases: (raw.aliases && typeof raw.aliases === 'object') ? raw.aliases : {},
  };
}

/**
 * Validate and fill in defaults for a character's voice field.
 */
export function normalizeVoice(raw) {
  const defaults = defaultVoice();
  if (!raw || typeof raw !== 'object') return defaults;
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : defaults.enabled,
    preferredVoiceName: raw.preferredVoiceName || null,
    rate: typeof raw.rate === 'number' ? Math.max(0.1, Math.min(10, raw.rate)) : defaults.rate,
    pitch: typeof raw.pitch === 'number' ? Math.max(0, Math.min(2, raw.pitch)) : defaults.pitch,
    split: raw.split || null,
  };
}

/**
 * Merge character-level clamp overrides with user clamps via min().
 * Character authors can only tighten, never loosen.
 */
export function mergeClamps(userClamps, characterOverrides) {
  const base = { ...defaultClamps(), ...(userClamps || {}) };
  if (!characterOverrides || typeof characterOverrides !== 'object') return base;
  const merged = { ...base };
  for (const key of Object.keys(base)) {
    if (typeof characterOverrides[key] === 'number') {
      merged[key] = Math.min(base[key], characterOverrides[key]);
    }
  }
  return merged;
}

// haptic/resolver.js
//
// Envelope Resolver (§4). Pure function:
//
//   resolveBlock(block, config) → normalizedEventStream
//
// Composes explicit tags + §3.6 decay + baseline + ambient pattern.
// Applies §2.5 clamps first, then multiplies by user's intensity slider.
//
// Output: flat array of { t, track, intensity, duration } events
// sorted by time offset. The scheduler dispatches these sequentially.
//
// §3.6(a) Decay bridging: every tag has an exponential tail after its
// explicit duration. Intensity decays toward zero along a configurable
// half-life. Interrupted instantly by subsequent tags on the same track.
//
// Composition per track: clamp(slider × max(explicit, decayTail, baseline))
//
// Curve math adapted from Adaptive Session Studio's applyCurve() (MIT).

import { defaultClamps, mergeClamps } from './schema.js';
import { getPattern } from './patterns.js';

// ---- Decay state (persists across blocks) ----

const _decayState = new Map(); // track → { intensity, startedAt }

/**
 * Reset decay state (new session / character switch).
 */
export function resetDecayState() {
  _decayState.clear();
}

/**
 * Record a tag's peak intensity for decay tail computation.
 * Called after each explicit tag dispatches.
 */
export function recordDecayPeak(track, intensity, timestamp) {
  _decayState.set(track, { intensity, startedAt: timestamp });
}

/**
 * Compute the decayed intensity for a track at a given time.
 * Uses exponential decay: I(t) = peak × 0.5^(elapsed / halfLife)
 *
 * @param {string} track
 * @param {number} timestamp - current time in ms
 * @param {number} halfLife - decay half-life in ms
 * @returns {number} decayed intensity (0..1)
 */
export function getDecayedIntensity(track, timestamp, halfLife) {
  const state = _decayState.get(track);
  if (!state || halfLife <= 0) return 0;
  const elapsed = timestamp - state.startedAt;
  if (elapsed <= 0) return state.intensity;
  return state.intensity * Math.pow(0.5, elapsed / halfLife);
}

/**
 * Resolve a parsed block into a normalized, clamped, slider-adjusted
 * event stream ready for the scheduler to dispatch.
 *
 * @param {Object} block - { index, tags, prose, proseLength }
 * @param {Object} config
 * @param {Object} config.clamps - user clamp settings
 * @param {Object} config.characterClamps - character-level clamp overrides
 * @param {number} config.slider - intensity slider multiplier (0..1.5)
 * @param {string} config.taglessMode - 'silent' | 'baseline' | 'ambient'
 * @param {number} config.baselineIntensity - floor for baseline mode
 * @param {number} config.decayHalfLife - ms, exponential tail
 * @param {Object} config.patterns - character's pattern library
 * @param {string} config.ambientPattern - ambient pattern name
 * @returns {Array<{t:number, track:string, intensity:number, duration:number}>}
 */
export function resolveBlock(block, config = {}) {
  const clamps = mergeClamps(config.clamps, config.characterClamps);
  const slider = typeof config.slider === 'number' ? config.slider : 1.0;
  const tags = block.tags || [];

  // Apply per-message tag cap (§2.5)
  const capped = tags.slice(0, clamps.tagsPerMessageCap);
  const discarded = tags.length - capped.length;

  // Build raw event timeline from tags
  let t = 0;  // running time offset in ms
  const events = [];

  for (const tag of capped) {
    if (tag.type === 'pattern' && tag.patternName) {
      // Resolve named pattern into event sequence
      const patternEvents = resolvePattern(tag, config.patterns || {}, clamps, t);
      for (const pe of patternEvents) {
        events.push(pe);
      }
      // Advance time by pattern's total duration
      const patternDur = patternEvents.reduce((max, e) => Math.max(max, e.t + e.duration - t), 0);
      t += patternDur;
    } else {
      // Atomic tag → single event
      const clamped = clampTag(tag, clamps);
      events.push({
        t,
        track: clamped.track || 'vibe',
        intensity: clamped.intensity,
        duration: clamped.duration,
      });
      t += clamped.duration;
    }

    // Min gap between tags (§2.5)
    if (clamps.minTagGap > 0) {
      t += clamps.minTagGap;
    }
  }

  // Tagless block fallback (§3.6b)
  if (events.length === 0 && block.proseLength > 0) {
    const readingDuration = estimateReadingDuration(block.proseLength);
    const taglessEvents = resolveTaglessBlock(config, clamps, readingDuration);
    for (const e of taglessEvents) events.push(e);
  }

  // §3.6(a) Decay bridging — exponential tail after explicit events
  const halfLife = typeof config.decayHalfLife === 'number' ? config.decayHalfLife : 2000;
  if (halfLife > 0 && events.length > 0) {
    const decayEvents = generateDecayTail(events, halfLife, clamps);
    for (const de of decayEvents) events.push(de);
  }

  // Apply slider multiplier to all intensities
  for (const event of events) {
    event.intensity = Math.max(0, Math.min(1, event.intensity * slider));
  }

  // Sort by time offset
  events.sort((a, b) => a.t - b.t);

  // Attach metadata for UI
  const meta = {
    tagCount: capped.length,
    discardedCount: discarded,
    totalDuration: events.reduce((max, e) => Math.max(max, e.t + e.duration), 0),
    isSynthetic: capped.length === 0 && events.length > 0,
  };

  return { events, meta };
}

/**
 * Clamp a single tag's intensity and duration to ceiling values.
 */
function clampTag(tag, clamps) {
  return {
    ...tag,
    intensity: Math.min(tag.intensity || 0, clamps.intensityCeiling),
    duration: Math.min(tag.duration || 0, clamps.durationCeiling),
    _clamped: tag.intensity > clamps.intensityCeiling || tag.duration > clamps.durationCeiling,
  };
}

/**
 * Resolve a named pattern into a sequence of events.
 * Falls back to a single intensity event if pattern is unknown.
 */
function resolvePattern(tag, patterns, clamps, startT) {
  const name = tag.patternName;
  // Look up in character patterns + built-in library
  const pattern = getPattern(name, patterns);

  if (!pattern || !pattern.tracks) {
    // Unknown pattern → single intensity event with defaults
    return [{
      t: startT,
      track: tag.track || 'vibe',
      intensity: Math.min(tag.intensity || 0.5, clamps.intensityCeiling),
      duration: Math.min(tag.duration || 3000, clamps.patternDurationCeiling),
    }];
  }

  // Scale the pattern timeline by intensity/duration overrides
  const intensityScale = tag.intensity || 1.0;
  const durationScale = tag.duration
    ? tag.duration / (pattern.totalDuration || tag.duration)
    : 1.0;

  const events = [];
  for (const [trackName, timeline] of Object.entries(pattern.tracks)) {
    for (const point of timeline) {
      const rawT = (point.t || 0) * durationScale;
      const rawD = (point.d || 0) * durationScale;
      const rawI = (point.i || 0) * intensityScale;

      events.push({
        t: startT + rawT,
        track: trackName,
        intensity: Math.min(rawI, clamps.intensityCeiling),
        duration: Math.min(rawD, clamps.durationCeiling),
      });
    }
  }

  // Enforce pattern duration ceiling
  const totalDur = events.reduce((max, e) => Math.max(max, (e.t - startT) + e.duration), 0);
  if (totalDur > clamps.patternDurationCeiling) {
    const scale = clamps.patternDurationCeiling / totalDur;
    for (const e of events) {
      e.t = startT + (e.t - startT) * scale;
      e.duration *= scale;
    }
  }

  return events;
}

/**
 * Generate a synthetic event for a tagless block.
 */
function resolveTaglessBlock(config, clamps, readingDuration) {
  const mode = config.taglessMode || 'silent';

  if (mode === 'silent') {
    return []; // No output — just decay tail from previous block
  }

  if (mode === 'baseline') {
    const floor = Math.min(config.baselineIntensity || 0.15, clamps.intensityCeiling);
    return [{
      t: 0,
      track: 'vibe',
      intensity: floor,
      duration: readingDuration,
    }];
  }

  if (mode === 'ambient' && config.ambientPattern && config.patterns) {
    const pattern = config.patterns[config.ambientPattern];
    if (pattern) {
      return resolvePattern(
        { patternName: config.ambientPattern, track: 'vibe', intensity: 1.0, duration: null },
        config.patterns,
        clamps,
        0
      );
    }
    // Ambient pattern not found → fall back to baseline
    const floor = Math.min(config.baselineIntensity || 0.15, clamps.intensityCeiling);
    return [{
      t: 0,
      track: 'vibe',
      intensity: floor,
      duration: readingDuration,
    }];
  }

  return [];
}

/**
 * Estimate reading duration from prose length (~200 wpm).
 */
function estimateReadingDuration(charCount) {
  const wordsApprox = charCount / 5;
  const minutes = wordsApprox / 200;
  return Math.max(1000, Math.round(minutes * 60 * 1000));
}

/**
 * Generate exponential decay tail events after a block's explicit events.
 *
 * For each track that has explicit events, appends a series of
 * decreasing intensity steps starting after the last event ends.
 * Decay follows: I(t) = peak × 0.5^(t / halfLife)
 *
 * Steps are sampled every 200ms until intensity drops below 0.02.
 * The decay tail is capped at 3× halfLife to prevent infinite tails.
 *
 * @param {Array} events - explicit events (pre-slider)
 * @param {number} halfLife - decay half-life in ms
 * @param {Object} clamps - clamp config
 * @returns {Array} decay tail events
 */
function generateDecayTail(events, halfLife, clamps) {
  if (halfLife <= 0 || events.length === 0) return [];

  // Find the last event per track and its peak intensity
  const trackPeaks = {};
  for (const e of events) {
    const endTime = e.t + e.duration;
    if (!trackPeaks[e.track] || endTime > trackPeaks[e.track].endTime) {
      trackPeaks[e.track] = { endTime, intensity: e.intensity };
    }
  }

  const decayEvents = [];
  const STEP_MS = 200;
  const MIN_INTENSITY = 0.02;
  const MAX_TAIL = halfLife * 3;

  for (const [track, peak] of Object.entries(trackPeaks)) {
    if (peak.intensity <= MIN_INTENSITY) continue;

    let elapsed = 0;
    while (elapsed < MAX_TAIL) {
      elapsed += STEP_MS;
      const decayed = peak.intensity * Math.pow(0.5, elapsed / halfLife);
      if (decayed < MIN_INTENSITY) break;

      decayEvents.push({
        t: peak.endTime + elapsed,
        track,
        intensity: Math.min(decayed, clamps.intensityCeiling || 1),
        duration: STEP_MS,
        _decay: true, // metadata flag for UI
      });
    }

    // Final zero event to cleanly end the tail
    decayEvents.push({
      t: peak.endTime + elapsed + STEP_MS,
      track,
      intensity: 0,
      duration: STEP_MS,
      _decay: true,
    });

    // Record peak for cross-block decay state
    recordDecayPeak(track, peak.intensity, peak.endTime);
  }

  return decayEvents;
}

// Export internals for testing
export { clampTag, resolvePattern, resolveTaglessBlock, estimateReadingDuration, generateDecayTail };

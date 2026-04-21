// haptic/scheduler.js
//
// Pipelined block scheduler (§4).
//
// Single-threaded async loop. Dequeues one block from the ready queue,
// resolves it through the envelope resolver, dispatches events over
// their timeline, awaits completion, then dequeues the next block.
//
// Every await is abortable via a cancel token so pause/stop/error
// can interrupt mid-block. The scheduler never calls the backend
// directly — it goes through backend.js's executeEvent/stopAll.
//
// Pipeline: while block N is executing, block N+1 is already in the
// queue. This hides parsing latency from the user.

import { resolveBlock } from './resolver.js';
import { executeEvent, stopAll, isHapticReady } from './backend.js';
import { speak, getActiveTtsBackend } from './tts.js';
import {
  getBusState,
  busActivate,
  busStop,
  onBusEvent,
} from './control_bus.js';
import { loadHapticSettings } from './settings.js';

// ---- Ready queue (FIFO) ----

const _queue = [];
let _running = false;
let _cancelToken = null;
let _config = null;

/**
 * Enqueue a parsed block for scheduled dispatch.
 * Called by the parser when a paragraph block completes.
 *
 * @param {Object} block - { index, tags, prose, proseLength }
 */
export function enqueueBlock(block) {
  _queue.push(block);
  // Auto-start the scheduler if not already running
  if (!_running) {
    _startLoop();
  }
}

/**
 * Flush the queue and stop the scheduler.
 * Called on stream end, disconnect, or error.
 */
export function flushQueue() {
  _queue.length = 0;
  _cancelCurrentBlock();
}

/**
 * Get current queue depth (for diagnostics).
 */
export function getQueueDepth() {
  return _queue.length;
}

// ---- Cancel token ----

function _createCancelToken() {
  let _cancelled = false;
  return {
    get cancelled() { return _cancelled; },
    cancel() { _cancelled = true; },
  };
}

function _cancelCurrentBlock() {
  if (_cancelToken) {
    _cancelToken.cancel();
    _cancelToken = null;
  }
}

// ---- Scheduler loop ----

async function _startLoop() {
  if (_running) return;
  _running = true;

  // Load config once per loop session
  try {
    const settings = await loadHapticSettings();
    _config = {
      clamps: settings.clamps,
      slider: settings.intensitySlider,
      taglessMode: settings.taglessBlockMode,
      baselineIntensity: settings.baselineIntensity,
      decayHalfLife: settings.decayHalfLife,
      // Character-specific config is injected by the caller via
      // setCharacterConfig() before blocks start flowing.
      characterClamps: _characterConfig.clampOverrides || null,
      patterns: _characterConfig.patterns || {},
      ambientPattern: _characterConfig.ambientPattern || null,
    };
  } catch {
    _config = {};
  }

  busActivate('scheduler-start');

  while (_queue.length > 0) {
    // Check if we should stop
    const state = getBusState();
    if (state === 'paused' || state === 'error' || state === 'idle') {
      break;
    }

    if (!isHapticReady()) {
      break;
    }

    const block = _queue.shift();
    _cancelToken = _createCancelToken();

    try {
      await _dispatchBlock(block, _cancelToken);
    } catch (err) {
      if (_cancelToken && _cancelToken.cancelled) {
        // Expected — block was cancelled by pause/stop
        break;
      }
      console.warn('[haptic:scheduler] block dispatch error:', err && err.message);
    }

    // Block cooldown (§2.5)
    const cooldown = _config && _config.clamps && _config.clamps.blockCooldown;
    if (cooldown > 0 && !(_cancelToken && _cancelToken.cancelled)) {
      await _abortableSleep(cooldown, _cancelToken);
    }
  }

  _running = false;
  _cancelToken = null;

  // If queue drained naturally (not by cancel), transition to idle
  if (getBusState() === 'active') {
    busStop('queue-drained');
  }
}

/**
 * Dispatch a single block: resolve haptic events + speak prose in parallel.
 * Block duration = max(hapticEnd, utteranceEnd) per §8.
 */
async function _dispatchBlock(block, token) {
  const { events, meta } = resolveBlock(block, _config || {});

  // Start TTS narration in parallel (non-blocking)
  let ttsPromise = null;
  if (block.prose && block.prose.trim() && getActiveTtsBackend() && _voiceConfig) {
    ttsPromise = speak(block.prose.trim(), _voiceConfig).catch(() => {});
  }

  // Dispatch haptic events in timeline order
  if (events.length > 0) {
    let lastT = 0;
    for (const event of events) {
      if (token.cancelled) return;

      const waitMs = event.t - lastT;
      if (waitMs > 0) {
        await _abortableSleep(waitMs, token);
        if (token.cancelled) return;
      }

      await executeEvent({
        track: event.track,
        intensity: event.intensity,
        duration: event.duration,
      });

      lastT = event.t;
    }

    // Wait for the last haptic event to complete
    const lastEvent = events[events.length - 1];
    if (lastEvent && lastEvent.duration > 0 && !token.cancelled) {
      await _abortableSleep(lastEvent.duration, token);
    }
  }

  // Block duration = max(hapticEnd, utteranceEnd)
  // Wait for TTS to finish if it's still speaking
  if (ttsPromise && !token.cancelled) {
    await ttsPromise;
  }
}

/**
 * Sleep that can be interrupted by a cancel token.
 */
function _abortableSleep(ms, token) {
  return new Promise((resolve) => {
    if (token && token.cancelled) { resolve(); return; }
    const timer = setTimeout(() => resolve(), ms);
    // Check periodically for cancellation
    const check = setInterval(() => {
      if (token && token.cancelled) {
        clearTimeout(timer);
        clearInterval(check);
        resolve();
      }
    }, 50);
    // Clean up interval when timer fires naturally
    const origResolve = resolve;
    setTimeout(() => clearInterval(check), ms + 10);
  });
}

// ---- Character config ----

let _characterConfig = {};
let _voiceConfig = null; // { voiceName, rate, pitch }

/**
 * Set character-specific configuration for the current session.
 * Called when a character with haptics loads.
 *
 * @param {Object} haptics - character.haptics (normalized)
 */
export function setCharacterConfig(haptics) {
  _characterConfig = haptics || {};
}

/**
 * Set the voice configuration for TTS narration.
 * Called when a character with voice config loads.
 *
 * @param {Object} voice - { voiceName, rate, pitch }
 */
export function setVoiceConfig(voice) {
  _voiceConfig = voice || null;
}

/**
 * Clear character config (on thread/character switch).
 */
export function clearCharacterConfig() {
  _characterConfig = {};
  _voiceConfig = null;
}

// ---- Bus integration ----

// Stop scheduler on bus events
onBusEvent('stop', () => {
  flushQueue();
  _running = false;
});

onBusEvent('pause', () => {
  _cancelCurrentBlock();
  // Don't flush queue — resume will re-start the loop
});

onBusEvent('resume', () => {
  if (_queue.length > 0 && !_running) {
    _startLoop();
  }
});

// ---- Exports for testing ----

export function _isRunning() { return _running; }
export function _getConfig() { return _config; }

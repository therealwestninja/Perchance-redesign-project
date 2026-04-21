// haptic/tts.js
//
// Text-to-speech narration subsystem (§8).
//
// Pluggable TTS backend contract, plugin registry, and two built-in
// free backends: Web Speech API and StreamElements TTS.
//
// Narration is off by default. When enabled, the paragraph-block
// scheduler drives TTS utterances in lockstep with haptic envelopes.

import { onBusEvent } from './control_bus.js';

// ---- TTS Backend registry ----

const _ttsBackends = new Map();
let _activeTtsId = null;

/**
 * Register a TTS backend plugin.
 */
export function registerTtsBackend(backend) {
  if (!backend || !backend.id) return;
  _ttsBackends.set(backend.id, backend);
}

/**
 * List registered TTS backends.
 */
export function listTtsBackends() {
  return Array.from(_ttsBackends.values()).map(b => ({
    id: b.id,
    displayName: b.displayName || b.id,
    capabilities: b.capabilities || {},
  }));
}

/**
 * Set active TTS backend.
 */
export function setActiveTtsBackend(id) {
  if (!_ttsBackends.has(id)) return false;
  // Stop current backend if switching
  if (_activeTtsId && _activeTtsId !== id) {
    const prev = _ttsBackends.get(_activeTtsId);
    if (prev) try { prev.stop(); } catch {}
  }
  _activeTtsId = id;
  return true;
}

/**
 * Get active TTS backend.
 */
export function getActiveTtsBackend() {
  if (!_activeTtsId) return null;
  return _ttsBackends.get(_activeTtsId) || null;
}

// ---- Unified TTS API ----

/**
 * Speak text using the active TTS backend.
 *
 * @param {string} text
 * @param {Object} voiceConfig - { voiceName, rate, pitch }
 * @returns {Promise<void>} resolves when utterance ends
 */
export async function speak(text, voiceConfig = {}) {
  const backend = getActiveTtsBackend();
  if (!backend) return;

  try {
    const handle = backend.speak({
      text: text.slice(0, 2000), // max_utterance_length clamp
      voiceId: voiceConfig.voiceName || null,
      rate: voiceConfig.rate || 1.0,
      pitch: voiceConfig.pitch || 1.0,
    });
    if (handle && handle.promise) {
      await handle.promise;
    }
  } catch (err) {
    console.warn('[haptic:tts] speak failed:', err && err.message);
  }
}

/**
 * Stop all TTS playback.
 */
export async function stopTts() {
  const backend = getActiveTtsBackend();
  if (!backend) return;
  try { await backend.stop(); } catch {}
}

/**
 * List available voices on the active backend.
 */
export function listVoices() {
  const backend = getActiveTtsBackend();
  if (!backend || !backend.listVoices) return [];
  try { return backend.listVoices(); } catch { return []; }
}

// ---- Voice selection ladder (§8) ----

/**
 * Find the best matching voice for a character's preferences.
 *
 * Ladder: exact name → fuzzy (Levenshtein ≤ 2) → language → first available.
 *
 * @param {string} preferredName
 * @param {string} lang - page language code (e.g. 'en')
 * @returns {Object|null} matched voice
 */
export function findBestVoice(preferredName, lang) {
  const voices = listVoices();
  if (voices.length === 0) return null;

  // 1. Exact name match
  if (preferredName) {
    const lower = preferredName.toLowerCase();
    const exact = voices.find(v => (v.name || '').toLowerCase() === lower);
    if (exact) return exact;

    // 2. Fuzzy match (Levenshtein ≤ 2)
    for (const v of voices) {
      const vName = (v.name || '').toLowerCase();
      if (_levenshtein(lower, vName) <= 2) return v;
    }
  }

  // 3. Language match
  if (lang) {
    const langMatch = voices.find(v => (v.lang || '').startsWith(lang));
    if (langMatch) return langMatch;
  }

  // 4. First available
  return voices[0];
}

function _levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] = Math.min(m[i-1][j]+1, m[i][j-1]+1, m[i-1][j-1]+(b[i-1]===a[j-1]?0:1));
    }
  }
  return m[b.length][a.length];
}

// ---- Built-in: Web Speech API plugin ----

const webSpeechPlugin = {
  id: 'web-speech',
  displayName: 'Web Speech API',
  capabilities: { voices: true, rateControl: true, pitchControl: true, offline: true, boundaryEvents: true },

  listVoices() {
    if (typeof speechSynthesis === 'undefined') return [];
    return speechSynthesis.getVoices().map(v => ({
      id: v.voiceURI,
      name: v.name,
      lang: v.lang,
      offline: v.localService,
    }));
  },

  speak(utterance) {
    if (typeof speechSynthesis === 'undefined') {
      return { promise: Promise.resolve(), stop: () => {} };
    }

    const u = new SpeechSynthesisUtterance(utterance.text);
    u.rate = Math.max(0.1, Math.min(10, utterance.rate || 1.0));
    u.pitch = Math.max(0, Math.min(2, utterance.pitch || 1.0));

    // Match voice by name/id
    if (utterance.voiceId) {
      const voices = speechSynthesis.getVoices();
      const match = voices.find(v =>
        v.name === utterance.voiceId || v.voiceURI === utterance.voiceId
      );
      if (match) u.voice = match;
    }

    let _resolve;
    const promise = new Promise(resolve => { _resolve = resolve; });

    u.onend = () => _resolve();
    u.onerror = () => _resolve(); // don't reject — narration failure is non-blocking

    speechSynthesis.speak(u);

    return {
      promise,
      stop: () => { speechSynthesis.cancel(); _resolve(); },
      onBoundary: null, // Web Speech boundary events are uneven
    };
  },

  async stop() {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }
  },

  on() {}, // event listeners — minimal for built-in
};

// ---- Built-in: StreamElements TTS plugin ----

const streamElementsPlugin = {
  id: 'streamelements',
  displayName: 'StreamElements TTS',
  capabilities: { voices: true, rateControl: false, pitchControl: false, offline: false, boundaryEvents: false },

  _voices: [
    { id: 'Brian', name: 'Brian', lang: 'en-GB' },
    { id: 'Amy', name: 'Amy', lang: 'en-GB' },
    { id: 'Emma', name: 'Emma', lang: 'en-GB' },
    { id: 'Joanna', name: 'Joanna', lang: 'en-US' },
    { id: 'Matthew', name: 'Matthew', lang: 'en-US' },
    { id: 'Ivy', name: 'Ivy', lang: 'en-US' },
    { id: 'Justin', name: 'Justin', lang: 'en-US' },
    { id: 'Kendra', name: 'Kendra', lang: 'en-US' },
    { id: 'Joey', name: 'Joey', lang: 'en-US' },
    { id: 'Salli', name: 'Salli', lang: 'en-US' },
  ],

  _currentAudio: null,

  listVoices() {
    return this._voices.map(v => ({ ...v, offline: false }));
  },

  speak(utterance) {
    const voice = utterance.voiceId || 'Brian';
    const text = encodeURIComponent(utterance.text.slice(0, 500)); // SE has shorter limits
    const url = `https://api.streamelements.com/kappa/v2/speech?voice=${voice}&text=${text}`;

    let _resolve;
    const promise = new Promise(resolve => { _resolve = resolve; });

    const audio = new Audio(url);
    this._currentAudio = audio;

    audio.onended = () => { this._currentAudio = null; _resolve(); };
    audio.onerror = () => { this._currentAudio = null; _resolve(); };
    audio.play().catch(() => _resolve());

    return {
      promise,
      stop: () => { audio.pause(); audio.currentTime = 0; this._currentAudio = null; _resolve(); },
    };
  },

  async stop() {
    if (this._currentAudio) {
      this._currentAudio.pause();
      this._currentAudio.currentTime = 0;
      this._currentAudio = null;
    }
  },

  on() {},
};

// ---- Self-register built-in plugins ----

registerTtsBackend(webSpeechPlugin);
registerTtsBackend(streamElementsPlugin);

// Default to Web Speech (offline, universal)
setActiveTtsBackend('web-speech');

// ---- Bus integration: stop TTS on any stop event ----

onBusEvent('stop', () => stopTts());
onBusEvent('pause', () => stopTts());
onBusEvent('error', () => stopTts());

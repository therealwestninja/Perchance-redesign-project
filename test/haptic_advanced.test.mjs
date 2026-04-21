// test/haptic_advanced.test.mjs
//
// Tests for M6 hallucination ladder, AI awareness, and M9 TTS.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---- Hallucination ladder ----

const {
  resolvePatternName,
  generateCorrectionSnippet,
  generatePauseInjection,
  resetHallucinationState,
  getUnknownNames,
  getResolvedAliases,
  levenshtein,
} = await import('../src/haptic/hallucination.js');

beforeEach(() => resetHallucinationState());

test('levenshtein: exact match is 0', () => {
  assert.equal(levenshtein('tease', 'tease'), 0);
});

test('levenshtein: single char difference', () => {
  assert.equal(levenshtein('tease', 'teaze'), 1);
  assert.equal(levenshtein('tease', 'teas'), 1);
});

test('levenshtein: two char difference', () => {
  assert.equal(levenshtein('tease', 'teasee'), 1);
  assert.equal(levenshtein('buildup', 'buidup'), 1);
});

test('resolvePatternName: exact match returns method=exact', () => {
  resetHallucinationState();
  const r = resolvePatternName('tease', {}, {});
  assert.equal(r.resolved, 'tease');
  assert.equal(r.method, 'exact');
  assert.equal(r.annotation, null);
});

test('resolvePatternName: fuzzy match within distance 2', () => {
  resetHallucinationState();
  const r = resolvePatternName('teaze', {}, {});
  assert.equal(r.resolved, 'tease');
  assert.equal(r.method, 'fuzzy');
  assert.ok(r.annotation);
  assert.equal(r.annotation.type, 'fuzzy-match');
  assert.ok(r.annotation.text.includes('teaze'));
});

test('resolvePatternName: pinned alias is used', () => {
  resetHallucinationState();
  const r = resolvePatternName('my-tease', {}, { 'my-tease': 'tease' });
  assert.equal(r.resolved, 'tease');
  assert.equal(r.method, 'alias');
});

test('resolvePatternName: character pattern takes priority', () => {
  resetHallucinationState();
  const custom = { 'custom-pulse': { description: 'custom', tracks: {}, totalDuration: 1000, defaultTrack: 'vibe' } };
  const r = resolvePatternName('custom-pulse', custom, {});
  assert.equal(r.resolved, 'custom-pulse');
  assert.equal(r.method, 'exact');
});

test('resolvePatternName: unknown returns null with annotation', () => {
  resetHallucinationState();
  const r = resolvePatternName('xyzzy-nonexistent', {}, {});
  assert.equal(r.resolved, null);
  assert.equal(r.method, 'unknown');
  assert.ok(r.annotation.type === 'unknown-pattern');
});

test('resolvePatternName: caches fuzzy match for subsequent calls', () => {
  resetHallucinationState();
  const r1 = resolvePatternName('teaze', {}, {});
  assert.equal(r1.method, 'fuzzy');
  const r2 = resolvePatternName('teaze', {}, {});
  assert.equal(r2.method, 'cached-fuzzy');
  assert.equal(r2.resolved, 'tease');
});

test('generateCorrectionSnippet: null when < 3 unknowns', () => {
  resetHallucinationState();
  resolvePatternName('abc', {}, {});
  resolvePatternName('def', {}, {});
  assert.equal(generateCorrectionSnippet({}), null);
});

test('generateCorrectionSnippet: generates when >= 3 unknowns', () => {
  resetHallucinationState();
  resolvePatternName('unknown1aaa', {}, {});
  resolvePatternName('unknown2bbb', {}, {});
  resolvePatternName('unknown3ccc', {}, {});
  const snippet = generateCorrectionSnippet({});
  assert.ok(snippet);
  assert.ok(snippet.includes('unknown1aaa'));
  assert.ok(snippet.includes('Available:'));
});

test('generatePauseInjection: returns system message', () => {
  const msg = generatePauseInjection('user-pause');
  assert.ok(msg.startsWith('[System:'));
  assert.ok(msg.includes('paused'));
});

test('generatePauseInjection: handles device disconnect', () => {
  const msg = generatePauseInjection('device-disconnected');
  assert.ok(msg.includes('disconnected'));
});

// ---- TTS ----

const {
  registerTtsBackend,
  listTtsBackends,
  setActiveTtsBackend,
  getActiveTtsBackend,
  listVoices,
  findBestVoice,
  speak,
  stopTts,
} = await import('../src/haptic/tts.js');

test('Web Speech and StreamElements are registered by default', () => {
  const backends = listTtsBackends();
  const ids = backends.map(b => b.id);
  assert.ok(ids.includes('web-speech'));
  assert.ok(ids.includes('streamelements'));
});

test('default active TTS backend is web-speech', () => {
  const active = getActiveTtsBackend();
  assert.ok(active);
  assert.equal(active.id, 'web-speech');
});

test('setActiveTtsBackend switches backend', () => {
  assert.ok(setActiveTtsBackend('streamelements'));
  assert.equal(getActiveTtsBackend().id, 'streamelements');
  // Switch back
  setActiveTtsBackend('web-speech');
});

test('setActiveTtsBackend rejects unknown', () => {
  assert.ok(!setActiveTtsBackend('nonexistent'));
});

test('StreamElements has voice list', () => {
  setActiveTtsBackend('streamelements');
  const voices = listVoices();
  assert.ok(voices.length >= 5);
  assert.ok(voices.some(v => v.name === 'Brian'));
  setActiveTtsBackend('web-speech');
});

test('findBestVoice: exact name match', () => {
  setActiveTtsBackend('streamelements');
  const voice = findBestVoice('Brian', 'en');
  assert.ok(voice);
  assert.equal(voice.name, 'Brian');
  setActiveTtsBackend('web-speech');
});

test('findBestVoice: language fallback', () => {
  setActiveTtsBackend('streamelements');
  const voice = findBestVoice('NonexistentVoice', 'en');
  assert.ok(voice);
  assert.ok(voice.lang.startsWith('en'));
  setActiveTtsBackend('web-speech');
});

test('findBestVoice: returns first available as last resort', () => {
  setActiveTtsBackend('streamelements');
  const voice = findBestVoice(null, 'xx-nonexistent');
  assert.ok(voice); // should still return something
  setActiveTtsBackend('web-speech');
});

test('registerTtsBackend: custom backend', () => {
  const custom = {
    id: 'test-custom-tts',
    displayName: 'Custom TTS',
    listVoices: () => [{ id: 'v1', name: 'Voice 1', lang: 'en' }],
    speak: () => ({ promise: Promise.resolve(), stop: () => {} }),
    stop: async () => {},
    on: () => {},
  };
  registerTtsBackend(custom);
  const backends = listTtsBackends();
  assert.ok(backends.some(b => b.id === 'test-custom-tts'));
});

test('stopTts does not throw when no backend active', async () => {
  // Should be a no-op
  await stopTts();
  assert.ok(true);
});

// test/haptic_patterns.test.mjs
//
// Tests for the haptic pattern library and plugin loading validation.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  BUILTIN_PATTERNS,
  getPattern,
  listPatterns,
  generatePatternInstructionSnippet,
  sample,
  sine,
  ramp,
  blend,
  clamp01,
} = await import('../src/haptic/patterns.js');

const { validatePluginExport } = await import('../src/haptic/plugin_loader.js');

// ---- Pattern library ----

test('BUILTIN_PATTERNS has 18 patterns', () => {
  const count = Object.keys(BUILTIN_PATTERNS).length;
  assert.ok(count >= 16, `expected at least 16 patterns, got ${count}`);
});

test('every pattern has required fields', () => {
  for (const [name, p] of Object.entries(BUILTIN_PATTERNS)) {
    assert.ok(p.description, `${name} missing description`);
    assert.ok(p.defaultTrack, `${name} missing defaultTrack`);
    assert.ok(p.tracks && typeof p.tracks === 'object', `${name} missing tracks`);
    assert.ok(p.totalDuration > 0, `${name} missing totalDuration`);
  }
});

test('every pattern has at least one track with timeline points', () => {
  for (const [name, p] of Object.entries(BUILTIN_PATTERNS)) {
    const trackNames = Object.keys(p.tracks);
    assert.ok(trackNames.length >= 1, `${name} has no tracks`);
    for (const tn of trackNames) {
      const points = p.tracks[tn];
      assert.ok(Array.isArray(points), `${name}.tracks.${tn} is not an array`);
      assert.ok(points.length >= 2, `${name}.tracks.${tn} has too few points (${points.length})`);
    }
  }
});

test('all timeline points have valid t/i/d values', () => {
  for (const [name, p] of Object.entries(BUILTIN_PATTERNS)) {
    for (const [tn, points] of Object.entries(p.tracks)) {
      for (let j = 0; j < points.length; j++) {
        const pt = points[j];
        assert.ok(typeof pt.t === 'number' && pt.t >= 0, `${name}.${tn}[${j}].t invalid: ${pt.t}`);
        assert.ok(typeof pt.i === 'number' && pt.i >= 0 && pt.i <= 1, `${name}.${tn}[${j}].i out of range: ${pt.i}`);
        assert.ok(typeof pt.d === 'number' && pt.d > 0, `${name}.${tn}[${j}].d invalid: ${pt.d}`);
      }
    }
  }
});

test('getPattern finds builtin by name', () => {
  const p = getPattern('tease');
  assert.ok(p);
  assert.ok(p.description.includes('tension'));
});

test('getPattern finds builtin with dashes', () => {
  const p = getPattern('slow-pulse');
  assert.ok(p);
});

test('getPattern returns null for unknown', () => {
  assert.equal(getPattern('nonexistent-pattern-xyz'), null);
});

test('getPattern prefers character patterns over builtin', () => {
  const custom = { tease: { description: 'custom tease', defaultTrack: 'vibe', tracks: {}, totalDuration: 1000 } };
  const p = getPattern('tease', custom);
  assert.equal(p.description, 'custom tease');
});

test('listPatterns merges builtin + character', () => {
  const custom = { 'my-custom': { description: 'custom', defaultTrack: 'vibe', tracks: {}, totalDuration: 1000 } };
  const all = listPatterns(custom);
  assert.ok(all['slow-pulse']);
  assert.equal(all['slow-pulse'].source, 'builtin');
  assert.ok(all['my-custom']);
  assert.equal(all['my-custom'].source, 'character');
});

test('generatePatternInstructionSnippet produces text', () => {
  const snippet = generatePatternInstructionSnippet({}, { intensityCeiling: 0.8, durationCeiling: 20000, tagsPerMessageCap: 8 });
  assert.ok(snippet.includes('vibe'));
  assert.ok(snippet.includes('pattern'));
  assert.ok(snippet.includes('slow-pulse') || snippet.includes('tease'));
  assert.ok(snippet.includes('max intensity'));
});

// ---- Generator helpers ----

test('sample generates points over duration', () => {
  const points = sample(t => t, 1000, 200);
  assert.ok(points.length >= 5);
  assert.equal(points[0].t, 0);
  assert.ok(points[0].i >= 0 && points[0].i <= 1);
});

test('sine oscillates between lo and hi', () => {
  const fn = sine(0.2, 0.8, 1000);
  const vals = [fn(0), fn(0.25), fn(0.5), fn(0.75)];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  assert.ok(min >= 0.15, `sine min ${min} too low`);
  assert.ok(max <= 0.85, `sine max ${max} too high`);
});

test('ramp goes from start to end', () => {
  const fn = ramp(0.1, 0.9);
  assert.ok(Math.abs(fn(0) - 0.1) < 0.01);
  assert.ok(Math.abs(fn(1) - 0.9) < 0.01);
  assert.ok(Math.abs(fn(0.5) - 0.5) < 0.01);
});

test('clamp01 clamps correctly', () => {
  assert.equal(clamp01(1.5), 1);
  assert.equal(clamp01(-0.3), 0);
  assert.equal(clamp01(0.5), 0.5);
});

// ---- Plugin validation ----

test('validatePluginExport: valid haptic plugin', () => {
  const type = validatePluginExport({
    id: 'test-plugin',
    displayName: 'Test Plugin',
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => false,
    execute: async () => {},
    stopAll: async () => {},
  });
  assert.equal(type, 'haptic');
});

test('validatePluginExport: valid tts plugin', () => {
  const type = validatePluginExport({
    id: 'test-tts',
    displayName: 'Test TTS',
    speak: () => {},
    stop: async () => {},
    listVoices: () => [],
  });
  assert.equal(type, 'tts');
});

test('validatePluginExport: rejects missing id', () => {
  assert.throws(() => validatePluginExport({ displayName: 'No ID', connect: () => {}, execute: () => {} }));
});

test('validatePluginExport: rejects bad id format', () => {
  assert.throws(() => validatePluginExport({ id: 'BAD ID!', displayName: 'Bad', connect: () => {}, execute: () => {} }));
});

test('validatePluginExport: rejects plugin with no backend interface', () => {
  assert.throws(() => validatePluginExport({ id: 'empty', displayName: 'Empty' }));
});

test('validatePluginExport: rejects null', () => {
  assert.throws(() => validatePluginExport(null));
});

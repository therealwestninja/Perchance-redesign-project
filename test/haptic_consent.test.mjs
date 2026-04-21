// test/haptic_consent.test.mjs
//
// Tests for the consent gate and AI instruction injection.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { buildHapticInstruction } = await import('../src/haptic/consent.js');
const { normalizeHaptics, defaultClamps } = await import('../src/haptic/schema.js');
const { resetHallucinationState, resolvePatternName } = await import('../src/haptic/hallucination.js');

// ---- buildHapticInstruction ----

test('buildHapticInstruction: returns null when haptics disabled', () => {
  const result = buildHapticInstruction(normalizeHaptics(null));
  assert.equal(result, null);
});

test('buildHapticInstruction: returns null for undefined input', () => {
  assert.equal(buildHapticInstruction(undefined), null);
  assert.equal(buildHapticInstruction(null), null);
});

test('buildHapticInstruction: generates snippet when enabled', () => {
  const haptics = normalizeHaptics({ enabled: true });
  const result = buildHapticInstruction(haptics);
  assert.ok(result);
  assert.ok(result.includes('vibe'));
  assert.ok(result.includes('pattern'));
});

test('buildHapticInstruction: uses custom snippet when provided', () => {
  const haptics = normalizeHaptics({
    enabled: true,
    instructionSnippet: 'Custom: use <vibe> for gentle sensations.',
  });
  const result = buildHapticInstruction(haptics);
  assert.ok(result.includes('Custom:'));
});

test('buildHapticInstruction: includes clamp info', () => {
  const haptics = normalizeHaptics({ enabled: true });
  const result = buildHapticInstruction(haptics);
  assert.ok(result.includes('max intensity') || result.includes('Limits'));
});

test('buildHapticInstruction: includes correction feedback when requested', () => {
  resetHallucinationState();
  // Simulate 3 unknowns
  resolvePatternName('unknownA1', {}, {});
  resolvePatternName('unknownB2', {}, {});
  resolvePatternName('unknownC3', {}, {});

  const haptics = normalizeHaptics({ enabled: true });
  const result = buildHapticInstruction(haptics, { includeCorrectionFeedback: true });
  assert.ok(result.includes('unknowna1')); // lowercased by hallucination system
  assert.ok(result.includes('Available:'));

  resetHallucinationState();
});

test('buildHapticInstruction: lists character patterns', () => {
  const haptics = normalizeHaptics({
    enabled: true,
    patterns: {
      'gentle-touch': { description: 'A soft touch', defaultTrack: 'vibe', tracks: {}, totalDuration: 5000 },
    },
  });
  const result = buildHapticInstruction(haptics);
  assert.ok(result.includes('gentle-touch'));
});

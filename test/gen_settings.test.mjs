import { test } from 'node:test';
import assert from 'node:assert/strict';

// gen_settings exports getGenOverrides
const { getGenOverrides } = await import('../src/chat/gen_settings.js');

test('getGenOverrides: returns null values when no overrides set', () => {
  const result = getGenOverrides();
  assert.ok(typeof result === 'object');
  assert.equal(result.temperature, null);
  assert.equal(result.maxTokens, null);
});

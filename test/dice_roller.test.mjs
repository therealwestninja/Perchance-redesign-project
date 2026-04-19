import { test } from 'node:test';
import assert from 'node:assert/strict';

const { parseAndRoll } = await import('../src/chat/dice_roller.js');

test('parseAndRoll: basic d20 roll', () => {
  const result = parseAndRoll('/roll 1d20');
  assert.ok(result.startsWith('🎲'));
  assert.ok(result.includes('1d20'));
  // Extract the number after →
  const num = parseInt(result.match(/→ \*\*(\d+)\*\*/)[1], 10);
  assert.ok(num >= 1 && num <= 20, `d20 result ${num} should be 1-20`);
});

test('parseAndRoll: d6 roll', () => {
  const result = parseAndRoll('/roll 1d6');
  const num = parseInt(result.match(/→ \*\*(\d+)\*\*/)[1], 10);
  assert.ok(num >= 1 && num <= 6, `d6 result ${num} should be 1-6`);
});

test('parseAndRoll: multiple dice 2d6', () => {
  const result = parseAndRoll('/roll 2d6');
  assert.ok(result.includes('2d6'));
  // Should show individual rolls in parens
  assert.ok(result.includes('('), 'multiple dice should show individual rolls');
  const num = parseInt(result.match(/→ \*\*(\d+)\*\*/)[1], 10);
  assert.ok(num >= 2 && num <= 12, `2d6 result ${num} should be 2-12`);
});

test('parseAndRoll: modifier +5', () => {
  const result = parseAndRoll('/roll 1d20+5');
  assert.ok(result.includes('+5'));
  const num = parseInt(result.match(/→ \*\*(\d+)\*\*/)[1], 10);
  assert.ok(num >= 6 && num <= 25, `1d20+5 result ${num} should be 6-25`);
});

test('parseAndRoll: negative modifier -2', () => {
  const result = parseAndRoll('/roll 1d20-2');
  assert.ok(result.includes('-2'));
  const num = parseInt(result.match(/→ \*\*(\d+)\*\*/)[1], 10);
  assert.ok(num >= -1 && num <= 18, `1d20-2 result ${num} should be -1 to 18`);
});

test('parseAndRoll: implicit 1 die (d20 = 1d20)', () => {
  const result = parseAndRoll('/roll d20');
  const num = parseInt(result.match(/→ \*\*(\d+)\*\*/)[1], 10);
  assert.ok(num >= 1 && num <= 20);
});

test('parseAndRoll: invalid dice count rejected', () => {
  const result = parseAndRoll('/roll 50d6');
  assert.ok(result.includes('Invalid'));
});

test('parseAndRoll: invalid sides rejected', () => {
  const result = parseAndRoll('/roll 1d200');
  assert.ok(result.includes('Invalid'));
});

test('parseAndRoll: non-dice input gives random roll', () => {
  const result = parseAndRoll('/roll something');
  assert.ok(result.startsWith('🎲'));
  assert.ok(result.includes('rolls'));
});

test('parseAndRoll: case insensitive', () => {
  const result = parseAndRoll('/roll 1D20');
  const num = parseInt(result.match(/→ \*\*(\d+)\*\*/)[1], 10);
  assert.ok(num >= 1 && num <= 20);
});

test('parseAndRoll: 4d8 individual rolls shown', () => {
  const result = parseAndRoll('/roll 4d8');
  // Should have parens with comma-separated rolls
  const rollsMatch = result.match(/\(([^)]+)\)/);
  assert.ok(rollsMatch, 'should show individual rolls');
  const rolls = rollsMatch[1].split(',').map(s => parseInt(s.trim(), 10));
  assert.equal(rolls.length, 4, 'should have 4 individual rolls');
  for (const r of rolls) {
    assert.ok(r >= 1 && r <= 8, `individual roll ${r} should be 1-8`);
  }
});

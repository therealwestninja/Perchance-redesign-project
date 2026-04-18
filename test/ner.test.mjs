// test/ner.test.mjs
//
// Tests for memory/ner.js — proper-noun extraction and bubble labeling.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractProperNouns,
  extractSalientWords,
  bestLabel,
} from '../src/memory/ner.js';

// ---- extractProperNouns ----

test('extractProperNouns: single proper noun in a sentence', () => {
  const text = 'She went to see Elara about the matter.';
  const pn = extractProperNouns(text);
  assert.ok(pn.includes('Elara'));
});

test('extractProperNouns: skips sentence-initial capitalized words', () => {
  const text = 'She went home.';
  const pn = extractProperNouns(text);
  // "She" is sentence-initial single word, should be skipped
  assert.equal(pn.length, 0);
});

test('extractProperNouns: keeps multi-word capitalized phrases at sentence start', () => {
  const text = 'Captain Vex arrived.';
  const pn = extractProperNouns(text);
  // Multi-word phrase at start SHOULD be kept (it's likely a name, not just a capitalized first word)
  assert.ok(pn.some(p => p.includes('Vex')), `expected Vex in ${JSON.stringify(pn)}`);
});

test('extractProperNouns: handles possessives and hyphens', () => {
  const text = 'They visited Mary-Sue and Jean-Paul.';
  const pn = extractProperNouns(text);
  assert.ok(pn.some(p => p.includes('Mary-Sue')));
  assert.ok(pn.some(p => p.includes('Jean-Paul')));
});

test('extractProperNouns: repeats count toward frequency', () => {
  const text = 'Elara was sad. Then Elara laughed. Later, Elara left.';
  const pn = extractProperNouns(text);
  assert.equal(pn.filter(p => p === 'Elara').length, 2); // two non-sentence-initial occurrences
});

test('extractProperNouns: empty/null input returns []', () => {
  assert.deepEqual(extractProperNouns(''), []);
  assert.deepEqual(extractProperNouns(null), []);
});

test('extractProperNouns: text with no capitalization returns []', () => {
  assert.deepEqual(extractProperNouns('the quick brown fox'), []);
});

// ---- extractSalientWords ----

test('extractSalientWords: removes stopwords and short words', () => {
  const text = 'The quick brown fox jumps over a lazy dog';
  const words = extractSalientWords(text);
  assert.ok(!words.includes('the'));
  assert.ok(!words.includes('a'));
  assert.ok(words.includes('quick'));
  assert.ok(words.includes('brown'));
  assert.ok(words.includes('fox'));
});

test('extractSalientWords: lowercases everything', () => {
  const words = extractSalientWords('MAGIC was Rare');
  assert.ok(words.includes('magic'));
  assert.ok(words.includes('rare'));
  assert.ok(!words.includes('MAGIC'));
});

test('extractSalientWords: empty input → []', () => {
  assert.deepEqual(extractSalientWords(''), []);
  assert.deepEqual(extractSalientWords(null), []);
});

test('extractSalientWords: ignores non-word characters', () => {
  const words = extractSalientWords('magic, swords & spells!');
  assert.ok(words.includes('magic'));
  assert.ok(words.includes('swords'));
  assert.ok(words.includes('spells'));
});

// ---- bestLabel ----

test('bestLabel: picks most-frequent proper noun', () => {
  const text = 'Elara was sad. Then Elara laughed. Later Elara left for Vex.';
  // Elara appears 2x (non-sentence-initial), Vex once. Elara should win.
  assert.equal(bestLabel(text), 'Elara');
});

test('bestLabel: falls back to salient word when no proper noun', () => {
  const text = 'the magic is rare and the magic is ancient';
  const label = bestLabel(text);
  // Proper nouns: none (after sentence-init filter). Most-frequent salient word: magic, count 2
  assert.equal(label, 'Magic');
});

test('bestLabel: returns null for empty text', () => {
  assert.equal(bestLabel(''), null);
  assert.equal(bestLabel(null), null);
});

test('bestLabel: minCount filters low-frequency proper nouns', () => {
  const text = 'The magic spread through Elara.';
  // "Elara" appears once. With minCount=2, should skip and fall through.
  const withHighMinCount = bestLabel(text, { minCount: 2 });
  // Falls through to salient fallback — also with minCount=2 filter
  // so "magic" (count 1) wouldn't qualify there either → null.
  assert.equal(withHighMinCount, null);

  const withMinCount1 = bestLabel(text, { minCount: 1 });
  assert.equal(withMinCount1, 'Elara');
});

test('bestLabel: multi-word proper noun', () => {
  const text = 'They came from the Veil of Night. The Veil of Night beckoned.';
  const label = bestLabel(text);
  assert.ok(label && label.includes('Veil'));
});

test('bestLabel: handles all-stopwords gracefully', () => {
  const text = 'The the and the to of';
  assert.equal(bestLabel(text), null);
});

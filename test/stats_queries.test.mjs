// test/stats_queries.test.mjs — unit tests for the stat computation layer

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, countWordsInText, emptyStats } from '../src/stats/queries.js';

test('emptyStats returns all zeros / nulls', () => {
  const s = emptyStats();
  assert.equal(s.characterCount, 0);
  assert.equal(s.threadCount, 0);
  assert.equal(s.messageCount, 0);
  assert.equal(s.userMessageCount, 0);
  assert.equal(s.wordsWritten, 0);
  assert.equal(s.loreCount, 0);
  assert.equal(s.daysActive, 0);
  assert.equal(s.longestThread, 0);
  assert.equal(s.firstActivityTime, null);
  assert.equal(s.lastActivityTime, null);
});

test('countWordsInText handles edge cases', () => {
  assert.equal(countWordsInText(''), 0);
  assert.equal(countWordsInText(null), 0);
  assert.equal(countWordsInText(undefined), 0);
  assert.equal(countWordsInText('hello'), 1);
  assert.equal(countWordsInText('  hello   world  '), 2);
  assert.equal(countWordsInText('one two three four five'), 5);
  assert.equal(countWordsInText('line1\nline2\tline3'), 3);
  assert.equal(countWordsInText(42), 1); // coerces to "42"
});

test('computeStats counts user-message words only', () => {
  const messages = [
    { threadId: 1, author: 'user', content: 'hello there', creationTime: 1_700_000_000_000 },
    { threadId: 1, author: 'ai',   content: 'well hello to you my friend', creationTime: 1_700_000_001_000 },
    { threadId: 1, author: 'user', content: 'how are you doing', creationTime: 1_700_000_002_000 },
  ];
  const stats = computeStats({ messages });
  assert.equal(stats.messageCount, 3);
  assert.equal(stats.userMessageCount, 2);
  assert.equal(stats.wordsWritten, 2 + 4); // "hello there" + "how are you doing"
});

test('computeStats reads either content or message field', () => {
  const messages = [
    { author: 'user', content: 'alpha beta' },
    { author: 'user', message: 'gamma delta epsilon' },
  ];
  const stats = computeStats({ messages });
  assert.equal(stats.wordsWritten, 5);
});

test('computeStats finds longest thread across many', () => {
  const messages = [
    { threadId: 1, author: 'user', content: 'a' },
    { threadId: 1, author: 'ai',   content: 'b' },
    { threadId: 2, author: 'user', content: 'c' },
    { threadId: 2, author: 'ai',   content: 'd' },
    { threadId: 2, author: 'user', content: 'e' },
    { threadId: 3, author: 'user', content: 'f' },
  ];
  const stats = computeStats({ messages });
  assert.equal(stats.longestThread, 3);
});

test('computeStats counts distinct active days', () => {
  const day = 86_400_000;
  const messages = [
    { author: 'user', content: 'a', creationTime: 0 * day },
    { author: 'user', content: 'b', creationTime: 0 * day + 3_600_000 }, // same day
    { author: 'user', content: 'c', creationTime: 1 * day + 100 },
    { author: 'user', content: 'd', creationTime: 5 * day + 500 },
  ];
  const stats = computeStats({ messages });
  assert.equal(stats.daysActive, 3);
});

test('computeStats returns earliest and latest activity times', () => {
  const messages = [
    { author: 'user', content: 'a', creationTime: 5000 },
    { author: 'user', content: 'b', creationTime: 1000 },
    { author: 'user', content: 'c', creationTime: 3000 },
    { author: 'ai',   content: 'd', creationTime: 999 }, // AI msgs don't count
    { author: 'user', content: 'e', creationTime: 9000 },
  ];
  const stats = computeStats({ messages });
  assert.equal(stats.firstActivityTime, 1000);
  assert.equal(stats.lastActivityTime, 9000);
});

test('computeStats is defensive against malformed input', () => {
  // None of these should throw.
  const messages = [
    null,
    undefined,
    { author: 'user', content: 'real' },
    { /* no author */ content: 'ignored' },
    { author: 'user', content: null },
    { author: 'user', content: 'x', creationTime: 'not a number' },
    {},
  ];
  const stats = computeStats({ messages });
  assert.equal(stats.userMessageCount, 3); // 3 objects with author === 'user'
  assert.equal(stats.wordsWritten, 2); // "real" + "x"
});

test('computeStats simple full scenario', () => {
  const characters = [{ id: 1 }, { id: 2 }];
  const threads = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const lore = [{ id: 'L1' }, { id: 'L2' }];
  const messages = [
    { threadId: 'a', author: 'user', content: 'test message', creationTime: 1000 },
  ];
  const s = computeStats({ characters, threads, messages, lore });
  assert.equal(s.characterCount, 2);
  assert.equal(s.threadCount, 3);
  assert.equal(s.loreCount, 2);
  assert.equal(s.wordsWritten, 2);
  assert.equal(s.firstActivityTime, 1000);
  assert.equal(s.lastActivityTime, 1000);
});

// test/utils_format.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatNumber,
  formatPercent,
  getInitialFromName,
  formatRelativeTime,
} from '../src/utils/format.js';

// ---------- formatNumber ----------

test('formatNumber inserts thousands separators', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(42), '42');
  assert.equal(formatNumber(1_000), '1,000');
  assert.equal(formatNumber(47_291), '47,291');
  assert.equal(formatNumber(1_000_000), '1,000,000');
});

test('formatNumber truncates non-integers to integer', () => {
  assert.equal(formatNumber(1234.89), '1,234');
});

test('formatNumber handles null/undefined/NaN safely', () => {
  assert.equal(formatNumber(null), '0');
  assert.equal(formatNumber(undefined), '0');
  assert.equal(formatNumber(NaN), '0');
  assert.equal(formatNumber('not a number'), '0');
});

// ---------- formatPercent ----------

test('formatPercent converts ratio to percent string', () => {
  assert.equal(formatPercent(0), '0%');
  assert.equal(formatPercent(0.5), '50%');
  assert.equal(formatPercent(0.62), '62%');
  assert.equal(formatPercent(1), '100%');
});

test('formatPercent supports fractional digits', () => {
  assert.equal(formatPercent(0.6234, 1), '62.3%');
  assert.equal(formatPercent(0.5, 2), '50.00%');
});

test('formatPercent clamps to [0, 1]', () => {
  assert.equal(formatPercent(-0.5), '0%');
  assert.equal(formatPercent(1.5), '100%');
});

test('formatPercent handles invalid input', () => {
  assert.equal(formatPercent(null), '0%');
  assert.equal(formatPercent(NaN), '0%');
});

// ---------- getInitialFromName ----------

test('getInitialFromName returns uppercased first letter', () => {
  assert.equal(getInitialFromName('Aria'), 'A');
  assert.equal(getInitialFromName('aria'), 'A');
  assert.equal(getInitialFromName('Aria Moonweaver'), 'A');
});

test('getInitialFromName handles blank / null', () => {
  assert.equal(getInitialFromName(''), '?');
  assert.equal(getInitialFromName('   '), '?');
  assert.equal(getInitialFromName(null), '?');
  assert.equal(getInitialFromName(undefined), '?');
});

test('getInitialFromName handles numeric input', () => {
  assert.equal(getInitialFromName(42), '4');
});

// ---------- formatRelativeTime ----------

test('formatRelativeTime returns "just now" for very recent', () => {
  const now = 1_700_000_000_000;
  assert.equal(formatRelativeTime(now, now), 'just now');
  assert.equal(formatRelativeTime(now - 30_000, now), 'just now');
});

test('formatRelativeTime handles minutes / hours / days', () => {
  const now = 1_700_000_000_000;
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  assert.equal(formatRelativeTime(now - 5 * min, now), '5 minutes ago');
  assert.equal(formatRelativeTime(now - 1 * min, now), '1 minute ago');
  assert.equal(formatRelativeTime(now - 3 * hour, now), '3 hours ago');
  assert.equal(formatRelativeTime(now - 2 * day, now), '2 days ago');
  assert.equal(formatRelativeTime(now - 10 * day, now), '1 week ago');
  assert.equal(formatRelativeTime(now - 45 * day, now), '1 month ago');
  assert.equal(formatRelativeTime(now - 400 * day, now), '1 year ago');
});

test('formatRelativeTime handles future / invalid', () => {
  const now = 1_700_000_000_000;
  assert.equal(formatRelativeTime(now + 10_000, now), 'just now'); // future
  assert.equal(formatRelativeTime(null), '');
  assert.equal(formatRelativeTime(NaN), '');
});

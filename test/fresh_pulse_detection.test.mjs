// test/fresh_pulse_detection.test.mjs
//
// Unit tests for detectFreshIncrease(previous, current) — the pure
// detector that decides whether the mini-card should fire the
// "friendly neighbor waving" pulse (pf-mini-card-fresh) on this
// refresh tick.
//
// The rule's three cases:
//   first render (previous = null) → never fresh (don't false-fire
//                                   on page load when user already
//                                   has pending items from last session)
//   count stayed / dropped         → not fresh
//   count strictly increased       → fresh — a new thing landed

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { detectFreshIncrease } = await import('../src/profile/index.js');

test('detectFreshIncrease: first render (previous=null) is never fresh', () => {
  assert.equal(detectFreshIncrease(null, 0), false);
  assert.equal(detectFreshIncrease(null, 5), false);
  assert.equal(detectFreshIncrease(null, 100), false);
});

test('detectFreshIncrease: previous=undefined also counts as first render', () => {
  // Guard against callers passing undefined rather than null.
  assert.equal(detectFreshIncrease(undefined, 3), false);
});

test('detectFreshIncrease: equal count is not fresh (ambient pulse continues)', () => {
  assert.equal(detectFreshIncrease(0, 0), false);
  assert.equal(detectFreshIncrease(3, 3), false);
  assert.equal(detectFreshIncrease(42, 42), false);
});

test('detectFreshIncrease: decreased count is not fresh (user just viewed something)', () => {
  assert.equal(detectFreshIncrease(5, 4), false);
  assert.equal(detectFreshIncrease(5, 0), false);
  assert.equal(detectFreshIncrease(100, 50), false);
});

test('detectFreshIncrease: strict increase fires the fresh pulse', () => {
  assert.equal(detectFreshIncrease(0, 1), true);
  assert.equal(detectFreshIncrease(3, 4), true);
  assert.equal(detectFreshIncrease(3, 10), true);
});

test('detectFreshIncrease: rising from a non-null zero works (first achievement unlock)', () => {
  // User opens profile with nothing pending (pendingCount=0), then a
  // new event lands — we SHOULD pulse fresh for it. Previous=0 is a
  // known-baseline, not a first-render null.
  assert.equal(detectFreshIncrease(0, 1), true);
});

test('detectFreshIncrease: coerces numeric-string inputs defensively', () => {
  // Settings/IDB paths occasionally hand back stringified numbers.
  // The rule should not false-compare '10' > '2' lexicographically.
  assert.equal(detectFreshIncrease('2', '10'), true);
  assert.equal(detectFreshIncrease('5', '5'),  false);
  assert.equal(detectFreshIncrease('5', '3'),  false);
});

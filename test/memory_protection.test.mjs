// test/memory_protection.test.mjs
//
// Tests for entry-ID hashing and the session protection store.
// Adapted from PMT's test/protection.test.js — same assertions,
// rewritten for our node:test convention.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createSessionProtectionStore,
  getEntryId,
} from '../src/memory/protection.js';

// ---- createSessionProtectionStore ----

test('session store starts empty', () => {
  const s = createSessionProtectionStore();
  assert.equal(s.size(), 0);
  assert.deepEqual(s.values(), []);
});

test('protect adds id', () => {
  const s = createSessionProtectionStore();
  s.protect('a');
  assert.ok(s.has('a'));
  assert.equal(s.size(), 1);
});

test('protect is idempotent', () => {
  const s = createSessionProtectionStore();
  s.protect('a');
  s.protect('a');
  s.protect('a');
  assert.equal(s.size(), 1);
});

test('toggle removes existing id', () => {
  const s = createSessionProtectionStore();
  s.protect('a');
  assert.equal(s.toggle('a'), false);
  assert.ok(!s.has('a'));
});

test('toggle adds missing id', () => {
  const s = createSessionProtectionStore();
  assert.equal(s.toggle('b'), true);
  assert.ok(s.has('b'));
});

test('unprotect removes id', () => {
  const s = createSessionProtectionStore();
  s.protect('x');
  s.unprotect('x');
  assert.ok(!s.has('x'));
  assert.equal(s.size(), 0);
});

test('clear empties the store', () => {
  const s = createSessionProtectionStore();
  s.protect('x');
  s.protect('y');
  s.clear();
  assert.equal(s.size(), 0);
  assert.deepEqual(s.values(), []);
});

// ---- getEntryId ----

test('entry id trims surrounding whitespace', () => {
  const id1 = getEntryId('  Hello world  ');
  const id2 = getEntryId('Hello world');
  assert.equal(id1, id2);
});

test('entry id distinguishes changed content', () => {
  const id1 = getEntryId('Hello world');
  const id2 = getEntryId('Hello world!');
  assert.notEqual(id1, id2);
});

test('entry id has stable e_ + 8-hex format', () => {
  const id = getEntryId('anything');
  assert.match(id, /^e_[0-9a-f]{8}$/);
});

test('entry id handles nullish input without throwing', () => {
  assert.match(getEntryId(null), /^e_[0-9a-f]{8}$/);
  assert.match(getEntryId(undefined), /^e_[0-9a-f]{8}$/);
  assert.match(getEntryId(''), /^e_[0-9a-f]{8}$/);
});

test('entry id is deterministic across calls', () => {
  const a = getEntryId('the quick brown fox');
  const b = getEntryId('the quick brown fox');
  assert.equal(a, b);
});

test('entry id varies across distinct inputs (collision sanity)', () => {
  // Not cryptographic, but obvious distinct strings shouldn't collide
  const ids = new Set();
  for (let i = 0; i < 200; i++) ids.add(getEntryId(`entry number ${i}`));
  assert.equal(ids.size, 200, 'djb2 hash collision in a small sample');
});

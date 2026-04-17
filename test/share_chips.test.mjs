// test/share_chips.test.mjs
//
// The share_chips module is mostly DOM rendering, but the
// findRarestUnlocked helper has enough logic to test directly.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findRarestUnlocked, tierRank } from '../src/render/share_chips.js';

const ACHIEVEMENTS = [
  { id: 'a-common-1',    name: 'First Word',       tier: 'common' },
  { id: 'a-common-2',    name: 'First Character',  tier: 'common' },
  { id: 'a-uncommon-1',  name: 'Wordsmith',        tier: 'uncommon' },
  { id: 'a-rare-1',      name: 'Chronicler',       tier: 'rare' },
  { id: 'a-epic-1',      name: 'Master of Quill',  tier: 'epic' },
  { id: 'a-legendary-1', name: 'Ancient Scribe',   tier: 'legendary' },
];

// ---- tierRank ----

test('tierRank: legendary > epic > rare > uncommon > common', () => {
  assert.ok(tierRank('legendary') > tierRank('epic'));
  assert.ok(tierRank('epic') > tierRank('rare'));
  assert.ok(tierRank('rare') > tierRank('uncommon'));
  assert.ok(tierRank('uncommon') > tierRank('common'));
});

test('tierRank: unknown tier falls back to 0', () => {
  assert.equal(tierRank('mythic'), 0);
  assert.equal(tierRank(undefined), 0);
  assert.equal(tierRank(null), 0);
});

// ---- findRarestUnlocked: empty / bad inputs ----

test('findRarestUnlocked: empty array → null', () => {
  assert.equal(findRarestUnlocked([], ACHIEVEMENTS), null);
});

test('findRarestUnlocked: non-array unlockedIds → null', () => {
  assert.equal(findRarestUnlocked(null, ACHIEVEMENTS), null);
  assert.equal(findRarestUnlocked(undefined, ACHIEVEMENTS), null);
  assert.equal(findRarestUnlocked('string', ACHIEVEMENTS), null);
});

test('findRarestUnlocked: non-array achievements → null', () => {
  assert.equal(findRarestUnlocked(['a-common-1'], null), null);
  assert.equal(findRarestUnlocked(['a-common-1'], 'oops'), null);
});

test('findRarestUnlocked: unknown IDs → null', () => {
  assert.equal(findRarestUnlocked(['totally-made-up'], ACHIEVEMENTS), null);
  assert.equal(findRarestUnlocked(['x', 'y', 'z'], ACHIEVEMENTS), null);
});

// ---- findRarestUnlocked: correctness ----

test('findRarestUnlocked: picks highest tier when multiple unlocked', () => {
  const r = findRarestUnlocked(
    ['a-common-1', 'a-uncommon-1', 'a-rare-1', 'a-legendary-1'],
    ACHIEVEMENTS
  );
  assert.equal(r.id, 'a-legendary-1');
});

test('findRarestUnlocked: picks only unlock when one unlocked', () => {
  const r = findRarestUnlocked(['a-rare-1'], ACHIEVEMENTS);
  assert.equal(r.name, 'Chronicler');
});

test('findRarestUnlocked: picks common when only commons are unlocked', () => {
  const r = findRarestUnlocked(['a-common-1', 'a-common-2'], ACHIEVEMENTS);
  assert.equal(r.tier, 'common');
});

test('findRarestUnlocked: ties broken by registry order (first seen wins)', () => {
  const r = findRarestUnlocked(['a-common-2', 'a-common-1'], ACHIEVEMENTS);
  assert.equal(r.id, 'a-common-1', 'registry order beats unlock-set order');
});

test('findRarestUnlocked: ignores unknown IDs but finds real ones', () => {
  const r = findRarestUnlocked(
    ['unknown-1', 'a-rare-1', 'unknown-2'],
    ACHIEVEMENTS
  );
  assert.equal(r.id, 'a-rare-1');
});

test('findRarestUnlocked: handles malformed achievement entries gracefully', () => {
  const messy = [null, undefined, { id: 'a-rare-1', name: 'Real', tier: 'rare' }, 'not-an-obj'];
  const r = findRarestUnlocked(['a-rare-1'], messy);
  assert.equal(r.name, 'Real');
});

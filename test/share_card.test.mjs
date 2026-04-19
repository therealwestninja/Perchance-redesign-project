// test/share_card.test.mjs
//
// Tests for the share_card module. Canvas rendering itself requires a
// DOM and isn't unit-testable without a headless browser; we instead
// test the PURE function — toShareViewModel — which is the actual
// privacy boundary. Whatever lands in the VM is what lands on the
// card.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { toShareViewModel } = await import('../src/render/share_card.js');

// ---- whitelist contract ----

test('toShareViewModel: produces only whitelisted fields', () => {
  const vm = toShareViewModel({
    displayName: 'Alice',
    title: 'Storyteller',
    archetype: { id: 'storyteller', label: 'Storyteller' },
    level: 7,
    accent: '#ff00aa',
    avatarUrl: 'data:image/png;base64,iVBOR',
    pinnedBadges: [{ name: 'Curator', icon: '◇' }],
    xpIntoLevel: 400,
    xpForNextLevel: 1000,
    progress01: 0.4,
    // fields that should NOT pass through
    bio: 'Secret life story',
    username: 'internal_handle',
    ageRange: '25-34',
    genderCustom: 'custom text',
    wordsWritten: 50000,
    counters: { memorySaves: 100 },
  });

  // Positive: whitelisted fields present
  assert.equal(vm.displayName, 'Alice');
  assert.equal(vm.title, 'Storyteller');
  assert.equal(vm.archetype, 'Storyteller');
  assert.equal(vm.level, 7);
  assert.equal(vm.accent, '#ff00aa');
  assert.equal(vm.avatarUrl, 'data:image/png;base64,iVBOR');
  assert.equal(vm.pinnedBadges.length, 1);
  assert.equal(vm.xpLabel, '400 / 1000 XP');
  assert.equal(vm.progress01, 0.4);

  // Negative: private fields absent
  const keys = Object.keys(vm);
  for (const privateField of ['bio', 'username', 'ageRange', 'genderCustom', 'wordsWritten', 'counters']) {
    assert.ok(!keys.includes(privateField), `${privateField} leaked into VM`);
  }
});

test('toShareViewModel: clamps displayName to 40 chars', () => {
  const long = 'A'.repeat(100);
  const vm = toShareViewModel({ displayName: long });
  assert.equal(vm.displayName.length, 40);
});

test('toShareViewModel: clamps title to 60 chars', () => {
  const long = 'Title '.repeat(20);
  const vm = toShareViewModel({ title: long });
  assert.ok(vm.title.length <= 60);
});

test('toShareViewModel: rejects non-hex accent and falls back to amber', () => {
  assert.equal(toShareViewModel({ accent: 'rgb(1,2,3)' }).accent, '#d8b36a');
  assert.equal(toShareViewModel({ accent: 'red' }).accent, '#d8b36a');
  assert.equal(toShareViewModel({ accent: '#zzzzzz' }).accent, '#d8b36a');
  assert.equal(toShareViewModel({ accent: '#ABCDEF' }).accent, '#ABCDEF');
});

test('toShareViewModel: rejects non-data avatarUrl', () => {
  // Only data: URLs accepted — prevents external fetches (privacy +
  // breaks CORS rendering)
  assert.equal(toShareViewModel({ avatarUrl: 'https://example.com/x.png' }).avatarUrl, null);
  assert.equal(toShareViewModel({ avatarUrl: 'javascript:alert(1)' }).avatarUrl, null);
  assert.equal(
    toShareViewModel({ avatarUrl: 'data:image/png;base64,abc' }).avatarUrl,
    'data:image/png;base64,abc'
  );
});

test('toShareViewModel: archetype renders only when present and not Newcomer', () => {
  assert.equal(toShareViewModel({}).archetype, null);
  assert.equal(toShareViewModel({ archetype: null }).archetype, null);
  assert.equal(
    toShareViewModel({ archetype: { label: 'Newcomer' } }).archetype,
    null,
    'Newcomer should not appear on shared card'
  );
  assert.equal(
    toShareViewModel({ archetype: { label: 'Roleplayer' } }).archetype,
    'Roleplayer'
  );
});

test('toShareViewModel: caps pinnedBadges to 5', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ name: `b${i}`, icon: '◇' }));
  const vm = toShareViewModel({ pinnedBadges: many });
  assert.equal(vm.pinnedBadges.length, 5);
});

test('toShareViewModel: handles missing fields gracefully', () => {
  const vm = toShareViewModel({});
  assert.equal(vm.displayName, 'Chronicler');
  assert.equal(vm.title, 'Newcomer');
  assert.equal(vm.archetype, null);
  assert.equal(vm.level, 1);
  assert.equal(vm.accent, '#d8b36a');
  assert.equal(vm.avatarUrl, null);
  assert.deepEqual(vm.pinnedBadges, []);
  assert.equal(vm.progress01, 0);
});

test('toShareViewModel: level floored to integer, min 1', () => {
  assert.equal(toShareViewModel({ level: 3.8 }).level, 3);
  assert.equal(toShareViewModel({ level: 0 }).level, 1);
  assert.equal(toShareViewModel({ level: -5 }).level, 1);
  assert.equal(toShareViewModel({ level: NaN }).level, 1);
});

test('toShareViewModel: progress01 clamped to [0, 1]', () => {
  assert.equal(toShareViewModel({ progress01: -0.5 }).progress01, 0);
  assert.equal(toShareViewModel({ progress01: 2 }).progress01, 1);
  assert.equal(toShareViewModel({ progress01: 0.3 }).progress01, 0.3);
  assert.equal(toShareViewModel({ progress01: NaN }).progress01, 0);
});

test('toShareViewModel: badge icon/name length-clamped', () => {
  const vm = toShareViewModel({
    pinnedBadges: [
      { name: 'X'.repeat(100), icon: 'long-icon-string' },
    ],
  });
  assert.ok(vm.pinnedBadges[0].name.length <= 40);
  assert.ok(vm.pinnedBadges[0].icon.length <= 4);
});

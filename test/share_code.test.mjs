// test/share_code.test.mjs
//
// Tests for src/profile/share_code.js. Covers:
//   - toShareViewModel whitelist (same privacy contract as the old
//     PNG-card path)
//   - encode produces a 'pf1:<base64url>' string
//   - encode → decode round-trip preserves every visible field
//   - decode rejects malformed codes, unknown prefixes, wrong
//     versions, and non-string input
//   - Decode re-applies the whitelist — hand-crafted oversized
//     fields get trimmed

import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  toShareViewModel,
  encodeShareCode,
  decodeShareCode,
  __shareCodeTest,
} = await import('../src/profile/share_code.js');

// ---- toShareViewModel (privacy whitelist) ----

test('toShareViewModel: accepts the public-display fields', () => {
  const vm = toShareViewModel({
    displayName: 'West',
    title: 'Chronicler',
    archetype: { label: 'Storyteller' },
    level: 5,
    accent: '#d8b36a',
    pinnedBadges: [{ name: 'Curator', icon: '●' }],
    xpIntoLevel: 30,
    xpForNextLevel: 100,
    progress01: 0.3,
  });
  assert.equal(vm.displayName, 'West');
  assert.equal(vm.title, 'Chronicler');
  assert.equal(vm.archetype, 'Storyteller');
  assert.equal(vm.level, 5);
  assert.equal(vm.accent, 'd8b36a');            // normalized, no '#'
  assert.equal(vm.pinnedBadges.length, 1);
  assert.equal(vm.xpIntoLevel, 30);
  assert.equal(vm.xpForNextLevel, 100);
  assert.equal(vm.progress01, 0.3);
});

test('toShareViewModel: rejects extraneous fields (they vanish)', () => {
  const vm = toShareViewModel({
    displayName: 'West',
    bio: 'secret bio text',
    username: 'wn-internal',
    ageRange: 'adult',
    genderCustom: 'anything',
    counters: { memorySaves: 100 },
    avatarUrl: 'data:image/png;base64,AAAA', // dropped — no image path
  });
  assert.ok(!('bio' in vm));
  assert.ok(!('username' in vm));
  assert.ok(!('ageRange' in vm));
  assert.ok(!('genderCustom' in vm));
  assert.ok(!('counters' in vm));
  assert.ok(!('avatarUrl' in vm), 'avatar never lands in the view-model');
});

test('toShareViewModel: filters Newcomer archetype to null', () => {
  const vm = toShareViewModel({ archetype: { label: 'Newcomer' } });
  assert.equal(vm.archetype, null);
});

test('toShareViewModel: length caps', () => {
  const longName = 'x'.repeat(200);
  const vm = toShareViewModel({
    displayName: longName,
    title: longName,
    archetype: { label: longName },
    pinnedBadges: [{ name: longName, icon: longName }],
  });
  assert.equal(vm.displayName.length, __shareCodeTest.LIMITS.displayName);
  assert.equal(vm.title.length, __shareCodeTest.LIMITS.title);
  assert.equal(vm.archetype.length, __shareCodeTest.LIMITS.archetype);
  assert.equal(vm.pinnedBadges[0].name.length, __shareCodeTest.LIMITS.badgeName);
  assert.equal(vm.pinnedBadges[0].icon.length, __shareCodeTest.LIMITS.badgeIcon);
});

test('toShareViewModel: badge list capped to maxBadges', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ name: `B${i}`, icon: '★' }));
  const vm = toShareViewModel({ pinnedBadges: many });
  assert.equal(vm.pinnedBadges.length, __shareCodeTest.LIMITS.maxBadges);
});

test('toShareViewModel: invalid accent coerces to default', () => {
  assert.equal(toShareViewModel({ accent: 'not-a-color' }).accent, 'd8b36a');
  assert.equal(toShareViewModel({ accent: '' }).accent, 'd8b36a');
  assert.equal(toShareViewModel({ accent: 123 }).accent, 'd8b36a');
});

test('toShareViewModel: accent accepts with or without leading hash', () => {
  assert.equal(toShareViewModel({ accent: '#123abc' }).accent, '123abc');
  assert.equal(toShareViewModel({ accent: 'abcdef' }).accent, 'abcdef');
  assert.equal(toShareViewModel({ accent: 'ABCDEF' }).accent, 'abcdef');
});

test('toShareViewModel: progress clamped to [0, 1]', () => {
  assert.equal(toShareViewModel({ progress01: -0.5 }).progress01, 0);
  assert.equal(toShareViewModel({ progress01: 1.5 }).progress01, 1);
  assert.equal(toShareViewModel({ progress01: 0.75 }).progress01, 0.75);
});

test('toShareViewModel: level floor at 1', () => {
  assert.equal(toShareViewModel({ level: 0 }).level, 1);
  assert.equal(toShareViewModel({ level: -5 }).level, 1);
  assert.equal(toShareViewModel({ level: 2.9 }).level, 2);
});

// ---- encode / format ----

test('encodeShareCode: returns prefixed string', () => {
  const code = encodeShareCode({ displayName: 'West' });
  assert.ok(code.startsWith(`${__shareCodeTest.CODE_PREFIX}:`), `expected pf1: prefix, got ${code.slice(0, 10)}`);
  assert.ok(code.length > 4);
});

test('encodeShareCode: same input always produces same code (deterministic)', () => {
  const input = { displayName: 'West', level: 5, title: 'Curator', accent: '#d8b36a' };
  assert.equal(encodeShareCode(input), encodeShareCode(input));
});

test('encodeShareCode: ignores fields not in the schema (no leakage)', () => {
  const a = encodeShareCode({ displayName: 'West', level: 5 });
  const b = encodeShareCode({ displayName: 'West', level: 5, bio: 'sensitive!', counters: { x: 1 } });
  assert.equal(a, b, 'extra fields do not affect output');
});

test('encodeShareCode: tolerates no input', () => {
  const code = encodeShareCode();
  assert.ok(code.startsWith('pf1:'));
  const vm = decodeShareCode(code);
  assert.equal(vm.displayName, 'Chronicler');
  assert.equal(vm.title, 'Newcomer');
});

// ---- decode + round-trip ----

test('round-trip: fields survive encode → decode', () => {
  const vm = toShareViewModel({
    displayName: 'West',
    title: 'Curator',
    archetype: { label: 'Storyteller' },
    level: 5,
    accent: '#abcdef',
    pinnedBadges: [
      { name: 'Curator', icon: '●' },
      { name: 'Seasoned Celebrant', icon: '★' },
    ],
    xpIntoLevel: 30,
    xpForNextLevel: 100,
    progress01: 0.75,
  });
  const code = encodeShareCode(vm);
  const decoded = decodeShareCode(code);
  assert.equal(decoded.displayName, 'West');
  assert.equal(decoded.title, 'Curator');
  assert.equal(decoded.archetype, 'Storyteller');
  assert.equal(decoded.level, 5);
  assert.equal(decoded.accent, 'abcdef');
  assert.equal(decoded.pinnedBadges.length, 2);
  assert.equal(decoded.pinnedBadges[0].name, 'Curator');
  assert.equal(decoded.pinnedBadges[0].icon, '●');
  assert.equal(decoded.xpIntoLevel, 30);
  assert.equal(decoded.xpForNextLevel, 100);
  assert.equal(decoded.progress01, 0.75);
});

test('round-trip: null archetype preserved as null', () => {
  const code = encodeShareCode({ displayName: 'X', archetype: null });
  const vm = decodeShareCode(code);
  assert.equal(vm.archetype, null);
});

test('round-trip: unicode display name survives', () => {
  const code = encodeShareCode({ displayName: '西方 — 🌙' });
  const vm = decodeShareCode(code);
  assert.equal(vm.displayName, '西方 — 🌙');
});

test('decodeShareCode: marks source as "shareCode"', () => {
  const code = encodeShareCode({ displayName: 'X' });
  assert.equal(decodeShareCode(code).source, 'shareCode');
});

// ---- decode rejection paths ----

test('decodeShareCode: returns null for non-string input', () => {
  assert.equal(decodeShareCode(null), null);
  assert.equal(decodeShareCode(undefined), null);
  assert.equal(decodeShareCode(42), null);
  assert.equal(decodeShareCode({}), null);
});

test('decodeShareCode: rejects codes without a colon', () => {
  assert.equal(decodeShareCode('pf1eyJ2Ijox'), null);
  assert.equal(decodeShareCode(''), null);
});

test('decodeShareCode: rejects obviously-non-share-code prefixes', () => {
  // Any "pf" + digit prefix is accepted during the development
  // stub period, so test the rejection behavior on prefixes that
  // don't match the family marker at all.
  const realCode = encodeShareCode({ displayName: 'X' });
  const body = realCode.split(':')[1];
  assert.equal(decodeShareCode(`xx:${body}`), null, 'non-pf prefix rejected');
  assert.equal(decodeShareCode(`url:${body}`), null, 'url prefix rejected');
  assert.equal(decodeShareCode(`::${body}`), null, 'empty prefix rejected');
});

test('decodeShareCode: version tracking is stubbed — accepts pf2, pf9, etc.', () => {
  // While the format is still being iterated on, any pf<digit>
  // prefix is accepted. Same for payload `v` values. This test
  // documents the development-stub behavior; when version
  // enforcement is turned on, this test will need to flip to
  // expect rejection.
  const realCode = encodeShareCode({ displayName: 'X', level: 5 });
  const body = realCode.split(':')[1];
  const pf2 = decodeShareCode(`pf2:${body}`);
  assert.ok(pf2, 'pf2 prefix accepted during dev stub');
  assert.equal(pf2.level, 5);
});

test('decodeShareCode: rejects malformed base64', () => {
  assert.equal(decodeShareCode('pf1:@@@@@'), null);
  assert.equal(decodeShareCode('pf1:not-base64-at-all!!!'), null);
});

test('decodeShareCode: rejects non-JSON payload', () => {
  // Base64url of plain text "hello"
  assert.equal(decodeShareCode('pf1:aGVsbG8'), null);
});

test('decodeShareCode: accepts any payload version during dev stub', () => {
  // While the format is in flux, payloads stamped with any `v`
  // value decode fine (as long as the rest of the schema is
  // sane). Test documents the stub behavior; will flip to expect
  // rejection when version tracking is enabled.
  const future = 'pf1:' + base64urlEncode(JSON.stringify({ v: 7, n: 'FromFuture', l: 10 }));
  const vm = decodeShareCode(future);
  assert.ok(vm);
  assert.equal(vm.displayName, 'FromFuture');
  assert.equal(vm.level, 10);
});

test('decodeShareCode: re-applies whitelist — oversized fields get trimmed', () => {
  const oversized = {
    v: 1,
    n: 'x'.repeat(500),
    t: 'x'.repeat(500),
    a: 'x'.repeat(500),
    l: 5,
    c: 'd8b36a',
    b: Array.from({ length: 50 }, (_, i) => ({ n: 'x'.repeat(500), i: 'x'.repeat(50) })),
    x: { i: 0, f: 1 },
    p: 0,
  };
  const forged = 'pf1:' + base64urlEncode(JSON.stringify(oversized));
  const vm = decodeShareCode(forged);
  assert.ok(vm, 'decode succeeds for a valid-shape payload');
  assert.equal(vm.displayName.length, __shareCodeTest.LIMITS.displayName);
  assert.equal(vm.title.length, __shareCodeTest.LIMITS.title);
  assert.equal(vm.archetype.length, __shareCodeTest.LIMITS.archetype);
  assert.equal(vm.pinnedBadges.length, __shareCodeTest.LIMITS.maxBadges);
  assert.equal(vm.pinnedBadges[0].name.length, __shareCodeTest.LIMITS.badgeName);
  assert.equal(vm.pinnedBadges[0].icon.length, __shareCodeTest.LIMITS.badgeIcon);
});

// ---- test helpers ----

function base64urlEncode(str) {
  const b = Buffer.from(str, 'utf8').toString('base64');
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---- buildShareUrl + parseShareUrl (#share-links) ----

const { buildShareUrl, parseShareUrl } = await import('../src/profile/share_code.js');

test('buildShareUrl: produces a URL with ?h= parameter', () => {
  // Mock window.location.href for the URL builder
  const origWindow = globalThis.window;
  globalThis.window = { ...origWindow, location: { href: 'https://perchance.org/ai-character-hero-chat' } };
  try {
    const code = encodeShareCode(toShareViewModel({ displayName: 'Test' }));
    const url = buildShareUrl(code);
    assert.ok(url.startsWith('https://perchance.org/ai-character-hero-chat?h='), `URL should start with base + ?h=, got: ${url}`);
    assert.ok(url.includes('pf1%3A') || url.includes('pf1:'), `URL should contain the share code, got: ${url}`);
  } finally {
    globalThis.window = origWindow;
  }
});

test('buildShareUrl: strips existing ?h= parameter before appending', () => {
  const origWindow = globalThis.window;
  globalThis.window = { ...origWindow, location: { href: 'https://perchance.org/ai-character-hero-chat?h=old' } };
  try {
    const url = buildShareUrl('pf1:new');
    // Should NOT contain 'old', only 'new'
    assert.ok(!url.includes('old'), `should not contain old ?h= value, got: ${url}`);
    assert.ok(url.includes('pf1'), `should contain new code, got: ${url}`);
  } finally {
    globalThis.window = origWindow;
  }
});

test('parseShareUrl: returns decoded VM when ?h= is present', () => {
  const origWindow = globalThis.window;
  const code = encodeShareCode(toShareViewModel({ displayName: 'Alice', level: 7 }));
  globalThis.window = { ...origWindow, location: { href: `https://perchance.org/test?h=${encodeURIComponent(code)}` } };
  try {
    const vm = parseShareUrl();
    assert.ok(vm, 'should return a decoded VM');
    assert.equal(vm.displayName, 'Alice');
    assert.equal(vm.level, 7);
    assert.equal(vm.source, 'shareCode');
  } finally {
    globalThis.window = origWindow;
  }
});

test('parseShareUrl: returns null when no ?h= parameter', () => {
  const origWindow = globalThis.window;
  globalThis.window = { ...origWindow, location: { href: 'https://perchance.org/test' } };
  try {
    assert.equal(parseShareUrl(), null);
  } finally {
    globalThis.window = origWindow;
  }
});

test('parseShareUrl: returns null for malformed share code', () => {
  const origWindow = globalThis.window;
  globalThis.window = { ...origWindow, location: { href: 'https://perchance.org/test?h=garbage' } };
  try {
    assert.equal(parseShareUrl(), null, 'should gracefully return null for invalid code');
  } finally {
    globalThis.window = origWindow;
  }
});

// test/share_code.test.mjs
//
// Tests for src/profile/share_code.js (pf3 binary format).
// Covers: toShareViewModel whitelist, encode/decode round-trip,
// malformed input rejection, buildShareUrl, parseShareUrl.

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
  assert.ok(code.startsWith(`${__shareCodeTest.CODE_PREFIX}:`), `expected prefix, got ${code.slice(0, 10)}`);
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
  assert.ok(code.startsWith('pf3:'), 'should start with pf3:');
  const vm = decodeShareCode(code);
  assert.equal(vm.displayName, 'Chronicler');
  assert.equal(vm.title, 'Newcomer');
});

// ---- decode + round-trip ----

test('round-trip: fields survive encode → decode', () => {
  const vm = toShareViewModel({
    displayName: 'West',
    title: 'Scribe',
    archetype: { label: 'Storyteller' },
    level: 5,
    accent: '#abcdef',
    pinnedBadges: [
      { name: 'Scribe', icon: '●' },
      { name: 'Seasoned Celebrant', icon: '★' },
    ],
    xpIntoLevel: 30,
    xpForNextLevel: 100,
    progress01: 0.75,
  });
  const code = encodeShareCode(vm);
  const decoded = decodeShareCode(code);
  assert.equal(decoded.displayName, 'West');
  assert.equal(decoded.title, 'Scribe');
  assert.equal(decoded.archetype, 'Storyteller');
  assert.equal(decoded.level, 5);
  assert.equal(decoded.accent, 'abcdef');
  assert.equal(decoded.pinnedBadges.length, 2);
  assert.equal(decoded.pinnedBadges[0].name, 'Scribe');
  // pf3: icons are derived from achievement tier, not stored verbatim
  assert.ok(decoded.pinnedBadges[0].icon, 'badge should have an icon');
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
  assert.equal(decodeShareCode('pf3noseparator'), null);
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

test('decodeShareCode: rejects non-pf3 prefixes', () => {
  const realCode = encodeShareCode({ displayName: 'X', level: 5 });
  const body = realCode.split(':')[1];
  // pf3 works
  const ok = decodeShareCode(`pf3:${body}`);
  assert.ok(ok, 'pf3 prefix accepted');
  assert.equal(ok.level, 5);
  // pf1, pf2 rejected
  assert.equal(decodeShareCode(`pf1:${body}`), null, 'pf1 rejected');
  assert.equal(decodeShareCode(`pf2:${body}`), null, 'pf2 rejected');
  assert.equal(decodeShareCode(`pf9:${body}`), null, 'pf9 rejected');
});

test('decodeShareCode: rejects malformed base64', () => {
  assert.equal(decodeShareCode('pf3:@@@@@'), null);
  assert.equal(decodeShareCode('pf3:not-base64-at-all!!!'), null);
});

test('decodeShareCode: rejects truncated binary payload', () => {
  // Too short to be a valid pf3 payload
  assert.equal(decodeShareCode('pf3:AQID'), null);
});

// ---- buildShareUrl + parseShareUrl (#share-links) ----

const { buildShareUrl, parseShareUrl } = await import('../src/profile/share_code.js');

test('buildShareUrl: produces a URL with ?h= parameter', () => {
  const origWindow = globalThis.window;
  globalThis.window = { ...origWindow, location: { href: 'https://perchance.org/ai-character-hero-chat', pathname: '/ai-character-hero-chat' } };
  try {
    const code = encodeShareCode(toShareViewModel({ displayName: 'Test' }));
    const url = buildShareUrl(code);
    assert.ok(url.startsWith('https://perchance.org/ai-character-hero-chat?h='), `URL should start with base + ?h=, got: ${url}`);
    assert.ok(url.includes('pf3%3A') || url.includes('pf3:'), `URL should contain the share code, got: ${url}`);
  } finally {
    globalThis.window = origWindow;
  }
});

test('buildShareUrl: strips hashed subdomain and internal params', () => {
  const origWindow = globalThis.window;
  globalThis.window = { ...origWindow, location: { href: 'https://b7b87bd7cc56b30fe95d472cd81985e4.perchance.org/ai-character-hero-chat?__generatorLastEditTime=123', pathname: '/ai-character-hero-chat' } };
  try {
    const code = encodeShareCode(toShareViewModel({ displayName: 'Fresh' }));
    const url = buildShareUrl(code);
    assert.ok(url.startsWith('https://perchance.org/ai-character-hero-chat?h='), `should use canonical domain, got: ${url}`);
    assert.ok(!url.includes('b7b87bd7'), `should not contain hashed subdomain, got: ${url}`);
    assert.ok(!url.includes('__generator'), `should not contain internal params, got: ${url}`);
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

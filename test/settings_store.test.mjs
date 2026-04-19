// test/settings_store.test.mjs — settings load/save/migrate/update logic

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Minimal localStorage shim for Node — must be installed before the module under
// test is imported, since the module reads globalThis.localStorage when called.
class MemoryStorage {
  constructor() { this.store = new Map(); }
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
  clear() { this.store.clear(); }
}
globalThis.localStorage = new MemoryStorage();

const {
  loadSettings,
  saveSettings,
  updateField,
  defaultSettings,
  onSettingsChange,
  AGE_RANGE_OPTIONS,
  SECTION_IDS,
} = await import('../src/profile/settings_store.js');

beforeEach(() => { globalThis.localStorage.clear(); });

// ---------- defaults ----------

test('defaultSettings shape has expected keys', () => {
  const s = defaultSettings();
  assert.ok(s.profile);
  assert.ok(s.display && s.display.sections);
  for (const id of SECTION_IDS) {
    assert.ok(s.display.sections[id], `missing default section: ${id}`);
    assert.equal(typeof s.display.sections[id].collapsed, 'boolean');
    assert.equal(typeof s.display.sections[id].blurred, 'boolean');
  }
});

test('details section is blurred by default (privacy)', () => {
  const s = defaultSettings();
  assert.equal(s.display.sections.details.blurred, true);
});

test('AGE_RANGE_OPTIONS has expected values', () => {
  const values = AGE_RANGE_OPTIONS.map(o => o.value);
  assert.ok(values.includes(''));
  assert.ok(values.includes('under-18'));
  assert.ok(values.includes('prefer-not-say'));
});

// ---------- load/save ----------

test('loadSettings returns defaults when storage empty', () => {
  const s = loadSettings();
  assert.deepEqual(s, defaultSettings());
});

test('saveSettings + loadSettings round-trips', () => {
  const fresh = defaultSettings();
  fresh.profile.displayName = 'Aria';
  fresh.profile.bio = 'my chronicle';
  saveSettings(fresh);

  const loaded = loadSettings();
  assert.equal(loaded.profile.displayName, 'Aria');
  assert.equal(loaded.profile.bio, 'my chronicle');
});

test('loadSettings falls back to defaults for malformed JSON', () => {
  globalThis.localStorage.setItem('pf:settings', 'not valid json {{{');
  const s = loadSettings();
  assert.deepEqual(s, defaultSettings());
});

test('loadSettings merges partial data over defaults', () => {
  // Simulate an older version that only saved a few fields
  globalThis.localStorage.setItem('pf:settings', JSON.stringify({
    profile: { displayName: 'Aria' },
  }));
  const s = loadSettings();
  assert.equal(s.profile.displayName, 'Aria');
  // Fields not in saved data get defaults
  assert.equal(s.profile.bio, '');
  assert.ok(s.display && s.display.sections && s.display.sections.about);
});

// ---------- migration ----------

test('migrates old pf:profile key to pf:settings', () => {
  globalThis.localStorage.setItem('pf:profile', JSON.stringify({
    displayName: 'Old Name',
    avatarUrl: 'http://example.com/a.png',
  }));
  const s = loadSettings();
  assert.equal(s.profile.displayName, 'Old Name');
  assert.equal(s.profile.avatarUrl, 'http://example.com/a.png');
  // Old key should be removed
  assert.equal(globalThis.localStorage.getItem('pf:profile'), null);
  // New key should contain the migrated data
  const raw = globalThis.localStorage.getItem('pf:settings');
  assert.ok(raw);
  const parsed = JSON.parse(raw);
  assert.equal(parsed.profile.displayName, 'Old Name');
});

test('new pf:settings takes precedence over old pf:profile', () => {
  globalThis.localStorage.setItem('pf:settings', JSON.stringify({
    profile: { displayName: 'New Name' },
  }));
  globalThis.localStorage.setItem('pf:profile', JSON.stringify({
    displayName: 'Old Name',
  }));
  const s = loadSettings();
  assert.equal(s.profile.displayName, 'New Name');
});

// ---------- updateField ----------

test('updateField sets nested value and persists', () => {
  updateField('profile.bio', 'new bio');
  const s = loadSettings();
  assert.equal(s.profile.bio, 'new bio');
});

test('updateField handles deep paths', () => {
  updateField('display.sections.details.blurred', false);
  const s = loadSettings();
  assert.equal(s.display.sections.details.blurred, false);
});

test('updateField creates missing parent objects', () => {
  // Explicitly starting from empty storage
  globalThis.localStorage.clear();
  updateField('profile.genderPos.x01', 0.75);
  const s = loadSettings();
  assert.equal(s.profile.genderPos.x01, 0.75);
  // sibling default preserved
  assert.equal(s.profile.genderPos.y01, 0.5);
});

// ---------- onSettingsChange ----------

test('onSettingsChange fires after saveSettings', () => {
  let count = 0;
  const unsub = onSettingsChange(() => { count++; });

  saveSettings(defaultSettings());
  assert.equal(count, 1);

  saveSettings(defaultSettings());
  assert.equal(count, 2);

  unsub();
});

test('onSettingsChange fires after updateField', () => {
  let count = 0;
  const unsub = onSettingsChange(() => { count++; });

  updateField('profile.bio', 'first');
  updateField('profile.bio', 'second');
  assert.equal(count, 2);

  unsub();
});

test('onSettingsChange unsubscribe stops further notifications', () => {
  let count = 0;
  const unsub = onSettingsChange(() => { count++; });
  updateField('profile.bio', 'a');
  assert.equal(count, 1);

  unsub();
  updateField('profile.bio', 'b');
  assert.equal(count, 1, 'should not have fired after unsubscribe');
});

test('onSettingsChange isolates listener failures', () => {
  let goodCount = 0;
  const unsubBad = onSettingsChange(() => { throw new Error('boom'); });
  const unsubGood = onSettingsChange(() => { goodCount++; });

  updateField('profile.bio', 'x');
  assert.equal(goodCount, 1, 'good listener fired even though bad one threw');

  unsubBad();
  unsubGood();
});

test('onSettingsChange returns no-op for non-function', () => {
  const unsub = onSettingsChange('not a function');
  assert.equal(typeof unsub, 'function');
  // Calling the no-op should not throw
  unsub();
});

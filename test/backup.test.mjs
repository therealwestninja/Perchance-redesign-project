// test/backup.test.mjs

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.store = new Map(); }
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
  clear() { this.store.clear(); }
}
globalThis.localStorage = new MemoryStorage();

const {
  exportSettingsAsJson,
  importSettingsFromJson,
  BACKUP_SCHEMA_VERSION,
} = await import('../src/profile/backup.js');
const { loadSettings, updateField } = await import('../src/profile/settings_store.js');

beforeEach(() => { globalThis.localStorage.clear(); });

// ---- export shape ----

test('export produces valid JSON with schema + exportedAt + settings', () => {
  const json = exportSettingsAsJson();
  const parsed = JSON.parse(json);
  assert.equal(parsed.schema, BACKUP_SCHEMA_VERSION);
  assert.equal(typeof parsed.exportedAt, 'string');
  assert.ok(!Number.isNaN(Date.parse(parsed.exportedAt)), 'exportedAt should be a valid date string');
  assert.equal(typeof parsed.settings, 'object');
  assert.ok(parsed.settings.profile);
});

test('export includes user changes to settings', () => {
  updateField('profile.displayName', 'Ada Lovelace');
  updateField('profile.bio', 'a note of interest');
  const parsed = JSON.parse(exportSettingsAsJson());
  assert.equal(parsed.settings.profile.displayName, 'Ada Lovelace');
  assert.equal(parsed.settings.profile.bio, 'a note of interest');
});

test('export is pretty-printed (for human inspection)', () => {
  const json = exportSettingsAsJson();
  assert.ok(json.includes('\n'), 'should have newlines');
  assert.ok(json.includes('  '), 'should have indentation');
});

// ---- import validation ----

test('import rejects empty string', () => {
  const r = importSettingsFromJson('');
  assert.equal(r.success, false);
  assert.match(r.error, /no backup/i);
});

test('import rejects whitespace only', () => {
  const r = importSettingsFromJson('   \n  \t ');
  assert.equal(r.success, false);
  assert.match(r.error, /no backup/i);
});

test('import rejects invalid JSON', () => {
  const r = importSettingsFromJson('{not json}');
  assert.equal(r.success, false);
  assert.match(r.error, /json/i);
});

test('import rejects non-object JSON', () => {
  assert.equal(importSettingsFromJson('null').success, false);
  assert.equal(importSettingsFromJson('42').success, false);
  assert.equal(importSettingsFromJson('"a string"').success, false);
  assert.equal(importSettingsFromJson('[1,2,3]').success, false);
});

test('import rejects object without recognized keys', () => {
  const r = importSettingsFromJson(JSON.stringify({ foo: 'bar', baz: 42 }));
  assert.equal(r.success, false);
  assert.match(r.error, /profile settings/i);
});

// ---- import success paths ----

test('import accepts wrapped export payload', () => {
  updateField('profile.displayName', 'Original Name');
  const exported = exportSettingsAsJson();

  // Change current settings
  updateField('profile.displayName', 'Something Else');

  // Restore from the earlier export
  const result = importSettingsFromJson(exported);
  assert.equal(result.success, true);
  assert.equal(result.schema, BACKUP_SCHEMA_VERSION);

  const restored = loadSettings();
  assert.equal(restored.profile.displayName, 'Original Name');
});

test('import accepts raw settings object (no wrapper)', () => {
  const raw = {
    profile: { displayName: 'Raw User', bio: '', avatarUrl: null },
    display: { sections: {} },
  };
  const r = importSettingsFromJson(JSON.stringify(raw));
  assert.equal(r.success, true);
  assert.equal(r.schema, 0); // 0 = raw, no wrapper

  const restored = loadSettings();
  assert.equal(restored.profile.displayName, 'Raw User');
});

test('import of raw settings missing some fields still restores — defaults fill in', () => {
  // Only profile; display/prompts/notifications missing
  const partial = {
    profile: { displayName: 'Partial', bio: 'test' },
  };
  const r = importSettingsFromJson(JSON.stringify(partial));
  assert.equal(r.success, true);

  const restored = loadSettings();
  assert.equal(restored.profile.displayName, 'Partial');
  // Default display/prompts/notifications fields should still be present
  assert.ok(restored.display);
  assert.ok(restored.display.sections);
  assert.ok(restored.notifications);
});

// ---- round-trip ----

test('export → import round-trip preserves settings exactly', () => {
  updateField('profile.displayName', 'Round Trip');
  updateField('profile.bio', 'The quick brown fox jumps over the lazy dog.');
  updateField('profile.titleOverride', 'Prolific Writer');
  updateField('display.sections.about.collapsed', true);

  const exported = exportSettingsAsJson();
  const before = loadSettings();

  // Clear everything
  globalThis.localStorage.clear();

  // Restore
  const r = importSettingsFromJson(exported);
  assert.equal(r.success, true);

  const after = loadSettings();
  assert.equal(after.profile.displayName, before.profile.displayName);
  assert.equal(after.profile.bio, before.profile.bio);
  assert.equal(after.profile.titleOverride, before.profile.titleOverride);
  assert.equal(after.display.sections.about.collapsed, true);
});

test('import handles settings with weekly prompt completion history', () => {
  // Simulate an established user's settings with prompt completions
  const settings = {
    profile: { displayName: 'Weekly Writer' },
    prompts: {
      completedByWeek: {
        '2026-W05': ['p-first-scene', 'p-dialogue'],
        '2026-W06': ['p-mentor'],
      },
    },
  };
  const r = importSettingsFromJson(JSON.stringify(settings));
  assert.equal(r.success, true);

  const restored = loadSettings();
  assert.deepEqual(restored.prompts.completedByWeek['2026-W05'].sort(),
    ['p-dialogue', 'p-first-scene']);
  assert.deepEqual(restored.prompts.completedByWeek['2026-W06'], ['p-mentor']);
});

// ---- defensive ----

test('import does not throw on wrapped payload with missing settings', () => {
  const r = importSettingsFromJson(JSON.stringify({ schema: 1, exportedAt: 'x' }));
  // With no settings field, falls through to raw-settings path which then
  // rejects because no recognized keys. Expect failure, not crash.
  assert.equal(r.success, false);
});

test('import does not throw on wrapped payload with null settings', () => {
  const r = importSettingsFromJson(JSON.stringify({ schema: 1, settings: null }));
  assert.equal(r.success, false);
});

test('import does not throw on non-string input', () => {
  assert.equal(importSettingsFromJson(null).success, false);
  assert.equal(importSettingsFromJson(undefined).success, false);
  assert.equal(importSettingsFromJson(42).success, false);
  assert.equal(importSettingsFromJson({}).success, false);
});

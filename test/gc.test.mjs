// test/gc.test.mjs
//
// Tests for clearCompletionHistory (user-initiated from the Backup
// section, replaces the earlier automatic-GC design). Verifies:
//   - clears everything except the current week
//   - accumulates cleared counts into historicalTotals so lifetime
//     stats and achievements never regress
//   - no-op when only the current week has entries
//   - computePromptStats folds historicalTotals into lifetime sums
//   - backup round-trip preserves post-clear state correctly
//
// The partition helpers (partitionWeekKeys, weekKeyToOrdinal) are
// retained for potential future scoped-clear variants and get their
// own correctness tests.

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
  partitionWeekKeys,
  weekKeyToOrdinal,
  clearCompletionHistory,
  RETENTION_WEEKS,
} = await import('../src/prompts/gc.js');
const { computePromptStats } = await import('../src/stats/prompt_stats.js');
const { loadSettings, updateField } = await import('../src/profile/settings_store.js');
const { exportSettingsAsJson, importSettingsFromJson } = await import('../src/profile/backup.js');
const { getCurrentWeekKey } = await import('../src/prompts/scheduler.js');

beforeEach(() => { globalThis.localStorage.clear(); });

// ---- weekKeyToOrdinal / partitionWeekKeys (unchanged helpers) ----

test('weekKeyToOrdinal: monotonic within year', () => {
  assert.ok(weekKeyToOrdinal('2026-W16') > weekKeyToOrdinal('2026-W01'));
  assert.ok(weekKeyToOrdinal('2026-W52') > weekKeyToOrdinal('2026-W51'));
});

test('weekKeyToOrdinal: monotonic across years', () => {
  assert.ok(weekKeyToOrdinal('2027-W01') > weekKeyToOrdinal('2026-W53'));
  assert.ok(weekKeyToOrdinal('2027-W01') > weekKeyToOrdinal('2026-W52'));
});

test('weekKeyToOrdinal: null for malformed input', () => {
  assert.equal(weekKeyToOrdinal('bogus'), null);
  assert.equal(weekKeyToOrdinal(''), null);
  assert.equal(weekKeyToOrdinal(null), null);
  assert.equal(weekKeyToOrdinal(undefined), null);
  assert.equal(weekKeyToOrdinal('2026W01'), null);
});

test('partitionWeekKeys: nothing expired when all recent', () => {
  const keys = ['2026-W10', '2026-W12', '2026-W14', '2026-W16'];
  const { keep, drop } = partitionWeekKeys(keys, '2026-W16', 104);
  assert.deepEqual(drop, []);
  assert.equal(keep.length, 4);
});

test('partitionWeekKeys: everything older than cutoff drops', () => {
  const keys = ['2026-W01', '2026-W10', '2026-W15', '2026-W16'];
  const { keep, drop } = partitionWeekKeys(keys, '2026-W16', 10);
  assert.ok(drop.includes('2026-W01'));
  assert.ok(keep.includes('2026-W10'));
  assert.ok(keep.includes('2026-W15'));
  assert.ok(keep.includes('2026-W16'));
});

test('partitionWeekKeys: malformed keys are kept (not silently dropped)', () => {
  const keys = ['2026-W15', 'bogus-key', '2020-W01'];
  const { keep, drop } = partitionWeekKeys(keys, '2026-W16', 52);
  assert.ok(keep.includes('bogus-key'));
  assert.ok(drop.includes('2020-W01'));
});

test('partitionWeekKeys: handles empty input', () => {
  const result = partitionWeekKeys([], '2026-W16', 104);
  assert.deepEqual(result, { keep: [], drop: [] });
});

test('partitionWeekKeys: handles invalid currentWeekKey by keeping everything', () => {
  const keys = ['2024-W01', '2026-W16'];
  const { keep, drop } = partitionWeekKeys(keys, 'bogus', 104);
  assert.deepEqual(drop, []);
  assert.equal(keep.length, 2);
});

// ---- clearCompletionHistory basics ----

test('clearCompletionHistory: no-op when only current week has entries', () => {
  const now = new Date(Date.UTC(2026, 3, 17));
  const currentKey = getCurrentWeekKey(now);
  updateField('prompts.completedByWeek', {
    [currentKey]: ['p-current'],
  });
  const r = clearCompletionHistory({ now });
  assert.equal(r.droppedWeeks, 0);
  assert.equal(r.droppedCompletions, 0);

  // Current week's entries survive untouched
  const s = loadSettings();
  assert.deepEqual(s.prompts.completedByWeek[currentKey], ['p-current']);
});

test('clearCompletionHistory: no-op on empty completedByWeek', () => {
  const r = clearCompletionHistory({ now: new Date(Date.UTC(2026, 3, 17)) });
  assert.equal(r.droppedWeeks, 0);
  assert.equal(r.droppedCompletions, 0);
});

test('clearCompletionHistory: drops everything except current week', () => {
  const now = new Date(Date.UTC(2026, 3, 17));
  const currentKey = getCurrentWeekKey(now);
  updateField('prompts.completedByWeek', {
    '2026-W10': ['p-1', 'p-2'],
    '2026-W12': ['p-3'],
    '2026-W14': ['p-4', 'p-5', 'p-6'],
    [currentKey]: ['p-this-week'],
  });
  const r = clearCompletionHistory({ now });
  assert.equal(r.droppedWeeks, 3);
  assert.equal(r.droppedCompletions, 6);

  const s = loadSettings();
  assert.deepEqual(Object.keys(s.prompts.completedByWeek), [currentKey]);
  assert.deepEqual(s.prompts.completedByWeek[currentKey], ['p-this-week']);
});

test('clearCompletionHistory: drops past weeks even when current week has no entries', () => {
  const now = new Date(Date.UTC(2026, 3, 17));
  updateField('prompts.completedByWeek', {
    '2026-W10': ['p-1'],
    '2026-W12': ['p-2'],
  });
  const r = clearCompletionHistory({ now });
  assert.equal(r.droppedWeeks, 2);

  const s = loadSettings();
  assert.deepEqual(Object.keys(s.prompts.completedByWeek), []);
});

// ---- historicalTotals accumulation ----

test('clearCompletionHistory: accumulates cleared counts into historicalTotals', () => {
  const now = new Date(Date.UTC(2026, 3, 17));
  updateField('prompts.completedByWeek', {
    '2026-W10': ['p-1', 'p-2', 'p-3'],
    '2026-W12': ['p-4', 'p-5'],
  });
  clearCompletionHistory({ now });

  const s = loadSettings();
  assert.equal(s.prompts.historicalTotals.total, 5);
  assert.equal(s.prompts.historicalTotals.weeksActive, 2);
});

test('clearCompletionHistory: empty past weeks do not count toward weeksActive', () => {
  const now = new Date(Date.UTC(2026, 3, 17));
  updateField('prompts.completedByWeek', {
    '2026-W10': [],
    '2026-W12': ['p-one'],
  });
  clearCompletionHistory({ now });

  const s = loadSettings();
  assert.equal(s.prompts.historicalTotals.weeksActive, 1);
  assert.equal(s.prompts.historicalTotals.total, 1);
});

test('clearCompletionHistory: second clear accumulates on top of first', () => {
  const now = new Date(Date.UTC(2026, 3, 17));
  updateField('prompts.completedByWeek', {
    '2026-W10': ['p-1', 'p-2'],
  });
  clearCompletionHistory({ now });
  let s = loadSettings();
  assert.equal(s.prompts.historicalTotals.total, 2);

  // Later the user has more past-week entries to clear
  updateField('prompts.completedByWeek', {
    '2026-W12': ['p-3', 'p-4', 'p-5'],
  });
  clearCompletionHistory({ now });
  s = loadSettings();
  assert.equal(s.prompts.historicalTotals.total, 5);
  assert.equal(s.prompts.historicalTotals.weeksActive, 2);
});

// ---- computePromptStats folds historicalTotals ----

test('computePromptStats: includes historicalTotals in lifetime sums', () => {
  const settings = {
    prompts: {
      completedByWeek: {
        '2026-W15': ['p-a', 'p-b'],
        '2026-W16': ['p-c'],
      },
      historicalTotals: { total: 47, weeksActive: 12 },
    },
  };
  const stats = computePromptStats(settings);
  assert.equal(stats.promptsCompletedTotal, 47 + 3);
  assert.equal(stats.promptsWeeksActive, 12 + 2);
});

test('computePromptStats: missing historicalTotals defaults to zero', () => {
  const settings = {
    prompts: {
      completedByWeek: { '2026-W16': ['p-only'] },
    },
  };
  const stats = computePromptStats(settings);
  assert.equal(stats.promptsCompletedTotal, 1);
});

test('computePromptStats: no regression across a Clear action', () => {
  const now = new Date(Date.UTC(2026, 3, 17));
  const currentKey = getCurrentWeekKey(now);
  updateField('prompts.completedByWeek', {
    '2026-W10': ['p-1', 'p-2', 'p-3'],
    '2026-W12': ['p-4'],
    '2026-W14': ['p-5'],
    [currentKey]: ['p-current'],
  });
  const before = computePromptStats(loadSettings());
  assert.equal(before.promptsCompletedTotal, 6);

  clearCompletionHistory({ now });

  const after = computePromptStats(loadSettings());
  assert.equal(after.promptsCompletedTotal, before.promptsCompletedTotal);
  assert.equal(after.promptsWeeksActive, before.promptsWeeksActive);
});

// ---- backup round-trip preserves post-clear state ----

test('backup: post-clear export/import round-trips historicalTotals', () => {
  const now = new Date(Date.UTC(2026, 3, 17));
  const currentKey = getCurrentWeekKey(now);
  updateField('prompts.completedByWeek', {
    '2026-W10': ['p-1', 'p-2'],
    [currentKey]: ['p-current'],
  });
  clearCompletionHistory({ now });

  const json = exportSettingsAsJson();
  globalThis.localStorage.clear();
  importSettingsFromJson(json);

  const s = loadSettings();
  assert.equal(s.prompts.historicalTotals.total, 2);
  const stats = computePromptStats(s);
  assert.equal(stats.promptsCompletedTotal, 3);
});

test('backup: restoring OLD backup (pre-historicalTotals) then clearing works', () => {
  const oldBackup = JSON.stringify({
    schema: 1,
    exportedAt: '2020-01-01T00:00:00.000Z',
    settings: {
      prompts: {
        completedByWeek: {
          '2019-W10': ['p-a', 'p-b', 'p-c'],
          '2019-W20': ['p-d'],
          '2020-W01': ['p-e'],
        },
      },
    },
  });
  importSettingsFromJson(oldBackup);

  const preClearStats = computePromptStats(loadSettings());
  assert.equal(preClearStats.promptsCompletedTotal, 5);

  const now = new Date(Date.UTC(2026, 3, 17));
  clearCompletionHistory({ now });

  const postClearStats = computePromptStats(loadSettings());
  assert.equal(postClearStats.promptsCompletedTotal, 5);
});

// ---- constant sanity ----

test('RETENTION_WEEKS retained for future scoped-clear variants', () => {
  assert.ok(RETENTION_WEEKS >= 52,
    'Retention constant for scoped-clear should stay >= archive display cap');
});

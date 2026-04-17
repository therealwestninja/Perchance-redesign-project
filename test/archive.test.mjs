// test/archive.test.mjs
//
// Tests for the pure archive-computation logic. Covers the tricky bits:
// week-key ↔ Date round-tripping, date-range formatting across month
// boundaries, and the events-in-week union (which handles the multi-day
// window events).

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
  computeArchiveEntries,
  weekKeyToMondayDate,
  formatDateRange,
  getEventsInWeekRange,
  MAX_WEEKS_BACK,
} = await import('../src/prompts/archive.js');
const { getCurrentWeekKey, getWeekPrompts } = await import('../src/prompts/scheduler.js');
const { updateField } = await import('../src/profile/settings_store.js');

beforeEach(() => { globalThis.localStorage.clear(); });

// ---- weekKeyToMondayDate ----

test('weekKeyToMondayDate: 2026-W01 is the Monday Dec 29 2025', () => {
  // ISO 2026 week 1 = week containing Jan 4 2026 (a Sunday)
  // → Monday of that week = Dec 29, 2025
  const d = weekKeyToMondayDate('2026-W01');
  assert.equal(d.getUTCFullYear(), 2025);
  assert.equal(d.getUTCMonth(), 11); // Dec = 11
  assert.equal(d.getUTCDate(), 29);
});

test('weekKeyToMondayDate: 2026-W16 is Apr 13 2026', () => {
  const d = weekKeyToMondayDate('2026-W16');
  assert.equal(d.getUTCFullYear(), 2026);
  assert.equal(d.getUTCMonth(), 3); // Apr
  assert.equal(d.getUTCDate(), 13);
});

test('weekKeyToMondayDate: round-trips through getCurrentWeekKey', () => {
  const apr17 = new Date(Date.UTC(2026, 3, 17)); // Fri
  const weekKey = getCurrentWeekKey(apr17);
  const monday = weekKeyToMondayDate(weekKey);
  // The monday should be Apr 13, 2026 (4 days before apr17)
  assert.equal(monday.getUTCDate(), 13);
});

test('weekKeyToMondayDate: invalid keys return Invalid Date', () => {
  assert.ok(Number.isNaN(weekKeyToMondayDate('bogus').getTime()));
  assert.ok(Number.isNaN(weekKeyToMondayDate('').getTime()));
  assert.ok(Number.isNaN(weekKeyToMondayDate(null).getTime()));
});

// ---- formatDateRange ----

test('formatDateRange: same month compact form', () => {
  const start = new Date(Date.UTC(2026, 3, 13));
  const end = new Date(Date.UTC(2026, 3, 19));
  assert.equal(formatDateRange(start, end), 'Apr 13–19');
});

test('formatDateRange: cross-month expanded form', () => {
  const start = new Date(Date.UTC(2026, 3, 27));
  const end = new Date(Date.UTC(2026, 4, 3));
  assert.equal(formatDateRange(start, end), 'Apr 27 – May 3');
});

test('formatDateRange: cross-year (Dec → Jan)', () => {
  const start = new Date(Date.UTC(2025, 11, 29));
  const end = new Date(Date.UTC(2026, 0, 4));
  assert.equal(formatDateRange(start, end), 'Dec 29 – Jan 4');
});

// ---- getEventsInWeekRange ----

test('getEventsInWeekRange: picks up a single-day event mid-week', () => {
  // Betty White's birthday is Jan 17. Week containing it:
  const monday = new Date(Date.UTC(2026, 0, 12));
  const sunday = new Date(Date.UTC(2026, 0, 18));
  const events = getEventsInWeekRange(monday, sunday);
  const ids = events.map(e => e.id);
  assert.ok(ids.includes('e-betty-white'));
});

test('getEventsInWeekRange: picks up multi-day events (Halloween week)', () => {
  // Halloween event spans Oct 27 – Nov 1. Week containing Oct 27:
  const monday = new Date(Date.UTC(2026, 9, 26));
  const sunday = new Date(Date.UTC(2026, 10, 1));
  const events = getEventsInWeekRange(monday, sunday);
  const ids = events.map(e => e.id);
  assert.ok(ids.includes('e-halloween'));
});

test('getEventsInWeekRange: deduplicates events that span multiple days', () => {
  // Halloween spans 6 days; should appear once
  const monday = new Date(Date.UTC(2026, 9, 26));
  const sunday = new Date(Date.UTC(2026, 10, 1));
  const events = getEventsInWeekRange(monday, sunday);
  const halloween = events.filter(e => e.id === 'e-halloween');
  assert.equal(halloween.length, 1);
});

test('getEventsInWeekRange: returns empty for a quiet week', () => {
  // First week of February (usually no events)
  const monday = new Date(Date.UTC(2026, 1, 2));
  const sunday = new Date(Date.UTC(2026, 1, 8));
  const events = getEventsInWeekRange(monday, sunday);
  assert.deepEqual(events, []);
});

// ---- computeArchiveEntries ----

test('computeArchiveEntries: returns N past weeks in reverse chronological order', () => {
  const now = new Date(Date.UTC(2026, 3, 17));
  const entries = computeArchiveEntries({ weeksBack: 4, now });
  assert.equal(entries.length, 4);

  // Newest entry first — its Monday should be the most recent past Monday
  const newest = entries[0].monday;
  const oldest = entries[entries.length - 1].monday;
  assert.ok(newest.getTime() > oldest.getTime());

  // Each entry is exactly 7 days before the previous
  for (let i = 1; i < entries.length; i++) {
    const diff = entries[i - 1].monday.getTime() - entries[i].monday.getTime();
    assert.equal(diff, 7 * 24 * 60 * 60 * 1000);
  }
});

test('computeArchiveEntries: does NOT include the current week', () => {
  const now = new Date(Date.UTC(2026, 3, 17));
  const currentWeek = getCurrentWeekKey(now);
  const entries = computeArchiveEntries({ weeksBack: 4, now });
  const weekKeys = entries.map(e => e.weekKey);
  assert.ok(!weekKeys.includes(currentWeek));
});

test('computeArchiveEntries: joins completions from settings', () => {
  const now = new Date(Date.UTC(2026, 3, 17));
  // Find the week key for 2 weeks ago
  const twoWeeksAgo = new Date(now);
  twoWeeksAgo.setUTCDate(now.getUTCDate() - 14);
  const pastWeekKey = getCurrentWeekKey(twoWeeksAgo);

  // Stash a completion for that past week — use an ID that WILL be in the
  // offered prompts for that week (we don't know which, so take the first)
  const pastOffered = getWeekPrompts(pastWeekKey);
  const firstOfferedId = pastOffered[0].id;

  updateField('prompts.completedByWeek', { [pastWeekKey]: [firstOfferedId] });

  const entries = computeArchiveEntries({ weeksBack: 4, now });
  const entry = entries.find(e => e.weekKey === pastWeekKey);
  assert.ok(entry);
  assert.equal(entry.completedCount, 1);
  const completedPrompt = entry.regularPrompts.find(p => p.id === firstOfferedId);
  assert.ok(completedPrompt && completedPrompt.completed);
});

test('computeArchiveEntries: empty completions → zero count', () => {
  const now = new Date(Date.UTC(2026, 3, 17));
  const entries = computeArchiveEntries({ weeksBack: 2, now });
  for (const entry of entries) {
    assert.equal(entry.completedCount, 0);
    assert.ok(entry.totalCount >= 4, 'should always have ≥ 4 regular prompts');
  }
});

test('computeArchiveEntries: weeksBack is clamped to MAX_WEEKS_BACK', () => {
  const now = new Date(Date.UTC(2026, 3, 17));
  const entries = computeArchiveEntries({ weeksBack: 10_000, now });
  assert.equal(entries.length, MAX_WEEKS_BACK);
});

test('computeArchiveEntries: weeksBack=0 → empty', () => {
  const now = new Date(Date.UTC(2026, 3, 17));
  const entries = computeArchiveEntries({ weeksBack: 0, now });
  assert.deepEqual(entries, []);
});

test('computeArchiveEntries: negative weeksBack → empty (clamped)', () => {
  const now = new Date(Date.UTC(2026, 3, 17));
  const entries = computeArchiveEntries({ weeksBack: -5, now });
  assert.deepEqual(entries, []);
});

test('computeArchiveEntries: event groups show up in the right weeks', () => {
  // Pick a "now" such that 2 weeks ago the week includes Jan 17 (Betty White)
  const now = new Date(Date.UTC(2026, 0, 31)); // Jan 31 2026, a Saturday
  const entries = computeArchiveEntries({ weeksBack: 4, now });

  // Find entry whose range includes Jan 17
  const entry = entries.find(e =>
    e.monday.getTime() <= Date.UTC(2026, 0, 17) &&
    e.sunday.getTime() >= Date.UTC(2026, 0, 17)
  );
  assert.ok(entry, 'should have a week covering Jan 17');
  const bettyGroup = entry.eventGroups.find(g => g.eventId === 'e-betty-white');
  assert.ok(bettyGroup, 'that week should surface Betty White event prompts');
  assert.ok(bettyGroup.prompts.length > 0);
});

test('computeArchiveEntries: event prompt completions tracked per week', () => {
  const now = new Date(Date.UTC(2026, 0, 31));
  updateField('prompts.completedByWeek', {
    // Mark the specific Betty White prompt for the week containing Jan 17.
    // Week key for a date in Jan 12-18, 2026 is 2026-W03 ISO:
    '2026-W03': ['e-betty-white-gentle-humor'],
  });
  const entries = computeArchiveEntries({ weeksBack: 4, now });
  const entry = entries.find(e => e.weekKey === '2026-W03');
  assert.ok(entry);
  const bettyGroup = entry.eventGroups.find(g => g.eventId === 'e-betty-white');
  const prompt = bettyGroup.prompts.find(p => p.id === 'e-betty-white-gentle-humor');
  assert.ok(prompt && prompt.completed);
  assert.equal(entry.completedCount, 1);
});

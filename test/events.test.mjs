// test/events.test.mjs
//
// Covers:
//   - Registry shape (unique IDs, valid windows, no cross-year windows)
//   - Active event detection for single-day and multi-day windows
//   - Integration with the notification system (seen/pending event tracking)

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

import { EVENTS, getEventById, getEventPromptById } from '../src/events/registry.js';
import { getActiveEvents, getActiveEventIds, getActiveEventPrompts } from '../src/events/active.js';
const {
  getSeenEventIds,
  computePendingEvents,
  markEventsSeen,
} = await import('../src/profile/notifications.js');

beforeEach(() => { globalThis.localStorage.clear(); });

// ---------- registry shape ----------

test('registry: all events have required fields', () => {
  for (const ev of EVENTS) {
    assert.ok(ev.id, `event missing id: ${JSON.stringify(ev)}`);
    assert.ok(ev.id.startsWith('e-'), `event id should start with 'e-': ${ev.id}`);
    assert.equal(typeof ev.name, 'string');
    assert.equal(typeof ev.icon, 'string');
    assert.equal(typeof ev.tagline, 'string');
    assert.equal(typeof ev.startMonth, 'number');
    assert.equal(typeof ev.startDay, 'number');
    assert.equal(typeof ev.endMonth, 'number');
    assert.equal(typeof ev.endDay, 'number');
    assert.ok(Array.isArray(ev.prompts));
    assert.ok(ev.prompts.length >= 1, `${ev.id} has no prompts`);
  }
});

test('registry: all event IDs are unique', () => {
  const ids = EVENTS.map(ev => ev.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate event IDs');
});

test('registry: all event prompt IDs are unique across all events', () => {
  const promptIds = [];
  for (const ev of EVENTS) {
    for (const p of ev.prompts) promptIds.push(p.id);
  }
  assert.equal(new Set(promptIds).size, promptIds.length, 'duplicate event prompt IDs');
});

test('registry: no event window crosses a year boundary', () => {
  for (const ev of EVENTS) {
    const start = ev.startMonth * 100 + ev.startDay;
    const end   = ev.endMonth   * 100 + ev.endDay;
    assert.ok(end >= start,
      `${ev.id}: end (${ev.endMonth}/${ev.endDay}) before start (${ev.startMonth}/${ev.startDay}) — would cross year boundary`);
  }
});

test('registry: months and days are within valid ranges', () => {
  for (const ev of EVENTS) {
    assert.ok(ev.startMonth >= 1 && ev.startMonth <= 12, `bad startMonth: ${ev.id}`);
    assert.ok(ev.endMonth   >= 1 && ev.endMonth   <= 12, `bad endMonth: ${ev.id}`);
    assert.ok(ev.startDay   >= 1 && ev.startDay   <= 31, `bad startDay: ${ev.id}`);
    assert.ok(ev.endDay     >= 1 && ev.endDay     <= 31, `bad endDay: ${ev.id}`);
  }
});

test('getEventById returns matching event or null', () => {
  assert.equal(getEventById('e-betty-white').name, 'Betty White\'s Birthday');
  assert.equal(getEventById('nonexistent'), null);
});

test('getEventPromptById finds prompts across all events', () => {
  const match = getEventPromptById('e-arbor-day-under-tree');
  assert.ok(match);
  assert.equal(match.event.id, 'e-arbor-day');
  assert.match(match.prompt.text, /tree/i);
});

// ---------- active event detection ----------

test('getActiveEvents: Betty White birthday active only on Jan 17', () => {
  const jan16 = new Date(Date.UTC(2026, 0, 16));
  const jan17 = new Date(Date.UTC(2026, 0, 17));
  const jan18 = new Date(Date.UTC(2026, 0, 18));

  assert.equal(getActiveEvents(jan16).find(e => e.id === 'e-betty-white'), undefined);
  assert.ok(getActiveEvents(jan17).find(e => e.id === 'e-betty-white'));
  assert.equal(getActiveEvents(jan18).find(e => e.id === 'e-betty-white'), undefined);
});

test('getActiveEvents: Halloween week spans multiple days (Oct 27 – Nov 1)', () => {
  for (const day of [27, 28, 29, 30, 31]) {
    const d = new Date(Date.UTC(2026, 9, day)); // month index 9 = October
    assert.ok(
      getActiveEvents(d).find(e => e.id === 'e-halloween'),
      `Halloween should be active on Oct ${day}`
    );
  }
  const nov1 = new Date(Date.UTC(2026, 10, 1));
  assert.ok(getActiveEvents(nov1).find(e => e.id === 'e-halloween'));
  // Outside window
  const oct26 = new Date(Date.UTC(2026, 9, 26));
  assert.equal(getActiveEvents(oct26).find(e => e.id === 'e-halloween'), undefined);
  const nov2 = new Date(Date.UTC(2026, 10, 2));
  assert.equal(getActiveEvents(nov2).find(e => e.id === 'e-halloween'), undefined);
});

test('getActiveEvents: Arbor Day window catches late April dates', () => {
  const apr24 = new Date(Date.UTC(2026, 3, 24));
  const apr25 = new Date(Date.UTC(2026, 3, 25));
  const apr26 = new Date(Date.UTC(2026, 3, 26));
  for (const d of [apr24, apr25, apr26]) {
    assert.ok(getActiveEvents(d).find(e => e.id === 'e-arbor-day'),
      `Arbor Day should be active on ${d.toISOString()}`);
  }
  const apr23 = new Date(Date.UTC(2026, 3, 23));
  const apr27 = new Date(Date.UTC(2026, 3, 27));
  assert.equal(getActiveEvents(apr23).find(e => e.id === 'e-arbor-day'), undefined);
  assert.equal(getActiveEvents(apr27).find(e => e.id === 'e-arbor-day'), undefined);
});

test('getActiveEvents: returns empty array on a quiet day', () => {
  // Feb 2 has no events configured in our calendar
  const feb2 = new Date(Date.UTC(2026, 1, 2));
  assert.deepEqual(getActiveEvents(feb2), []);
});

test('getActiveEventIds returns just the IDs of active events', () => {
  const jan17 = new Date(Date.UTC(2026, 0, 17));
  const ids = getActiveEventIds(jan17);
  assert.ok(ids.includes('e-betty-white'));
  assert.equal(typeof ids[0], 'string');
});

test('getActiveEventPrompts bundles prompt with event metadata', () => {
  const jan17 = new Date(Date.UTC(2026, 0, 17));
  const pairs = getActiveEventPrompts(jan17);
  assert.ok(pairs.length > 0);
  for (const { event, prompt } of pairs) {
    assert.equal(event.id, 'e-betty-white');
    assert.ok(prompt.id.startsWith('e-betty-white-'));
  }
});

// ---------- notification integration ----------

test('computePendingEvents: empty when no active events', () => {
  assert.deepEqual(computePendingEvents([]), []);
});

test('computePendingEvents: returns all active events before any are marked seen', () => {
  const active = ['e-new-year'];
  assert.deepEqual(computePendingEvents(active), ['e-new-year']);
});

test('computePendingEvents: returns [] after marking seen', () => {
  markEventsSeen(['e-new-year']);
  assert.deepEqual(computePendingEvents(['e-new-year']), []);
});

test('markEventsSeen garbage-collects events that are no longer active', () => {
  // User saw Arbor Day last spring. Now it's December; only e-year-end active.
  markEventsSeen(['e-arbor-day']);
  assert.ok(getSeenEventIds().has('e-arbor-day'));

  // Later in the year, user opens profile with different events active
  markEventsSeen(['e-year-end']);
  const seen = getSeenEventIds();
  assert.ok(seen.has('e-year-end'));
  assert.equal(seen.has('e-arbor-day'), false,
    'old events should be garbage-collected so they re-announce next year');
});

test('markEventsSeen with empty array clears the seen set', () => {
  markEventsSeen(['e-betty-white']);
  assert.equal(getSeenEventIds().size, 1);
  markEventsSeen([]);
  assert.equal(getSeenEventIds().size, 0);
});

test('markEventsSeen is defensive against non-array input', () => {
  markEventsSeen(['e-new-year']);
  markEventsSeen(null);   // should not clobber
  markEventsSeen('bad');
  assert.equal(getSeenEventIds().size, 1);
});

test('end-to-end: event becomes active → pulse → open profile → no more pulse', () => {
  // Day 1: Jan 17, Betty White's birthday, user hasn't seen it yet
  const jan17 = new Date(Date.UTC(2026, 0, 17));
  const active = getActiveEventIds(jan17);
  assert.ok(active.includes('e-betty-white'));

  // Pulse fires because no events have been seen yet
  assert.ok(computePendingEvents(active).includes('e-betty-white'));

  // User opens profile — events are marked seen
  markEventsSeen(active);

  // Next call while still Jan 17: no pulse
  assert.deepEqual(computePendingEvents(active), []);
});

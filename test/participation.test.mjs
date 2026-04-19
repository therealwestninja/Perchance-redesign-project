// test/participation.test.mjs
//
// Unit tests for src/events/participation.js. Validates:
//   - State monotonicity (no downgrades)
//   - Idempotency
//   - findEventForPrompt correctness against registry
//   - recordPromptCompletionParticipation bumps right event
//   - countEventsResponded counts only >= responded
//   - Malformed-storage safety

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
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, opts = {}) { this.type = type; this.detail = opts.detail; }
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
}

const {
  getEventParticipation,
  getEventParticipationFor,
  recordEventParticipation,
  findEventForPrompt,
  recordPromptCompletionParticipation,
  countEventsResponded,
} = await import('../src/events/participation.js');

beforeEach(() => { globalThis.localStorage.clear(); });

// ---- recordEventParticipation ----

test('recordEventParticipation: sets initial state', () => {
  recordEventParticipation('e-new-year', 'seen');
  const rec = getEventParticipationFor('e-new-year');
  assert.equal(rec.state, 'seen');
  assert.ok(rec.at, 'timestamp recorded');
});

test('recordEventParticipation: upgrades from seen to responded', () => {
  recordEventParticipation('e-new-year', 'seen');
  recordEventParticipation('e-new-year', 'responded');
  assert.equal(getEventParticipationFor('e-new-year').state, 'responded');
});

test('recordEventParticipation: monotonic — does not downgrade', () => {
  recordEventParticipation('e-new-year', 'responded');
  recordEventParticipation('e-new-year', 'seen');
  assert.equal(getEventParticipationFor('e-new-year').state, 'responded');
});

test('recordEventParticipation: no downgrade from chronicled', () => {
  recordEventParticipation('e-new-year', 'chronicled');
  recordEventParticipation('e-new-year', 'responded');
  recordEventParticipation('e-new-year', 'seen');
  assert.equal(getEventParticipationFor('e-new-year').state, 'chronicled');
});

test('recordEventParticipation: idempotent — repeat same state is no-op', async () => {
  recordEventParticipation('e-new-year', 'seen');
  const firstRec = getEventParticipationFor('e-new-year');
  // Sleep a tick to distinguish timestamps if a second write happened
  await new Promise(r => setTimeout(r, 2));
  recordEventParticipation('e-new-year', 'seen');
  const secondRec = getEventParticipationFor('e-new-year');
  assert.equal(firstRec.at, secondRec.at, 'no new write occurred');
});

test('recordEventParticipation: ignores invalid state', () => {
  recordEventParticipation('e-new-year', 'nonsense');
  assert.equal(getEventParticipationFor('e-new-year'), null);
});

test('recordEventParticipation: ignores empty event id', () => {
  recordEventParticipation('', 'seen');
  assert.deepEqual(getEventParticipation(), {});
});

// ---- findEventForPrompt ----

test('findEventForPrompt: returns event for valid event prompt', () => {
  // e-new-year-fresh-start is in the registry
  const ev = findEventForPrompt('e-new-year-fresh-start');
  assert.ok(ev, 'found an event');
  assert.equal(ev.id, 'e-new-year');
});

test('findEventForPrompt: null for non-event prompt', () => {
  assert.equal(findEventForPrompt('p-quiet-moment'), null);
  assert.equal(findEventForPrompt('p-anything'), null);
});

test('findEventForPrompt: null for unknown e- prompt', () => {
  assert.equal(findEventForPrompt('e-nonexistent-prompt'), null);
});

test('findEventForPrompt: null for non-string input', () => {
  assert.equal(findEventForPrompt(null), null);
  assert.equal(findEventForPrompt(undefined), null);
  assert.equal(findEventForPrompt(123), null);
});

// ---- recordPromptCompletionParticipation ----

test('recordPromptCompletionParticipation: records responded state', () => {
  recordPromptCompletionParticipation('e-new-year-fresh-start');
  assert.equal(getEventParticipationFor('e-new-year').state, 'responded');
});

test('recordPromptCompletionParticipation: no-op for non-event prompt', () => {
  recordPromptCompletionParticipation('p-quiet-moment');
  assert.deepEqual(getEventParticipation(), {});
});

// ---- countEventsResponded ----

test('countEventsResponded: returns 0 for empty', () => {
  assert.equal(countEventsResponded(), 0);
});

test('countEventsResponded: excludes seen-only events', () => {
  recordEventParticipation('e-new-year', 'seen');
  recordEventParticipation('e-valentines', 'responded');
  assert.equal(countEventsResponded(), 1);
});

test('countEventsResponded: includes chronicled', () => {
  recordEventParticipation('e-new-year', 'chronicled');
  recordEventParticipation('e-valentines', 'responded');
  recordEventParticipation('e-betty-white', 'seen');
  assert.equal(countEventsResponded(), 2);
});

test('countEventsResponded: counts each event once regardless of prompts completed', () => {
  // Completing multiple prompts from same event is still 1 event
  recordPromptCompletionParticipation('e-new-year-fresh-start');
  recordPromptCompletionParticipation('e-new-year-changed-mind');
  recordPromptCompletionParticipation('e-new-year-old-self');
  assert.equal(countEventsResponded(), 1);
});

// ---- storage-safety ----

test('getEventParticipation: safe on malformed storage', () => {
  globalThis.localStorage.setItem('pf:settings', JSON.stringify({
    notifications: { eventParticipation: 'not an object' },
  }));
  assert.deepEqual(getEventParticipation(), {});
});

test('getEventParticipation: safe when array is stored by mistake', () => {
  globalThis.localStorage.setItem('pf:settings', JSON.stringify({
    notifications: { eventParticipation: [1, 2, 3] },
  }));
  assert.deepEqual(getEventParticipation(), {});
});

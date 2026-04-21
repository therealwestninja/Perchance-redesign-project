// test/haptic.test.mjs
//
// Tests for the haptic subsystem: schema, control bus, backend registry.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---- Schema tests ----

const {
  defaultHaptics,
  defaultVoice,
  defaultClamps,
  defaultHapticSettings,
  normalizeHaptics,
  normalizeVoice,
  mergeClamps,
  HAPTIC_SCHEMA_VERSION,
} = await import('../src/haptic/schema.js');

test('defaultHaptics returns disabled with schemaVersion', () => {
  const h = defaultHaptics();
  assert.equal(h.enabled, false);
  assert.equal(h.schemaVersion, HAPTIC_SCHEMA_VERSION);
  assert.equal(h.defaults.atomicDuration, 3000);
  assert.equal(h.defaults.atomicIntensity, 0.5);
  assert.equal(h.defaults.defaultTrack, 'vibe');
  assert.deepEqual(h.patterns, {});
  assert.equal(h.ambientPattern, null);
});

test('defaultVoice returns disabled with rate/pitch 1.0', () => {
  const v = defaultVoice();
  assert.equal(v.enabled, false);
  assert.equal(v.rate, 1.0);
  assert.equal(v.pitch, 1.0);
  assert.equal(v.preferredVoiceName, null);
  assert.equal(v.split, null);
});

test('defaultClamps returns sane values', () => {
  const c = defaultClamps();
  assert.equal(c.intensityCeiling, 0.8);
  assert.equal(c.durationCeiling, 20000);
  assert.equal(c.tagsPerMessageCap, 8);
  assert.equal(c.minTagGap, 0);
  assert.equal(c.blockCooldown, 0);
});

test('defaultHapticSettings has global id and buttplug backend', () => {
  const s = defaultHapticSettings();
  assert.equal(s.id, 'global');
  assert.equal(s.activeBackendId, 'buttplug');
  assert.equal(s.intensitySlider, 1.0);
  assert.equal(s.taglessBlockMode, 'silent');
});

test('normalizeHaptics fills in missing fields', () => {
  const h = normalizeHaptics({});
  assert.equal(h.enabled, false);
  assert.equal(h.defaults.atomicDuration, 3000);
  assert.deepEqual(h.patterns, {});
});

test('normalizeHaptics preserves valid fields', () => {
  const h = normalizeHaptics({
    enabled: true,
    defaults: { atomicDuration: 5000 },
    patterns: { tease: { description: 'slow tease' } },
    aliases: { teaze: 'tease' },
  });
  assert.equal(h.enabled, true);
  assert.equal(h.defaults.atomicDuration, 5000);
  assert.equal(h.defaults.atomicIntensity, 0.5); // default fill
  assert.equal(h.patterns.tease.description, 'slow tease');
  assert.equal(h.aliases.teaze, 'tease');
});

test('normalizeHaptics handles null/undefined gracefully', () => {
  assert.equal(normalizeHaptics(null).enabled, false);
  assert.equal(normalizeHaptics(undefined).enabled, false);
  assert.equal(normalizeHaptics('garbage').enabled, false);
});

test('normalizeVoice clamps rate and pitch', () => {
  const v = normalizeVoice({ rate: 99, pitch: -5 });
  assert.equal(v.rate, 10);   // clamped to max
  assert.equal(v.pitch, 0);   // clamped to min
});

test('mergeClamps uses min() of user and character values', () => {
  const user = { intensityCeiling: 0.8, durationCeiling: 20000 };
  const char = { intensityCeiling: 0.6, durationCeiling: 30000 };
  const merged = mergeClamps(user, char);
  assert.equal(merged.intensityCeiling, 0.6);    // char is tighter
  assert.equal(merged.durationCeiling, 20000);   // user is tighter
});

test('mergeClamps ignores null character overrides', () => {
  const user = { intensityCeiling: 0.8 };
  const merged = mergeClamps(user, null);
  assert.equal(merged.intensityCeiling, 0.8);
});

// ---- Control bus tests ----

const {
  getBusState,
  busActivate,
  busPause,
  busResume,
  busStop,
  busError,
  busReset,
  onBusEvent,
} = await import('../src/haptic/control_bus.js');

beforeEach(() => { busReset(); });

test('bus starts in idle state', () => {
  busReset();
  assert.equal(getBusState(), 'idle');
});

test('busActivate transitions to active', () => {
  busReset();
  busActivate('test');
  assert.equal(getBusState(), 'active');
});

test('busPause transitions to paused', () => {
  busReset();
  busActivate();
  busPause('test');
  assert.equal(getBusState(), 'paused');
});

test('busResume transitions from paused to active', () => {
  busReset();
  busActivate();
  busPause();
  busResume();
  assert.equal(getBusState(), 'active');
});

test('busStop returns to idle', () => {
  busReset();
  busActivate();
  busStop();
  assert.equal(getBusState(), 'idle');
});

test('busError transitions to error state', () => {
  busReset();
  busActivate();
  busError('ws-disconnect', new Error('test'));
  assert.equal(getBusState(), 'error');
});

test('onBusEvent fires on state changes', () => {
  busReset();
  const events = [];
  const unsub = onBusEvent('stateChange', (detail) => {
    events.push(detail);
  });
  busActivate('go');
  busPause('wait');
  busResume('ok');
  busStop('done');
  unsub();

  assert.equal(events.length, 4);
  assert.equal(events[0].prev, 'idle');
  assert.equal(events[0].next, 'active');
  assert.equal(events[1].next, 'paused');
  assert.equal(events[2].next, 'active');
  assert.equal(events[3].next, 'idle');
});

test('onBusEvent unsubscribe works', () => {
  busReset();
  let count = 0;
  const unsub = onBusEvent('pause', () => count++);
  busActivate();
  busPause();
  unsub();
  busResume();
  busPause();  // should not fire
  assert.equal(count, 1);
});

test('duplicate state transitions are suppressed', () => {
  busReset();
  const events = [];
  onBusEvent('stateChange', (d) => events.push(d));
  busActivate();
  busActivate();  // same state — no event
  busActivate();  // same state — no event
  assert.equal(events.length, 1);
});

// ---- Backend registry tests ----

// Import buttplug.js so it self-registers (in the IIFE bundle this
// happens automatically via manifest order; in ESM tests it's explicit).
await import('../src/haptic/buttplug.js');

const {
  registerBackend,
  listBackends,
  getBackend,
  setActiveBackend,
  getActiveBackend,
  getActiveBackendId,
  isHapticReady,
} = await import('../src/haptic/backend.js');

test('buttplug plugin self-registers', () => {
  // buttplug.js is imported by backend.js's dependency chain
  const backends = listBackends();
  const bp = backends.find(b => b.id === 'buttplug');
  assert.ok(bp, 'buttplug should be registered');
  assert.equal(bp.displayName, 'Buttplug.io (Intiface Central)');
  assert.equal(bp.connected, false);
});

test('setActiveBackend selects a registered backend', () => {
  assert.ok(setActiveBackend('buttplug'));
  assert.equal(getActiveBackendId(), 'buttplug');
  assert.ok(getActiveBackend());
});

test('setActiveBackend rejects unknown id', () => {
  assert.ok(!setActiveBackend('nonexistent'));
});

test('isHapticReady is false when not connected', () => {
  setActiveBackend('buttplug');
  assert.equal(isHapticReady(), false);
});

test('registerBackend ignores null/missing id', () => {
  const before = listBackends().length;
  registerBackend(null);
  registerBackend({});
  assert.equal(listBackends().length, before);
});

// ---- Mock backend for integration tests ----

test('mock backend connects and dispatches', async () => {
  const log = [];
  const mockBackend = {
    id: 'mock-test',
    displayName: 'Mock Backend',
    capabilities: { vibe: true },
    _connected: false,
    connect: async () => { mockBackend._connected = true; log.push('connect'); },
    disconnect: async () => { mockBackend._connected = false; log.push('disconnect'); },
    isConnected: () => mockBackend._connected,
    listDevices: () => [{ index: 0, name: 'Mock Vibe', primaryType: 'vibe' }],
    getActiveDeviceType: () => 'vibe',
    execute: async (event) => { log.push(`exec:${event.track}:${event.intensity}`); },
    stopAll: async () => { log.push('stop'); },
    on: () => {},
  };

  registerBackend(mockBackend);
  setActiveBackend('mock-test');

  const { connectActiveBackend, executeEvent, stopAll, disconnectActiveBackend } = await import('../src/haptic/backend.js');

  await connectActiveBackend();
  assert.ok(isHapticReady());

  await executeEvent({ track: 'vibe', intensity: 0.5, duration: 100 });
  await stopAll();
  await disconnectActiveBackend();

  assert.deepEqual(log, ['connect', 'exec:vibe:0.5', 'stop', 'disconnect']);

  // Cleanup — switch back to buttplug
  setActiveBackend('buttplug');
});

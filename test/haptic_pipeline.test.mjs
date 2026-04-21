// test/haptic_pipeline.test.mjs
//
// Tests for the M3 haptic pipeline: parser, resolver, scheduler.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---- Parser tests ----

const {
  createParser,
  parseTag,
  parseDuration,
  parseIntensity,
  parseAttrs,
} = await import('../src/haptic/parser.js');

// -- parseDuration --

test('parseDuration: seconds', () => {
  assert.equal(parseDuration('4s'), 4000);
  assert.equal(parseDuration('0.5s'), 500);
  assert.equal(parseDuration('10s'), 10000);
});

test('parseDuration: milliseconds', () => {
  assert.equal(parseDuration('500ms'), 500);
  assert.equal(parseDuration('1200ms'), 1200);
});

test('parseDuration: bare number = ms', () => {
  assert.equal(parseDuration('3000'), 3000);
});

test('parseDuration: invalid returns null', () => {
  assert.equal(parseDuration('abc'), null);
  assert.equal(parseDuration(''), null);
  assert.equal(parseDuration(null), null);
});

// -- parseIntensity --

test('parseIntensity: numeric values clamp to 0..1', () => {
  assert.deepEqual(parseIntensity('0.6'), { value: 0.6, semantic: null });
  assert.deepEqual(parseIntensity('1.5'), { value: 1.0, semantic: null });
  assert.deepEqual(parseIntensity('-0.3'), { value: 0.0, semantic: null });
});

test('parseIntensity: semantic values', () => {
  assert.deepEqual(parseIntensity('low'), { value: 0.3, semantic: 'low' });
  assert.deepEqual(parseIntensity('medium'), { value: 0.5, semantic: 'medium' });
  assert.deepEqual(parseIntensity('high'), { value: 0.7, semantic: 'high' });
  assert.deepEqual(parseIntensity('max'), { value: 1.0, semantic: 'max' });
  assert.deepEqual(parseIntensity('gentle'), { value: 0.3, semantic: 'gentle' });
});

test('parseIntensity: invalid returns null', () => {
  assert.equal(parseIntensity('banana'), null);
});

// -- parseAttrs --

test('parseAttrs: bare values', () => {
  const attrs = parseAttrs('intensity=0.6 duration=4s');
  assert.equal(attrs.intensity, '0.6');
  assert.equal(attrs.duration, '4s');
});

test('parseAttrs: quoted values', () => {
  const attrs = parseAttrs('name="tease" intensity=0.8');
  assert.equal(attrs.name, 'tease');
  assert.equal(attrs.intensity, '0.8');
});

// -- parseTag --

test('parseTag: vibe with full params', () => {
  const tag = parseTag('vibe', 'intensity=0.6 duration=4s', '<vibe intensity=0.6 duration=4s>', 0, null);
  assert.equal(tag.type, 'vibe');
  assert.equal(tag.track, 'vibe');
  assert.equal(tag.intensity, 0.6);
  assert.equal(tag.duration, 4000);
  assert.equal(tag.valid, true);
});

test('parseTag: stop tag', () => {
  const tag = parseTag('stop', '', '<stop>', 0, null);
  assert.equal(tag.type, 'stop');
  assert.equal(tag.intensity, 0);
  assert.equal(tag.duration, 300);
});

test('parseTag: missing params use defaults', () => {
  const tag = parseTag('vibe', '', '<vibe>', 0, { atomicIntensity: 0.5, atomicDuration: 3000, defaultTrack: 'vibe' });
  assert.equal(tag.intensity, 0.5);
  assert.equal(tag.duration, 3000);
});

test('parseTag: pattern with name', () => {
  const tag = parseTag('pattern', 'name=tease intensity=0.8', '<pattern name=tease intensity=0.8>', 0, null);
  assert.equal(tag.type, 'pattern');
  assert.equal(tag.patternName, 'tease');
  assert.equal(tag.intensity, 0.8);
});

test('parseTag: pattern without name is invalid', () => {
  const tag = parseTag('pattern', 'intensity=0.5', '<pattern intensity=0.5>', 0, null);
  assert.equal(tag.valid, false);
  assert.ok(tag.annotations.length > 0);
});

test('parseTag: semantic intensity annotated', () => {
  const tag = parseTag('vibe', 'intensity=medium', '<vibe intensity=medium>', 0, null);
  assert.equal(tag.intensity, 0.5);
  assert.ok(tag.annotations.some(a => a.type === 'semantic-value'));
});

// -- createParser: streaming --

test('parser: single chunk with one tag', () => {
  const tags = [];
  const blocks = [];
  const p = createParser({
    onTag: t => tags.push(t),
    onBlock: b => blocks.push(b),
  });
  p.push('She smiled. <vibe intensity=0.6 duration=4s> And then...');
  p.flush();

  assert.equal(tags.length, 1);
  assert.equal(tags[0].type, 'vibe');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].tags.length, 1);
  assert.ok(blocks[0].prose.includes('She smiled.'));
  assert.ok(blocks[0].prose.includes('And then...'));
});

test('parser: paragraph blocks split on \\n\\n', () => {
  const blocks = [];
  const p = createParser({ onBlock: b => blocks.push(b) });
  p.push('Block one. <vibe intensity=0.3>\n\nBlock two. <stroke speed=0.7>');
  p.flush();

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].tags.length, 1);
  assert.equal(blocks[0].tags[0].type, 'vibe');
  assert.equal(blocks[1].tags.length, 1);
  assert.equal(blocks[1].tags[0].type, 'stroke');
});

test('parser: handles multiple tags in one block', () => {
  const tags = [];
  const p = createParser({ onTag: t => tags.push(t) });
  p.push('<vibe intensity=0.3> text <vibe intensity=0.7> more <stop>');
  p.flush();

  assert.equal(tags.length, 3);
  assert.equal(tags[0].intensity, 0.3);
  assert.equal(tags[1].intensity, 0.7);
  assert.equal(tags[2].type, 'stop');
});

test('parser: streaming chunks — tag split across boundary', () => {
  const tags = [];
  const p = createParser({ onTag: t => tags.push(t) });
  // Tag split: '<vibe inten' + 'sity=0.6 duration=4s>'
  p.push('Hello <vibe inten');
  p.push('sity=0.6 duration=4s> world');
  p.flush();

  assert.equal(tags.length, 1);
  assert.equal(tags[0].type, 'vibe');
  assert.equal(tags[0].intensity, 0.6);
});

test('parser: does NOT match emoticons like <3', () => {
  const tags = [];
  const p = createParser({ onTag: t => tags.push(t) });
  p.push('I love you <3 so much');
  p.flush();

  assert.equal(tags.length, 0);
});

test('parser: reset clears state', () => {
  const p = createParser({});
  p.push('<vibe intensity=0.5>');
  p.flush();
  assert.equal(p.getTags().length, 1);

  p.reset();
  assert.equal(p.getTags().length, 0);
});

test('parser: preserves prose without tags', () => {
  const blocks = [];
  const p = createParser({ onBlock: b => blocks.push(b) });
  p.push('Just plain text, no tags here.');
  p.flush();

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].tags.length, 0);
  assert.equal(blocks[0].prose, 'Just plain text, no tags here.');
});

// ---- Resolver tests ----

const {
  resolveBlock,
  clampTag,
  estimateReadingDuration,
} = await import('../src/haptic/resolver.js');

test('resolveBlock: single vibe tag', () => {
  const block = {
    index: 0,
    tags: [{ type: 'vibe', track: 'vibe', intensity: 0.6, duration: 4000 }],
    prose: 'test',
    proseLength: 4,
  };
  const { events, meta } = resolveBlock(block, { slider: 1.0, decayHalfLife: 0, clamps: { intensityCeiling: 1.0, durationCeiling: 20000, tagsPerMessageCap: 8, patternDurationCeiling: 60000, minTagGap: 0, blockCooldown: 0 } });

  assert.equal(events.length, 1);
  assert.equal(events[0].intensity, 0.6);
  assert.equal(events[0].duration, 4000);
  assert.equal(events[0].track, 'vibe');
});

test('resolveBlock: slider scales intensity', () => {
  const block = {
    index: 0,
    tags: [{ type: 'vibe', track: 'vibe', intensity: 0.8, duration: 1000 }],
    prose: '', proseLength: 0,
  };
  const { events } = resolveBlock(block, { slider: 0.5, decayHalfLife: 0 });
  assert.equal(events[0].intensity, 0.4); // 0.8 × 0.5
});

test('resolveBlock: clamps intensity ceiling', () => {
  const block = {
    index: 0,
    tags: [{ type: 'vibe', track: 'vibe', intensity: 0.9, duration: 1000 }],
    prose: '', proseLength: 0,
  };
  const { events } = resolveBlock(block, {
    slider: 1.0,
    clamps: { intensityCeiling: 0.5, durationCeiling: 20000, tagsPerMessageCap: 8, patternDurationCeiling: 60000, minTagGap: 0, blockCooldown: 0 },
  });
  assert.equal(events[0].intensity, 0.5); // clamped from 0.9
});

test('resolveBlock: caps tags per message', () => {
  const tags = Array.from({ length: 12 }, (_, i) => ({
    type: 'vibe', track: 'vibe', intensity: 0.5, duration: 100,
  }));
  const block = { index: 0, tags, prose: '', proseLength: 0 };
  const { events, meta } = resolveBlock(block, {
    decayHalfLife: 0,
    clamps: { tagsPerMessageCap: 8, intensityCeiling: 1, durationCeiling: 20000, patternDurationCeiling: 60000, minTagGap: 0, blockCooldown: 0 },
  });

  assert.equal(events.length, 8);
  assert.equal(meta.discardedCount, 4);
});

test('resolveBlock: tagless block in silent mode returns no events', () => {
  const block = { index: 0, tags: [], prose: 'Some prose text here.', proseLength: 21 };
  const { events, meta } = resolveBlock(block, { taglessMode: 'silent' });
  assert.equal(events.length, 0);
  assert.equal(meta.isSynthetic, false);
});

test('resolveBlock: tagless block in baseline mode returns floor event', () => {
  const block = { index: 0, tags: [], prose: 'Some prose text here.', proseLength: 21 };
  const { events, meta } = resolveBlock(block, {
    taglessMode: 'baseline',
    baselineIntensity: 0.15,
    decayHalfLife: 0,
    slider: 1.0,
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].intensity, 0.15);
  assert.ok(events[0].duration > 0);
  assert.equal(meta.isSynthetic, true);
});

test('resolveBlock: events sorted by time', () => {
  const block = {
    index: 0,
    tags: [
      { type: 'vibe', track: 'vibe', intensity: 0.3, duration: 2000 },
      { type: 'stroke', track: 'stroke', intensity: 0.5, duration: 1000 },
    ],
    prose: '', proseLength: 0,
  };
  const { events } = resolveBlock(block, { slider: 1.0 });
  assert.ok(events[0].t <= events[1].t);
});

test('clampTag: clamps both intensity and duration', () => {
  const tag = { type: 'vibe', track: 'vibe', intensity: 0.95, duration: 30000 };
  const clamps = { intensityCeiling: 0.8, durationCeiling: 20000 };
  const result = clampTag(tag, clamps);
  assert.equal(result.intensity, 0.8);
  assert.equal(result.duration, 20000);
  assert.equal(result._clamped, true);
});

test('estimateReadingDuration: reasonable for typical prose', () => {
  // 100 chars ≈ 20 words ≈ 6 seconds at 200wpm
  const dur = estimateReadingDuration(100);
  assert.ok(dur >= 1000);
  assert.ok(dur < 30000);
});

// ---- Scheduler tests ----

// Import scheduler and wire up a mock backend for testing
import { busReset } from '../src/haptic/control_bus.js';
import { registerBackend, setActiveBackend } from '../src/haptic/backend.js';

const {
  enqueueBlock,
  flushQueue,
  getQueueDepth,
  setCharacterConfig,
  clearCharacterConfig,
  _isRunning,
} = await import('../src/haptic/scheduler.js');

// Mock backend for scheduler tests
const _execLog = [];
const mockSchedBackend = {
  id: 'mock-sched',
  displayName: 'Mock Scheduler Backend',
  capabilities: { vibe: true },
  _connected: false,
  connect: async () => { mockSchedBackend._connected = true; },
  disconnect: async () => { mockSchedBackend._connected = false; },
  isConnected: () => mockSchedBackend._connected,
  listDevices: () => [{ index: 0, name: 'Mock', primaryType: 'vibe' }],
  getActiveDeviceType: () => 'vibe',
  execute: async (event) => { _execLog.push(event); },
  stopAll: async () => { _execLog.push({ type: 'stopAll' }); },
  on: () => {},
};

registerBackend(mockSchedBackend);

test('scheduler: enqueue and flush', async () => {
  busReset();
  _execLog.length = 0;
  setActiveBackend('mock-sched');
  await mockSchedBackend.connect();

  const block = {
    index: 0,
    tags: [{ type: 'vibe', track: 'vibe', intensity: 0.5, duration: 50 }],
    prose: 'test', proseLength: 4,
  };

  enqueueBlock(block);

  // Wait for scheduler to process
  await new Promise(r => setTimeout(r, 200));

  assert.ok(_execLog.length >= 1, 'should have dispatched at least one event');
  assert.equal(_execLog[0].track, 'vibe');
  assert.equal(_execLog[0].intensity, 0.5);

  await mockSchedBackend.disconnect();
  flushQueue();
  clearCharacterConfig();
});

test('scheduler: flushQueue clears pending blocks', () => {
  enqueueBlock({ index: 0, tags: [], prose: '', proseLength: 0 });
  enqueueBlock({ index: 1, tags: [], prose: '', proseLength: 0 });
  assert.ok(getQueueDepth() >= 1);
  flushQueue();
  assert.equal(getQueueDepth(), 0);
});

test('scheduler: setCharacterConfig/clearCharacterConfig', () => {
  setCharacterConfig({ patterns: { tease: {} }, ambientPattern: 'tease' });
  clearCharacterConfig();
  // No crash — just verifying the API
  assert.ok(true);
});

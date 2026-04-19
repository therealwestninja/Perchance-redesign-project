// test/best_effort.test.mjs
//
// Tests for src/utils/best_effort.js. Validates:
//   - Successful calls return fn's return value
//   - Thrown errors are swallowed (no escape to caller)
//   - Debug log emitted on failure with the tag included
//   - Async variant awaits and handles rejection
//   - Missing console.debug doesn't itself throw

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { bestEffort, bestEffortAsync } = await import('../src/utils/best_effort.js');

// Capture console.debug calls for assertion; restore after each test.
function captureDebug(run) {
  const original = console.debug;
  const captured = [];
  console.debug = (...args) => { captured.push(args); };
  try {
    return { captured, result: run() };
  } finally {
    console.debug = original;
  }
}

async function captureDebugAsync(run) {
  const original = console.debug;
  const captured = [];
  console.debug = (...args) => { captured.push(args); };
  try {
    const result = await run();
    return { captured, result };
  } finally {
    console.debug = original;
  }
}

// ---- bestEffort: sync ----

test('bestEffort: returns fn return value on success', () => {
  assert.equal(bestEffort(() => 42), 42);
  assert.equal(bestEffort(() => 'hello'), 'hello');
  assert.deepEqual(bestEffort(() => ({ a: 1 })), { a: 1 });
});

test('bestEffort: success does NOT log', () => {
  const { captured } = captureDebug(() => bestEffort(() => 1));
  assert.equal(captured.length, 0);
});

test('bestEffort: swallows throw, returns undefined', () => {
  const r = bestEffort(() => { throw new Error('boom'); });
  assert.equal(r, undefined);
});

test('bestEffort: logs at debug level with tag on failure', () => {
  const { captured } = captureDebug(() =>
    bestEffort(() => { throw new Error('nope'); }, 'myOp')
  );
  assert.equal(captured.length, 1);
  const [msg, err] = captured[0];
  assert.ok(msg.includes('myOp'), `expected tag in msg, got: ${msg}`);
  assert.ok(err instanceof Error);
  assert.equal(err.message, 'nope');
});

test('bestEffort: default tag when none provided', () => {
  const { captured } = captureDebug(() =>
    bestEffort(() => { throw new Error('x'); })
  );
  assert.equal(captured.length, 1);
  const [msg] = captured[0];
  assert.ok(msg.includes('operation'), 'default tag should appear in msg');
});

test('bestEffort: logs non-Error throws too', () => {
  const { captured } = captureDebug(() =>
    bestEffort(() => { throw 'string thrown'; }, 't')
  );
  assert.equal(captured.length, 1);
  const [, e] = captured[0];
  assert.equal(e, 'string thrown');
});

test('bestEffort: survives missing console.debug', () => {
  const original = console.debug;
  delete console.debug; // simulate exotic env
  try {
    // Should not itself throw
    const r = bestEffort(() => { throw new Error('x'); }, 't');
    assert.equal(r, undefined);
  } finally {
    console.debug = original;
  }
});

// ---- bestEffortAsync ----

test('bestEffortAsync: resolves with fn result on success', async () => {
  const r = await bestEffortAsync(async () => 99);
  assert.equal(r, 99);
});

test('bestEffortAsync: swallows async rejection', async () => {
  const r = await bestEffortAsync(async () => { throw new Error('boom'); }, 'asyncOp');
  assert.equal(r, undefined);
});

test('bestEffortAsync: logs on rejection with tag', async () => {
  const { captured, result } = await captureDebugAsync(
    () => bestEffortAsync(async () => { throw new Error('async-fail'); }, 'myAsync')
  );
  assert.equal(result, undefined);
  assert.equal(captured.length, 1);
  const [msg, err] = captured[0];
  assert.ok(msg.includes('myAsync'));
  assert.equal(err.message, 'async-fail');
});

test('bestEffortAsync: swallows synchronous throw from the fn too', async () => {
  // fn throws synchronously before returning a promise
  const r = await bestEffortAsync(() => { throw new Error('sync-in-async'); }, 't');
  assert.equal(r, undefined);
});

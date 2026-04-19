// test/paint_app_accent.test.mjs
//
// Unit tests for paintAppAccent(accent) — the helper that cascades
// the user's accent color into upstream Perchance's CSS custom
// properties on document.documentElement.
//
// We don't have jsdom; we mock global.document with a minimal
// documentElement.style.setProperty observer. Each test installs
// its own mock so state never leaks between cases.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { paintAppAccent } = await import('../src/profile/flair.js');

/**
 * Build a minimal document mock that records every setProperty call.
 * Returns { doc, calls } — calls is an array of [name, value] tuples.
 */
function mockDocument() {
  const calls = [];
  const doc = {
    documentElement: {
      style: {
        setProperty(name, value) { calls.push([name, value]); },
      },
    },
  };
  return { doc, calls };
}

test('paintAppAccent: overrides the 4 upstream accent-variable targets', () => {
  const { doc, calls } = mockDocument();
  const prev = globalThis.document;
  globalThis.document = doc;
  try {
    paintAppAccent({ color: '#8a4ec8', rgb: '138, 78, 200' });
  } finally {
    globalThis.document = prev;
  }
  const names = calls.map(c => c[0]);
  assert.deepEqual(
    names.sort(),
    [
      '--link-color',
      '--notification-bg-color',
      '--selected-thread-bg',
      '--selected-thread-border-color',
    ].sort(),
  );
});

test('paintAppAccent: solid targets receive the hex color; selected-thread-bg uses 18% alpha', () => {
  const { doc, calls } = mockDocument();
  const prev = globalThis.document;
  globalThis.document = doc;
  try {
    paintAppAccent({ color: '#8a4ec8', rgb: '138, 78, 200' });
  } finally {
    globalThis.document = prev;
  }
  const byName = Object.fromEntries(calls);
  assert.equal(byName['--notification-bg-color'],        '#8a4ec8');
  assert.equal(byName['--link-color'],                   '#8a4ec8');
  assert.equal(byName['--selected-thread-border-color'], '#8a4ec8');
  assert.equal(byName['--selected-thread-bg'],           'rgba(138, 78, 200, 0.18)');
});

test('paintAppAccent: derives rgb from color when rgb not supplied', () => {
  const { doc, calls } = mockDocument();
  const prev = globalThis.document;
  globalThis.document = doc;
  try {
    // Passing only { color } — paintAppAccent should call hexToRgb
    // internally so selected-thread-bg still renders correctly.
    paintAppAccent({ color: '#d8b36a' });
  } finally {
    globalThis.document = prev;
  }
  const byName = Object.fromEntries(calls);
  assert.equal(byName['--selected-thread-bg'], 'rgba(216, 179, 106, 0.18)');
});

test('paintAppAccent: no-op when document is unavailable (e.g. SSR, early boot)', () => {
  const prev = globalThis.document;
  globalThis.document = undefined;
  try {
    // Should not throw — just silently skip.
    paintAppAccent({ color: '#d8b36a', rgb: '216, 179, 106' });
  } finally {
    globalThis.document = prev;
  }
});

test('paintAppAccent: no-op when accent is malformed', () => {
  const { doc, calls } = mockDocument();
  const prev = globalThis.document;
  globalThis.document = doc;
  try {
    paintAppAccent(null);
    paintAppAccent(undefined);
    paintAppAccent({});
    paintAppAccent({ color: 42 });
  } finally {
    globalThis.document = prev;
  }
  // None of those calls should have hit setProperty
  assert.equal(calls.length, 0);
});

test('paintAppAccent: survives a throwing setProperty (swallows and continues)', () => {
  const doc = {
    documentElement: {
      style: {
        setProperty() { throw new Error('CSSOM rejected the value'); },
      },
    },
  };
  const prev = globalThis.document;
  globalThis.document = doc;
  try {
    // Should not throw — theming is a nicety, not a promise.
    paintAppAccent({ color: '#d8b36a', rgb: '216, 179, 106' });
  } finally {
    globalThis.document = prev;
  }
});

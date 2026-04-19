// test/utils_image.test.mjs — pure validation tests for the avatar pipeline.
// resizeImageToDataURL is browser-only (FileReader, Image, canvas) and not
// tested here; its guards route through checkImageFile first anyway.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkImageFile,
  DEFAULT_ALLOWED_TYPES,
  DEFAULT_MAX_BYTES,
} from '../src/utils/image.js';

// ---- rejects ----

test('checkImageFile rejects null', () => {
  const r = checkImageFile(null);
  assert.equal(r.ok, false);
  assert.match(r.error, /No file/i);
});

test('checkImageFile rejects undefined', () => {
  const r = checkImageFile(undefined);
  assert.equal(r.ok, false);
});

test('checkImageFile rejects non-object', () => {
  const r = checkImageFile('string is not a file');
  assert.equal(r.ok, false);
});

test('checkImageFile rejects wrong MIME type', () => {
  const r = checkImageFile({ type: 'text/plain', size: 100 });
  assert.equal(r.ok, false);
  assert.match(r.error, /JPEG|PNG|image/i);
});

test('checkImageFile rejects SVG (not in allowlist — potential script vector)', () => {
  // SVG can embed <script>, so we don't accept it even though it's technically an image
  const r = checkImageFile({ type: 'image/svg+xml', size: 1000 });
  assert.equal(r.ok, false);
});

test('checkImageFile rejects missing type', () => {
  const r = checkImageFile({ size: 1000 });
  assert.equal(r.ok, false);
});

test('checkImageFile rejects zero-byte file', () => {
  const r = checkImageFile({ type: 'image/png', size: 0 });
  assert.equal(r.ok, false);
  assert.match(r.error, /empty/i);
});

test('checkImageFile rejects missing size', () => {
  const r = checkImageFile({ type: 'image/png' });
  assert.equal(r.ok, false);
});

test('checkImageFile rejects over-size with helpful message', () => {
  const r = checkImageFile({ type: 'image/jpeg', size: DEFAULT_MAX_BYTES + 1 });
  assert.equal(r.ok, false);
  assert.match(r.error, /too large|limit/i);
});

// ---- accepts ----

test('checkImageFile accepts a typical JPEG photo (~2MB)', () => {
  const r = checkImageFile({ type: 'image/jpeg', size: 2 * 1024 * 1024 });
  assert.equal(r.ok, true);
});

test('checkImageFile accepts all configured default types', () => {
  for (const type of DEFAULT_ALLOWED_TYPES) {
    const r = checkImageFile({ type, size: 500 });
    assert.equal(r.ok, true, `should accept ${type}`);
  }
});

test('checkImageFile accepts at the exact size limit', () => {
  const r = checkImageFile({ type: 'image/png', size: DEFAULT_MAX_BYTES });
  assert.equal(r.ok, true);
});

// ---- options ----

test('checkImageFile honors custom maxBytes', () => {
  const okAtDefault = checkImageFile({ type: 'image/jpeg', size: 500 * 1024 });
  assert.equal(okAtDefault.ok, true);

  const rejectedAtTight = checkImageFile(
    { type: 'image/jpeg', size: 500 * 1024 },
    { maxBytes: 100 * 1024 }
  );
  assert.equal(rejectedAtTight.ok, false);
});

test('checkImageFile honors custom allowedTypes', () => {
  const strict = { allowedTypes: ['image/png'] };
  assert.equal(checkImageFile({ type: 'image/png', size: 500 }, strict).ok, true);
  assert.equal(checkImageFile({ type: 'image/jpeg', size: 500 }, strict).ok, false);
});

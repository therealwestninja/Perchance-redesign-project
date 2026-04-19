// test/sparkline.test.mjs
//
// Unit tests for src/render/sparkline.js. Testing the pure helper
// computeSparklinePoints — the SVG-generation path needs a DOM and
// is exercised via Perchance integration rather than unit tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { computeSparklinePoints } = await import('../src/render/sparkline.js');

test('computeSparklinePoints: empty series returns empty result', () => {
  assert.deepEqual(computeSparklinePoints([]), { points: [], max: 0, lastIdx: -1 });
  assert.deepEqual(computeSparklinePoints(null), { points: [], max: 0, lastIdx: -1 });
  assert.deepEqual(computeSparklinePoints(undefined), { points: [], max: 0, lastIdx: -1 });
});

test('computeSparklinePoints: all-zero series reports max=0', () => {
  const r = computeSparklinePoints([0, 0, 0, 0], 80, 20);
  assert.equal(r.max, 0);
  // Points still generated so the caller can render a flat line at PAD_Y
  assert.equal(r.points.length, 4);
});

test('computeSparklinePoints: single non-zero value', () => {
  const r = computeSparklinePoints([5], 80, 20);
  assert.equal(r.max, 5);
  assert.equal(r.points.length, 1);
  // stepX=0 for single-value series: x=0
  assert.equal(r.points[0][0], 0);
});

test('computeSparklinePoints: multiple values span the width', () => {
  const r = computeSparklinePoints([0, 1, 2, 3], 90, 20);
  assert.equal(r.points.length, 4);
  // With 4 values and width 90, stepX = 30
  assert.equal(r.points[0][0], 0);
  assert.equal(r.points[1][0], 30);
  assert.equal(r.points[2][0], 60);
  assert.equal(r.points[3][0], 90);
});

test('computeSparklinePoints: y coords inverted (SVG convention)', () => {
  // Max should render HIGH on screen = LOW y value (SVG origin top-left)
  const r = computeSparklinePoints([0, 10], 80, 20);
  const [, yMin] = r.points[0]; // value=0
  const [, yMax] = r.points[1]; // value=10, should be highest point = lowest y
  assert.ok(yMin > yMax, 'value=0 should render lower on screen than value=10');
});

test('computeSparklinePoints: normalizes to series max', () => {
  // Small-valued series should fill the same visual space as large-valued
  const small = computeSparklinePoints([0, 1, 2], 80, 20);
  const large = computeSparklinePoints([0, 500, 1000], 80, 20);
  // Y at peak should be the same for both
  assert.equal(small.points[2][1], large.points[2][1]);
});

test('computeSparklinePoints: lastIdx equals series.length - 1', () => {
  assert.equal(computeSparklinePoints([1, 2, 3]).lastIdx, 2);
  assert.equal(computeSparklinePoints([0]).lastIdx, 0);
});

test('computeSparklinePoints: handles non-numeric values as 0', () => {
  const r = computeSparklinePoints([null, undefined, 'x', 5]);
  assert.equal(r.max, 5);
});

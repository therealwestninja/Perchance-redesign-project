// test/clustering.test.mjs
//
// Tests for memory/clustering.js. Focus on: determinism, correctness on
// synthetic data where we know the right answer, edge cases.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  seededRandom,
  l2Normalize,
  sqDistance,
  kmeans,
  recommendK,
} from '../src/memory/clustering.js';

// ---- RNG ----

test('seededRandom: same seed produces same sequence', () => {
  const a = seededRandom(42);
  const b = seededRandom(42);
  for (let i = 0; i < 10; i++) {
    assert.equal(a(), b());
  }
});

test('seededRandom: different seeds diverge', () => {
  const a = seededRandom(1);
  const b = seededRandom(2);
  // Not a tight bound; just shouldn't be identical sequences.
  let different = 0;
  for (let i = 0; i < 10; i++) {
    if (a() !== b()) different++;
  }
  assert.ok(different >= 8, 'different seeds should give different sequences');
});

test('seededRandom: produces [0, 1) floats', () => {
  const r = seededRandom(12345);
  for (let i = 0; i < 1000; i++) {
    const x = r();
    assert.ok(x >= 0 && x < 1, `out of range: ${x}`);
  }
});

// ---- l2Normalize ----

test('l2Normalize: unit vector stays unit', () => {
  const v = new Float32Array([1, 0, 0]);
  l2Normalize(v);
  assert.ok(Math.abs(v[0] - 1) < 1e-6);
  assert.equal(v[1], 0);
  assert.equal(v[2], 0);
});

test('l2Normalize: scales to unit length', () => {
  const v = new Float32Array([3, 4]);
  l2Normalize(v);
  const mag = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
  assert.ok(Math.abs(mag - 1) < 1e-6);
  assert.ok(Math.abs(v[0] - 0.6) < 1e-6);
  assert.ok(Math.abs(v[1] - 0.8) < 1e-6);
});

test('l2Normalize: zero vector stays zero', () => {
  const v = new Float32Array([0, 0, 0]);
  l2Normalize(v);
  assert.deepEqual([...v], [0, 0, 0]);
});

// ---- sqDistance ----

test('sqDistance: identical vectors ⇒ 0', () => {
  const a = new Float32Array([0.5, 0.5]);
  const b = new Float32Array([0.5, 0.5]);
  assert.equal(sqDistance(a, b), 0);
});

test('sqDistance: orthogonal unit vectors ⇒ 2', () => {
  const a = new Float32Array([1, 0]);
  const b = new Float32Array([0, 1]);
  assert.equal(sqDistance(a, b), 2);
});

// ---- recommendK ----

test('recommendK: sensible defaults', () => {
  assert.equal(recommendK(0), 1, 'edge');
  assert.equal(recommendK(1), 1);
  assert.equal(recommendK(2), 2);
  assert.equal(recommendK(3), 3);
  // sqrt(n/2) capped to [3,15]
  assert.ok(recommendK(10) >= 3);
  assert.ok(recommendK(200) <= 15);
  assert.ok(recommendK(1000) <= 15);
});

// ---- kmeans ----

test('kmeans: empty input produces empty output', () => {
  const r = kmeans({ vectors: [], k: 3 });
  assert.deepEqual(r.assignments, []);
  assert.deepEqual(r.centers, []);
});

test('kmeans: single vector → single cluster', () => {
  const r = kmeans({ vectors: [new Float32Array([1, 0, 0])], k: 3 });
  assert.equal(r.assignments.length, 1);
  assert.equal(r.assignments[0], 0);
});

test('kmeans: k > n is clamped to n', () => {
  const vectors = [
    new Float32Array([1, 0]),
    new Float32Array([0, 1]),
  ];
  const r = kmeans({ vectors, k: 10 });
  // Only 2 distinct clusters possible.
  const uniqueClusters = new Set(r.assignments);
  assert.ok(uniqueClusters.size <= 2);
});

test('kmeans: two clear clusters separate correctly', () => {
  // Two clusters: "apples" near [1, 0], "bananas" near [0, 1]
  const vectors = [
    new Float32Array([1.0, 0.05]),
    new Float32Array([0.98, 0.1]),
    new Float32Array([0.95, 0.05]),
    new Float32Array([0.1, 1.0]),
    new Float32Array([0.05, 0.98]),
    new Float32Array([0.05, 0.95]),
  ];
  const r = kmeans({ vectors, k: 2 });
  // First three should share a cluster; last three should share the other
  const a = r.assignments;
  assert.equal(a[0], a[1], 'first three in same cluster');
  assert.equal(a[1], a[2]);
  assert.equal(a[3], a[4], 'last three in same cluster');
  assert.equal(a[4], a[5]);
  assert.notEqual(a[0], a[3], 'the two groups differ');
});

test('kmeans: deterministic with seeded RNG', () => {
  const vectorSpec = [
    [1, 0.1, 0.1], [0.9, 0.2, 0.1], [0.1, 1, 0.1],
    [0.1, 0.9, 0.2], [0.1, 0.1, 1], [0.2, 0.1, 0.9],
  ];
  const v1 = vectorSpec.map(s => new Float32Array(s));
  const v2 = vectorSpec.map(s => new Float32Array(s));

  const r1 = kmeans({ vectors: v1, k: 3, seed: 42 });
  const r2 = kmeans({ vectors: v2, k: 3, seed: 42 });
  assert.deepEqual(r1.assignments, r2.assignments);
});

test('kmeans: runs produce same clusters regardless of explicit seed when input is stable', () => {
  // Relies on deriveSeed: same input → same seed → same result
  const v1 = [new Float32Array([1, 0]), new Float32Array([0, 1]), new Float32Array([0.9, 0.1])];
  const v2 = [new Float32Array([1, 0]), new Float32Array([0, 1]), new Float32Array([0.9, 0.1])];
  const r1 = kmeans({ vectors: v1, k: 2 });
  const r2 = kmeans({ vectors: v2, k: 2 });
  assert.deepEqual(r1.assignments, r2.assignments);
});

test('kmeans: converges on trivial input', () => {
  const vectors = [
    new Float32Array([1, 0]),
    new Float32Array([0, 1]),
    new Float32Array([1, 0]),
    new Float32Array([0, 1]),
  ];
  const r = kmeans({ vectors, k: 2 });
  assert.ok(r.converged, 'should converge');
  assert.ok(r.iterations < 10, `expected quick convergence, got ${r.iterations}`);
});

test('kmeans: handles pathological case (all duplicates)', () => {
  const vectors = Array.from({ length: 6 }, () => new Float32Array([1, 0]));
  const r = kmeans({ vectors, k: 3 });
  // All identical vectors → assignments can go any way, but shouldn't crash
  assert.equal(r.assignments.length, 6);
});

test('kmeans: respects maxIterations cap', () => {
  const vectors = [
    new Float32Array([1, 0]),
    new Float32Array([0, 1]),
    new Float32Array([0.5, 0.5]),
  ];
  const r = kmeans({ vectors, k: 2, maxIterations: 1 });
  assert.equal(r.iterations, 1);
});

test('kmeans: assignments length matches vectors length', () => {
  const n = 20;
  const vectors = Array.from({ length: n }, (_, i) =>
    new Float32Array([Math.cos(i), Math.sin(i)])
  );
  const r = kmeans({ vectors, k: 4 });
  assert.equal(r.assignments.length, n);
  for (const a of r.assignments) {
    assert.ok(a >= 0 && a < 4, `cluster index out of range: ${a}`);
  }
});

test('kmeans: every cluster center returned has correct dimension', () => {
  const dim = 10;
  const vectors = Array.from({ length: 6 }, () =>
    new Float32Array(dim).map(() => Math.random())
  );
  const r = kmeans({ vectors, k: 3 });
  for (const c of r.centers) {
    assert.equal(c.length, dim);
  }
});

// ---- recommendK with prefMultiplier (#5d) ----

test('recommendK: prefMultiplier defaults to 1 (no behavior change without arg)', () => {
  // Multi-arg call equals single-arg call when multiplier is 1.
  for (const n of [4, 10, 50, 200, 1000]) {
    assert.equal(recommendK(n, 1), recommendK(n), `n=${n}`);
  }
});

test('recommendK: multiplier > 1 returns at least the default for moderate inputs', () => {
  // 2x should give >= the default for moderate-to-large inputs.
  // (Trivially small inputs (≤3) ignore the multiplier — they always
  // return n.) Sanity bound [3, 15] still applies, so we can't go above 15.
  for (const n of [10, 50, 200]) {
    const base = recommendK(n);
    const denser = recommendK(n, 2);
    assert.ok(denser >= base, `n=${n}: denser=${denser} should be >= base=${base}`);
  }
});

test('recommendK: multiplier < 1 returns at most the default', () => {
  for (const n of [10, 50, 200, 500]) {
    const base = recommendK(n);
    const sparser = recommendK(n, 0.5);
    assert.ok(sparser <= base, `n=${n}: sparser=${sparser} should be <= base=${base}`);
  }
});

test('recommendK: sanity bounds [3, 15] apply regardless of multiplier', () => {
  // Even with extreme multipliers, k stays in [3, 15] for non-trivial n.
  for (const n of [10, 100, 10000]) {
    const huge = recommendK(n, 100);
    assert.ok(huge <= 15, `n=${n} mult=100: ${huge} should be <= 15`);
    const tiny = recommendK(n, 0.001);
    assert.ok(tiny >= 3, `n=${n} mult=0.001: ${tiny} should be >= 3`);
  }
});

test('recommendK: invalid multiplier falls back to 1', () => {
  // NaN, negative, zero, non-number — all treated as 1.
  for (const bad of [NaN, -1, 0, 'abc', null, undefined]) {
    assert.equal(recommendK(50, bad), recommendK(50, 1), `bad input ${bad}`);
  }
});

test('recommendK: trivially small inputs ignore the multiplier', () => {
  // n <= 3 always returns n, regardless of multiplier.
  assert.equal(recommendK(0, 2), 1);
  assert.equal(recommendK(1, 0.5), 1);
  assert.equal(recommendK(2, 100), 2);
  assert.equal(recommendK(3, 0.01), 3);
});

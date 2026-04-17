// build.test.mjs — smoke tests for build/build.mjs
//
// Run with: npm test    (or: node --test test/)
//
// These tests run the real build against the real vendor sources in a
// controlled way and verify basic invariants. No mocking.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from '../build/build.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);

test('build produces both output files', async () => {
  const result = await build();
  assert.ok(result.top.path.endsWith('perchance_1.txt'), 'top output path');
  assert.ok(result.panel.path.endsWith('perchance_2.txt'), 'panel output path');
  assert.ok(result.top.bytes > 0, 'top output is non-empty');
  assert.ok(result.panel.bytes > 0, 'panel output is non-empty');
});

test('top DSL output matches vendored source byte-for-byte', async () => {
  await build();
  const vendored = await readFile(join(ROOT, 'vendor/perchance-ai-character-chat/perchance_1.txt'), 'utf8');
  const built = await readFile(join(ROOT, 'build/perchance_1.txt'), 'utf8');
  assert.equal(built, vendored, 'top DSL should be passed through unchanged');
});

test('panel output contains vendored source', async () => {
  await build();
  const vendored = await readFile(join(ROOT, 'vendor/perchance-ai-character-chat/perchance_2.txt'), 'utf8');
  const built = await readFile(join(ROOT, 'build/perchance_2.txt'), 'utf8');
  // with empty manifest, built output is vendored + scaffold sentinel comment
  assert.ok(built.startsWith(vendored.trimEnd()), 'panel should start with full vendored source');
});

test('with empty manifest, a scaffold sentinel is appended', async () => {
  // Only runs a meaningful check when the manifest is currently empty.
  // Once real modules are listed, a different assertion applies (next test).
  const manifestText = await readFile(join(ROOT, 'src/manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestText);
  if ((manifest.modules || []).length !== 0) return;

  const result = await build();
  assert.equal(result.moduleCount, 0);
  const built = await readFile(join(ROOT, 'build/perchance_2.txt'), 'utf8');
  assert.match(built, /project scaffold: no modules/);
});

test('with populated manifest, module bundle is appended', async () => {
  const manifestText = await readFile(join(ROOT, 'src/manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestText);
  if ((manifest.modules || []).length === 0) return;

  const result = await build();
  assert.equal(result.moduleCount, manifest.modules.length);
  const built = await readFile(join(ROOT, 'build/perchance_2.txt'), 'utf8');
  assert.match(built, /appended by build\/build\.mjs/);
  assert.match(built, /window\.__perchance_fork__/);
  for (const mod of manifest.modules) {
    assert.ok(built.includes(`module: ${mod}`), `bundle should mark ${mod}`);
  }
  // Verify ESM keywords got stripped — not present in the output
  assert.ok(!/^\s*export\s/m.test(built), 'export keyword should be stripped from bundle');
  assert.ok(!/^\s*import\s.*from\s/m.test(built), 'import keyword should be stripped from bundle');
});

test('build is idempotent — second run reports unchanged', async () => {
  await build();
  const second = await build();
  assert.equal(second.top.changed, false, 'top should be unchanged on second run');
  assert.equal(second.panel.changed, false, 'panel should be unchanged on second run');
});

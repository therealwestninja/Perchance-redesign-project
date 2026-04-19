#!/usr/bin/env node
// build.mjs — assemble Perchance generator files from vendored upstream + src/
//
// Reads:
//   vendor/perchance-ai-character-chat/perchance_1.txt
//   vendor/perchance-ai-character-chat/perchance_2.txt
//   src/manifest.json  (ordered list of modules to bundle)
//   src/**/*.js        (modules referenced by the manifest)
//
// Writes:
//   build/perchance_1.txt  (top DSL — vendored as-is for now)
//   build/perchance_2.txt  (HTML panel + appended project bundle)
//
// Flags:
//   --check   Exit non-zero if build would change any output file.
//             Useful in CI to enforce "build output is committed".
//
// No dependencies. Pure Node stdlib. Target: Node >= 20.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const VENDOR = join(ROOT, 'vendor', 'perchance-ai-character-chat');
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'build');

const CHECK_MODE = process.argv.includes('--check');

// ---------- helpers ----------

async function readText(path) {
  return readFile(path, 'utf8');
}

async function writeIfChanged(path, content) {
  let existing = '';
  try { existing = await readText(path); } catch {}
  const changed = existing !== content;
  if (changed && CHECK_MODE) {
    throw new Error(`--check: output would change at ${path.replace(ROOT + '/', '')}`);
  }
  if (changed) await writeFile(path, content);
  return { path, changed, bytes: content.length };
}

async function loadManifest() {
  try {
    const text = await readText(join(SRC, 'manifest.json'));
    const json = JSON.parse(text);
    return { modules: Array.isArray(json.modules) ? json.modules : [] };
  } catch (e) {
    if (e.code === 'ENOENT') return { modules: [] };
    throw new Error(`manifest.json is invalid: ${e.message}`);
  }
}

// Source files are authored as ESM so Node tests can import them directly.
// When bundling into a single IIFE for Perchance, ESM-only keywords must be
// stripped since the whole bundle runs as a plain <script>. The stripper is
// deliberately simple: it handles the common shapes we use, not arbitrary
// import/export syntax. Keep source files to simple forms.
function stripEsmKeywords(code) {
  // `import ... from '...'` and bare `import '...'` — bundle is one scope
  code = code.replace(/^[ \t]*import\s[^;]*?from\s+['"][^'"]+['"]\s*;?[ \t]*$/gm, '');
  code = code.replace(/^[ \t]*import\s+['"][^'"]+['"]\s*;?[ \t]*$/gm, '');
  // `export default X` — drop the `export default ` prefix
  code = code.replace(/^[ \t]*export\s+default\s+/gm, '');
  // `export function foo` / `export const foo` / etc — drop just the keyword
  code = code.replace(/^([ \t]*)export\s+(function|const|let|var|class|async\s+function)\b/gm, '$1$2');
  // `export { a, b };` — drop entire line
  code = code.replace(/^[ \t]*export\s*\{[^}]*\}\s*;?[ \t]*$/gm, '');
  return code;
}

function wrapModule(relPath, code) {
  const stripped = stripEsmKeywords(code);
  const bar = '─'.repeat(58);
  const indented = stripped.split('\n').map(l => l ? '  ' + l : '').join('\n').trimEnd();
  return [
    `  /* ${bar}`,
    `     module: ${relPath}`,
    `     ${bar} */`,
    indented,
    ``
  ].join('\n');
}

function wrapBundle(moduleBlocks, moduleCount) {
  const lines = [
    '',
    '<!--',
    '  ==========================================================',
    '  Perchance Redesign Project — appended by build/build.mjs',
    '  ==========================================================',
    '  This block is assembled from src/ modules listed in',
    '  src/manifest.json. Do not edit by hand — edit source and',
    '  re-run the build.',
    '-->',
    '<script>',
    '(function (NS) {',
    `  'use strict';`,
    `  NS.__meta = { modules: ${moduleCount} };`,
    '',
    moduleBlocks,
    '})(window.__perchance_fork__ = window.__perchance_fork__ || {});',
    '</script>',
    ''
  ];
  return lines.join('\n');
}

// ---------- main ----------

export async function build() {
  await mkdir(OUT, { recursive: true });

  // perchance_1.txt — top DSL, copied verbatim (extension hooks come later)
  const topSrc = await readText(join(VENDOR, 'perchance_1.txt'));
  const topResult = await writeIfChanged(join(OUT, 'perchance_1.txt'), topSrc);

  // perchance_2.txt — HTML panel + optional appended bundle
  const panelSrc = await readText(join(VENDOR, 'perchance_2.txt'));
  const manifest = await loadManifest();

  const moduleBlocks = [];
  for (const relPath of manifest.modules) {
    try {
      const code = await readText(join(SRC, relPath));
      moduleBlocks.push(wrapModule(relPath, code));
    } catch (e) {
      throw new Error(`manifest references missing module: ${relPath}`);
    }
  }

  let panelOut;
  if (moduleBlocks.length === 0) {
    // No modules yet — pass vendor through with a sentinel comment
    panelOut = panelSrc.trimEnd() + '\n\n<!-- project scaffold: no modules in src/manifest.json yet -->\n';
  } else {
    panelOut = panelSrc.trimEnd() + wrapBundle(moduleBlocks.join('\n'), moduleBlocks.length);
  }

  const panelResult = await writeIfChanged(join(OUT, 'perchance_2.txt'), panelOut);

  return {
    top: topResult,
    panel: panelResult,
    moduleCount: moduleBlocks.length
  };
}

// ---------- CLI entry point ----------

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  try {
    const result = await build();
    const rel = (p) => p.replace(ROOT + '/', '');
    const mark = (r) => r.changed ? '✓ wrote' : '· unchanged';
    console.log(`${mark(result.top)}    ${rel(result.top.path)}  (${result.top.bytes.toLocaleString()} bytes)`);
    console.log(`${mark(result.panel)}    ${rel(result.panel.path)}  (${result.panel.bytes.toLocaleString()} bytes)`);
    console.log(`           modules bundled: ${result.moduleCount}`);
  } catch (err) {
    console.error(`✗ build failed: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

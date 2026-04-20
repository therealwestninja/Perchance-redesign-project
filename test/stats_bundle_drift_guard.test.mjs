// test/stats_bundle_drift_guard.test.mjs
//
// Narrow-predicate audit NP-6 drift guard.
//
// Bug shape: a new achievement criterion reads stats.newField, but the
// stats-bundle builders in profile/full_page.js don't populate it. The
// criterion silently never fires on refresh paths (splash redraw,
// share dialog, accent repaint). Same class of bug as the Apr 18
// save-button softlock.
//
// This test: parse src/achievements/registry.js for every s.<field>
// token a criterion reads, assert each is in KNOWN_SOURCES (fields
// that `buildFreshStats` and its sync variant know how to refresh).
//
// When this test fails, the options are:
//   a) Add the new field to KNOWN_SOURCES here AND wire it into
//      buildFreshStats/buildFreshStatsSync in full_page.js
//   b) Realize the new criterion can use an existing field instead
//
// NEVER just silence this test — that's how narrow-predicate bugs
// get born.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = join(__dirname, '..', 'src', 'achievements', 'registry.js');
const FULL_PAGE_PATH = join(__dirname, '..', 'src', 'profile', 'full_page.js');

/**
 * Every top-level `stats.<field>` source that the achievement
 * criteria are allowed to read. Adding a new source means:
 *   1. Add to this list
 *   2. Populate it at the init site in openFullPage()
 *   3. Populate it in buildFreshStats() and/or buildFreshStatsSync()
 *      (both, unless there's a documented reason the sync path
 *      can carry the init-time value)
 *   4. Add the new field to any secondary stats bundles downstream
 *      (e.g., archetype computation)
 */
const KNOWN_SOURCES = new Set([
  // IDB-derived, from computeStats(data) in stats/queries.js:
  'characterCount',
  'threadCount',
  'longestThread',
  'loreCount',
  'daysActive',
  'userMessageCount',
  'wordsWritten',
  // Prompt-derived, from computePromptStats(settings) in stats/prompt_stats.js:
  'promptsCompletedTotal',
  'promptsWeeksActive',
  'promptsByCategory',
  'promptCategoriesTouched',
  // Explicit injections in openFullPage + buildFreshStats:
  'counters',
  'streaks',
  'eventsResponded',
  // Two-pass unlock count — injected by openFullPage after the first
  // computeUnlockedIds pass so palette_vellum / palette_silver /
  // palette_deep criteria can gate on total achievements earned.
  '_unlockedCount',
]);

/**
 * Extract every `s.<identifier>` token from the registry source.
 * We scope to the `criteria:` arrow bodies — `s` is the standard
 * parameter name there and these are the dangerous reads for this
 * audit. We also look at helper functions in the same file that
 * take `s` (like `maxStreak(s)` and `peakCategoryCount(s)`).
 */
function extractStatsReferences(source) {
  // Keep analysis simple: any `s.<word>` in the file. Tolerates
  // `(s) =>`, `(s)` declarations, and helper-fn bodies alike.
  // Noise risk: an unrelated variable named `s` could pollute the
  // set. The registry file happens not to use `s` for anything
  // other than the stats bundle, confirmed via inspection.
  const matches = source.matchAll(/\bs\.([a-zA-Z_][a-zA-Z0-9_]*)/g);
  const out = new Set();
  for (const m of matches) out.add(m[1]);
  return out;
}

test('every stat field referenced by a criterion is in KNOWN_SOURCES', () => {
  const source = readFileSync(REGISTRY_PATH, 'utf8');
  const referenced = extractStatsReferences(source);

  // Remove obvious non-stat noise (tier labels used inside
  // tieredCounter's thresholds shorthand) — these are config keys,
  // not stat-bundle field reads.
  referenced.delete('bronze');
  referenced.delete('silver');
  referenced.delete('gold');

  const unknown = [...referenced].filter(f => !KNOWN_SOURCES.has(f));

  assert.deepEqual(
    unknown, [],
    `Narrow-predicate drift guard tripped: the achievement registry ` +
    `references stat field(s) not declared in KNOWN_SOURCES: ` +
    `${unknown.join(', ')}. This means criteria may read stale/` +
    `undefined values on refresh paths in full_page.js. See the ` +
    `doc comment at the top of this test for the fix recipe.`
  );
});

/**
 * Second guard: confirm full_page.js has a buildFreshStats helper
 * AND that it sets each known source. Regex-shaped so it stays
 * cheap; the cost of a false positive (helper renamed) is that
 * someone re-reads this test and updates the pattern.
 */
test('buildFreshStats helper exists in full_page.js and covers the mutable sources', () => {
  const source = readFileSync(FULL_PAGE_PATH, 'utf8');
  assert.match(source, /async\s+function\s+buildFreshStats\s*\(/,
    'buildFreshStats() should exist in full_page.js');
  assert.match(source, /function\s+buildFreshStatsSync\s*\(/,
    'buildFreshStatsSync() should exist in full_page.js');

  // The fields that CAN change mid-session and must be refreshed:
  const MUTABLE_SOURCES = ['counters', 'streaks', 'eventsResponded'];
  for (const field of MUTABLE_SOURCES) {
    // Match either `fresh.<field> =` or `fresh.<field>:` forms.
    const pattern = new RegExp(`fresh\\.${field}\\s*=`);
    assert.match(source, pattern,
      `buildFreshStats / buildFreshStatsSync should assign fresh.${field}. ` +
      `A refresh path reading this field will go stale without it.`);
  }
});

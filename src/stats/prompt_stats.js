// stats/prompt_stats.js
//
// Derive prompt-completion metrics from the persisted settings blob.
// Pure: pass in a settings object (from loadSettings()), get back a
// merge-able stats bundle. Separate from stats/queries.js because that
// module works on IDB data, whereas prompt state lives in localStorage.
//
// The returned shape merges cleanly into the main stats bundle so
// achievement criteria can read it alongside words / characters / threads.
//
// Lifetime totals include both:
//   - current completedByWeek entries (up to RETENTION_WEEKS back)
//   - historicalTotals accumulated by GC when old entries were pruned
// So achievement signals ("100 prompts completed") never regress when
// GC runs — the count is preserved in historicalTotals before deletion.

import { getPromptById, PROMPT_CATEGORIES } from '../prompts/registry.js';

/**
 * @typedef {Object} PromptStats
 * @property {number} promptsCompletedTotal     Sum across all weeks of completed prompt IDs
 * @property {number} promptsWeeksActive        Number of distinct weeks with ≥1 completion
 * @property {Object<string, number>} promptsByCategory  { character: N, ... } completion counts per category
 * @property {number} promptCategoriesTouched    Count of distinct categories with ≥1 completion
 */

/**
 * @param {object} settings  Output of loadSettings()
 * @returns {PromptStats}
 */
export function computePromptStats(settings) {
  const prompts = (settings && settings.prompts) || {};
  const byWeek = prompts.completedByWeek || {};
  const hist   = prompts.historicalTotals || {};

  let total = Number(hist.total) || 0;
  let weeksActive = Number(hist.weeksActive) || 0;

  // Per-category accumulator. Start from historical per-category
  // totals (preserved by GC on prune) so counts never regress.
  const byCategory = {};
  for (const cat of PROMPT_CATEGORIES) byCategory[cat.id] = 0;
  const histByCat = (hist && hist.byCategory && typeof hist.byCategory === 'object')
    ? hist.byCategory : {};
  for (const cat of PROMPT_CATEGORIES) {
    byCategory[cat.id] += Number(histByCat[cat.id]) || 0;
  }

  for (const weekKey of Object.keys(byWeek)) {
    const list = byWeek[weekKey];
    if (!Array.isArray(list) || list.length === 0) continue;
    total += list.length;
    weeksActive += 1;
    for (const id of list) {
      const p = getPromptById(id);
      if (p && p.category && byCategory[p.category] !== undefined) {
        byCategory[p.category] += 1;
      }
    }
  }

  // Count distinct categories touched (any value > 0).
  let categoriesTouched = 0;
  for (const cat of PROMPT_CATEGORIES) {
    if (byCategory[cat.id] > 0) categoriesTouched += 1;
  }

  return {
    promptsCompletedTotal: total,
    promptsWeeksActive: weeksActive,
    promptsByCategory: byCategory,
    promptCategoriesTouched: categoriesTouched,
  };
}

// stats/prompt_stats.js
//
// Derive prompt-completion metrics from the persisted settings blob.
// Pure: pass in a settings object (from loadSettings()), get back a
// merge-able stats bundle. Separate from stats/queries.js because that
// module works on IDB data, whereas prompt state lives in localStorage.
//
// The returned shape merges cleanly into the main stats bundle so
// achievement criteria can read it alongside words / characters / threads.

/**
 * @typedef {Object} PromptStats
 * @property {number} promptsCompletedTotal  Sum across all weeks of completed prompt IDs
 * @property {number} promptsWeeksActive     Number of distinct weeks with ≥1 completion
 */

/**
 * @param {object} settings  Output of loadSettings()
 * @returns {PromptStats}
 */
export function computePromptStats(settings) {
  const byWeek = (settings && settings.prompts && settings.prompts.completedByWeek) || {};

  let total = 0;
  let weeksActive = 0;

  for (const weekKey of Object.keys(byWeek)) {
    const list = byWeek[weekKey];
    if (!Array.isArray(list) || list.length === 0) continue;
    total += list.length;
    weeksActive += 1;
  }

  return {
    promptsCompletedTotal: total,
    promptsWeeksActive: weeksActive,
  };
}

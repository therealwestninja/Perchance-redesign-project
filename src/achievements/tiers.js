// achievements/tiers.js
//
// Level and XP math. Pure functions.
//
// XP sources (configured via XP_WEIGHTS below):
//   - 1 XP per N words written   (craft — the most important stat)
//   - M XP per character created
//   - M XP per thread started
//   - M XP per lore entry
//
// Leveling curve is quadratic: level N requires cumulative XP >= XP_PER_LEVEL * (N-1)^2.
//   Level  1: 0 XP
//   Level  2: 100 XP
//   Level  5: 1,600 XP
//   Level 10: 8,100 XP
//   Level 25: 57,600 XP
//   Level 50: 240,100 XP
// Each level is slightly harder than the last. No grind-to-max — by design,
// reaching high levels takes sustained creative work, not a single session.

const XP_PER_LEVEL = 100;

export const XP_WEIGHTS = Object.freeze({
  wordsPer: 10,      // 1 XP per this many words written
  perCharacter: 50,  // flat XP per character created
  perThread: 100,    // flat XP per thread started
  perLore: 25,       // flat XP per lore entry
});

/**
 * Compute total XP from a stats bundle.
 */
export function xpFromStats(stats) {
  if (!stats) return 0;
  const w = XP_WEIGHTS;
  return (
    Math.floor((stats.wordsWritten || 0) / w.wordsPer) +
    (stats.characterCount || 0) * w.perCharacter +
    (stats.threadCount || 0) * w.perThread +
    (stats.loreCount || 0) * w.perLore
  );
}

/**
 * Cumulative XP required to reach the START of the given level.
 * Level 1 starts at 0 XP, level 2 at 100, level 3 at 400, etc.
 */
export function xpRequiredForLevel(level) {
  if (level <= 1) return 0;
  return XP_PER_LEVEL * (level - 1) * (level - 1);
}

/**
 * Given total XP, return level breakdown.
 *
 * @param {number} totalXP
 * @returns {{
 *   level: number,
 *   totalXP: number,
 *   xpIntoLevel: number,
 *   xpForNextLevel: number,
 *   progress01: number
 * }}
 */
export function levelFromXP(totalXP) {
  totalXP = Math.max(0, totalXP | 0);

  // Find the largest L such that xpRequiredForLevel(L) <= totalXP.
  // Given the quadratic curve, this is bounded and fast; no need for binary search.
  let level = 1;
  while (xpRequiredForLevel(level + 1) <= totalXP) level++;

  const floor = xpRequiredForLevel(level);
  const ceiling = xpRequiredForLevel(level + 1);
  const xpIntoLevel = totalXP - floor;
  const xpForNextLevel = ceiling - floor;
  const progress01 = xpForNextLevel > 0 ? xpIntoLevel / xpForNextLevel : 0;

  return { level, totalXP, xpIntoLevel, xpForNextLevel, progress01 };
}

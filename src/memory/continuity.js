// memory/continuity.js
//
// Heuristic scoring for 'which entries are worth keeping.' Scans each entry
// for signals that suggest it contains durable story value (relationships,
// worldbuilding, named scenes) rather than transient chat byproducts.
// Used by the prune UI to preview "what would be dropped" with reasons,
// and can feed trim.js's continuity-aware token-budget mode.
//
// Adapted from PMT (Perchance Memory Trimmer Tool) src/core/continuity.js —
// MIT licensed. Regex patterns and score weights preserved verbatim;
// reformatted for ESM.
//
// This is a HEURISTIC. Scores are directional, not authoritative. A low
// score doesn't mean "worthless," just "less likely to contain a durable
// fact than a high-scoring one." UI should always present scores as
// suggestions, never as verdicts.

const HIGH_SIGNAL_RE = /\b(relationship|loves?|hates?|married|sister|brother|father|mother|family|friend|enemy|rival|ally|betrayed?|trust|key|important|remember|always|never|must|critical|core|secret|sworn|promised?|turned|became|discovered?|realized?|revealed?|established?|origin|history|backstory|goal|mission|rule|law|forbidden)\b/i;
const WORLD_FACT_RE = /\b(world|realm|kingdom|city|place|location|town|village|region|land|continent|planet|era|age|period|century|culture|government|empire|faction|guild|order|religion|magic|system|power|ability|skill|class|rank|title)\b/i;
const SCENE_RE = /\b(happened?|occurred?|during|when|after|before|scene|moment|event|battle|fight|encounter|conversation|meeting|ritual|ceremony|quest|journey|first|last|finally|conclusion|ending|beginning|starting)\b/i;

/**
 * @param {string} entry
 * @param {{
 *   isPinned?: boolean,
 *   isProtected?: boolean,
 *   index?: number,
 *   total?: number,
 * }} [ctx]
 * @returns {{ score: number, label: 'high' | 'medium' | 'low', reasons: string[] }}
 */
export function scoreContinuity(entry, ctx = {}) {
  const { isPinned = false, isProtected = false, index = 0, total = 1 } = ctx;
  const reasons = [];
  let score = 0;

  if (isPinned)    { score += 40; reasons.push('pinned'); }
  if (isProtected) { score += 30; reasons.push('protected'); }

  if (HIGH_SIGNAL_RE.test(entry)) { score += 20; reasons.push('relationship/key-fact signal'); }
  if (WORLD_FACT_RE.test(entry))  { score += 15; reasons.push('world-fact signal'); }
  if (SCENE_RE.test(entry))       { score += 10; reasons.push('scene/event signal'); }

  // Recency: the top 20% newest entries get a small bonus
  const recencyThreshold = Math.max(1, Math.floor(total * 0.8));
  if (index >= recencyThreshold) { score += 10; reasons.push('recent'); }

  // "Goldilocks" length: very short = noise, very long = likely rambly
  const len = String(entry || '').length;
  if (len >= 30 && len <= 300) { score += 5; reasons.push('good length'); }

  const label = score >= 40 ? 'high' : score >= 20 ? 'medium' : 'low';
  return { score, label, reasons };
}

/**
 * Score every entry in context. Returns an array indexed in step with
 * the input, each item wrapping the entry with its score metadata.
 *
 * @param {string[]} entries
 * @param {Set<string>} [pinnedIds]
 * @param {Set<string>} [protectedIds]
 * @param {(entry: string) => string} [getEntryId]
 * @returns {Array<{
 *   entry: string,
 *   entryId: string,
 *   score: number,
 *   label: 'high' | 'medium' | 'low',
 *   reasons: string[],
 * }>}
 */
export function scoreAllEntries(entries, pinnedIds = new Set(), protectedIds = new Set(), getEntryId = (e) => e) {
  const total = (entries || []).length;
  return (entries || []).map((entry, index) => {
    const entryId = getEntryId(entry);
    const isPinned = pinnedIds.has(entryId);
    const isProtected = protectedIds.has(entryId);
    const { score, label, reasons } = scoreContinuity(entry, { isPinned, isProtected, index, total });
    return { entry, entryId, score, label, reasons };
  });
}

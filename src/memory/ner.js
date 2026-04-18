// memory/ner.js
//
// Tiny named-entity extraction for labeling memory bubbles. Not a serious
// NER system — no model, no POS tagging. It finds:
//
//   1. Capitalized multi-word phrases that aren't sentence-initial
//      (proper nouns: "Elara", "the Veil of Night", "Captain Vex")
//   2. Failing that, the most-frequent salient word (stopword-filtered,
//      length ≥ 3) as a fallback when no proper noun dominates.
//
// This is optimized for the story/roleplay context of Perchance memories,
// where proper nouns dominate vocabulary and characters/places are what
// users want to see as labels. If the text is prose-heavy without
// proper nouns (unusual), the salient-word fallback keeps the label
// human-readable.
//
// The output is intended for display only. If the heuristic picks
// something silly, the user can click-to-rename the bubble.

// Pretty big stopword list; omitting it produces labels like "the"
// which is useless.
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'done', 'for', 'from',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself',
  'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it',
  'its', 'itself', 'just', 'me', 'my', 'myself', 'no', 'nor', 'not',
  'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours',
  'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'still',
  'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves',
  'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to',
  'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what',
  'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with',
  'would', 'you', 'your', 'yours', 'yourself', 'yourselves',
  // Narrative-specific noise words
  'said', 'went', 'came', 'looked', 'seemed', 'felt', 'knew', 'thought',
  'back', 'again', 'before', 'after', 'even', 'still', 'never', 'always',
]);

/**
 * Sentence-start detection. A "position" is considered sentence-initial
 * if it's at index 0, OR preceded by a sentence-ending punctuation
 * followed by whitespace.
 * @param {string} text
 * @param {number} start  index of the match in text
 * @returns {boolean}
 */
function isSentenceStart(text, start) {
  if (start === 0) return true;
  // Walk back past whitespace
  let i = start - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  if (i < 0) return true;
  return /[.!?]/.test(text[i]);
}

/**
 * Extract candidate proper-noun phrases from text. Returns them in
 * order of appearance (duplicates allowed — caller tallies frequency).
 *
 * Walks the text token by token, identifying capitalized tokens that are
 * NOT at sentence-start (sentence-initial capitals are ambiguous — "Then"
 * at the start of a sentence is almost never a proper noun). A phrase is
 * a maximal run of consecutive capitalized tokens, optionally joined by
 * lowercase linkers ("of", "the", "de", etc.).
 *
 * Non-sentence-initial requirement is strict: a phrase cannot BEGIN at a
 * sentence start, even if continues for multiple tokens. "Captain Vex
 * arrived" at the start of a sentence is ambiguous (regular word +
 * proper noun, or proper noun + proper noun?) — we err on the side of
 * missing some multi-word names rather than inflating labels with
 * sentence-starter noise like "Then Elara".
 *
 * @param {string} text
 * @returns {string[]}
 */
export function extractProperNouns(text) {
  if (!text) return [];

  // Tokenize preserving positions.
  const tokens = [];
  const tokenRe = /\S+/g;
  let m;
  while ((m = tokenRe.exec(text)) !== null) {
    tokens.push({ word: m[0], start: m.index });
  }

  const LINKERS = new Set(['of', 'the', 'and', 'de', 'la', 'von', 'van', 'al', 'du', 'le']);
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    // Phrase start candidate: a capitalized word (starts with A-Z, rest a-z'-)
    const cleanWord = tok.word.replace(/[^A-Za-z'-]/g, ''); // strip trailing/leading punct
    if (!/^[A-Z][a-zA-Z'-]*$/.test(cleanWord)) { i++; continue; }
    // Must NOT be sentence-initial
    if (isSentenceStart(text, tok.start)) { i++; continue; }

    // Collect phrase: this token + possible (<linker> <Capitalized>)+ or (<Capitalized>)+
    const phraseWords = [cleanWord];
    let j = i + 1;
    while (j < tokens.length) {
      const next = tokens[j];
      const nextClean = next.word.replace(/[^A-Za-z'-]/g, '');
      if (/^[A-Z][a-zA-Z'-]*$/.test(nextClean)) {
        phraseWords.push(nextClean);
        j++;
      } else if (LINKERS.has(nextClean.toLowerCase()) && j + 1 < tokens.length) {
        const after = tokens[j + 1];
        const afterClean = after.word.replace(/[^A-Za-z'-]/g, '');
        if (/^[A-Z][a-zA-Z'-]*$/.test(afterClean)) {
          phraseWords.push(nextClean.toLowerCase());
          phraseWords.push(afterClean);
          j += 2;
        } else break;
      } else break;
    }

    out.push(phraseWords.join(' '));
    i = j;
  }
  return out;
}

/**
 * Extract salient words from text: lowercased, stopword-filtered, length ≥ 3.
 * Returns in order of appearance.
 * @param {string} text
 * @returns {string[]}
 */
export function extractSalientWords(text) {
  if (!text) return [];
  const words = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words.filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Count term frequency over a list of strings. Returns a sorted array
 * of [term, count] pairs, descending by count.
 * @param {string[]} terms
 * @returns {Array<[string, number]>}
 */
function tally(terms) {
  const counts = new Map();
  for (const t of terms) {
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Prefer proper nouns; fall back to salient words. Returns best label for
 * the given concatenated text.
 *
 * @param {string} text  concatenation of bubble member texts
 * @param {{ minCount?: number }} [opts]  term must appear at least this
 *   many times to qualify (default 1). Raising this filters trivia.
 * @returns {string | null} the chosen label, or null if text is empty
 */
export function bestLabel(text, { minCount = 1 } = {}) {
  if (!text || !text.trim()) return null;

  // 1) Proper nouns
  const propers = tally(extractProperNouns(text));
  // Prefer the highest-frequency proper noun that meets minCount
  for (const [term, count] of propers) {
    if (count >= minCount) return term;
  }

  // 2) Fallback: most-frequent salient word that meets minCount,
  //    title-cased for display
  const salients = tally(extractSalientWords(text));
  for (const [term, count] of salients) {
    if (count >= minCount) {
      return term.charAt(0).toUpperCase() + term.slice(1);
    }
  }

  // 3) Nothing qualifies → null, caller uses a generic label
  return null;
}

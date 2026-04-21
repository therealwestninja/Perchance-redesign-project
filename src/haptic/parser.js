// haptic/parser.js
//
// Streaming tag parser for haptic markup in AI output (§2, §4).
//
// Ingests AI streaming chunks. Maintains a buffer for tags split
// across deltas. Emits two event types:
//   - tagParsed(tag, position)   → UI glyph renderer
//   - blockComplete(block)       → ready queue
//
// Block boundary: paragraph break (\n\n). Trailing incomplete blocks
// flush on stream end.
//
// Parsing rules (§2):
//   - Strict tag regex: <tagname attr=value ...>
//   - Known atomic tags: vibe, stroke, rotate, intensity, stop
//   - Named patterns: <pattern name=X ...>
//   - Unknown tags → preserved with error annotation
//   - Malformed segments → [!] glyphs (never silently dropped)
//   - Tag positions in prose preserved for glyph rendering

import { defaultHaptics, defaultClamps } from './schema.js';
import { resolvePatternName } from './hallucination.js';

// ---- Tag regex ----
// Matches: <vibe intensity=0.6 duration=4s>
//          <pattern name=tease intensity=0.8>
//          <stop>
//          <intensity level=0.5 duration=3s>
// Does NOT match: <3 (emoticon), <note> (unless it's a known tag)
const TAG_RE = /<(vibe|stroke|rotate|intensity|stop|pattern)\b([^>]*?)>/gi;

// Known atomic tag names
const ATOMIC_TAGS = new Set(['vibe', 'stroke', 'rotate', 'intensity', 'stop']);

// Attribute parser: key=value pairs (value can be quoted or bare)
const ATTR_RE = /([a-z_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/gi;

// Duration parser: "4s", "500ms", "4000" (bare number = ms)
function parseDuration(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  const mMatch = trimmed.match(/^([\d.]+)\s*ms$/);
  if (mMatch) return Math.round(parseFloat(mMatch[1]));
  const sMatch = trimmed.match(/^([\d.]+)\s*s$/);
  if (sMatch) return Math.round(parseFloat(sMatch[1]) * 1000);
  const bare = parseFloat(trimmed);
  if (!isNaN(bare)) return Math.round(bare);
  return null;
}

// Intensity parser: numeric or semantic
const SEMANTIC_INTENSITY = {
  low: 0.3, light: 0.3, soft: 0.3, gentle: 0.3,
  medium: 0.5, moderate: 0.5, normal: 0.5,
  high: 0.7, strong: 0.7, hard: 0.7,
  max: 1.0, intense: 1.0, full: 1.0,
};

function parseIntensity(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (SEMANTIC_INTENSITY[trimmed] !== undefined) {
    return { value: SEMANTIC_INTENSITY[trimmed], semantic: trimmed };
  }
  const num = parseFloat(trimmed);
  if (!isNaN(num)) return { value: Math.max(0, Math.min(1, num)), semantic: null };
  return null;
}

// ---- Parsed tag shape ----

/**
 * Parse attributes from the attribute string portion of a tag.
 * Returns a map of { key: rawValue }.
 */
function parseAttrs(attrStr) {
  const attrs = {};
  let match;
  ATTR_RE.lastIndex = 0;
  while ((match = ATTR_RE.exec(attrStr)) !== null) {
    attrs[match[1].toLowerCase()] = match[2] || match[3] || match[4];
  }
  return attrs;
}

/**
 * Parse a single tag match into a structured tag object.
 *
 * @param {string} tagName - 'vibe', 'stroke', 'rotate', etc.
 * @param {string} attrStr - the raw attribute string
 * @param {string} rawText - the full original tag text
 * @param {number} position - character offset in the message
 * @param {Object} defaults - character haptic defaults
 * @returns {Object} parsed tag
 */
function parseTag(tagName, attrStr, rawText, position, defaults) {
  const attrs = parseAttrs(attrStr);
  const name = tagName.toLowerCase();
  const defs = defaults || defaultHaptics().defaults;

  const tag = {
    type: name,
    raw: rawText,
    position,
    track: null,
    intensity: null,
    duration: null,
    patternName: null,
    annotations: [],    // warnings/resolutions for UI
    valid: true,
  };

  if (name === 'stop') {
    tag.track = 'all';
    tag.intensity = 0;
    tag.duration = 300;  // §3: ramp to zero over ~300ms
    return tag;
  }

  if (name === 'pattern') {
    tag.patternName = attrs.name || null;
    if (!tag.patternName) {
      tag.annotations.push({ type: 'error', text: 'pattern tag missing name attribute' });
      tag.valid = false;
    }
    tag.track = attrs.track || defs.defaultTrack || 'vibe';
  } else if (ATOMIC_TAGS.has(name)) {
    tag.track = name === 'intensity' ? (attrs.track || defs.defaultTrack || 'vibe') : name;
  } else {
    // Unknown tag type → map to intensity (§3.5 step 3)
    tag.track = defs.defaultTrack || 'vibe';
    tag.annotations.push({
      type: 'unknown-tag',
      text: `unknown tag "${name}" mapped to intensity`,
    });
  }

  // Parse intensity/speed/level
  const rawIntensity = attrs.intensity || attrs.speed || attrs.level;
  if (rawIntensity) {
    const parsed = parseIntensity(rawIntensity);
    if (parsed) {
      tag.intensity = parsed.value;
      if (parsed.semantic) {
        tag.annotations.push({
          type: 'semantic-value',
          text: `"${parsed.semantic}" → ${parsed.value}`,
        });
      }
    } else {
      tag.intensity = defs.atomicIntensity;
      tag.annotations.push({ type: 'parse-warning', text: `invalid intensity "${rawIntensity}", using default` });
    }
  } else {
    tag.intensity = defs.atomicIntensity;
  }

  // Parse duration
  const rawDuration = attrs.duration;
  if (rawDuration) {
    const parsed = parseDuration(rawDuration);
    if (parsed !== null) {
      tag.duration = parsed;
    } else {
      tag.duration = defs.atomicDuration;
      tag.annotations.push({ type: 'parse-warning', text: `invalid duration "${rawDuration}", using default` });
    }
  } else {
    tag.duration = defs.atomicDuration;
  }

  return tag;
}

// ---- Streaming parser ----

/**
 * Create a new streaming parser instance.
 *
 * @param {Object} opts
 * @param {Object} opts.defaults - character haptic defaults
 * @param {Function} opts.onTag - callback(tag) for each parsed tag
 * @param {Function} opts.onBlock - callback(block) when a paragraph block completes
 * @returns {{ push(chunk), flush(), getTags(), reset() }}
 */
export function createParser(opts = {}) {
  const defaults = opts.defaults || defaultHaptics().defaults;
  const characterPatterns = opts.characterPatterns || {};
  const aliases = opts.aliases || {};
  const onTag = opts.onTag || (() => {});
  const onBlock = opts.onBlock || (() => {});

  let _buffer = '';          // chunk accumulation buffer
  let _blockTags = [];       // tags in current block
  let _blockProse = '';      // prose text in current block (tags stripped)
  let _blockIndex = 0;
  let _globalOffset = 0;     // character offset across all chunks
  let _allTags = [];         // all tags parsed in this message

  /**
   * Push a streaming chunk into the parser.
   * Tags may span chunk boundaries — we buffer until we see
   * a complete tag or can confirm the partial is just prose.
   */
  function push(chunk) {
    _buffer += chunk;

    // Process complete blocks (paragraph boundaries = \n\n)
    let blockBreak;
    while ((blockBreak = _buffer.indexOf('\n\n')) !== -1) {
      const blockText = _buffer.slice(0, blockBreak);
      _processBlockText(blockText);
      _emitBlock();
      _buffer = _buffer.slice(blockBreak + 2);
      _globalOffset += blockBreak + 2;
    }

    // Process tags in the remaining buffer (but keep a trailing
    // partial tag in the buffer — it might complete in the next chunk).
    // A trailing '<' without '>' means a tag might be split.
    const lastOpen = _buffer.lastIndexOf('<');
    const lastClose = _buffer.lastIndexOf('>');
    if (lastOpen > lastClose) {
      // Potential partial tag at end — process everything before it
      const safe = _buffer.slice(0, lastOpen);
      if (safe.length > 0) {
        _processInlineText(safe);
        _buffer = _buffer.slice(lastOpen);
        _globalOffset += lastOpen;
      }
    }
    // If buffer has no partial tags, process what we can without
    // emitting a block (tags accumulate for the current block)
  }

  /**
   * Flush remaining buffer at stream end.
   */
  function flush() {
    if (_buffer.length > 0) {
      _processBlockText(_buffer);
      _buffer = '';
    }
    if (_blockTags.length > 0 || _blockProse.length > 0) {
      _emitBlock();
    }
  }

  /**
   * Process a complete block of text (between \n\n boundaries).
   * Extracts tags, preserves prose positions.
   */
  function _processBlockText(text) {
    _processInlineText(text);
  }

  /**
   * Extract tags from text, accumulate into current block.
   */
  function _processInlineText(text) {
    let lastEnd = 0;
    TAG_RE.lastIndex = 0;
    let match;
    while ((match = TAG_RE.exec(text)) !== null) {
      // Prose before this tag
      if (match.index > lastEnd) {
        _blockProse += text.slice(lastEnd, match.index);
      }

      const tagName = match[1];
      const attrStr = match[2] || '';
      const rawText = match[0];
      const position = _globalOffset + match.index;

      const tag = parseTag(tagName, attrStr, rawText, position, defaults);

      // Run hallucination ladder for pattern tags with unknown names
      if (tag.type === 'pattern' && tag.patternName) {
        const resolution = resolvePatternName(tag.patternName, characterPatterns, aliases);
        if (resolution.annotation) {
          tag.annotations.push(resolution.annotation);
        }
        if (resolution.resolved && resolution.resolved !== tag.patternName) {
          tag.patternName = resolution.resolved;
        }
      }

      _blockTags.push(tag);
      _allTags.push(tag);
      onTag(tag);

      lastEnd = match.index + match[0].length;
    }

    // Trailing prose after last tag
    if (lastEnd < text.length) {
      _blockProse += text.slice(lastEnd);
    }
  }

  /**
   * Emit the current accumulated block.
   */
  function _emitBlock() {
    const block = {
      index: _blockIndex++,
      tags: _blockTags.slice(),
      prose: _blockProse,
      proseLength: _blockProse.length,
    };
    _blockTags = [];
    _blockProse = '';
    onBlock(block);
  }

  /**
   * Get all tags parsed so far (for the full message).
   */
  function getTags() {
    return _allTags.slice();
  }

  /**
   * Reset parser state for a new message.
   */
  function reset() {
    _buffer = '';
    _blockTags = [];
    _blockProse = '';
    _blockIndex = 0;
    _globalOffset = 0;
    _allTags = [];
  }

  return { push, flush, getTags, reset };
}

// ---- Exports for direct use ----

export { parseTag, parseDuration, parseIntensity, parseAttrs, TAG_RE };

// utils/format.js
//
// Display formatters — pure functions, no side effects.
// All safe to call with null / undefined / NaN; they return sensible defaults.

/**
 * Format an integer with thousands separators. "47291" → "47,291".
 */
export function formatNumber(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  try {
    return new Intl.NumberFormat('en-US').format(v | 0);
  } catch {
    return String(v | 0);
  }
}

/**
 * Format a 0..1 ratio as a percent string. formatPercent(0.62) → "62%".
 */
export function formatPercent(ratio, digits = 0) {
  const v = Number(ratio);
  if (!Number.isFinite(v)) return '0%';
  const clamped = Math.max(0, Math.min(1, v));
  return (clamped * 100).toFixed(digits) + '%';
}

/**
 * Get the first visible grapheme of a name, uppercased. Falls back to "?".
 * Used for auto-generated monogram avatars.
 *
 *   getInitialFromName("Aria Moonweaver") → "A"
 *   getInitialFromName("🗡️ Dagger") → "🗡"
 *   getInitialFromName("") → "?"
 */
export function getInitialFromName(name) {
  if (!name) return '?';
  const trimmed = String(name).trim();
  if (!trimmed) return '?';
  // Use an Intl.Segmenter if available so emoji / multi-codepoint glyphs
  // are handled as single graphemes.
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      for (const { segment } of seg.segment(trimmed)) {
        return segment.toUpperCase();
      }
    }
  } catch { /* fall through */ }
  return trimmed[0].toUpperCase();
}

/**
 * "X days ago" relative time. Accepts a timestamp in ms or null.
 * Returns empty string for null/invalid.
 */
export function formatRelativeTime(tsMs, nowMs = Date.now()) {
  if (!Number.isFinite(tsMs)) return '';
  const diff = nowMs - tsMs;
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w} week${w === 1 ? '' : 's'} ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? '' : 's'} ago`;
  const y = Math.floor(d / 365);
  return `${y} year${y === 1 ? '' : 's'} ago`;
}

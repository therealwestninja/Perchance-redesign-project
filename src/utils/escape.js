// utils/escape.js
//
// Minimal HTML escaping. Use this whenever user-supplied text needs to flow
// into `innerHTML`. For DOM text nodes, prefer `textContent` instead — it
// does the safe thing automatically.

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

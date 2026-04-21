// render/haptic_glyphs.js
//
// Renders haptic tags as inline glyphs inside AI messages (§5).
//
// Each parsed tag becomes a small clickable glyph at its position in
// the message text. Clicking a glyph opens a context menu with:
//   - Parameter display (track, intensity, duration)
//   - Annotations (clamped, fuzzy-matched, unknown tag, semantic value)
//   - Actions: Replay · Edit · Delete · Save to library
//
// A "haptic cues" summary chip appears below each message that
// contains tags, showing tag count + any interventions.

import { h } from '../utils/dom.js';
import { executeEvent, isHapticReady } from '../haptic/backend.js';

// ---- Glyph vocabulary ----
// Default glyphs per tag type. User-themable via settings.glyphTheme.
const DEFAULT_GLYPHS = {
  vibe:      '〰',
  stroke:    '↕',
  rotate:    '⟳',
  intensity: '◈',
  stop:      '⊘',
  pattern:   '♫',
  unknown:   '⚠',
  error:     '⛌',
};

/**
 * Get the glyph character for a tag type.
 */
function glyphFor(tag, theme) {
  if (theme && theme[tag.patternName]) return theme[tag.patternName];
  if (theme && theme[tag.type]) return theme[tag.type];
  if (!tag.valid) return DEFAULT_GLYPHS.error;
  if (tag.type === 'pattern') return DEFAULT_GLYPHS.pattern;
  return DEFAULT_GLYPHS[tag.type] || DEFAULT_GLYPHS.unknown;
}

// ---- Context menu ----

let _activeMenu = null;

function closeActiveMenu() {
  if (_activeMenu) {
    _activeMenu.remove();
    _activeMenu = null;
  }
}

// Close on click outside
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (_activeMenu && !_activeMenu.contains(e.target) && !e.target.closest('.pf-hg-glyph')) {
      closeActiveMenu();
    }
  });
}

/**
 * Open a context menu for a glyph.
 */
function openGlyphMenu(tag, glyphEl, messageEl, tagIndex, onEdit, onDelete) {
  closeActiveMenu();

  const menu = h('div', { class: 'pf-hg-menu' });

  // Header: tag type + params
  const header = h('div', { class: 'pf-hg-menu-header' }, [
    h('span', { class: 'pf-hg-menu-type' }, [tag.type.toUpperCase()]),
    tag.patternName ? h('span', { class: 'pf-hg-menu-name' }, [tag.patternName]) : null,
  ].filter(Boolean));
  menu.appendChild(header);

  // Params
  const params = h('div', { class: 'pf-hg-menu-params' });
  if (tag.track && tag.track !== 'all') {
    params.appendChild(h('div', {}, [`Track: ${tag.track}`]));
  }
  if (tag.intensity !== null && tag.intensity !== undefined) {
    params.appendChild(h('div', {}, [`Intensity: ${(tag.intensity * 100).toFixed(0)}%`]));
  }
  if (tag.duration !== null && tag.duration !== undefined) {
    const dur = tag.duration >= 1000 ? `${(tag.duration / 1000).toFixed(1)}s` : `${tag.duration}ms`;
    params.appendChild(h('div', {}, [`Duration: ${dur}`]));
  }
  menu.appendChild(params);

  // Annotations
  if (tag.annotations && tag.annotations.length > 0) {
    const annots = h('div', { class: 'pf-hg-menu-annotations' });
    for (const a of tag.annotations) {
      const prefix = a.type === 'error' ? '✗ '
                   : a.type === 'unknown-tag' ? '⚠ '
                   : a.type === 'semantic-value' ? '⤳ '
                   : a.type === 'parse-warning' ? '⚠ '
                   : '';
      annots.appendChild(h('div', { class: 'pf-hg-menu-annot pf-hg-menu-annot-' + a.type }, [prefix + a.text]));
    }
    menu.appendChild(annots);
  }

  // Raw tag text
  if (tag.raw) {
    const rawEl = h('div', { class: 'pf-hg-menu-raw' }, [tag.raw]);
    menu.appendChild(rawEl);
  }

  // Action buttons
  const actions = h('div', { class: 'pf-hg-menu-actions' });

  // Replay
  const replayBtn = h('button', {
    type: 'button', class: 'pf-hg-action',
    onClick: () => {
      if (isHapticReady()) {
        executeEvent({ track: tag.track || 'vibe', intensity: tag.intensity || 0.5, duration: tag.duration || 3000 });
      }
      closeActiveMenu();
    },
  }, ['▶ Replay']);
  actions.appendChild(replayBtn);

  // Delete
  const deleteBtn = h('button', {
    type: 'button', class: 'pf-hg-action pf-hg-action-danger',
    onClick: () => {
      if (onDelete) onDelete(tagIndex);
      glyphEl.remove();
      closeActiveMenu();
    },
  }, ['✕ Delete']);
  actions.appendChild(deleteBtn);

  menu.appendChild(actions);

  // Position the menu near the glyph
  const rect = glyphEl.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.left = `${Math.min(rect.left, window.innerWidth - 240)}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.zIndex = '99999';

  document.body.appendChild(menu);
  _activeMenu = menu;
}

// ---- Inline glyph rendering ----

/**
 * Process an AI message element: find haptic tags in its text,
 * replace them with inline glyph elements, add cues chip.
 *
 * @param {HTMLElement} messageEl - the .message.ai element
 * @param {Array} tags - parsed tags from the parser
 * @param {Object} opts
 * @param {Object} opts.glyphTheme - user glyph overrides
 * @param {Function} opts.onDelete - callback(tagIndex) for tag deletion
 * @param {Function} opts.onEdit - callback(tagIndex, newTag) for tag editing
 */
export function renderGlyphs(messageEl, tags, opts = {}) {
  if (!messageEl || !tags || tags.length === 0) return;

  const theme = opts.glyphTheme || {};

  // Find the message content container
  const contentEl = messageEl.querySelector('.message-text')
                 || messageEl.querySelector('.msg-text')
                 || messageEl.querySelector('.content')
                 || messageEl;

  // Don't double-process
  if (messageEl.dataset.hapticGlyphs === 'true') return;
  messageEl.dataset.hapticGlyphs = 'true';

  // Replace raw tag text in the HTML with glyph elements.
  // We work on innerHTML — find each tag.raw and replace it with a
  // glyph span. Tags that aren't found in the HTML (already stripped
  // by upstream sanitization) get appended as floating glyphs.
  const html = contentEl.innerHTML;
  let newHtml = html;
  const glyphIds = [];

  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    const glyphChar = glyphFor(tag, theme);
    const id = `pf-hg-${Date.now()}-${i}`;
    glyphIds.push({ id, tag, index: i });

    const annotClass = tag.annotations && tag.annotations.length > 0 ? ' pf-hg-annotated' : '';
    const glyphHtml = `<span class="pf-hg-glyph pf-hg-glyph-${tag.type}${annotClass}" data-hg-idx="${i}" id="${id}" title="${escHtml(tag.type)}${tag.patternName ? ': ' + escHtml(tag.patternName) : ''}">${escHtml(glyphChar)}</span>`;

    if (tag.raw && newHtml.includes(escHtml(tag.raw))) {
      // Replace first occurrence of the raw tag text
      newHtml = newHtml.replace(escHtml(tag.raw), glyphHtml);
    } else if (tag.raw && newHtml.includes(tag.raw)) {
      newHtml = newHtml.replace(tag.raw, glyphHtml);
    } else {
      // Tag text not found in HTML (stripped by sanitizer) — append
      newHtml += ' ' + glyphHtml;
    }
  }

  contentEl.innerHTML = newHtml;

  // Attach click handlers to each glyph
  for (const { id, tag, index } of glyphIds) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        openGlyphMenu(tag, el, messageEl, index, opts.onEdit, opts.onDelete);
      });
    }
  }

  // Add cues chip below message
  addCuesChip(messageEl, tags);
}

/**
 * Add a "haptic cues" summary chip below an AI message.
 */
function addCuesChip(messageEl, tags) {
  // Don't double-add
  if (messageEl.querySelector('.pf-hg-cues')) return;

  const count = tags.length;
  const clamped = tags.filter(t => t.annotations && t.annotations.some(a => a.type === 'clamped')).length;
  const fuzzy = tags.filter(t => t.annotations && t.annotations.some(a => a.type === 'fuzzy-match')).length;
  const unknown = tags.filter(t => t.annotations && t.annotations.some(a => a.type === 'unknown-tag')).length;
  const semantic = tags.filter(t => t.annotations && t.annotations.some(a => a.type === 'semantic-value')).length;

  let summary = `${count} haptic cue${count !== 1 ? 's' : ''}`;
  const details = [];
  if (clamped > 0) details.push(`${clamped} clamped`);
  if (fuzzy > 0) details.push(`${fuzzy} fuzzy-matched`);
  if (unknown > 0) details.push(`${unknown} unknown`);
  if (semantic > 0) details.push(`${semantic} semantic`);
  if (details.length > 0) summary += ` (${details.join(', ')})`;

  const chip = h('div', { class: 'pf-hg-cues' }, [
    h('span', { class: 'pf-hg-cues-icon' }, ['◈']),
    h('span', { class: 'pf-hg-cues-text' }, [summary]),
  ]);

  messageEl.appendChild(chip);
}

// ---- Helpers ----

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Remove all haptic glyphs from a message (for re-render).
 */
export function clearGlyphs(messageEl) {
  if (!messageEl) return;
  messageEl.querySelectorAll('.pf-hg-glyph').forEach(el => el.remove());
  messageEl.querySelectorAll('.pf-hg-cues').forEach(el => el.remove());
  delete messageEl.dataset.hapticGlyphs;
}

/**
 * Get the default glyph map (for settings UI).
 */
export function getDefaultGlyphs() {
  return { ...DEFAULT_GLYPHS };
}

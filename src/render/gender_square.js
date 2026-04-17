// render/gender_square.js
//
// A 2D draggable picker, per the brief's ASCII sketch:
//
//   Male ─────────── Non-Binary
//   │                          │
//   │              ●           │
//   │                          │
//   Other ──────────── Female
//
// Label positions match the user's drawing:
//   top-left: Male, top-right: Non-Binary
//   bottom-left: Other, bottom-right: Female
//
// Dot position is stored as { x01, y01 } normalized to [0, 1].
// Value is saved on pointer release (drag end), not during drag, to avoid
// hammering localStorage.

import { h } from '../utils/dom.js';
import { updateField } from '../profile/settings_store.js';

/**
 * @param {{ initialValue?: { x01: number, y01: number } }} opts
 * @returns {HTMLElement}
 */
export function createGenderSquare({ initialValue } = {}) {
  const start = clamp01ish(initialValue) || { x01: 0.5, y01: 0.5 };

  const dot = h('div', {
    class: 'pf-gs-dot',
    'aria-hidden': 'true',
  });

  const field = h('div', {
    class: 'pf-gs-field',
    role: 'slider',
    tabindex: '0',
    'aria-label': 'Gender position — 2D picker. Drag the dot anywhere inside the square.',
    'aria-valuetext': formatAria(start),
  }, [dot]);

  const root = h('div', { class: 'pf-gs' }, [
    h('div', { class: 'pf-gs-labels' }, [
      h('span', { class: 'pf-gs-label pf-gs-label-tl' }, ['Male']),
      h('span', { class: 'pf-gs-label pf-gs-label-tr' }, ['Non-Binary']),
      h('span', { class: 'pf-gs-label pf-gs-label-bl' }, ['Other']),
      h('span', { class: 'pf-gs-label pf-gs-label-br' }, ['Female']),
      field,
    ]),
  ]);

  let current = { ...start };
  applyDotPosition(current);

  // ---- pointer handling ----

  let activePointerId = null;

  field.addEventListener('pointerdown', (ev) => {
    if (activePointerId !== null) return;
    activePointerId = ev.pointerId;
    try { field.setPointerCapture(ev.pointerId); } catch {}
    updateFromEvent(ev);
  });

  field.addEventListener('pointermove', (ev) => {
    if (ev.pointerId !== activePointerId) return;
    updateFromEvent(ev);
  });

  const endPointer = (ev) => {
    if (ev.pointerId !== activePointerId) return;
    activePointerId = null;
    try { field.releasePointerCapture(ev.pointerId); } catch {}
    updateField('profile.genderPos', current);
  };
  field.addEventListener('pointerup', endPointer);
  field.addEventListener('pointercancel', endPointer);

  // Keyboard: arrow keys nudge the dot 5% per press; persists immediately
  field.addEventListener('keydown', (ev) => {
    const step = 0.05;
    let dx = 0, dy = 0;
    if (ev.key === 'ArrowLeft')  dx = -step;
    if (ev.key === 'ArrowRight') dx =  step;
    if (ev.key === 'ArrowUp')    dy = -step;
    if (ev.key === 'ArrowDown')  dy =  step;
    if (dx === 0 && dy === 0) return;
    ev.preventDefault();
    current = {
      x01: clamp01(current.x01 + dx),
      y01: clamp01(current.y01 + dy),
    };
    applyDotPosition(current);
    field.setAttribute('aria-valuetext', formatAria(current));
    updateField('profile.genderPos', current);
  });

  function updateFromEvent(ev) {
    const rect = field.getBoundingClientRect();
    const x = clamp01((ev.clientX - rect.left) / Math.max(1, rect.width));
    const y = clamp01((ev.clientY - rect.top) / Math.max(1, rect.height));
    current = { x01: x, y01: y };
    applyDotPosition(current);
    field.setAttribute('aria-valuetext', formatAria(current));
  }

  function applyDotPosition({ x01, y01 }) {
    dot.style.left = `${(x01 * 100).toFixed(2)}%`;
    dot.style.top  = `${(y01 * 100).toFixed(2)}%`;
  }

  return root;
}

function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
function clamp01ish(v) {
  if (!v || typeof v !== 'object') return null;
  return { x01: clamp01(v.x01), y01: clamp01(v.y01) };
}
function formatAria({ x01, y01 }) {
  // Describe position in rough terms for screen readers
  const x = Math.round(x01 * 100);
  const y = Math.round(y01 * 100);
  return `horizontal ${x}%, vertical ${y}%`;
}

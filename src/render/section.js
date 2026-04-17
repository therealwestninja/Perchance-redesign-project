// render/section.js
//
// Collapsible + blurrable section. Header has title + two toggle buttons:
// collapse (chevron) and blur (eye). Each section persists its display state
// under display.sections[sectionId] in the settings store.

import { h } from '../utils/dom.js';
import { updateField } from '../profile/settings_store.js';

/**
 * @param {{
 *   id: string,
 *   title: string,
 *   children: any,
 *   initialState: { collapsed: boolean, blurred: boolean },
 * }} opts
 * @returns {HTMLElement}
 */
export function createSection({ id, title, children, initialState }) {
  let collapsed = !!(initialState && initialState.collapsed);
  let blurred   = !!(initialState && initialState.blurred);

  const body = h('div', { class: 'pf-section-body' }, children);
  const coverBtn = h('button', {
    class: 'pf-section-cover',
    type: 'button',
    'aria-label': `Reveal ${title}`,
    onClick: () => setBlurred(false),
  }, ['👁  tap to reveal']);

  const chevronBtn = h('button', {
    class: 'pf-section-ctrl pf-section-chevron',
    type: 'button',
    title: 'Collapse / expand',
    'aria-label': 'Collapse section',
    onClick: () => setCollapsed(!collapsed),
  }, ['▾']);

  const eyeBtn = h('button', {
    class: 'pf-section-ctrl pf-section-eye',
    type: 'button',
    title: 'Hide / show content',
    'aria-label': 'Blur section',
    onClick: () => setBlurred(!blurred),
  }, ['👁']);

  const bodyWrap = h('div', { class: 'pf-section-body-wrap' }, [body, coverBtn]);

  const root = h('section', { class: 'pf-section', 'data-section-id': id }, [
    h('header', { class: 'pf-section-header' }, [
      h('h2', { class: 'pf-section-title' }, [title]),
      h('div', { class: 'pf-section-ctrls' }, [eyeBtn, chevronBtn]),
    ]),
    bodyWrap,
  ]);

  function setCollapsed(val) {
    collapsed = !!val;
    root.classList.toggle('pf-section-collapsed', collapsed);
    chevronBtn.setAttribute('aria-expanded', String(!collapsed));
    chevronBtn.textContent = collapsed ? '▸' : '▾';
    updateField(`display.sections.${id}.collapsed`, collapsed);
  }

  function setBlurred(val) {
    blurred = !!val;
    root.classList.toggle('pf-section-blurred', blurred);
    eyeBtn.setAttribute('aria-pressed', String(blurred));
    updateField(`display.sections.${id}.blurred`, blurred);
  }

  setCollapsed(collapsed);
  setBlurred(blurred);

  return root;
}

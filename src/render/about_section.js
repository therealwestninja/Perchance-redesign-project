// render/about_section.js
//
// Freeform bio textarea. Auto-saves on blur.

import { h } from '../utils/dom.js';
import { updateField } from '../profile/settings_store.js';

const MAX_LEN = 4000; // generous but bounded

export function createAboutBody({ initialValue = '' }) {
  const ta = h('textarea', {
    class: 'pf-about-textarea',
    maxlength: String(MAX_LEN),
    rows: '6',
    placeholder: 'Tell your chronicle — who you are as a storyteller, ' +
                 'what kinds of stories you love, whatever you want to share.',
    onBlur: (ev) => {
      updateField('profile.bio', ev.target.value);
    },
  });
  ta.value = String(initialValue || '');

  const counter = h('div', { class: 'pf-about-counter', 'aria-hidden': 'true' });
  const updateCounter = () => {
    counter.textContent = `${ta.value.length.toLocaleString()} / ${MAX_LEN.toLocaleString()}`;
  };
  ta.addEventListener('input', updateCounter);
  updateCounter();

  return h('div', { class: 'pf-about' }, [ta, counter]);
}

// render/prompts_section.js
//
// Body of the "Prompts" section on the full profile. Shows this week's
// selection as a list of checkboxes. Toggling a checkbox persists the
// completion state and visually crosses out the prompt.
//
// Layout:
//   - Intro line ("this week's writing ideas, etc.")
//   - Outstanding prompts (unchecked, top)
//   - Completed prompts (checked, strike-through, bottom)

import { h, replaceContents } from '../utils/dom.js';
import { setCompleted } from '../prompts/completion.js';

/**
 * @param {{
 *   weekKey: string,
 *   prompts: Array<{id: string, text: string}>,
 *   completedIds: Set<string>,
 * }} opts
 */
export function createPromptsBody({ weekKey, prompts, completedIds }) {
  const completed = new Set(completedIds);

  const list = h('ul', { class: 'pf-prompts-list' });

  const intro = h('p', { class: 'pf-prompts-intro' }, [
    'This week\'s writing ideas. Try any that call to you. ',
    h('span', { class: 'pf-prompts-intro-soft' }, [
      'New set every Monday — you can leave any unchecked.',
    ]),
  ]);

  function render() {
    const ordered = orderForDisplay(prompts, completed);
    const items = ordered.map(p => createPromptItem(p, completed.has(p.id), toggle));
    replaceContents(list, items);
  }

  function toggle(id, completedNow) {
    if (completedNow) completed.add(id);
    else              completed.delete(id);
    setCompleted(weekKey, id, completedNow);
    render();
  }

  render();

  return h('div', { class: 'pf-prompts' }, [intro, list]);
}

/**
 * Outstanding first, completed below. Preserves original order within each group.
 */
function orderForDisplay(prompts, completed) {
  const out = [];
  const done = [];
  for (const p of prompts) {
    if (completed.has(p.id)) done.push(p);
    else out.push(p);
  }
  return [...out, ...done];
}

function createPromptItem(prompt, isCompleted, onToggle) {
  const checkbox = h('input', {
    type: 'checkbox',
    class: 'pf-prompt-checkbox',
    checked: isCompleted,
    'aria-label': isCompleted ? 'Mark as incomplete' : 'Mark as completed',
    onChange: (ev) => onToggle(prompt.id, !!ev.target.checked),
  });

  return h('li', {
    class: 'pf-prompt-item' + (isCompleted ? ' pf-prompt-item-done' : ''),
    'data-prompt-id': prompt.id,
  }, [
    h('label', { class: 'pf-prompt-label' }, [
      checkbox,
      h('span', { class: 'pf-prompt-text' }, [prompt.text]),
    ]),
  ]);
}

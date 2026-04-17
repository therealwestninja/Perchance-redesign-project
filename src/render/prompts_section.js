// render/prompts_section.js
//
// Body of the "Prompts" section. When a holiday / observance is active, its
// themed prompts appear as a banner-marked group ABOVE the regular weekly
// prompts. Completion tracking is shared — event prompt IDs go into the
// same completedByWeek record, just with `e-` prefixed IDs instead of `p-`.

import { h, replaceContents } from '../utils/dom.js';
import { setCompleted } from '../prompts/completion.js';

/**
 * @param {{
 *   weekKey: string,
 *   prompts: Array<{id: string, text: string}>,
 *   completedIds: Set<string>,
 *   activeEvents?: Array<object>,
 * }} opts
 */
export function createPromptsBody({ weekKey, prompts, completedIds, activeEvents = [] }) {
  const completed = new Set(completedIds);

  const eventGroupsEl = h('div', { class: 'pf-event-groups' });
  const weeklyList = h('ul', { class: 'pf-prompts-list' });

  const intro = h('p', { class: 'pf-prompts-intro' }, [
    'This week\'s writing ideas. Try any that call to you. ',
    h('span', { class: 'pf-prompts-intro-soft' }, [
      'New set every Monday — you can leave any unchecked.',
    ]),
  ]);

  function renderAll() {
    // ---- event groups (if any) ----
    const eventChildren = [];
    for (const ev of activeEvents) {
      eventChildren.push(createEventGroup(ev, completed, (id, done) => toggle(id, done)));
    }
    replaceContents(eventGroupsEl, eventChildren);

    // ---- regular weekly prompts ----
    const ordered = orderForDisplay(prompts, completed);
    const items = ordered.map(p => createPromptItem(p, completed.has(p.id), toggle));
    replaceContents(weeklyList, items);
  }

  function toggle(id, completedNow) {
    if (completedNow) completed.add(id);
    else              completed.delete(id);
    setCompleted(weekKey, id, completedNow);
    renderAll();
  }

  renderAll();

  return h('div', { class: 'pf-prompts' }, [
    eventGroupsEl,
    intro,
    weeklyList,
  ]);
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

/**
 * One event's themed group: icon + name + tagline header, then its prompts.
 */
function createEventGroup(ev, completed, onToggle) {
  const list = h('ul', { class: 'pf-event-list' });
  const ordered = orderForDisplay(ev.prompts, completed);
  const items = ordered.map(p => createPromptItem(p, completed.has(p.id), onToggle));
  replaceContents(list, items);

  return h('div', {
    class: 'pf-event-group',
    'data-event-id': ev.id,
  }, [
    h('div', { class: 'pf-event-header' }, [
      h('span', { class: 'pf-event-icon', 'aria-hidden': 'true' }, [ev.icon || '✦']),
      h('div', { class: 'pf-event-titlebar' }, [
        h('div', { class: 'pf-event-name' }, [ev.name || 'Event']),
        ev.tagline ? h('div', { class: 'pf-event-tagline' }, [ev.tagline]) : null,
      ]),
    ]),
    list,
  ]);
}

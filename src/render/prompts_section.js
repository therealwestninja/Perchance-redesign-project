// render/prompts_section.js
//
// Body of the "Prompts" section. When a holiday / observance is active, its
// themed prompts appear as a banner-marked group ABOVE the current prompts.
// Completion tracking is shared — event prompt IDs go into the same
// completedByWeek record, just with `e-` prefixed IDs instead of `p-`.
//
// Cadence: 'weekly' shows 4 rotating prompts (Monday refresh). 'daily'
// shows 1 prompt for today. Toggle at the top of the section. Completion
// storage is the same in both modes (bucketed by containing week).

import { h, replaceContents } from '../utils/dom.js';
import { setCompleted } from '../prompts/completion.js';
import { updateField } from '../profile/settings_store.js';

/**
 * @param {{
 *   weekKey: string,
 *   prompts: Array<{id: string, text: string}>,
 *   completedIds: Set<string>,
 *   activeEvents?: Array<object>,
 *   cadence?: 'weekly' | 'daily',
 * }} opts
 */
export function createPromptsBody({ weekKey, prompts, completedIds, activeEvents = [], cadence = 'weekly' }) {
  const completed = new Set(completedIds);
  const isDaily = cadence === 'daily';

  const eventGroupsEl = h('div', { class: 'pf-event-groups' });
  const weeklyList = h('ul', { class: 'pf-prompts-list' });

  const introText = isDaily
    ? 'Today\'s writing idea. '
    : 'This week\'s writing ideas. Try any that call to you. ';
  const introSoft = isDaily
    ? 'A fresh prompt each day — no pressure to check it off.'
    : 'New set every Monday — you can leave any unchecked.';

  const intro = h('p', { class: 'pf-prompts-intro' }, [
    introText,
    h('span', { class: 'pf-prompts-intro-soft' }, [introSoft]),
  ]);

  // Cadence toggle — two small pill buttons at the top-right of the
  // section body. Clicking either stashes the choice and fires a
  // settings-changed notification; the profile re-reads on next open.
  // We don't live-swap the DOM in place because the toggle affects
  // which prompts are *shown* (not just style), and the cleanest way
  // to get that right is a fresh re-render.
  const cadenceToggle = createCadenceToggle(cadence);

  function renderAll() {
    const eventChildren = [];
    for (const ev of activeEvents) {
      eventChildren.push(createEventGroup(ev, completed, (id, done) => toggle(id, done)));
    }
    replaceContents(eventGroupsEl, eventChildren);

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
    h('div', { class: 'pf-prompts-header' }, [intro, cadenceToggle]),
    eventGroupsEl,
    weeklyList,
  ]);
}

/**
 * Segmented-control style toggle. Persists the choice and closes the
 * overlay so the next profile open re-reads with the new cadence — the
 * cleanest way to get everything downstream (archive, pulse, event
 * group rendering) in sync without live-rewiring the DOM.
 */
function createCadenceToggle(current) {
  const wklBtn = h('button', {
    type: 'button',
    class: 'pf-cadence-btn' + (current === 'weekly' ? ' pf-cadence-btn-active' : ''),
    'aria-pressed': String(current === 'weekly'),
    title: 'Four prompts per week',
    onClick: () => pick('weekly'),
  }, ['Weekly']);
  const dayBtn = h('button', {
    type: 'button',
    class: 'pf-cadence-btn' + (current === 'daily' ? ' pf-cadence-btn-active' : ''),
    'aria-pressed': String(current === 'daily'),
    title: 'One prompt per day',
    onClick: () => pick('daily'),
  }, ['Daily']);

  function pick(next) {
    if (next === current) return;
    updateField('prompts.cadence', next);
    // Close the overlay; re-opening reads the new cadence. Avoids
    // having to tear down + rebuild the entire Prompts tree in place.
    // Use closest() instead of document.querySelector so we close THIS
    // overlay and not some other one that might exist.
    const overlay = wklBtn.closest('.pf-overlay');
    if (overlay && typeof overlay.hide === 'function') overlay.hide();
  }

  return h('div', {
    class: 'pf-cadence-toggle',
    role: 'group',
    'aria-label': 'Prompt cadence',
  }, [wklBtn, dayBtn]);
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

// render/prompt_archive.js
//
// Read-only view of past weeks' prompts. Groups per week: week label,
// date range, completion count, list of offered prompts with ✓ or · for
// completion state. Event-themed prompts appear in their own subgroup
// inside each week, matching the current Prompts section's layout.
//
// This is not interactive — no checkboxes. Past is past. The live Prompts
// section remains the place for editing the current week.

import { h, replaceContents } from '../utils/dom.js';
import { computeArchiveEntries, MAX_WEEKS_BACK } from '../prompts/archive.js';

const INITIAL_WEEKS = 8;
const STEP_WEEKS    = 8;

export function createPromptArchive() {
  const container = h('div', { class: 'pf-archive' });
  let weeksBack = INITIAL_WEEKS;

  function render() {
    const entries = computeArchiveEntries({ weeksBack });

    if (entries.length === 0) {
      replaceContents(container, [
        h('p', { class: 'pf-archive-empty' }, [
          'No past weeks yet — the first archive entry appears next Monday.',
        ]),
      ]);
      return;
    }

    const children = [
      h('p', { class: 'pf-archive-intro' }, [
        'A record of past weeks. ',
        h('span', { class: 'pf-archive-intro-soft' }, [
          'Read-only — completions here reflect what you marked at the time.',
        ]),
      ]),
      ...entries.map(renderWeekEntry),
    ];

    if (weeksBack < MAX_WEEKS_BACK) {
      children.push(h('button', {
        class: 'pf-archive-load-more',
        type: 'button',
        onClick: () => {
          weeksBack = Math.min(MAX_WEEKS_BACK, weeksBack + STEP_WEEKS);
          render();
        },
      }, ['Show earlier weeks']));
    } else {
      children.push(h('p', { class: 'pf-archive-end' }, [
        `Showing the past ${MAX_WEEKS_BACK} weeks.`,
      ]));
    }

    replaceContents(container, children);
  }

  render();
  return container;
}

function renderWeekEntry(entry) {
  const eventChildren = entry.eventGroups.map(eg =>
    h('div', { class: 'pf-archive-event-group' }, [
      h('div', { class: 'pf-archive-event-head' }, [
        h('span', { class: 'pf-archive-event-icon', 'aria-hidden': 'true' }, [eg.eventIcon || '✦']),
        h('span', { class: 'pf-archive-event-name' }, [eg.eventName]),
      ]),
      h('ul', { class: 'pf-archive-list' }, eg.prompts.map(renderPromptItem)),
    ])
  );

  return h('div', { class: 'pf-archive-week' }, [
    h('div', { class: 'pf-archive-week-head' }, [
      h('div', { class: 'pf-archive-week-title' }, [
        h('span', { class: 'pf-archive-week-key' }, [entry.weekKey]),
        h('span', { class: 'pf-archive-week-range' }, [entry.dateRange]),
      ]),
      h('div', {
        class: 'pf-archive-week-count' +
          (entry.completedCount === 0 ? ' pf-archive-week-count-none' : ''),
      }, [
        `${entry.completedCount} of ${entry.totalCount}`,
      ]),
    ]),
    h('ul', { class: 'pf-archive-list' }, entry.regularPrompts.map(renderPromptItem)),
    ...eventChildren,
  ]);
}

function renderPromptItem(p) {
  return h('li', {
    class: 'pf-archive-item' + (p.completed ? ' pf-archive-item-done' : ''),
  }, [
    h('span', {
      class: 'pf-archive-check',
      'aria-label': p.completed ? 'Completed' : 'Not completed',
    }, [p.completed ? '✓' : '·']),
    h('span', { class: 'pf-archive-text' }, [p.text]),
  ]);
}

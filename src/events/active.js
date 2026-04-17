// events/active.js
//
// Given a date, return the events whose window is currently active.
// Pure — no I/O, no localStorage. Uses UTC to keep timezone handling
// consistent with the weekly scheduler.
//
// Each event's window is expressed as (startMonth, startDay) to
// (endMonth, endDay), inclusive on both ends, year-agnostic.
// Windows never cross a year boundary (enforced by registry discipline).

import { EVENTS } from './registry.js';

/**
 * @param {Date} [date=new Date()]
 * @returns {Array<object>}  events currently within their window
 */
export function getActiveEvents(date = new Date()) {
  const month = date.getUTCMonth() + 1;  // 1..12
  const day = date.getUTCDate();          // 1..31
  const today = month * 100 + day;        // e.g. 424 for April 24 — numeric compare

  return EVENTS.filter(ev => {
    const start = ev.startMonth * 100 + ev.startDay;
    const end   = ev.endMonth   * 100 + ev.endDay;
    return today >= start && today <= end;
  });
}

/**
 * @param {Date} [date=new Date()]
 * @returns {string[]} IDs of currently-active events
 */
export function getActiveEventIds(date = new Date()) {
  return getActiveEvents(date).map(ev => ev.id);
}

/**
 * Flatten all prompt objects from the currently-active events, tagged
 * with their event metadata so the renderer can group them visually.
 *
 * @param {Date} [date=new Date()]
 * @returns {Array<{ event: object, prompt: {id: string, text: string} }>}
 */
export function getActiveEventPrompts(date = new Date()) {
  const active = getActiveEvents(date);
  const out = [];
  for (const ev of active) {
    for (const p of ev.prompts) {
      out.push({ event: ev, prompt: p });
    }
  }
  return out;
}

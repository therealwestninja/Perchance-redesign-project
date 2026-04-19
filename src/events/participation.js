// events/participation.js
//
// Tracks the user's engagement with each holiday/event beyond the
// existing seenEventIds "I saw the badge" signal. Three states, each
// a strict upgrade from the previous:
//
//   null           — never encountered (no record)
//   'seen'         — user has been shown the badge/announcement
//   'responded'    — user completed at least one prompt from this event
//   'chronicled'   — user explicitly added something from this event to
//                    their chronicle (future hook; no UI yet)
//
// State transitions are MONOTONIC: once you've "responded", you can't
// regress to "seen" by un-completing prompts. This keeps the record
// a historical badge rather than a fragile live-state — if a user
// un-checks a prompt after participating, we don't forget the moment.
//
// Storage: settings.notifications.eventParticipation = {
//   [eventId]: { state: 'seen'|'responded'|'chronicled', at: ISO }
// }
//
// Writes are idempotent and guarded against downgrades. Errors are
// silently swallowed — participation is a pleasant history signal,
// not critical state.

import { loadSettings, updateField } from '../profile/settings_store.js';
import { EVENTS } from './registry.js';

const STATE_RANK = Object.freeze({
  seen: 1,
  responded: 2,
  chronicled: 3,
});

/**
 * Read the full event-participation map. Always returns an object.
 * @returns {Object<string, { state: string, at: string }>}
 */
export function getEventParticipation() {
  try {
    const s = loadSettings();
    const map = (s && s.notifications && s.notifications.eventParticipation) || {};
    return (map && typeof map === 'object' && !Array.isArray(map)) ? map : {};
  } catch {
    return {};
  }
}

/**
 * Read a single event's participation record.
 * @param {string} eventId
 * @returns {{ state: string, at: string } | null}
 */
export function getEventParticipationFor(eventId) {
  if (typeof eventId !== 'string' || !eventId) return null;
  const map = getEventParticipation();
  return map[eventId] || null;
}

/**
 * Record that the user has reached a participation state for the
 * given event. Monotonic — will NOT regress an existing higher state
 * to a lower one. Idempotent if the state is already at or above the
 * one requested.
 *
 * @param {string} eventId
 * @param {'seen'|'responded'|'chronicled'} state
 */
export function recordEventParticipation(eventId, state) {
  if (typeof eventId !== 'string' || !eventId) return;
  const rank = STATE_RANK[state];
  if (!rank) return;
  try {
    const map = { ...getEventParticipation() };
    const prev = map[eventId];
    const prevRank = prev ? (STATE_RANK[prev.state] || 0) : 0;
    if (rank <= prevRank) return; // no downgrade, no duplicate writes
    map[eventId] = { state, at: new Date().toISOString() };
    updateField('notifications.eventParticipation', map);
  } catch { /* best-effort */ }
}

/**
 * Given a prompt ID, return the event it belongs to, or null if the
 * prompt is a regular weekly prompt. Event prompts are namespaced
 * with `e-` prefix (and their events by `e-<eventname>`), but the
 * source of truth is the registry itself.
 *
 * @param {string} promptId
 * @returns {object|null}  the event object from registry, or null
 */
export function findEventForPrompt(promptId) {
  if (typeof promptId !== 'string' || !promptId.startsWith('e-')) return null;
  for (const ev of EVENTS) {
    if (ev.prompts && ev.prompts.some(p => p.id === promptId)) return ev;
  }
  return null;
}

/**
 * If the given prompt belongs to an event, bump that event's
 * participation to 'responded'. Called from the prompt-completion
 * pipeline. No-op for non-event prompts.
 *
 * @param {string} promptId
 */
export function recordPromptCompletionParticipation(promptId) {
  const ev = findEventForPrompt(promptId);
  if (!ev) return;
  recordEventParticipation(ev.id, 'responded');
}

/**
 * Count how many distinct events the user has ever responded to (or
 * reached a higher state for). Used by achievements that reward
 * event participation variety.
 *
 * @returns {number}
 */
export function countEventsResponded() {
  const map = getEventParticipation();
  let n = 0;
  for (const rec of Object.values(map)) {
    if (rec && STATE_RANK[rec.state] >= STATE_RANK.responded) n++;
  }
  return n;
}

// render/activity_sparkline.js
//
// Compact bar-sparkline showing recent weeks of prompt-completion activity.
// Complements the radar (which shows total SHAPE) by showing trajectory
// over time. Only appears in Focus mode — part of the share card composition.
//
// Uses the archive's computeArchiveEntries for past-week completion counts,
// plus the caller-supplied current week's live count so the rightmost bar
// reflects "this week so far" rather than being absent.

import { h, hSVG } from '../utils/dom.js';
import { computeArchiveEntries } from '../prompts/archive.js';

const DEFAULT_WEEKS = 12;

// Visual dimensions — matches the corner chips in feel (compact, readable
// from a screenshot without dominating the radar).
const WIDTH = 380;
const BAR_AREA_HEIGHT = 40;
const LABEL_HEIGHT = 18;
const HEIGHT = BAR_AREA_HEIGHT + LABEL_HEIGHT + 4;
const BAR_GAP = 3;

/**
 * @param {{
 *   currentWeekCompletedCount: number,
 *   weeks?: number,
 *   now?: Date,
 * }} opts
 */
export function createActivitySparkline({ currentWeekCompletedCount = 0, weeks = DEFAULT_WEEKS, now = new Date() } = {}) {
  // Fetch past weeks — archive returns newest-first, we'll iterate and
  // reverse for chronological left-to-right display. Current week appended
  // at the end as the rightmost (lit) bar.
  const pastEntries = computeArchiveEntries({ weeksBack: weeks - 1, now });
  const pastCounts = [...pastEntries].reverse().map(e => e.completedCount);
  const currentCount = Math.max(0, Number(currentWeekCompletedCount) || 0);

  // series = [ past weeks (oldest → newest), currentWeek ]
  const series = [...pastCounts, currentCount];
  const totalCompletions = series.reduce((acc, v) => acc + v, 0);

  // For the Y scale: use the greater of the series max and a reasonable
  // floor so a "zero-all-around" new user still shows empty bars of
  // consistent height rather than huge bars that happen to be zero.
  // Floor of 4 = the weekly prompt count; most weeks cap around 7 with events.
  const ymax = Math.max(4, ...series);

  const barSlotWidth = (WIDTH - BAR_GAP * (series.length - 1)) / series.length;
  const barWidth = Math.max(2, barSlotWidth);

  const bars = series.map((count, i) => {
    const isCurrent = i === series.length - 1;
    const normalized = count / ymax;
    const barH = normalized * BAR_AREA_HEIGHT;
    const x = i * (barSlotWidth + BAR_GAP);
    const y = BAR_AREA_HEIGHT - barH;

    // Background "track" bar so empty weeks still show a visual placeholder
    const track = hSVG('rect', {
      class: 'pf-sparkline-track',
      x: x.toFixed(2),
      y: 0,
      width: barWidth.toFixed(2),
      height: BAR_AREA_HEIGHT,
      rx: 1.5,
    });

    // Value bar. Zero-count bars draw a tiny sliver so the timeline
    // still reads as "a bar is present, it's just small/empty."
    const valueH = count === 0 ? 2 : Math.max(2, barH);
    const valueY = BAR_AREA_HEIGHT - valueH;
    const value = hSVG('rect', {
      class: 'pf-sparkline-bar' + (isCurrent ? ' pf-sparkline-bar-current' : ''),
      x: x.toFixed(2),
      y: valueY.toFixed(2),
      width: barWidth.toFixed(2),
      height: valueH.toFixed(2),
      rx: 1.5,
    });

    return [track, value];
  }).flat();

  // Bottom label: left = range description, right = total
  const labelY = BAR_AREA_HEIGHT + LABEL_HEIGHT - 2;
  const leftLabel = hSVG('text', {
    class: 'pf-sparkline-label',
    x: 0,
    y: labelY,
    'text-anchor': 'start',
  }, [`Past ${series.length} weeks`]);
  const rightLabel = hSVG('text', {
    class: 'pf-sparkline-label pf-sparkline-label-right',
    x: WIDTH,
    y: labelY,
    'text-anchor': 'end',
  }, [`${totalCompletions} completed`]);

  const svg = hSVG('svg', {
    class: 'pf-sparkline-svg',
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    role: 'img',
    'aria-label': `Prompt activity, past ${series.length} weeks: ${totalCompletions} completions total`,
  }, [...bars, leftLabel, rightLabel]);

  return h('div', { class: 'pf-sparkline' }, [svg]);
}

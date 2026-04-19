// render/sparkline.js
//
// Tiny inline SVG sparkline. Designed for chips in the Activity
// section — 30 data points squeezed into a small horizontal strip
// under each counter's label.
//
// Renders as a single <polyline> for the line + a filled <polygon>
// for the area under the line. Scales y to the series max so even
// small-value counters show relative shape, not a flat zero.
//
// If every value is zero (or the series is empty), returns a minimal
// empty SVG rather than null, so callers can unconditionally append
// it without a layout shift.

import { hSVG } from '../utils/dom.js';

const DEFAULT_W = 80;
const DEFAULT_H = 20;
const PAD_Y = 2;

/**
 * Pure helper — turn a series into an array of [x, y] points. Exported
 * for tests; consumers that just want a rendered SVG should use
 * createSparkline.
 *
 * Returns { points, max, lastIdx }. `points` is empty for empty/null
 * input; `max === 0` indicates the "flat-line" rendering case.
 */
export function computeSparklinePoints(series, width = DEFAULT_W, height = DEFAULT_H) {
  if (!Array.isArray(series) || series.length === 0) {
    return { points: [], max: 0, lastIdx: -1 };
  }
  const max = series.reduce((m, v) => Math.max(m, Number(v) || 0), 0);
  const stepX = series.length > 1 ? width / (series.length - 1) : 0;
  const usableH = height - PAD_Y * 2;
  const points = series.map((v, i) => {
    const x = i * stepX;
    const y = max > 0
      ? height - PAD_Y - ((Number(v) || 0) / max) * usableH
      : height - PAD_Y;
    return [x, y];
  });
  return { points, max, lastIdx: series.length - 1 };
}

/**
 * Build a sparkline SVG element.
 *
 * @param {number[]} series - data points, oldest-first. Length drives
 *                            the horizontal resolution.
 * @param {{ width?: number, height?: number, color?: string,
 *           fill?: string, label?: string }} [opts]
 * @returns {SVGElement}
 */
export function createSparkline(series, {
  width = DEFAULT_W,
  height = DEFAULT_H,
  color = 'currentColor',
  fill,
  label,
} = {}) {
  const attrs = {
    class: 'pf-sparkline',
    viewBox: `0 0 ${width} ${height}`,
    width: String(width),
    height: String(height),
    'aria-hidden': label ? 'false' : 'true',
  };
  if (label) attrs['aria-label'] = label;

  if (!Array.isArray(series) || series.length === 0) {
    return hSVG('svg', attrs, []);
  }

  const { points, max } = computeSparklinePoints(series, width, height);
  // No data yet — draw a flat line along the bottom so the element
  // still has a visible shape without pretending there's activity.
  if (max === 0) {
    return hSVG('svg', attrs, [
      hSVG('line', {
        x1: '0',
        y1: String(height - PAD_Y),
        x2: String(width),
        y2: String(height - PAD_Y),
        stroke: color,
        'stroke-opacity': '0.25',
        'stroke-width': '1',
      }),
    ]);
  }

  // Area fill under the line. Optional — if no fill color is passed,
  // we derive a translucent version of the stroke color.
  const areaFill = fill || 'currentColor';
  const areaPoints = [
    [0, height],
    ...points,
    [points[points.length - 1][0], height],
  ];
  const children = [
    hSVG('polygon', {
      points: areaPoints.map(p => p.join(',')).join(' '),
      fill: areaFill,
      'fill-opacity': '0.18',
    }),
    hSVG('polyline', {
      points: points.map(p => p.join(',')).join(' '),
      fill: 'none',
      stroke: color,
      'stroke-width': '1.25',
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    }),
  ];

  // Highlight today's point (the last one) as a small dot. Gives a
  // "you're here" anchor and also pulls focus to present activity.
  const lastValue = Number(series[series.length - 1]) || 0;
  if (lastValue > 0) {
    const [lx, ly] = points[points.length - 1];
    children.push(hSVG('circle', {
      cx: String(lx),
      cy: String(ly),
      r: '1.8',
      fill: color,
    }));
  }

  return hSVG('svg', attrs, children);
}

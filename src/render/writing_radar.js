// render/writing_radar.js
//
// SVG pentagon radar chart showing the user's "writing shape" across
// 5 axes. Uses tier-based normalization (see stats/radar_stats.js) so
// the shape is meaningful at every progression stage.

import { h, hSVG } from '../utils/dom.js';
import { computeRadarValues } from '../stats/radar_stats.js';
import { formatNumber } from '../utils/format.js';

const VIEWBOX = 400;
const CENTER  = VIEWBOX / 2;
const RADIUS  = 140;       // max data radius
const LABEL_OFFSET = 28;   // labels sit this far outside the data polygon
const GRID_RINGS = 4;      // number of concentric guide rings

export function createWritingRadar({ stats }) {
  const values = computeRadarValues(stats);
  const n = values.length;

  // Axis unit vectors — start at top (-90°), go clockwise
  const axes = values.map((v, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI / n);
    return {
      ...v,
      angle,
      unit: { x: Math.cos(angle), y: Math.sin(angle) },
    };
  });

  // ---- SVG elements ----

  const svgChildren = [];

  // Concentric guide rings (equal spacing — they represent equal normalized progress)
  for (let ring = 1; ring <= GRID_RINGS; ring++) {
    const r = RADIUS * (ring / GRID_RINGS);
    svgChildren.push(makePolygon(axes, r, {
      class: 'pf-radar-ring',
      fill: 'none',
    }));
  }

  // Axis lines from center to the outer ring
  for (const a of axes) {
    svgChildren.push(hSVG('line', {
      class: 'pf-radar-axis-line',
      x1: CENTER,
      y1: CENTER,
      x2: CENTER + a.unit.x * RADIUS,
      y2: CENTER + a.unit.y * RADIUS,
    }));
  }

  // Data polygon — filled
  svgChildren.push(makePolygon(
    axes.map(a => ({ ...a, _r: RADIUS * a.normalized })),
    null, // radius comes from per-axis _r
    { class: 'pf-radar-value-fill' }
  ));

  // Value vertex dots
  for (const a of axes) {
    const r = RADIUS * a.normalized;
    svgChildren.push(hSVG('circle', {
      class: 'pf-radar-value-dot',
      cx: CENTER + a.unit.x * r,
      cy: CENTER + a.unit.y * r,
      r: 3.5,
    }));
  }

  // Axis labels at the outer end of each axis
  for (const a of axes) {
    const lx = CENTER + a.unit.x * (RADIUS + LABEL_OFFSET);
    const ly = CENTER + a.unit.y * (RADIUS + LABEL_OFFSET);
    svgChildren.push(hSVG('text', {
      class: 'pf-radar-label',
      x: lx,
      y: ly,
      'text-anchor': anchorFor(a.unit.x),
      'dominant-baseline': baselineFor(a.unit.y),
    }, [a.label]));
  }

  const svg = hSVG('svg', {
    class: 'pf-radar-svg',
    viewBox: `0 0 ${VIEWBOX} ${VIEWBOX}`,
    role: 'img',
    'aria-label': describeShape(values),
  }, svgChildren);

  // A compact raw-values readout below the chart, so the radar isn't
  // purely impressionistic — the user can see the actual numbers too.
  const readout = h('div', { class: 'pf-radar-readout' }, axes.map(a =>
    h('div', { class: 'pf-radar-readout-item' }, [
      h('span', { class: 'pf-radar-readout-label' }, [a.label]),
      h('span', { class: 'pf-radar-readout-value' }, [formatNumber(a.raw)]),
    ])
  ));

  return h('div', { class: 'pf-radar' }, [svg, readout]);
}

// ---- helpers ----

/**
 * Build an SVG polygon from an array of axes. If `constantR` is given,
 * every vertex sits at that radius. Otherwise each axis's `_r` is used.
 */
function makePolygon(axes, constantR, attrs) {
  const points = axes.map(a => {
    const r = constantR != null ? constantR : a._r;
    const x = CENTER + a.unit.x * r;
    const y = CENTER + a.unit.y * r;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  return hSVG('polygon', { ...attrs, points });
}

function anchorFor(ux) {
  if (ux > 0.25)  return 'start';
  if (ux < -0.25) return 'end';
  return 'middle';
}

function baselineFor(uy) {
  if (uy > 0.25)  return 'hanging';
  if (uy < -0.25) return 'alphabetic';
  return 'middle';
}

/**
 * ARIA description — screen reader gets a plain summary of the shape.
 */
function describeShape(values) {
  const parts = values.map(v => `${v.label}: ${formatNumber(v.raw)}`);
  return 'Writing-style shape — ' + parts.join(', ');
}

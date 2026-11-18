/**
 * @file HistoryPage.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import { escapeHTML, formatNumber } from '../html.js';
import { getReleaseLink, loadSchemaIndex } from './shared.js';

// ----------------------------------------------------------------------------
// Functions
// ----------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// NOTE: "2016-08-30" -> "Aug 2016".
function formatMonth (
  isoDate
) {
  return isoDate ? `${MONTHS.at(Number(isoDate.slice(5, 7)) - 1)} ${isoDate.slice(0, 4)}` : '';
}

function toDays (
  isoDate
) {
  return Date.parse(isoDate) / 864e5;
}

// NOTE: a round step for about five gridlines (1, 2 or 5 times a power of 10).
function getStep (
  maximum
) {
  const rough = Math.max(1, maximum) / 5;
  const power = 10 ** Math.floor(Math.log10(rough));
  return [1, 2, 5, 10].map((factor) => factor * power).find((step) => step >= rough);
}

// ----------------------------------------------------------------------------
// HistoryPage
// ----------------------------------------------------------------------------

// NOTE: admins only. Every imported release placed on a timeline by its
// release point (when its changes stopped, from the package's `released`),
// climbing by the elements and types it added, changed or removed against
// the release it builds on. A release that builds on an older one starts
// its climb from that release, so a parallel draft shows as a branch.
export class HistoryPage {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Static variables
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  // NOTE: validated with the dataviz palette checker against white: lightness
  // band, chroma, colour-blind separation and 3:1 contrast all pass.
  static PUBLISHERS = {
    GPO: { label: 'GPO release', color: '#1d64bf' },
    Xcential: { label: 'Xcential proposal', color: '#c97a10' }
  };

  static LAYOUT = {
    width: 1120,
    height: 460,
    left: 64,
    right: 48,
    top: 28,
    bottom: 44,
    labelHeight: 18
  };

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Constructor
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  constructor (
    store
  ) {
    this.store = store;
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance internal methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  #getPublisher (
    manifest
  ) {
    if (manifest.publisher && HistoryPage.PUBLISHERS[manifest.publisher]) {
      return manifest.publisher;
    }
    return manifest.status === 'reference' ? 'GPO' : 'Xcential';
  }

  async #buildPoints (
    packages
  ) {
    const byRelease = new Map(packages.map((entry) => [entry.manifest.release, entry]));
    const points = new Map();
    for (const entry of packages) {
      const earlier = byRelease.get(entry.manifest.buildsOn) ?? null;
      let totals = null;
      if (earlier) {
        const [current, before] = await Promise.all([loadSchemaIndex(this.store, entry), loadSchemaIndex(this.store, earlier)]);
        totals = Object.values(current.compareWith(before)).reduce((sum, change) => ({
          added: sum.added + change.added.length,
          changed: sum.changed + change.changed.length,
          removed: sum.removed + change.removed.length
        }), { added: 0, changed: 0, removed: 0 });
      }
      const step = totals ? totals.added + totals.changed + totals.removed : 0;
      const base = earlier ? points.get(earlier.manifest.release)?.running ?? 0 : 0;
      points.set(entry.manifest.release, {
        entry,
        earlier,
        totals,
        step,
        running: base + step,
        coverage: entry.manifest.validation?.byRole?.regression ?? null,
        date: entry.manifest.released,
        publisher: this.#getPublisher(entry.manifest)
      });
    }
    return [...points.values()];
  }

  // NOTE: places each label beside its point where it hits no other label,
  // point or the plot's edge, trying the nearest spots first.
  #placeLabels (
    points,
    x,
    y,
    bounds,
    getLabel
  ) {
    const layout = HistoryPage.LAYOUT;
    const placed = [];
    const markers = points.map((point) => ({ x0: x(point) - 8, x1: x(point) + 8, y0: y(point) - 8, y1: y(point) + 8 }));
    // NOTE: the lines are sampled every 4 units, close enough to keep a
    // label off them.
    const linePoints = points.filter((point) => point.earlier).flatMap((point) => {
      const from = points.find((other) => other.entry === point.earlier);
      if (!from) {
        return [];
      }
      const length = Math.hypot(x(point) - x(from), y(point) - y(from));
      const count = Math.max(1, Math.ceil(length / 4));
      return Array.from({ length: count + 1 }, (_, i) => [x(from) + (x(point) - x(from)) * i / count, y(from) + (y(point) - y(from)) * i / count]);
    });
    const overlaps = (box) => [...placed, ...markers].some((other) => box.x0 < other.x1 && box.x1 > other.x0 && box.y0 < other.y1 && box.y1 > other.y0) ||
      linePoints.some(([px, py]) => px > box.x0 - 2 && px < box.x1 + 2 && py > box.y0 - 2 && py < box.y1 + 2);
    const inside = (box) => box.x0 >= bounds.x0 && box.x1 <= bounds.x1 && box.y0 >= bounds.y0 && box.y1 <= bounds.y1;
    return points.map((point) => {
      const text = getLabel(point);
      const width = text.length * 7.2;
      const px = x(point);
      const py = y(point);
      const candidates = [
        [12, -layout.labelHeight / 2], [-12 - width, -layout.labelHeight / 2],
        [-width / 2, -12 - layout.labelHeight], [-width / 2, 12],
        [12, -layout.labelHeight - 6], [-12 - width, -layout.labelHeight - 6],
        [12, 6], [-12 - width, 6],
        [-width / 2, -34 - layout.labelHeight], [-width / 2, 34],
        [12, -34 - layout.labelHeight], [-12 - width, -34 - layout.labelHeight],
        [12, 34], [-12 - width, 34],
        [-width / 2, -56 - layout.labelHeight], [-width / 2, 56],
        [12, -56 - layout.labelHeight], [-12 - width, -56 - layout.labelHeight],
        [12, 56], [-12 - width, 56]
      ];
      for (const [dx, dy] of candidates) {
        const box = { x0: px + dx, x1: px + dx + width, y0: py + dy, y1: py + dy + layout.labelHeight };
        if (inside(box) && !overlaps(box)) {
          placed.push(box);
          return { text, box, far: Math.abs(dy) > 30 || (dy > 0 && Math.abs(dx) > 30 && dy > 20) };
        }
      }
      const box = { x0: px + 12, x1: px + 12 + width, y0: py - layout.labelHeight / 2, y1: py + layout.labelHeight / 2 };
      placed.push(box);
      return { text, box, far: false };
    });
  }

  // NOTE: one chart: releases on a time axis, a value per release, each
  // release joined to the release it builds on.
  #renderChart (
    points,
    {
      getValue,
      getLabel,
      title,
      yMax: fixedMax = null,
      formatTick = formatNumber,
      chartID
    },
    timeRange
  ) {
    const layout = HistoryPage.LAYOUT;
    const { start, end } = timeRange;
    const top = Math.max(...points.map(getValue));
    const step = fixedMax ? fixedMax / 4 : getStep(top);
    const yMax = fixedMax ?? (Math.ceil(top / step) * step || step);
    const plotWidth = layout.width - layout.left - layout.right;
    const plotHeight = layout.height - layout.top - layout.bottom;
    const xDate = (isoDate) => layout.left + (toDays(isoDate) - start) / (end - start) * plotWidth;
    const yValue = (value) => layout.top + (1 - value / yMax) * plotHeight;
    const x = (point) => xDate(point.date);
    const y = (point) => yValue(getValue(point));
    const baseline = layout.height - layout.bottom;
    const firstYear = new Date(start * 864e5).getUTCFullYear() + 1;
    const lastYear = new Date(end * 864e5).getUTCFullYear();
    const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);
    const yTicks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);
    const grid = `
      ${yTicks.map((value) => `<line x1="${layout.left}" x2="${layout.width - layout.right}" y1="${yValue(value)}" y2="${yValue(value)}" class="history-grid"/><text x="${layout.left - 10}" y="${yValue(value) + 4}" text-anchor="end" class="history-tick">${formatTick(value)}</text>`).join('')}
      ${years.map((year) => `<line x1="${xDate(`${year}-01-01`)}" x2="${xDate(`${year}-01-01`)}" y1="${baseline}" y2="${baseline + 6}" class="history-axis"/><text x="${xDate(`${year}-01-01`)}" y="${baseline + 22}" text-anchor="middle" class="history-tick">${year}</text>`).join('')}
      <line x1="${layout.left}" x2="${layout.width - layout.right}" y1="${baseline}" y2="${baseline}" class="history-axis"/>`;
    const firstChild = new Map();
    for (const point of [...points].sort((first, second) => first.date.localeCompare(second.date))) {
      if (point.earlier && !firstChild.has(point.earlier.manifest.release)) {
        firstChild.set(point.earlier.manifest.release, point);
      }
    }
    const segments = points.filter((point) => point.earlier).map((point) => {
      const from = points.find((other) => other.entry === point.earlier);
      if (!from) {
        return '';
      }
      const isBranch = firstChild.get(point.earlier.manifest.release) !== point;
      const color = HistoryPage.PUBLISHERS[point.publisher].color;
      return `<path d="M${x(from)} ${y(from)}L${x(point)} ${y(point)}" fill="none" stroke="${color}" stroke-width="2"${isBranch ? ' stroke-dasharray="6 5"' : ''}/>`;
    }).join('');
    const labels = this.#placeLabels(points, x, y, { x0: layout.left + 4, x1: layout.width - 4, y0: 20, y1: baseline - 4 }, getLabel);
    const marks = points.map((point, index) => {
      const label = labels.at(index);
      const color = HistoryPage.PUBLISHERS[point.publisher].color;
      const leader = label.far
        ? `<line x1="${x(point)}" y1="${y(point)}" x2="${Math.min(Math.max(x(point), label.box.x0), label.box.x1)}" y2="${label.box.y0 > y(point) ? label.box.y0 : label.box.y1}" class="history-leader"/>`
        : '';
      return `
        <g class="history-point" tabindex="0" data-index="${index}">
          ${leader}
          <circle cx="${x(point)}" cy="${y(point)}" r="16" class="history-hit"/>
          <circle cx="${x(point)}" cy="${y(point)}" r="6" fill="${color}" stroke="#ffffff" stroke-width="2"/>
          <text x="${label.box.x0}" y="${label.box.y0 + 13}" class="history-label">${escapeHTML(label.text)}</text>
        </g>`;
    }).join('');
    return `
      <div class="history-chart" id="${chartID}" style="position: relative">
        <svg viewBox="0 0 ${layout.width} ${layout.height}" width="100%" role="img" aria-label="${escapeHTML(title)}, release by release, on a timeline">
          ${grid}
          <text x="${layout.left}" y="14" class="history-tick">${escapeHTML(title)}</text>
          ${segments}${marks}
        </svg>
        <div class="history-tooltip" role="status" hidden></div>
      </div>`;
  }

  #renderTable (
    points
  ) {
    const rows = [...points]
      .sort((first, second) => String(first.date ?? '').localeCompare(String(second.date ?? '')))
      .map((point) => `
        <tr>
          <th scope="row"><a href="${getReleaseLink(point.entry.name, point.earlier ? '/changes' : '')}">${escapeHTML(point.entry.manifest.release)}</a></th>
          <td>${escapeHTML(point.publisher)}</td>
          <td>${escapeHTML(formatMonth(point.date) || 'not recorded')}<br><span class="small muted">${escapeHTML(point.entry.manifest.releasedEvidence ?? '')}</span></td>
          <td>${escapeHTML(point.earlier?.manifest.release ?? '—')}</td>
          <td class="num">${point.totals ? formatNumber(point.totals.added) : '—'}</td>
          <td class="num">${point.totals ? formatNumber(point.totals.changed) : '—'}</td>
          <td class="num">${point.totals ? formatNumber(point.totals.removed) : '—'}</td>
          <td class="num">${formatNumber(point.running)}</td>
          <td class="num">${point.coverage?.samples ? `${formatNumber(point.coverage.schemaValid)} of ${formatNumber(point.coverage.samples)}` : '—'}</td>
        </tr>`).join('');
    return `
      <details>
        <summary>Show the numbers and where each date comes from</summary>
        <div class="table-box" style="margin-top: 12px">
          <table>
            <thead><tr><th scope="col">Release</th><th scope="col">By</th><th scope="col">Release point</th><th scope="col">Compared with</th><th scope="col" class="num">New</th><th scope="col" class="num">Changed</th><th scope="col" class="num">Removed</th><th scope="col" class="num">Running total</th><th scope="col" class="num">GPO samples accepted</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </details>`;
  }

  #wireTooltip (
    chart,
    points
  ) {
    const tooltip = chart.querySelector('.history-tooltip');
    const show = (mark) => {
      const point = points.at(Number(mark.dataset.index));
      const totals = point.totals;
      tooltip.innerHTML = `
        <p><strong>${escapeHTML(point.entry.manifest.release)}</strong> · ${escapeHTML(HistoryPage.PUBLISHERS[point.publisher].label)}</p>
        <p class="muted">Release point ${escapeHTML(formatMonth(point.date))}</p>
        ${totals
          ? `<p>Against ${escapeHTML(point.earlier.manifest.release)}: <strong>${formatNumber(totals.added)}</strong> new, <strong>${formatNumber(totals.changed)}</strong> changed, <strong>${formatNumber(totals.removed)}</strong> removed</p>`
          : '<p>The starting point: no earlier release to compare with.</p>'}
        <p>Running total: <strong>${formatNumber(point.running)}</strong></p>
        ${point.coverage ? `<p>GPO samples accepted: <strong>${formatNumber(point.coverage.schemaValid)} of ${formatNumber(point.coverage.samples)}</strong></p>` : ''}
        ${totals ? '<p class="muted">Click to see every change</p>' : ''}`;
      const box = mark.querySelector('circle').getBoundingClientRect();
      const frame = chart.getBoundingClientRect();
      tooltip.hidden = false;
      const left = box.right - frame.left + 12;
      tooltip.style.left = `${Math.max(8, Math.min(left, frame.width - tooltip.offsetWidth - 8))}px`;
      tooltip.style.top = `${Math.max(0, box.top - frame.top - 8)}px`;
    };
    const open = (mark) => {
      const point = points.at(Number(mark.dataset.index));
      if (point.earlier) {
        window.location.hash = getReleaseLink(point.entry.name, '/changes').slice(1);
      }
    };
    for (const mark of chart.querySelectorAll('.history-point')) {
      mark.addEventListener('mouseenter', () => show(mark));
      mark.addEventListener('focus', () => show(mark));
      mark.addEventListener('mouseleave', () => { tooltip.hidden = true; });
      mark.addEventListener('blur', () => { tooltip.hidden = true; });
      mark.addEventListener('click', () => open(mark));
      mark.addEventListener('keydown', (event) => event.key === 'Enter' && open(mark));
    }
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance properties & methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  async render (
    container
  ) {
    container.innerHTML = '<p class="muted" role="status">Reading every release… this takes a few seconds.</p>';
    const packages = (await this.store.listAllPackages())
      .slice()
      .sort((first, second) => String(first.manifest.release).localeCompare(String(second.manifest.release), 'en', { numeric: true }));
    const points = await this.#buildPoints(packages);
    const dated = points.filter((point) => point.date);
    const undated = points.filter((point) => !point.date);
    const legend = Object.values(HistoryPage.PUBLISHERS)
      .map((publisher) => `<span class="history-legend-item"><span class="history-key" style="background: ${publisher.color}"></span>${publisher.label}</span>`)
      .join('');
    const covered = dated.filter((point) => point.coverage && point.coverage.samples > 0);
    const corpusSizes = new Set(covered.map((point) => point.coverage.samples));
    const days = dated.map((point) => toDays(point.date));
    const timeRange = { start: Math.min(...days) - 120, end: Math.max(...days) + 240 };
    container.innerHTML = `
      <section class="stack">
        <p class="eyebrow">Admins only</p>
        <h1>Release History</h1>
        <p style="max-width: 860px">Each release sits at its release point, the month its changes stopped. Hover a release for its numbers; click it to see every change.</p>
      </section>
      ${dated.length < 2
        ? '<p class="muted">At least two releases with a recorded release point are needed. Re-import the packages built with release dates.</p>'
        : `<div class="history-legend">${legend}<span class="history-legend-item"><svg width="28" height="10" aria-hidden="true"><path d="M0 5H28" stroke="var(--slate)" stroke-width="2" stroke-dasharray="6 5"/></svg>builds on an older release (a branch)</span></div>
          <section class="stack">
            <h2>How Much Changed</h2>
            <p class="small muted" style="max-width: 860px">The line climbs by the elements and types each release added, changed or removed against the release it builds on.</p>
            ${this.#renderChart(dated, {
              chartID: 'history-changes',
              title: 'Running total of constructs new, changed or removed',
              getValue: (point) => point.running,
              getLabel: (point) => `${point.entry.manifest.release}${point.step ? `  +${formatNumber(point.step)}` : ''}`
            }, timeRange)}
          </section>
          ${covered.length >= 2
            ? `<section class="stack">
                <h2>How Many Real Documents Each Release Accepts</h2>
                <p class="small muted" style="max-width: 860px">The same ${corpusSizes.size === 1 ? formatNumber([...corpusSizes][0]) : ''} sample documents GPO has published (bills and resolutions, public laws, Statutes at Large, statute compilations, the Federal Register and CFR, committee reports and CBO estimates), checked against each release's schema. ${corpusSizes.size > 1 ? '<strong>The releases were checked against different sample sets, so the shares are not strictly comparable.</strong> ' : ''}USLM 1.0.18 and 2.0.0 used other namespaces, so these documents cannot be checked against them; 2.0.0 accepts all ${formatNumber(dated.find((point) => point.entry.manifest.release === '2.0.0')?.entry.manifest.validation?.byRole?.proposal?.samples ?? 0) || 'of the'} samples published with it.</p>
                ${this.#renderChart(covered, {
                  chartID: 'history-coverage',
                  title: 'Share of GPO\'s published samples valid against the schema',
                  yMax: 100,
                  formatTick: (value) => `${value}%`,
                  getValue: (point) => 100 * point.coverage.schemaValid / point.coverage.samples,
                  getLabel: (point) => `${point.entry.manifest.release}  ${Math.round(100 * point.coverage.schemaValid / point.coverage.samples)}%`
                }, timeRange)}
              </section>`
            : ''}
          <p class="small muted" style="max-width: 860px">A dashed line starts from the release a draft builds on rather than the newest one before it: 2.2.0-rc1, for example, builds on 2.1.0, so it includes the changes 2.1.3 also makes. Hidden releases are included.</p>
          ${this.#renderTable(points)}`}
      ${undated.length ? `<p class="small muted">Not on the timeline, because their packages record no release point: ${undated.map((point) => escapeHTML(point.entry.manifest.release)).join(', ')}. Re-import the newer packages to place them.</p>` : ''}`;
    for (const [chartID, chartPoints] of [['history-changes', dated], ['history-coverage', covered]]) {
      const chart = container.querySelector(`#${chartID}`);
      if (chart) {
        this.#wireTooltip(chart, chartPoints);
      }
    }
  }
}

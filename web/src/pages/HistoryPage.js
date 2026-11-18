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

// NOTE: "2016-08-30" -> "Aug 2016"; packages built before release dates were
// recorded have none, and show nothing.
function formatMonth (
  isoDate
) {
  if (!isoDate) {
    return '';
  }
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months.at(Number(isoDate.slice(5, 7)) - 1)} ${isoDate.slice(0, 4)}`;
}

// ----------------------------------------------------------------------------
// HistoryPage
// ----------------------------------------------------------------------------

// NOTE: admins only. Every imported release in version order, each compared
// with the release it builds on, as a grid: a column per release and a swim
// lane per family of document types. A construct counts in the lane of each
// family whose document roots can reach it; one every family can reach
// counts once, as shared; one no root reaches counts as a building block.
export class HistoryPage {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Static variables
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  static FAMILIES = [
    { id: 'law', label: 'Bills, laws, Code, regulations', roots: ['bill', 'resolution', 'pLaw', 'uscDoc', 'statute', 'statutesAtLarge', 'statuteCompilation', 'constitutionalAmendment', 'lawDoc', 'cfrDoc', 'frDoc', 'rule', 'notice', 'presidentialDoc'] },
    { id: 'amendment', label: 'Amendments', roots: ['amendment', 'engrossedAmendment'] },
    { id: 'report', label: 'Committee reports', roots: ['legislativeReport'] },
    { id: 'cbo', label: 'CBO cost estimates', roots: ['cboReport'] },
    { id: 'floor', label: 'Floor proceedings and votes', roots: ['rollCall', 'legislativeDay', 'calendar'] }
  ];

  static LANES = [
    { id: 'shared', label: 'Shared by every document type' },
    ...HistoryPage.FAMILIES,
    { id: 'other', label: 'Building blocks no document uses' }
  ];

  // NOTE: validated with the dataviz palette checker against white: lightness
  // band, chroma, colour-blind separation and 3:1 contrast all pass.
  static SERIES = [
    { id: 'added', label: 'New', color: '#1d64bf' },
    { id: 'changed', label: 'Changed', color: '#c97a10' },
    { id: 'removed', label: 'Removed', color: '#7a5ea8' }
  ];

  static LAYOUT = {
    laneLabelWidth: 210,
    columnWidth: 112,
    headerHeight: 76,
    laneHeight: 72,
    barWidth: 18,
    barGap: 2,
    barMaxHeight: 48
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

  // NOTE: the lanes a construct belongs to in one release.
  #getLanes (
    reach,
    presentFamilies,
    key
  ) {
    const families = presentFamilies.filter((family) => reach.get(family.id).has(key));
    if (families.length === 0) {
      return ['other'];
    }
    if (presentFamilies.length > 1 && families.length === presentFamilies.length) {
      return ['shared'];
    }
    return families.map((family) => family.id);
  }

  #computeReach (
    index
  ) {
    const reach = new Map();
    const presentFamilies = [];
    for (const family of HistoryPage.FAMILIES) {
      const roots = family.roots.filter((root) => index.getConstruct('element', root) !== null);
      reach.set(family.id, index.findReachable(roots));
      if (roots.length > 0) {
        presentFamilies.push(family);
      }
    }
    return { reach, presentFamilies };
  }

  async #compareRelease (
    entry,
    earlierEntry
  ) {
    const [current, earlier] = await Promise.all([
      loadSchemaIndex(this.store, entry),
      loadSchemaIndex(this.store, earlierEntry)
    ]);
    const currentReach = this.#computeReach(current);
    const earlierReach = this.#computeReach(earlier);
    const cells = new Map(HistoryPage.LANES.map((lane) => [lane.id, { added: 0, changed: 0, removed: 0 }]));
    const comparison = current.compareWith(earlier);
    for (const [kind, change] of Object.entries(comparison)) {
      for (const series of ['added', 'changed']) {
        for (const name of change[series]) {
          for (const lane of this.#getLanes(currentReach.reach, currentReach.presentFamilies, `${kind}:${name}`)) {
            cells.get(lane)[series] += 1;
          }
        }
      }
      for (const name of change.removed) {
        for (const lane of this.#getLanes(earlierReach.reach, earlierReach.presentFamilies, `${kind}:${name}`)) {
          cells.get(lane).removed += 1;
        }
      }
    }
    const totals = Object.values(comparison).reduce((sum, change) => ({
      added: sum.added + change.added.length,
      changed: sum.changed + change.changed.length,
      removed: sum.removed + change.removed.length
    }), { added: 0, changed: 0, removed: 0 });
    return { entry, earlierEntry, cells, totals };
  }

  #renderChart (
    columns
  ) {
    const layout = HistoryPage.LAYOUT;
    const width = layout.laneLabelWidth + columns.length * layout.columnWidth + 16;
    const height = layout.headerHeight + HistoryPage.LANES.length * layout.laneHeight + 8;
    const maximum = Math.max(1, ...columns.flatMap((column) => [...column.cells.values()].flatMap((cell) => [cell.added, cell.changed, cell.removed])));
    const scale = (value) => value === 0 ? 0 : Math.max(2, (value / maximum) * layout.barMaxHeight);
    const groupWidth = HistoryPage.SERIES.length * layout.barWidth + (HistoryPage.SERIES.length - 1) * layout.barGap;
    const header = columns.map((column, index) => {
      const x = layout.laneLabelWidth + index * layout.columnWidth + layout.columnWidth / 2;
      const previous = columns[index - 1];
      const comparedWith = previous && previous.entry.name === column.earlierEntry.name ? '' : `vs ${column.earlierEntry.manifest.release}`;
      return `
        <a href="${getReleaseLink(column.entry.name, '/changes')}">
          <text x="${x}" y="24" text-anchor="middle" class="history-release">${escapeHTML(column.entry.manifest.release)}</text>
        </a>
        <text x="${x}" y="42" text-anchor="middle" class="history-note">${escapeHTML(formatMonth(column.entry.manifest.released))}</text>
        <text x="${x}" y="58" text-anchor="middle" class="history-note">${escapeHTML(comparedWith)}</text>`;
    }).join('');
    const lanes = HistoryPage.LANES.map((lane, laneIndex) => {
      const y0 = layout.headerHeight + laneIndex * layout.laneHeight;
      const baseline = y0 + layout.laneHeight - 12;
      const cells = columns.map((column, columnIndex) => {
        const cell = column.cells.get(lane.id);
        const x0 = layout.laneLabelWidth + columnIndex * layout.columnWidth;
        const left = x0 + (layout.columnWidth - groupWidth) / 2;
        const bars = HistoryPage.SERIES.map((series, seriesIndex) => {
          const barHeight = scale(cell[series.id]);
          if (barHeight === 0) {
            return '';
          }
          const x = left + seriesIndex * (layout.barWidth + layout.barGap);
          const radius = Math.min(4, barHeight / 2);
          return `<path d="M${x} ${baseline}V${baseline - barHeight + radius}Q${x} ${baseline - barHeight} ${x + radius} ${baseline - barHeight}H${x + layout.barWidth - radius}Q${x + layout.barWidth} ${baseline - barHeight} ${x + layout.barWidth} ${baseline - barHeight + radius}V${baseline}Z" fill="${series.color}"/>`;
        }).join('');
        const total = cell.added + cell.changed + cell.removed;
        const label = total === 0
          ? ''
          : `<text x="${x0 + layout.columnWidth / 2}" y="${baseline - Math.max(scale(cell.added), scale(cell.changed), scale(cell.removed)) - 6}" text-anchor="middle" class="history-value">${formatNumber(total)}</text>`;
        return `
          <g class="history-cell" tabindex="0" data-lane="${escapeHTML(lane.label)}" data-release="${escapeHTML(column.entry.manifest.release)}" data-earlier="${escapeHTML(column.earlierEntry.manifest.release)}" data-added="${cell.added}" data-changed="${cell.changed}" data-removed="${cell.removed}" data-link="${escapeHTML(getReleaseLink(column.entry.name, '/changes'))}">
            <rect x="${x0 + 2}" y="${y0 + 2}" width="${layout.columnWidth - 4}" height="${layout.laneHeight - 4}" rx="6" class="history-hit"/>
            <line x1="${x0 + 12}" x2="${x0 + layout.columnWidth - 12}" y1="${baseline}" y2="${baseline}" class="history-baseline"/>
            ${bars}${label}
          </g>`;
      }).join('');
      return `
        <g>
          <line x1="0" x2="${width - 8}" y1="${y0}" y2="${y0}" class="history-rule"/>
          <text x="0" y="${y0 + layout.laneHeight / 2 + 4}" class="history-lane">${escapeHTML(lane.label)}</text>
          ${cells}
        </g>`;
    }).join('');
    return `
      <div class="history-chart" style="position: relative">
        <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Constructs new, changed and removed in each release, by family of document types">
          ${header}${lanes}
        </svg>
        <div class="history-tooltip" role="status" hidden></div>
      </div>`;
  }

  #renderTable (
    columns
  ) {
    const rows = columns.flatMap((column) => HistoryPage.LANES.map((lane) => {
      const cell = column.cells.get(lane.id);
      if (cell.added + cell.changed + cell.removed === 0) {
        return '';
      }
      return `<tr><th scope="row">${escapeHTML(column.entry.manifest.release)}</th><td>${escapeHTML(column.earlierEntry.manifest.release)}</td><td>${escapeHTML(lane.label)}</td><td class="num">${formatNumber(cell.added)}</td><td class="num">${formatNumber(cell.changed)}</td><td class="num">${formatNumber(cell.removed)}</td></tr>`;
    })).join('');
    return `
      <details>
        <summary>Show the numbers as a table</summary>
        <div class="table-box" style="margin-top: 12px">
          <table>
            <thead><tr><th scope="col">Release</th><th scope="col">Compared with</th><th scope="col">Lane</th><th scope="col" class="num">New</th><th scope="col" class="num">Changed</th><th scope="col" class="num">Removed</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </details>`;
  }

  #wireTooltip (
    container
  ) {
    const chart = container.querySelector('.history-chart');
    const tooltip = chart.querySelector('.history-tooltip');
    const show = (cell) => {
      const { lane, release, earlier, added, changed, removed } = cell.dataset;
      tooltip.innerHTML = `
        <p><strong>${escapeHTML(release)}</strong> vs ${escapeHTML(earlier)}</p>
        <p class="muted">${escapeHTML(lane)}</p>
        ${HistoryPage.SERIES.map((series) => `<p><span class="history-key" style="background: ${series.color}"></span>${series.label}: <strong>${formatNumber(Number(cell.dataset[series.id]))}</strong></p>`).join('')}
        <p class="muted">${Number(added) + Number(changed) + Number(removed) > 0 ? 'Click to see every change' : 'No change in this lane'}</p>`;
      const box = cell.getBoundingClientRect();
      const frame = chart.getBoundingClientRect();
      tooltip.hidden = false;
      const left = Math.min(box.right - frame.left + 8, frame.width - tooltip.offsetWidth - 8);
      tooltip.style.left = `${Math.max(8, left)}px`;
      tooltip.style.top = `${box.top - frame.top}px`;
    };
    for (const cell of chart.querySelectorAll('.history-cell')) {
      cell.addEventListener('mouseenter', () => show(cell));
      cell.addEventListener('focus', () => show(cell));
      cell.addEventListener('mouseleave', () => { tooltip.hidden = true; });
      cell.addEventListener('blur', () => { tooltip.hidden = true; });
      cell.addEventListener('click', () => { window.location.hash = cell.dataset.link.slice(1); });
      cell.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          window.location.hash = cell.dataset.link.slice(1);
        }
      });
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
      .sort((first, second) => String(first.manifest.released ?? '').localeCompare(String(second.manifest.released ?? '')) ||
        String(first.manifest.release).localeCompare(String(second.manifest.release), 'en', { numeric: true }));
    const comparable = packages
      .map((entry) => ({ entry, earlierEntry: packages.find((other) => other.manifest.project === entry.manifest.project && other.manifest.release === entry.manifest.buildsOn) ?? null }))
      .filter((pair) => pair.earlierEntry !== null);
    const missing = packages.filter((entry) => entry.manifest.buildsOn && !packages.some((other) => other.manifest.release === entry.manifest.buildsOn));
    const columns = [];
    for (const pair of comparable) {
      columns.push(await this.#compareRelease(pair.entry, pair.earlierEntry));
    }
    const legend = HistoryPage.SERIES.map((series) => `<span class="history-legend-item"><span class="history-key" style="background: ${series.color}"></span>${series.label}</span>`).join('');
    container.innerHTML = `
      <section class="stack">
        <p class="eyebrow">Admins only</p>
        <h1>Release History</h1>
        <p style="max-width: 860px">Each column is a release, oldest first, with the month it was published, compared with the release it builds on; each lane is a family of document types. Bars count the elements and types new, changed or removed; the number above them is the total. Hover a cell for the counts, click it to see every change.</p>
      </section>
      ${columns.length === 0
        ? '<p class="muted">No two imported releases can be compared yet: a release and the release it builds on must both be imported.</p>'
        : `<div class="history-legend" aria-hidden="true">${legend}</div>
          <div class="table-box">${this.#renderChart(columns)}</div>
          <p class="small muted" style="max-width: 860px">A construct counts in every lane whose document types can contain it, so a column's lanes can add up to more than its total. "Shared" means every family present in that release can contain it. Hidden releases are included. Release totals: ${columns.map((column) => `${escapeHTML(column.entry.manifest.release)} ${formatNumber(column.totals.added)} new, ${formatNumber(column.totals.changed)} changed, ${formatNumber(column.totals.removed)} removed`).join('; ')}.</p>
          ${this.#renderTable(columns)}`}
      ${missing.length ? `<p class="small muted">Not shown, because the release each builds on is not imported: ${missing.map((entry) => escapeHTML(entry.manifest.release)).join(', ')}.</p>` : ''}`;
    if (columns.length > 0) {
      this.#wireTooltip(container);
    }
  }
}

/**
 * @file ChangesPage.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import { isDocumentationOnly, renderDiff } from '../diff.js';
import { encodeSegment, escapeHTML, formatNumber } from '../html.js';
import { getConstructLink, getReleaseLink, loadDecisions, loadSchemaIndex } from './shared.js';

// ----------------------------------------------------------------------------
// ChangesPage
// ----------------------------------------------------------------------------

// NOTE: everything that differs between a release and an earlier one (by
// default the release it builds on): constructs new, removed and changed,
// each change shown as a line diff of its XSD source; rule files,
// stylesheets, review notes and samples added, removed or changed; the
// decision register; and the validation results side by side.
export class ChangesPage {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Static variables
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  static KIND_LABELS = {
    element: 'Elements',
    complexType: 'Complex types',
    simpleType: 'Simple types',
    group: 'Groups',
    attributeGroup: 'Attribute groups'
  };

  static FILE_GROUPS = [
    ['rules/', 'Schematron rule files'],
    ['stylesheets/', 'Stylesheets'],
    ['review-guide/', 'Review notes and change logs'],
    ['converters/', 'Converters'],
    ['samples/', 'Samples']
  ];

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Constructor
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  constructor (
    store,
    packageEntry,
    againstName = null
  ) {
    this.store = store;
    this.packageEntry = packageEntry;
    this.manifest = packageEntry.manifest;
    this.againstName = againstName;
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance internal methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  async #findEarlierPackage (
    packages
  ) {
    if (this.againstName) {
      return packages.find((entry) => entry.name === this.againstName) ?? null;
    }
    if (!this.manifest.buildsOn) {
      return null;
    }
    return this.store.findPackageByRelease(this.manifest.project, this.manifest.buildsOn);
  }

  #renderPicker (
    packages,
    earlier
  ) {
    const options = packages
      .filter((entry) => entry.name !== this.packageEntry.name)
      .map((entry) => `<option value="${escapeHTML(entry.name)}"${entry.name === earlier?.name ? ' selected' : ''}>${escapeHTML(entry.manifest.release)}${entry.manifest.release === this.manifest.buildsOn ? ' (builds on)' : ''}</option>`)
      .join('');
    return `
      <label style="max-width: 320px">Compare with
        <select id="against">${earlier ? '' : '<option value="" selected>Choose a release</option>'}${options}</select>
      </label>`;
  }

  #renderSummary (
    comparison,
    earlier
  ) {
    const rows = Object.entries(comparison).map(([kind, change]) => `
      <tr>
        <th scope="row">${escapeHTML(ChangesPage.KIND_LABELS[kind] ?? kind)}</th>
        <td class="num">${formatNumber(change.added.length)}</td>
        <td class="num">${formatNumber(change.changed.length)}</td>
        <td class="num">${formatNumber(change.removed.length)}</td>
      </tr>`).join('');
    const results = (manifest) => {
      const byRole = manifest.validation?.byRole ?? {};
      const cell = (role) => byRole[role] ? `${formatNumber(byRole[role].schemaValid)} of ${formatNumber(byRole[role].samples)}` : '—';
      const errors = Object.values(byRole).reduce((total, role) => total + (role.ruleErrors ?? 0), 0);
      return `<td class="num">${cell('proposal')}</td><td class="num">${cell('regression')}</td><td class="num">${formatNumber(errors)}</td>`;
    };
    return `
      <div class="row" style="gap: 24px">
        <div class="table-box" style="flex: 1 1 360px">
          <table>
            <thead><tr><th scope="col">Construct kind</th><th scope="col" class="num">New</th><th scope="col" class="num">Changed</th><th scope="col" class="num">Removed</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="table-box" style="flex: 1 1 360px">
          <table>
            <thead><tr><th scope="col">Validation</th><th scope="col" class="num">Proposal valid</th><th scope="col" class="num">Regression valid</th><th scope="col" class="num">Rule errors</th></tr></thead>
            <tbody>
              <tr><th scope="row">${escapeHTML(earlier.manifest.release)}</th>${results(earlier.manifest)}</tr>
              <tr><th scope="row">${escapeHTML(this.manifest.release)}</th>${results(this.manifest)}</tr>
            </tbody>
          </table>
        </div>
      </div>
      <p class="small muted">Each release validates its own samples, so the sample sets can differ. "Changed" counts any difference in a definition; open one to see whether only its documentation changed.</p>`;
  }

  #renderConstructs (
    comparison,
    earlier
  ) {
    return Object.entries(comparison)
      .filter(([, change]) => change.added.length + change.changed.length + change.removed.length > 0)
      .map(([kind, change]) => {
        const added = change.added
          .map((name) => `<a class="mono" href="${getConstructLink(this.packageEntry.name, kind, name)}">${escapeHTML(name)}</a>`)
          .join(', ');
        const removed = change.removed
          .map((name) => `<a class="mono" href="${getConstructLink(earlier.name, kind, name)}">${escapeHTML(name)}</a>`)
          .join(', ');
        const changed = change.changed.map((name) => `
          <details class="change" data-kind="${escapeHTML(kind)}" data-name="${escapeHTML(name)}">
            <summary><span class="mono">${escapeHTML(name)}</span> <span class="change-label small muted"></span></summary>
            <div class="change-body stack" style="margin-top: 12px"><p class="small muted" role="status">Comparing…</p></div>
          </details>`).join('');
        return `
          <section class="stack">
            <h2>${escapeHTML(ChangesPage.KIND_LABELS[kind] ?? kind)}</h2>
            ${added ? `<p class="eyebrow">New (${formatNumber(change.added.length)})</p><p style="font-size: 14px; line-height: 24px">${added}</p>` : ''}
            ${removed ? `<p class="eyebrow">Removed (${formatNumber(change.removed.length)})</p><p style="font-size: 14px; line-height: 24px">${removed}</p>` : ''}
            ${changed ? `<p class="eyebrow">Changed (${formatNumber(change.changed.length)})</p><div class="stack stack--tight">${changed}</div>` : ''}
          </section>`;
      }).join('') || '<p class="muted">No construct differs.</p>';
  }

  // NOTE: compares the package files by path and SHA-256, so a file counts
  // as changed only when its bytes differ.
  #renderFiles (
    earlier
  ) {
    const before = new Map(earlier.manifest.files.map((file) => [file.path, file.sha256]));
    const after = new Map(this.manifest.files.map((file) => [file.path, file.sha256]));
    const sections = ChangesPage.FILE_GROUPS.map(([prefix, label]) => {
      const paths = new Set([...before.keys(), ...after.keys()].filter((filePath) => filePath.startsWith(prefix)));
      const added = [...paths].filter((filePath) => !before.has(filePath)).sort();
      const removed = [...paths].filter((filePath) => !after.has(filePath)).sort();
      const changed = [...paths].filter((filePath) => before.has(filePath) && after.has(filePath) && before.get(filePath) !== after.get(filePath)).sort();
      if (added.length + removed.length + changed.length === 0) {
        return '';
      }
      const list = (title, items) => items.length === 0
        ? ''
        : `<details><summary>${title} (${formatNumber(items.length)})</summary><ul class="small mono" style="margin: 8px 0 0; padding-left: 20px">${items.map((item) => `<li>${escapeHTML(item.slice(prefix.length))}</li>`).join('')}</ul></details>`;
      return `
        <div class="stack stack--tight">
          <h3>${escapeHTML(label)}</h3>
          ${list('Added', added)}${list('Removed', removed)}${list('Changed', changed)}
        </div>`;
    }).join('');
    return sections || '<p class="muted">No package file differs.</p>';
  }

  async #renderDecisions (
    earlier
  ) {
    const [before, after] = await Promise.all([loadDecisions(this.store, earlier), loadDecisions(this.store, this.packageEntry)]);
    const beforeIDs = new Map((before?.decisions ?? []).map((decision) => [decision.id, decision]));
    const afterIDs = new Map((after?.decisions ?? []).map((decision) => [decision.id, decision]));
    const added = [...afterIDs.values()].filter((decision) => !beforeIDs.has(decision.id));
    const removed = [...beforeIDs.values()].filter((decision) => !afterIDs.has(decision.id));
    const changed = [...afterIDs.values()].filter((decision) => beforeIDs.has(decision.id) && beforeIDs.get(decision.id).text !== decision.text);
    if (added.length + removed.length + changed.length === 0) {
      return '<p class="muted">The decision registers are the same.</p>';
    }
    const item = (decision, packageName) => `<li><a href="${getReleaseLink(packageName, `/decisions/${encodeSegment(decision.id)}`)}">${escapeHTML(decision.id)}</a> ${escapeHTML(decision.title)}</li>`;
    return `
      ${added.length ? `<p class="eyebrow">New (${added.length})</p><ul style="margin: 0; padding-left: 20px; font-size: 14px">${added.map((decision) => item(decision, this.packageEntry.name)).join('')}</ul>` : ''}
      ${changed.length ? `<p class="eyebrow">Text changed (${changed.length})</p><ul style="margin: 0; padding-left: 20px; font-size: 14px">${changed.map((decision) => item(decision, this.packageEntry.name)).join('')}</ul>` : ''}
      ${removed.length ? `<p class="eyebrow">Not in this release (${removed.length})</p><ul style="margin: 0; padding-left: 20px; font-size: 14px">${removed.map((decision) => item(decision, earlier.name)).join('')}</ul>` : ''}`;
  }

  #wireChanges (
    container,
    currentIndex,
    earlierIndex
  ) {
    const fill = (details) => {
      if (details.dataset.filled) {
        return;
      }
      details.dataset.filled = 'true';
      const { kind, name } = details.dataset;
      const current = currentIndex.getConstruct(kind, name);
      const earlier = earlierIndex.getConstruct(kind, name);
      details.querySelector('.change-body').innerHTML = `
        <p class="small muted">Left numbers: ${escapeHTML(earlier.file.replace('schema/', ''))} in ${escapeHTML(earlierIndex.release)} · right numbers: ${escapeHTML(current.file.replace('schema/', ''))} in ${escapeHTML(currentIndex.release)} · <a href="${getConstructLink(this.packageEntry.name, kind, name)}">open the construct</a></p>
        ${renderDiff(earlier, current)}`;
    };
    for (const details of container.querySelectorAll('details.change')) {
      const current = currentIndex.getConstruct(details.dataset.kind, details.dataset.name);
      const earlier = earlierIndex.getConstruct(details.dataset.kind, details.dataset.name);
      details.querySelector('.change-label').textContent = isDocumentationOnly(earlier, current) ? 'documentation only' : 'definition changed';
      details.addEventListener('toggle', () => details.open && fill(details));
    }
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance properties & methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  async render (
    container
  ) {
    container.innerHTML = '<p class="muted" role="status">Comparing releases…</p>';
    const packages = await this.store.listPackages();
    const earlier = await this.#findEarlierPackage(packages);
    const heading = `
      <nav aria-label="Breadcrumb" class="small muted"><a href="${getReleaseLink(this.packageEntry.name)}">${escapeHTML(String(this.manifest.project).toUpperCase())} ${escapeHTML(this.manifest.release)}</a> / What changed</nav>
      <section class="stack">
        <h1>What Changed in ${escapeHTML(this.manifest.release)}</h1>
        ${this.#renderPicker(packages, earlier)}
      </section>`;
    const wirePicker = () => container.querySelector('#against')?.addEventListener('change', (event) => {
      window.location.hash = getReleaseLink(this.packageEntry.name, `/changes/${encodeSegment(event.target.value)}`).slice(1);
    });
    if (earlier === null) {
      container.innerHTML = `${heading}<p class="muted">${this.manifest.buildsOn && !this.againstName ? `Release ${escapeHTML(this.manifest.buildsOn)}, which this release builds on, has not been imported. Pick another release to compare with.` : 'Pick a release to compare with.'}</p>`;
      wirePicker();
      return;
    }
    const [currentIndex, earlierIndex] = await Promise.all([
      loadSchemaIndex(this.store, this.packageEntry),
      loadSchemaIndex(this.store, earlier)
    ]);
    currentIndex.release = this.manifest.release;
    earlierIndex.release = earlier.manifest.release;
    const comparison = currentIndex.compareWith(earlierIndex);
    container.innerHTML = `
      ${heading}
      <section class="stack" aria-labelledby="summary-heading">
        <h2 id="summary-heading">At a Glance</h2>
        ${this.#renderSummary(comparison, earlier)}
      </section>
      ${this.#renderConstructs(comparison, earlier)}
      <section class="stack" aria-labelledby="files-heading">
        <h2 id="files-heading">Package Files</h2>
        ${this.#renderFiles(earlier)}
      </section>
      <section class="stack" aria-labelledby="register-heading">
        <h2 id="register-heading">Decision Register</h2>
        ${await this.#renderDecisions(earlier)}
      </section>`;
    wirePicker();
    this.#wireChanges(container, currentIndex, earlierIndex);
  }
}

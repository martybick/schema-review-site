/**
 * @file ReleaseHomePage.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import { escapeHTML, formatDate, formatNumber } from '../html.js';
import { CommentThread } from '../CommentThread.js';
import { DataStore } from '../DataStore.js';
import { countPositions, renderStatusPill, renderTally } from './DecisionPage.js';
import { getConstructLink, getDecisionLink, getReleaseLink, groupSamples, loadDecisions, loadSchemaIndex, summarizeChoice } from './shared.js';

// ----------------------------------------------------------------------------
// ReleaseHomePage
// ----------------------------------------------------------------------------

// NOTE: the landing page of one release: what it is, how its samples fare,
// whether it breaks the release it builds on, what changed, which decisions
// await ratification, and the package's files.
export class ReleaseHomePage {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Static variables
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  static STATUS_LABELS = {
    'release-candidate': 'Release candidate',
    reference: 'Reference release',
    draft: 'Draft',
    frozen: 'Frozen',
    superseded: 'Superseded'
  };

  static KIND_LABELS = {
    element: 'Elements',
    complexType: 'Complex types',
    simpleType: 'Simple types',
    group: 'Groups',
    attributeGroup: 'Attribute groups'
  };

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Constructor
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  constructor (
    store,
    dataStore,
    packageEntry,
    siteControls = null,
    authController = null
  ) {
    this.authController = authController;
    this.store = store;
    this.dataStore = dataStore;
    this.siteControls = siteControls;
    this.packageEntry = packageEntry;
    this.manifest = packageEntry.manifest;
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance internal methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  #renderFigures () {
    const byRole = this.manifest.validation?.byRole ?? {};
    const figures = Object.entries(byRole).map(([role, summary], i) => `
      <div class="figure${i === 0 ? ' figure--navy' : ''}">
        <p class="eyebrow">${escapeHTML(role)} samples valid</p>
        <p class="figure__value">${formatNumber(summary.schemaValid)}<span class="figure__unit"> of ${formatNumber(summary.samples)}</span></p>
      </div>`);
    const ruleErrors = Object.values(byRole).reduce((total, summary) => total + summary.ruleErrors, 0);
    const samplesWithErrors = Object.values(byRole).reduce((total, summary) => total + summary.samplesWithRuleErrors, 0);
    if (Object.keys(byRole).length > 0) {
      figures.push(`
        <div class="figure">
          <p class="eyebrow">Schematron errors</p>
          <p class="figure__value">${formatNumber(ruleErrors)}<span class="figure__unit"> in ${formatNumber(samplesWithErrors)} samples</span></p>
        </div>`);
    }
    figures.push(`
      <div class="figure">
        <p class="eyebrow">Schemas</p>
        <p class="figure__value">${formatNumber(this.manifest.contents?.schemas)}<span class="figure__unit"> files</span></p>
      </div>`);
    return `<section class="figures" aria-label="Key figures">${figures.join('')}</section>`;
  }

  #renderCompatibility () {
    const compatibility = this.manifest.validation?.compatibility;
    if (!compatibility || compatibility.broken.length === 0) {
      return compatibility
        ? `<section class="panel"><p><strong>Backward compatible with ${escapeHTML(compatibility.against)}:</strong> all ${formatNumber(compatibility.validBefore)} samples valid under ${escapeHTML(compatibility.against)} are still valid.</p></section>`
        : '';
    }
    return `
      <section class="callout" aria-label="Compatibility">
        <div class="callout__text">
          <p class="eyebrow">Not backward compatible with ${escapeHTML(compatibility.against)}</p>
          <p><strong>${formatNumber(compatibility.broken.length)} of ${formatNumber(compatibility.validBefore)} samples valid under ${escapeHTML(compatibility.against)} are now invalid.</strong></p>
        </div>
        <a class="button" href="${getReleaseLink(this.packageEntry.name, '/validation')}#compatibility">See the samples</a>
      </section>`;
  }

  #renderSamples () {
    const groups = groupSamples(this.manifest.contents?.samples ?? []);
    if (groups.length === 0) {
      return '';
    }
    const items = groups.map((group) => `<li><span>${escapeHTML(group.label)} <span class="muted small">${escapeHTML(group.role)}</span></span><span>${formatNumber(group.samples.length)}</span></li>`).join('');
    return `
      <section class="stack" aria-labelledby="samples-heading">
        <h3 id="samples-heading">Samples by Document Type</h3>
        <ul class="list-plain">${items}</ul>
      </section>`;
  }

  // NOTE: every imported release, so people can move between the release
  // under review and the ones before or after it.
  async #fillReleases (
    container
  ) {
    const target = container.querySelector('#other-releases');
    const packages = await this.store.listPackages();
    if (!target || packages.length < 2) {
      target?.remove();
      return;
    }
    const items = packages.map((entry) => {
      const label = `${String(entry.manifest.project).toUpperCase()} ${entry.manifest.release}`;
      const notes = [
        this.store.isDefault(entry.name) ? 'opens first' : '',
        this.store.isHidden(entry.name) ? 'hidden from members' : ''
      ].filter(Boolean).join(', ');
      const status = `${ReleaseHomePage.STATUS_LABELS[entry.manifest.status] ?? entry.manifest.status}${notes ? ` (${notes})` : ''}`;
      return `<li><span>${entry.name === this.packageEntry.name ? `<strong>${escapeHTML(label)}</strong> (this page)` : `<a href="${getReleaseLink(entry.name)}">${escapeHTML(label)}</a>`}</span><span class="muted">${escapeHTML(status)}</span></li>`;
    }).join('');
    target.innerHTML = `<h3 id="releases-heading">Releases on This Site</h3><ul class="list-plain">${items}</ul>`;
  }

  // NOTE: admins only: which release the site opens on, and whether
  // members see this one.
  #renderReleaseSettings () {
    const controls = this.siteControls;
    if (!controls?.isAdmin) {
      return '';
    }
    const name = this.packageEntry.name;
    const isDefault = controls.isDefault(name);
    const isHidden = controls.isHidden(name);
    return `
      <section class="panel stack" id="release-settings" aria-labelledby="release-settings-heading" style="border: 2px solid var(--amber)">
        <h3 id="release-settings-heading">Release Settings (Admins)</h3>
        <p class="small">${isDefault ? 'The site opens on this release.' : 'The site does not open on this release.'} ${isHidden ? '<strong>Hidden from members:</strong> only admins see it.' : 'Members can see it.'}</p>
        <div class="stack stack--tight">
          ${isDefault ? '' : '<button class="button button--secondary" type="button" id="make-default">Open the site on this release</button>'}
          <button class="button button--secondary" type="button" id="toggle-hidden">${isHidden ? 'Show to members' : 'Hide from members'}</button>
        </div>
        <div class="settings-status"></div>
      </section>`;
  }

  #wireReleaseSettings (
    container
  ) {
    const panel = container.querySelector('#release-settings');
    if (!panel) {
      return;
    }
    const run = async (work) => {
      for (const button of panel.querySelectorAll('button')) {
        button.disabled = true;
      }
      try {
        await work();
      } catch (error) {
        panel.querySelector('.settings-status').innerHTML = `<div class="message message--error" role="alert">Could not save: ${escapeHTML(error.message)}</div>`;
        for (const button of panel.querySelectorAll('button')) {
          button.disabled = false;
        }
      }
    };
    panel.querySelector('#make-default')?.addEventListener('click', () => run(() => this.siteControls.setDefault(this.packageEntry.name)));
    panel.querySelector('#toggle-hidden').addEventListener('click', () => run(() => this.siteControls.setHidden(this.packageEntry.name, !this.siteControls.isHidden(this.packageEntry.name))));
  }

  #renderPackageFiles () {
    const contents = this.manifest.contents ?? {};
    const guides = (contents.reviewGuide ?? []).map((entry) => `<li><a data-file="${escapeHTML(entry.path)}">${escapeHTML(entry.path.replace('review-guide/', ''))}</a></li>`).join('');
    return `
      <section class="panel stack" aria-labelledby="package-heading">
        <h3 id="package-heading">Package</h3>
        <p class="small">${formatNumber(contents.schemas)} schemas · ${formatNumber((contents.rules ?? []).length)} Schematron rule sets · ${formatNumber((contents.stylesheets ?? []).length)} stylesheets · ${formatNumber((contents.samples ?? []).length)} samples · ${formatNumber((contents.converters ?? []).length)} ${(contents.converters ?? []).length === 1 ? 'converter' : 'converters'}</p>
        <ul class="stack stack--tight" style="list-style: none; margin: 0; padding: 0; font-size: 14px">
          <li><a data-file="manifest.json">manifest.json</a></li>
          <li><a data-file="validation/report.md">Validation report</a></li>
          ${guides}
        </ul>
      </section>`;
  }

  async #fillDecisions (
    container
  ) {
    const target = container.querySelector('#decisions');
    if (!target) {
      return;
    }
    const register = await loadDecisions(this.store, this.packageEntry);
    if (register === null) {
      target.innerHTML = '<h2 id="decisions-heading">Decisions</h2><p class="muted">This release has no decision register.</p>';
      return;
    }
    const project = this.manifest.project;
    const [records, positions] = await Promise.all([
      this.dataStore.listDecisionRecords(project),
      this.dataStore.listPositions(project)
    ]);
    const rows = register.decisions.map((decision) => {
      const key = DataStore.getDecisionKey(project, decision.id);
      return `
        <li>
          <strong style="color: var(--navy); min-width: 40px">${escapeHTML(decision.id)}</strong>
          <span style="flex: 1 1 320px; font-size: 14px"><a style="font-weight: 600" href="${getDecisionLink(this.packageEntry.name, decision.id)}">${escapeHTML(decision.title)}</a><br><span class="small muted">Proposed: ${escapeHTML(summarizeChoice(decision.modelingChoice))}</span></span>
          ${renderStatusPill(records.get(key))}
          ${renderTally(countPositions(positions.filter((entry) => entry.decisionKey === key)))}
        </li>`;
    }).join('');
    const openIssues = register.openIssues.map((issue) => `<li>${escapeHTML(issue.title)}</li>`).join('');
    target.innerHTML = `
      <h2 id="decisions-heading">Decisions</h2>
      <p class="small muted">Open a decision to state your position and comment. <a href="${getDecisionLink(this.packageEntry.name)}">See all decisions as a table</a>.</p>
      ${register.decisions.length === 0 ? '<p class="muted">None.</p>' : `<ul class="list-rows">${rows}</ul>`}
      ${openIssues ? `<h3>Still Open</h3><ul class="stack stack--tight" style="margin: 0; padding-left: 20px; font-size: 14px">${openIssues}</ul>` : ''}`;
  }

  async #fillChanges (
    container
  ) {
    const target = container.querySelector('#changes');
    const buildsOn = this.manifest.buildsOn;
    if (!target || !buildsOn) {
      target?.remove();
      return;
    }
    const earlierPackage = await this.store.findPackageByRelease(this.manifest.project, buildsOn);
    if (earlierPackage === null) {
      target.innerHTML = `<h2>Changes Since ${escapeHTML(buildsOn)}</h2><p class="muted">Release ${escapeHTML(buildsOn)} has not been imported, so changes cannot be listed.</p>`;
      return;
    }
    const [currentIndex, earlierIndex] = await Promise.all([
      loadSchemaIndex(this.store, this.packageEntry),
      loadSchemaIndex(this.store, earlierPackage)
    ]);
    const comparison = currentIndex.compareWith(earlierIndex);
    const rows = Object.entries(comparison)
      .filter(([, change]) => change.added.length + change.changed.length + change.removed.length > 0)
      .map(([kind, change]) => `
        <tr>
          <th scope="row">${escapeHTML(ReleaseHomePage.KIND_LABELS[kind] ?? kind)}</th>
          <td class="num">${formatNumber(change.added.length)}</td>
          <td class="num">${formatNumber(change.changed.length)}</td>
          <td class="num">${formatNumber(change.removed.length)}</td>
        </tr>`).join('');
    const addedElements = comparison.element.added.slice(0, 24)
      .map((name) => `<a class="mono" href="${getConstructLink(this.packageEntry.name, 'element', name)}">${escapeHTML(name)}</a>`).join(', ');
    target.innerHTML = `
      <h2 id="changes-heading">Changes Since ${escapeHTML(buildsOn)}</h2>
      <div class="table-box">
        <table>
          <thead><tr><th scope="col">Construct kind</th><th scope="col" class="num">New</th><th scope="col" class="num">Changed</th><th scope="col" class="num">Removed</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4">No differences.</td></tr>'}</tbody>
        </table>
      </div>
      ${addedElements ? `<p class="eyebrow">New elements</p><p style="font-size: 14px; line-height: 24px">${addedElements}${comparison.element.added.length > 24 ? ` and ${formatNumber(comparison.element.added.length - 24)} more` : ''}</p>` : ''}
      <p class="small muted">"Changed" counts any difference in a definition, documentation included. <a href="${getReleaseLink(this.packageEntry.name, '/changes')}">See every change, line by line</a>, or compare with another release.</p>`;
  }

  // NOTE: package files open from Storage download links, fetched once the
  // page is drawn; until then the links are inert.
  async #resolveFileLinks (
    container
  ) {
    for (const link of container.querySelectorAll('a[data-file]')) {
      try {
        link.href = await this.store.getFileURL(this.packageEntry.name, link.dataset.file);
        link.target = '_blank';
        link.rel = 'noopener';
      } catch (error) {
        link.replaceWith(document.createTextNode(`${link.textContent} (not available)`));
      }
    }
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance properties & methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  async render (
    container
  ) {
    const manifest = this.manifest;
    const source = manifest.source ?? {};
    container.innerHTML = `
      <section class="title-row">
        <div class="stack stack--tight">
          <p class="eyebrow">${escapeHTML(ReleaseHomePage.STATUS_LABELS[manifest.status] ?? manifest.status)}${this.siteControls?.isAdmin && this.store.isHidden(this.packageEntry.name) ? ' · <span style="color: var(--navy); background: var(--amber); padding: 0 6px; border-radius: 4px">Hidden from members</span>' : ''}</p>
          <h1>${escapeHTML(String(manifest.project ?? '').toUpperCase())} ${escapeHTML(manifest.release)}</h1>
          <p style="max-width: 760px">${escapeHTML(endSentence(manifest.description))}${manifest.buildsOn ? ` Builds on ${escapeHTML(manifest.buildsOn)}.` : ''}</p>
          <p class="small muted">Imported from ${escapeHTML(source.repository)} at commit ${escapeHTML(String(source.commit ?? '').slice(0, 7))} · package built ${escapeHTML(formatDate(manifest.created))}</p>
        </div>
        <div class="row" style="gap: 12px">
          ${this.manifest.buildsOn ? `<a class="button button--secondary" href="${getReleaseLink(this.packageEntry.name, '/changes')}">What changed</a>` : ''}
          <a class="button button--secondary" href="${getReleaseLink(this.packageEntry.name, '/constructs')}">Browse constructs</a>
          <a class="button" href="${getReleaseLink(this.packageEntry.name, '/validation')}">Validation results</a>
        </div>
      </section>
      ${this.#renderFigures()}
      ${this.#renderCompatibility()}
      <div class="row">
        <div class="row__main">
          <section class="stack" id="changes" aria-labelledby="changes-heading"><p class="muted" role="status">Comparing with ${escapeHTML(manifest.buildsOn ?? '')}…</p></section>
          <section class="stack" id="decisions" aria-labelledby="decisions-heading"><p class="muted" role="status">Loading decisions…</p></section>
          <section class="stack" id="release-comments" aria-labelledby="comments-heading"></section>
        </div>
        <aside class="row__side">
          ${this.#renderReleaseSettings()}
          <section class="stack" id="other-releases" aria-labelledby="releases-heading"></section>
          ${this.#renderSamples()}
          ${this.#renderPackageFiles()}
        </aside>
      </div>`;
    this.#wireReleaseSettings(container);
    const commentThread = this.authController
      ? new CommentThread(this.dataStore, this.authController, {
        project: this.manifest.project,
        release: this.manifest.release,
        kind: 'release',
        key: this.manifest.release,
        intro: 'For anything about this release as a whole. To ask the group to settle a modeling choice, choose the type "Decision needed".'
      })
      : null;
    await Promise.all([
      commentThread?.render(container.querySelector('#release-comments')),
      this.#fillReleases(container).catch(() => container.querySelector('#other-releases')?.remove()),
      this.#fillDecisions(container).catch((error) => {
        const target = container.querySelector('#decisions');
        if (target) {
          target.innerHTML = `<p class="message message--error" role="alert">Could not load decisions: ${escapeHTML(error.message)}</p>`;
        }
      }),
      this.#resolveFileLinks(container),
      this.#fillChanges(container).catch((error) => {
        const target = container.querySelector('#changes');
        if (target) {
          target.innerHTML = `<p class="message message--error" role="alert">Could not compare releases: ${escapeHTML(error.message)}</p>`;
        }
      })
    ]);
  }
}

// ----------------------------------------------------------------------------
// Functions
// ----------------------------------------------------------------------------

function endSentence (
  text
) {
  const trimmed = String(text ?? '').trim();
  return trimmed === '' || /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

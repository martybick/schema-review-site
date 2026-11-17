/**
 * @file ConstructPage.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import { escapeHTML, formatNumber } from '../html.js';
import { getConstructLink, getReleaseLink, loadSchemaIndex } from './shared.js';

// ----------------------------------------------------------------------------
// ConstructPage
// ----------------------------------------------------------------------------

// NOTE: one global construct of a release: documentation, content model,
// where it is allowed, its XSD source with real line numbers, the decisions
// that name it, and whether it is new or changed since the release it
// builds on.
export class ConstructPage {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Static variables
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  static MAX_SOURCE_LINES = 120;
  static KIND_LABELS = {
    element: 'Element',
    complexType: 'Complex type',
    simpleType: 'Simple type',
    group: 'Group',
    attributeGroup: 'Attribute group'
  };

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Constructor
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  constructor (
    store,
    packageEntry,
    kind,
    name
  ) {
    this.store = store;
    this.packageEntry = packageEntry;
    this.kind = kind;
    this.name = name;
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance internal methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  #renderContentModel (
    construct,
    schemaIndex
  ) {
    if (construct.contentModel.length === 0) {
      return '<p class="muted">No content model (a simple or empty definition).</p>';
    }
    const lines = construct.contentModel.map(([depth, text, note, target]) => {
      const indent = '  '.repeat(depth);
      const position = target ? text.lastIndexOf(target.name) : -1;
      const label = position !== -1 && schemaIndex.getConstruct(target.kind, target.name)
        ? `${escapeHTML(text.slice(0, position))}<a href="${getConstructLink(this.packageEntry.name, target.kind, target.name)}">${escapeHTML(target.name)}</a>${escapeHTML(text.slice(position + target.name.length))}`
        : escapeHTML(text);
      return `${indent}${label}${note ? `    <span class="muted">${escapeHTML(note)}</span>` : ''}`;
    });
    return `<pre class="model">${lines.join('\n')}</pre>`;
  }

  #renderSource (
    construct
  ) {
    if (construct.sourceLines.length === 0) {
      return '<p class="muted">Source not found.</p>';
    }
    const shown = construct.sourceLines.slice(0, ConstructPage.MAX_SOURCE_LINES);
    const lines = shown.map((line, i) => `<span class="line-number">${construct.startLine + i}</span>${escapeHTML(line)}`).join('\n');
    const lastLine = construct.startLine + construct.sourceLines.length - 1;
    return `
      <p class="small muted">${escapeHTML(construct.file.replace('schema/', ''))} · lines ${construct.startLine}–${lastLine}${construct.sourceLines.length > shown.length ? ` (first ${shown.length} shown)` : ''}</p>
      <div class="code-window"><pre>${lines}</pre></div>`;
  }

  #renderParents (
    construct
  ) {
    if (construct.parents.length === 0) {
      return '<p class="small muted">Not referred to by any other global construct (a root, or unused).</p>';
    }
    return `<p style="font-size: 14px; line-height: 24px">${construct.parents
      .map((parent) => `<a class="mono" href="${getConstructLink(this.packageEntry.name, parent.kind, parent.name)}">${escapeHTML(parent.name)}</a>`)
      .join(' · ')}</p>`;
  }

  async #fillHistory (
    container,
    construct
  ) {
    const target = container.querySelector('#history');
    const buildsOn = this.packageEntry.manifest.buildsOn;
    if (!buildsOn) {
      target.remove();
      return;
    }
    const earlierPackage = await this.store.findPackageByRelease(this.packageEntry.manifest.project, buildsOn);
    if (earlierPackage === null) {
      target.innerHTML = `<h3>History</h3><p class="small muted">Release ${escapeHTML(buildsOn)} is not imported.</p>`;
      return;
    }
    const earlierIndex = await loadSchemaIndex(this.store, earlierPackage);
    const earlier = earlierIndex.getConstruct(this.kind, this.name);
    const status = earlier === null
      ? `<span class="pill pill--navy">New in ${escapeHTML(this.packageEntry.manifest.release)}</span> Not in ${escapeHTML(buildsOn)}.`
      : earlier.canonical === construct.canonical
        ? `Unchanged since ${escapeHTML(buildsOn)}.`
        : `<span class="pill">Changed</span> Defined differently in ${escapeHTML(buildsOn)}: <a href="${getConstructLink(earlierPackage.name, this.kind, this.name)}">see the ${escapeHTML(buildsOn)} definition</a>.`;
    target.innerHTML = `<h3>History</h3><p style="font-size: 14px; line-height: 22px">${status}</p>`;
  }

  async #fillDecisions (
    container
  ) {
    const target = container.querySelector('#related-decisions');
    let decisions;
    try {
      decisions = await this.store.readJSON(this.packageEntry.name, 'decisions/decisions.json');
    } catch (error) {
      target.remove();
      return;
    }
    const namePattern = new RegExp(`\\b${this.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    const related = decisions.decisions.filter((decision) => namePattern.test(`${decision.title} ${decision.modelingChoice ?? ''} ${decision.text ?? ''}`));
    if (related.length === 0) {
      target.remove();
      return;
    }
    const items = related.map((decision) => `
      <li class="panel--navy" style="border-radius: var(--radius-md); padding: 16px; list-style: none">
        <p class="eyebrow">${escapeHTML(decision.id)} · ${escapeHTML(decision.status)}</p>
        <p style="font-weight: 600">${escapeHTML(decision.title)}</p>
        ${decision.modelingChoice ? `<p class="small" style="color: var(--blue-200)">Modeling choice: ${escapeHTML(decision.modelingChoice.replace(/^Decided\s+\S+:\s*/, '').split(/\.\s/)[0].replace(/\.$/, ''))}.</p>` : ''}
      </li>`).join('');
    target.innerHTML = `<h3>Decisions That Name It</h3><ul class="stack" style="margin: 0; padding: 0">${items}</ul>`;
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance properties & methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  async render (
    container
  ) {
    container.innerHTML = '<p class="muted" role="status">Reading the schema…</p>';
    const schemaIndex = await loadSchemaIndex(this.store, this.packageEntry);
    const construct = schemaIndex.getConstruct(this.kind, this.name);
    const manifest = this.packageEntry.manifest;
    if (construct === null) {
      container.innerHTML = `
        <section class="stack">
          <h1>Not Found</h1>
          <p>${escapeHTML(manifest.release)} has no ${escapeHTML(ConstructPage.KIND_LABELS[this.kind] ?? this.kind)} named <code>${escapeHTML(this.name)}</code>.</p>
          <p><a href="${getReleaseLink(this.packageEntry.name, '/constructs')}">Browse constructs</a></p>
        </section>`;
      return;
    }
    const displayName = this.kind === 'element' ? `<${construct.name}>` : construct.name;
    container.innerHTML = `
      <nav aria-label="Breadcrumb" class="small muted"><a href="${getReleaseLink(this.packageEntry.name)}">${escapeHTML(String(manifest.project).toUpperCase())} ${escapeHTML(manifest.release)}</a> / <a href="${getReleaseLink(this.packageEntry.name, '/constructs')}">Constructs</a> / ${escapeHTML(construct.name)}</nav>
      <section class="stack">
        <div class="row" style="gap: 12px; align-items: center">
          <h1 class="mono">${escapeHTML(displayName)}</h1>
          <span class="pill">${escapeHTML(ConstructPage.KIND_LABELS[this.kind] ?? this.kind)}</span>
        </div>
        ${construct.documentation ? `<p style="max-width: 880px">${escapeHTML(construct.documentation)}</p>` : '<p class="muted">No documentation in the schema.</p>'}
      </section>
      <div class="row">
        <div class="row__main">
          <section class="stack" aria-labelledby="model-heading">
            <h2 id="model-heading">Content Model</h2>
            ${this.#renderContentModel(construct, schemaIndex)}
            <p class="eyebrow">Referred to by</p>
            ${this.#renderParents(construct)}
          </section>
          <section class="stack" aria-labelledby="source-heading">
            <h2 id="source-heading">XSD Source</h2>
            ${this.#renderSource(construct)}
          </section>
        </div>
        <aside class="row__side">
          <section class="stack" id="related-decisions"><p class="muted small" role="status">Looking for related decisions…</p></section>
          <section class="stack" id="history"><p class="muted small" role="status">Checking history…</p></section>
          <section class="stack">
            <h3>Comments</h3>
            <p class="small muted">Comments on constructs arrive with issues and decisions in a later slice.</p>
          </section>
        </aside>
      </div>`;
    await Promise.all([
      this.#fillDecisions(container),
      this.#fillHistory(container, construct).catch((error) => {
        container.querySelector('#history').innerHTML = `<p class="small muted">Could not check history: ${escapeHTML(error.message)}</p>`;
      })
    ]);
  }
}

// ----------------------------------------------------------------------------
// ConstructListPage
// ----------------------------------------------------------------------------

export class ConstructListPage {
  constructor (
    store,
    packageEntry
  ) {
    this.store = store;
    this.packageEntry = packageEntry;
  }

  #renderList (
    listElement,
    constructs,
    filterText
  ) {
    const needle = filterText.trim().toLowerCase();
    const matches = needle === '' ? constructs : constructs.filter((construct) => construct.name.toLowerCase().includes(needle));
    listElement.innerHTML = matches.slice(0, 400).map((construct) => `
      <li>
        <a class="mono" href="${getConstructLink(this.packageEntry.name, construct.kind, construct.name)}">${escapeHTML(construct.name)}</a>
        <span class="small muted">${escapeHTML(ConstructPage.KIND_LABELS[construct.kind] ?? construct.kind)}</span>
      </li>`).join('') || '<li>No constructs match.</li>';
    listElement.previousElementSibling.textContent = `${formatNumber(matches.length)} of ${formatNumber(constructs.length)} constructs${matches.length > 400 ? ' (first 400 shown)' : ''}`;
  }

  async render (
    container
  ) {
    container.innerHTML = '<p class="muted" role="status">Reading the schema…</p>';
    const schemaIndex = await loadSchemaIndex(this.store, this.packageEntry);
    const manifest = this.packageEntry.manifest;
    const constructs = schemaIndex.listConstructs();
    container.innerHTML = `
      <section class="stack stack--tight">
        <p class="eyebrow">${escapeHTML(String(manifest.project).toUpperCase())} ${escapeHTML(manifest.release)}</p>
        <h1>Constructs</h1>
      </section>
      <form class="form" role="search" onsubmit="return false">
        <label>Find a construct by name
          <input type="search" id="construct-filter" autocomplete="off" placeholder="for example rollCall">
        </label>
      </form>
      <section class="stack">
        <p class="small muted" role="status"></p>
        <ul class="list-plain" id="construct-list"></ul>
      </section>`;
    const listElement = container.querySelector('#construct-list');
    const filterInput = container.querySelector('#construct-filter');
    filterInput.addEventListener('input', () => this.#renderList(listElement, constructs, filterInput.value));
    this.#renderList(listElement, constructs, '');
  }
}

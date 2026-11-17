/**
 * @file ValidationPage.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import { escapeHTML, formatDate, formatNumber } from '../html.js';
import { describeRole, getReleaseLink, groupSamples } from './shared.js';

// ----------------------------------------------------------------------------
// ValidationPage
// ----------------------------------------------------------------------------

// NOTE: shows the validation run that came with the package (XSD and
// Schematron over every sample). Re-running on demand, against an
// alternative or a bulk corpus, needs the validation service (slice 2).
export class ValidationPage {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Static variables
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  static MAX_EXAMPLES = 4;

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Constructor
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  constructor (
    store,
    packageEntry
  ) {
    this.store = store;
    this.packageEntry = packageEntry;
    this.manifest = packageEntry.manifest;
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance internal methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  #renderSummary (
    report
  ) {
    const byRole = report.summary.byRole;
    const cards = Object.entries(byRole).map(([role, summary], i) => `
      <div class="figure${i === 0 ? ' figure--navy' : ''}">
        <p class="eyebrow">${escapeHTML(role)} samples</p>
        <p class="figure__value">${formatNumber(summary.schemaValid)}<span class="figure__unit"> of ${formatNumber(summary.samples)} valid</span></p>
      </div>`);
    const errors = Object.values(byRole).reduce((total, summary) => total + summary.ruleErrors, 0);
    const warnings = Object.values(byRole).reduce((total, summary) => total + summary.ruleWarnings, 0);
    const samplesWithErrors = Object.values(byRole).reduce((total, summary) => total + summary.samplesWithRuleErrors, 0);
    cards.push(`<div class="figure"><p class="eyebrow">Rule errors</p><p class="figure__value">${formatNumber(errors)}<span class="figure__unit"> in ${formatNumber(samplesWithErrors)} samples</span></p></div>`);
    cards.push(`<div class="figure"><p class="eyebrow">Rule warnings</p><p class="figure__value">${formatNumber(warnings)}</p></div>`);
    return `<section class="figures" aria-label="Results summary">${cards.join('')}</section>`;
  }

  #renderByDocumentType (
    report
  ) {
    const resultsByPath = new Map(report.samples.map((sample) => [sample.path, sample]));
    const compatibility = report.summary.compatibility;
    const brokenPaths = new Set((compatibility?.broken ?? []).map((entry) => entry.path));
    const groups = groupSamples(this.manifest.contents.samples, (sample) => {
      const result = resultsByPath.get(sample.path);
      const ruleErrors = Object.values(result?.rules ?? {}).reduce((total, ruleResult) => total + ruleResult.errors, 0);
      return { isValid: result?.schema?.valid === true, ruleErrors, isBroken: brokenPaths.has(sample.path) };
    });
    const rows = groups.map((group) => {
      const valid = group.samples.filter((sample) => sample.isValid).length;
      const ruleErrors = group.samples.reduce((total, sample) => total + sample.ruleErrors, 0);
      const broken = group.samples.filter((sample) => sample.isBroken).length;
      const note = broken > 0 ? `<a href="#compatibility">${formatNumber(broken)} valid under ${escapeHTML(compatibility.against)}</a>` : '';
      return `
        <tr>
          <th scope="row">${escapeHTML(group.label)}</th>
          <td>${escapeHTML(describeRole(group.role))}</td>
          <td class="num">${formatNumber(group.samples.length)}</td>
          <td class="num">${formatNumber(valid)}</td>
          <td class="num">${ruleErrors > 0 ? `<a href="#rule-errors">${formatNumber(ruleErrors)}</a>` : '0'}</td>
          <td>${note}</td>
        </tr>`;
    }).join('');
    return `
      <section class="stack" aria-labelledby="by-type-heading">
        <h2 id="by-type-heading">Results by Document Type</h2>
        <div class="table-box">
          <table>
            <thead><tr><th scope="col">Document type</th><th scope="col">Samples</th><th scope="col" class="num">Count</th><th scope="col" class="num">Valid (XSD)</th><th scope="col" class="num">Rule errors</th><th scope="col">Note</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>`;
  }

  // NOTE: groups rule errors by rule and message, with the first quoted name
  // in the message ignored, so "The 'voteNum' element..." and "The 'voteDate'
  // element..." count as one finding. Error counts include messages beyond
  // the ones the report kept, so a group's total is exact but its examples
  // are not exhaustive.
  #renderRuleErrors (
    report
  ) {
    const groups = new Map();
    for (const sample of report.samples) {
      for (const [ruleID, ruleResult] of Object.entries(sample.rules ?? {})) {
        const errorMessages = ruleResult.messages.filter((message) => message.level === 'error');
        for (const message of errorMessages) {
          const pattern = message.message.replace(/'[^']*'/, "'…'");
          const key = `${ruleID}\u0000${pattern}`;
          if (!groups.has(key)) {
            groups.set(key, { ruleID, pattern, messageCounts: new Map(), count: 0, samples: new Set() });
          }
          const group = groups.get(key);
          group.samples.add(sample.path.split('/').pop());
          group.messageCounts.set(message.message, (group.messageCounts.get(message.message) ?? 0) + 1);
        }
        const unlisted = ruleResult.errors - errorMessages.length;
        for (const message of errorMessages) {
          groups.get(`${ruleID}\u0000${message.message.replace(/'[^']*'/, "'…'")}`).count += 1;
        }
        if (unlisted > 0 && errorMessages.length > 0) {
          groups.get(`${ruleID}\u0000${errorMessages.at(-1).message.replace(/'[^']*'/, "'…'")}`).count += unlisted;
        }
      }
    }
    for (const group of groups.values()) {
      group.example = [...group.messageCounts.entries()].sort((first, second) => second[1] - first[1])[0][0];
    }
    const sorted = [...groups.values()].sort((first, second) => second.count - first.count);
    if (sorted.length === 0) {
      return '<section class="stack" id="rule-errors"><h2>Rule Errors</h2><p>No sample has a rule error.</p></section>';
    }
    const items = sorted.map((group) => {
      const examples = [...group.samples].slice(0, ValidationPage.MAX_EXAMPLES).join(', ');
      const more = group.samples.size > ValidationPage.MAX_EXAMPLES ? ` and ${formatNumber(group.samples.size - ValidationPage.MAX_EXAMPLES)} more` : '';
      return `
        <li>
          <span style="font-size: 24px; font-weight: 700; color: var(--navy); min-width: 64px">${formatNumber(group.count)}</span>
          <div class="stack stack--tight" style="flex: 1 1 400px">
            <p style="font-size: 14px; line-height: 22px; font-weight: 600">${escapeHTML(group.example)}</p>
            <p class="small muted">${escapeHTML(group.ruleID)} · ${formatNumber(group.samples.size)} samples: ${escapeHTML(examples)}${more}</p>
          </div>
        </li>`;
    }).join('');
    const ruleSets = new Set(sorted.map((group) => group.ruleID));
    const callout = ruleSets.size === 1
      ? `<div class="callout"><div class="callout__text"><p class="eyebrow">All rule errors come from one rule set</p><p>Every error in this run is reported by <strong>${escapeHTML([...ruleSets][0])}</strong>.</p></div></div>`
      : '';
    return `
      <section class="stack" id="rule-errors" aria-labelledby="rule-errors-heading">
        <h2 id="rule-errors-heading">Rule Errors, Grouped</h2>
        ${callout}
        <ul class="list-rows">${items}</ul>
        <p class="small muted">Messages that differ only in the element they name are grouped; the example is the most frequent of them.</p>
      </section>`;
  }

  #renderCompatibility (
    report
  ) {
    const compatibility = report.summary.compatibility;
    if (!compatibility) {
      return '';
    }
    const items = compatibility.broken.map((entry) => `
      <li style="display: block">
        <span class="mono">${escapeHTML(entry.path.split('/').pop())}</span>
        <span class="small muted" style="display: block">${escapeHTML(summarizeSchemaError(entry.errors[0]?.message))}</span>
      </li>`).join('');
    return `
      <section class="stack" id="compatibility" aria-labelledby="compatibility-heading">
        <h3 id="compatibility-heading">Compatibility with ${escapeHTML(compatibility.against)}</h3>
        <p style="font-size: 14px; line-height: 22px">${formatNumber(compatibility.validBefore)} samples valid under ${escapeHTML(compatibility.against)}. Under ${escapeHTML(report.release)}, <strong>${formatNumber(compatibility.broken.length)} became invalid</strong> and ${formatNumber(compatibility.fixed.length)} became valid.</p>
        ${items ? `<ul class="list-plain">${items}</ul>` : ''}
      </section>`;
  }

  #renderRunNotes (
    report
  ) {
    const notes = [];
    for (const location of report.skippedImports ?? []) {
      notes.push(`Remote schema import not loaded, validated as if absent: <span class="mono">${escapeHTML(location)}</span>`);
    }
    for (const sample of report.samples) {
      for (const [ruleID, ruleResult] of Object.entries(sample.rules ?? {})) {
        if (ruleResult.note) {
          notes.push(`${escapeHTML(sample.path.split('/').pop())} (${escapeHTML(ruleID)}): ${escapeHTML(ruleResult.note)}`);
        }
      }
    }
    for (const skipped of report.skippedFiles ?? []) {
      notes.push(`Not packaged: ${escapeHTML(skipped.source)} (${escapeHTML(skipped.reason)})`);
    }
    return `
      <section class="stack" aria-labelledby="notes-heading">
        <h3 id="notes-heading">Run Notes</h3>
        <p class="small">${escapeHTML(report.validator)}</p>
        ${notes.length > 0 ? `<ul style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 20px">${notes.map((note) => `<li>${note}</li>`).join('')}</ul>` : ''}
      </section>`;
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance properties & methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  async render (
    container
  ) {
    container.innerHTML = '<p class="muted" role="status">Loading the validation report…</p>';
    let report;
    try {
      report = await this.store.readJSON(this.packageEntry.name, 'validation/report.json');
    } catch (error) {
      container.innerHTML = `<div class="message message--error" role="alert">Could not read this package's validation report: ${escapeHTML(error.message)}</div>`;
      return;
    }
    if (report.samples.length === 0) {
      container.innerHTML = `
        <section class="stack"><p class="eyebrow">${escapeHTML(this.manifest.project)} ${escapeHTML(this.manifest.release)}</p><h1>Validation and Coverage</h1>
        <p>This package has no samples, so there are no results. Reference releases are used for comparison.</p></section>`;
      return;
    }
    container.innerHTML = `
      <section class="stack stack--tight">
        <p class="eyebrow">${escapeHTML(String(this.manifest.project).toUpperCase())} ${escapeHTML(this.manifest.release)} · run with the package, ${escapeHTML(formatDate(report.created))}</p>
        <h1>Validation and Coverage</h1>
        <p class="small"><a href="${getReleaseLink(this.packageEntry.name)}">Back to the release</a></p>
      </section>
      ${this.#renderSummary(report)}
      ${this.#renderByDocumentType(report)}
      <div class="row">
        <div class="row__main">${this.#renderRuleErrors(report)}</div>
        <aside class="row__side">
          ${this.#renderCompatibility(report)}
          ${this.#renderRunNotes(report)}
        </aside>
      </div>`;
  }
}

// ----------------------------------------------------------------------------
// Functions
// ----------------------------------------------------------------------------

// NOTE: shortens a Xerces message such as "cvc-complex-type.2.4.a: Invalid
// content was found starting with element '{"ns":name}'. One of '{...}' is
// expected." to its first sentence, with the namespace dropped.
function summarizeSchemaError (
  message
) {
  if (!message) {
    return '';
  }
  return message
    .replace(/^cvc-[\w.-]+:\s*/, '')
    .replace(/\{"[^"]*":([^}]+)\}/g, '$1')
    .replace(/\.\s+One of '.*$/s, '.');
}

/**
 * @file shared.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import { encodeSegment, escapeHTML } from '../html.js';
import { SchemaIndex } from '../SchemaIndex.js';

// ----------------------------------------------------------------------------
// Functions
// ----------------------------------------------------------------------------

const schemaIndexes = new Map();

// NOTE: builds (once per package) the index of a release's schema set from
// the schema files its manifest lists.
export async function loadSchemaIndex (
  store,
  packageEntry
) {
  if (!schemaIndexes.has(packageEntry.name)) {
    const promise = (async () => {
      const schemaPaths = packageEntry.manifest.files
        .map((file) => file.path)
        .filter((filePath) => filePath.startsWith('schema/') && filePath.endsWith('.xsd'));
      const schemaFiles = await Promise.all(schemaPaths.map(async (filePath) => ({
        path: filePath,
        text: await store.readText(packageEntry.name, filePath)
      })));
      return SchemaIndex.fromSchemaFiles(schemaFiles, packageEntry.manifest.entrySchema);
    })();
    promise.catch(() => schemaIndexes.delete(packageEntry.name));
    schemaIndexes.set(packageEntry.name, promise);
  }
  return schemaIndexes.get(packageEntry.name);
}

export function getReleaseLink (
  packageName,
  subPath = ''
) {
  return `#/releases/${encodeSegment(packageName)}${subPath}`;
}

export function getConstructLink (
  packageName,
  kind,
  name
) {
  return getReleaseLink(packageName, `/constructs/${encodeSegment(kind)}/${encodeSegment(name)}`);
}

export function getDecisionLink (
  packageName,
  decisionID = ''
) {
  return getReleaseLink(packageName, decisionID ? `/decisions/${encodeSegment(decisionID)}` : '/decisions');
}

// NOTE: returns the package's decision register, or null when the package
// has none.
export async function loadDecisions (
  store,
  packageEntry
) {
  if (!packageEntry.manifest.files.some((file) => file.path === 'decisions/decisions.json')) {
    return null;
  }
  try {
    return await store.readJSON(packageEntry.name, 'decisions/decisions.json');
  } catch (error) {
    return null;
  }
}

// NOTE: the register's choice reads "Decided 2026-11-16: B, a new element.
// Drafted as..."; this finds the option letter (B).
export function getProposedOption (
  decision
) {
  if (decision.proposedOption !== undefined) {
    return decision.proposedOption;
  }
  const match = /:\s*([A-Z])\b/.exec(decision.modelingChoice ?? '');
  return match ? match[1] : null;
}

// NOTE: the part of the choice before the first full stop.
export function summarizeChoice (
  modelingChoice
) {
  if (!modelingChoice) {
    return '';
  }
  const text = modelingChoice.replace(/^Decided\s+\S+:\s*/, '');
  return text.split(/\.\s/)[0].replace(/\.$/, '');
}

// NOTE: where a comment was made, as a link to that page.
export function getCommentPlaceLink (
  comment
) {
  const packageName = `${comment.project}-${comment.release}`;
  if (comment.targetKind === 'construct') {
    const [kind, name] = comment.targetKey.split(':');
    return { href: getConstructLink(packageName, kind, name), label: `${name} (${comment.release})` };
  }
  if (comment.targetKind === 'decision') {
    return { href: getDecisionLink(packageName, comment.targetKey), label: `decision ${comment.targetKey}` };
  }
  return { href: getReleaseLink(packageName), label: `release ${comment.release}` };
}

// NOTE: a decision raised on the site, in the shape of the register's.
export function toRegisterDecision (
  siteDecision
) {
  const proposed = siteDecision.options.find((option) => option.label === siteDecision.proposedOption);
  return {
    id: siteDecision.id,
    title: siteDecision.title,
    status: 'proposed',
    source: 'site',
    proposedOption: siteDecision.proposedOption ?? null,
    modelingChoice: proposed ? `${proposed.label}, ${proposed.text}` : 'No option proposed yet',
    options: siteDecision.options.map((option) => ({ ...option, recommended: false })),
    text: siteDecision.question ?? '',
    raisedIn: siteDecision.raisedIn,
    createdBy: siteDecision.createdBy
  };
}

export function renderMessage (
  container,
  text,
  isError = false
) {
  container.innerHTML = `<div class="message${isError ? ' message--error' : ''}" role="${isError ? 'alert' : 'status'}">${escapeHTML(text)}</div>`;
}

export function renderNoPackages (
  container,
  isAdmin
) {
  container.innerHTML = `
    <section class="stack">
      <h1>No Releases Yet</h1>
      <p>No release package has been imported.</p>
      ${isAdmin ? '<p><a class="button" href="#/import">Import a release package</a></p>' : '<p class="muted">An admin will import the first release candidate.</p>'}
    </section>`;
}

// NOTE: groups samples by role and document type, in the order roles first
// appear, then by document type label.
export function groupSamples (
  samples,
  getExtra = () => ({})
) {
  const groups = new Map();
  for (const sample of samples) {
    const key = `${sample.role}\u0000${sample.documentTypeLabel ?? sample.documentType}`;
    if (!groups.has(key)) {
      groups.set(key, { role: sample.role, label: sample.documentTypeLabel ?? sample.documentType, samples: [] });
    }
    groups.get(key).samples.push({ ...sample, ...getExtra(sample) });
  }
  return [...groups.values()];
}

export function describeRole (
  role
) {
  return { proposal: 'Proposal', regression: 'Regression' }[role] ?? role;
}

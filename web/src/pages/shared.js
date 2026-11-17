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

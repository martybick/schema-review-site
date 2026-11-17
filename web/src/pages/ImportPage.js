/**
 * @file ImportPage.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import { escapeHTML, formatNumber } from '../html.js';
import { getReleaseLink } from './shared.js';

// ----------------------------------------------------------------------------
// ImportPage
// ----------------------------------------------------------------------------

// NOTE: admins import a release package by choosing its unzipped folder.
// Before anything is uploaded, every file the manifest lists is checked
// against its SHA-256; a package that does not match its manifest is refused.
// The manifest is uploaded last, so a package only appears on the site once
// all its files are in place.
export class ImportPage {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Static variables
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  static MANIFEST = 'manifest.json';
  static UPLOAD_CONCURRENCY = 6;

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Constructor
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  constructor (
    store,
    onImported
  ) {
    this.store = store;
    this.onImported = onImported;
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance internal methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  // NOTE: a chosen folder gives paths like "uslm-2.2.0-rc1/schema/x.xsd";
  // the first segment is the package folder's own name.
  #indexFiles (
    fileList
  ) {
    const files = new Map();
    for (const file of fileList) {
      const relativePath = file.webkitRelativePath.split('/').slice(1).join('/');
      files.set(relativePath, file);
    }
    return files;
  }

  async #checkPackage (
    files,
    report
  ) {
    const manifestFile = files.get(ImportPage.MANIFEST);
    if (!manifestFile) {
      throw new Error('This folder has no manifest.json. Choose the unzipped package folder itself.');
    }
    const manifest = JSON.parse(await manifestFile.text());
    if (!manifest.project || !manifest.release || !Array.isArray(manifest.files)) {
      throw new Error('manifest.json is not a release package manifest.');
    }
    const problems = [];
    let checked = 0;
    for (const entry of manifest.files) {
      const file = files.get(entry.path);
      if (!file) {
        problems.push(`missing: ${entry.path}`);
      } else if (await getFileHash(file) !== entry.sha256) {
        problems.push(`changed since the package was built: ${entry.path}`);
      }
      checked += 1;
      report(`Checking files: ${formatNumber(checked)} of ${formatNumber(manifest.files.length)}`, checked / manifest.files.length);
    }
    if (problems.length > 0) {
      throw new Error(`The folder does not match its manifest (${problems.length} problems): ${problems.slice(0, 5).join('; ')}`);
    }
    return manifest;
  }

  async #uploadPackage (
    packageName,
    manifest,
    files,
    report
  ) {
    const paths = manifest.files.map((entry) => entry.path);
    let uploaded = 0;
    const uploadNext = async () => {
      while (paths.length > 0) {
        const relativePath = paths.shift();
        await this.store.uploadFile(packageName, relativePath, files.get(relativePath));
        uploaded += 1;
        report(`Uploading: ${formatNumber(uploaded)} of ${formatNumber(manifest.files.length)} files`, uploaded / manifest.files.length);
      }
    };
    await Promise.all(Array.from({ length: ImportPage.UPLOAD_CONCURRENCY }, uploadNext));
    await this.store.uploadFile(packageName, ImportPage.MANIFEST, files.get(ImportPage.MANIFEST));
  }

  async #onImport (
    form,
    status
  ) {
    const input = form.elements.folder;
    const button = form.querySelector('button');
    const report = (text, fraction) => {
      status.innerHTML = `<div class="stack"><p role="status">${escapeHTML(text)}</p><div class="progress" aria-hidden="true"><div style="width: ${Math.round(fraction * 100)}%"></div></div></div>`;
    };
    if (input.files.length === 0) {
      status.innerHTML = '<div class="message message--error" role="alert">Choose the unzipped package folder first.</div>';
      return;
    }
    button.disabled = true;
    try {
      const files = this.#indexFiles(input.files);
      const manifest = await this.#checkPackage(files, report);
      const packageName = `${manifest.project}-${manifest.release}`;
      const existing = await this.store.findPackage(packageName);
      if (existing && !window.confirm(`${packageName} is already on the site. Replace it with this package?`)) {
        status.innerHTML = '<div class="message" role="status">Import cancelled.</div>';
        return;
      }
      await this.#uploadPackage(packageName, manifest, files, report);
      this.onImported();
      status.innerHTML = `<div class="message" role="status"><strong>${escapeHTML(packageName)}</strong> is imported: ${formatNumber(manifest.files.length + 1)} files. <a href="${getReleaseLink(packageName)}">Open the release</a>.</div>`;
    } catch (error) {
      status.innerHTML = `<div class="message message--error" role="alert">${escapeHTML(error.message)}</div>`;
    } finally {
      button.disabled = false;
    }
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance properties & methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  render (
    container
  ) {
    container.innerHTML = `
      <section class="stack">
        <p class="eyebrow">Admin</p>
        <h1>Import a Release Package</h1>
        <p style="max-width: 760px">Choose the unzipped folder of a package built by the release packager (for example <code>uslm-2.2.0-rc1</code>). Every file is checked against the manifest's checksums before anything is uploaded. Import reference releases, such as the one a candidate builds on, the same way.</p>
      </section>
      <form class="form" id="import-form">
        <label>Package folder
          <input type="file" name="folder" webkitdirectory multiple>
        </label>
        <div><button class="button" type="submit">Check and import</button></div>
        <div id="import-status"></div>
      </form>`;
    const form = container.querySelector('#import-form');
    const status = container.querySelector('#import-status');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#onImport(form, status);
    });
  }
}

// ----------------------------------------------------------------------------
// Functions
// ----------------------------------------------------------------------------

async function getFileHash (
  file
) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

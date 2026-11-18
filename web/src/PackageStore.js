/**
 * @file PackageStore.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import {
  getBytes,
  getDownloadURL,
  listAll,
  ref,
  uploadBytes
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-storage.js';
import { services } from './firebase.js';

// ----------------------------------------------------------------------------
// PackageStore
// ----------------------------------------------------------------------------

// NOTE: release packages live in Storage under packages/<package name>/, as
// the packager wrote them (manifest.json, schema/, rules/, samples/,
// validation/, decisions/...). The site reads them as they are; it never
// builds or changes a model itself.
export class PackageStore {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Static variables
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  static ROOT = 'packages';
  static STATUS_ORDER = ['release-candidate', 'draft', 'frozen', 'reference', 'superseded'];

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Private instance properties
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  #cache = new Map();
  #packagesPromise = null;
  #visibility = { defaultName: null, hidden: new Set(), showHidden: true };

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance internal methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  #getRef (
    packageName,
    relativePath
  ) {
    return ref(services.storage, `${PackageStore.ROOT}/${packageName}/${relativePath}`);
  }

  async #readText (
    packageName,
    relativePath
  ) {
    const key = `${packageName}/${relativePath}`;
    if (!this.#cache.has(key)) {
      const promise = getBytes(this.#getRef(packageName, relativePath))
        .then((bytes) => new TextDecoder('utf-8').decode(bytes));
      promise.catch(() => this.#cache.delete(key));
      this.#cache.set(key, promise);
    }
    return this.#cache.get(key);
  }

  async #loadPackages () {
    const listing = await listAll(ref(services.storage, PackageStore.ROOT));
    const packages = [];
    for (const prefix of listing.prefixes) {
      try {
        const manifest = await this.readJSON(prefix.name, 'manifest.json');
        packages.push({ name: prefix.name, manifest });
      } catch (error) {
        // NOTE: a folder without a readable manifest is an unfinished import.
        console.warn(`Skipping ${prefix.name}: ${error.message}`);
      }
    }
    return packages.sort(comparePackages);
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance properties & methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  // NOTE: admins choose, on a release's home page, which release the site
  // opens on and which releases members see (siteSettings in Firestore).
  // Hiding is a matter of what the site shows, not of access: the files of
  // a hidden release stay readable to members who know where to look.
  setVisibility (
    {
      defaultName = null,
      hidden = [],
      showHidden = false
    }
  ) {
    this.#visibility = { defaultName, hidden: new Set(hidden), showHidden };
  }

  isHidden (
    packageName
  ) {
    return this.#visibility.hidden.has(packageName);
  }

  isDefault (
    packageName
  ) {
    return this.#visibility.defaultName === packageName;
  }

  async listAllPackages () {
    this.#packagesPromise ??= this.#loadPackages();
    try {
      return await this.#packagesPromise;
    } catch (error) {
      this.#packagesPromise = null;
      throw error;
    }
  }

  // NOTE: the packages this person may see, the default release first.
  async listPackages () {
    const packages = (await this.listAllPackages())
      .filter((entry) => this.#visibility.showHidden || !this.isHidden(entry.name));
    const defaultEntry = packages.find((entry) => this.isDefault(entry.name));
    return defaultEntry ? [defaultEntry, ...packages.filter((entry) => entry !== defaultEntry)] : packages;
  }

  async findPackage (
    packageName
  ) {
    const packages = await this.listPackages();
    return packages.find((entry) => entry.name === packageName) ?? null;
  }

  async findDefaultPackage () {
    const packages = (await this.listPackages()).filter((entry) => !this.isHidden(entry.name));
    return packages[0] ?? (await this.listPackages())[0] ?? null;
  }

  async findPackageByRelease (
    project,
    release
  ) {
    const packages = await this.listPackages();
    return packages.find((entry) => entry.manifest.project === project && entry.manifest.release === release) ?? null;
  }

  async readJSON (
    packageName,
    relativePath
  ) {
    return JSON.parse(await this.#readText(packageName, relativePath));
  }

  async readText (
    packageName,
    relativePath
  ) {
    return this.#readText(packageName, relativePath);
  }

  async getFileURL (
    packageName,
    relativePath
  ) {
    return getDownloadURL(this.#getRef(packageName, relativePath));
  }

  async uploadFile (
    packageName,
    relativePath,
    file
  ) {
    const contentType = file.type || guessContentType(relativePath);
    await uploadBytes(this.#getRef(packageName, relativePath), file, { contentType });
  }

  clearCache () {
    this.#cache.clear();
    this.#packagesPromise = null;
  }
}

// ----------------------------------------------------------------------------
// Functions
// ----------------------------------------------------------------------------

function comparePackages (
  first,
  second
) {
  const firstRank = PackageStore.STATUS_ORDER.indexOf(first.manifest.status);
  const secondRank = PackageStore.STATUS_ORDER.indexOf(second.manifest.status);
  if (firstRank !== secondRank) {
    return (firstRank === -1 ? 99 : firstRank) - (secondRank === -1 ? 99 : secondRank);
  }
  return String(second.manifest.release).localeCompare(String(first.manifest.release), 'en', { numeric: true });
}

function guessContentType (
  relativePath
) {
  const extension = relativePath.split('.').pop().toLowerCase();
  const types = {
    xml: 'application/xml',
    xsd: 'application/xml',
    sch: 'application/xml',
    json: 'application/json',
    md: 'text/markdown',
    css: 'text/css',
    py: 'text/x-python',
    txt: 'text/plain'
  };
  return types[extension] ?? 'application/octet-stream';
}

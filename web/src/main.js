/**
 * @file main.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import { AuthController } from './AuthController.js';
import { escapeHTML } from './html.js';
import { PackageStore } from './PackageStore.js';
import { ConstructListPage, ConstructPage } from './pages/ConstructPage.js';
import { ImportPage } from './pages/ImportPage.js';
import { ReleaseHomePage } from './pages/ReleaseHomePage.js';
import { renderMessage, renderNoPackages } from './pages/shared.js';
import { NotInvitedPage, SignInPage } from './pages/SignInPage.js';
import { ValidationPage } from './pages/ValidationPage.js';
import { Router } from './Router.js';
import { SITE_CONFIG } from './siteConfig.js';

// ----------------------------------------------------------------------------
// SiteApp
// ----------------------------------------------------------------------------

// NOTE: decides which page to show for the current route and the person's
// role. Signed-out people see sign-in; signed-in people who are not invited
// see "No access"; only admins reach the import page.
class SiteApp {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Constructor
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  constructor () {
    this.container = document.getElementById('app');
    this.authController = new AuthController();
    this.store = new PackageStore();
    this.router = new Router()
      .addRoute('home', '')
      .addRoute('constructs', 'constructs')
      .addRoute('validation', 'validation')
      .addRoute('import', 'import')
      .addRoute('release', 'releases/:packageName')
      .addRoute('release-validation', 'releases/:packageName/validation')
      .addRoute('release-constructs', 'releases/:packageName/constructs')
      .addRoute('construct', 'releases/:packageName/constructs/:kind/:name');
    this.renderCount = 0;
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance internal methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  #updateHeader (
    route
  ) {
    const nav = document.getElementById('site-nav');
    const userArea = document.getElementById('site-user');
    const isMember = this.authController.isMember;
    nav.hidden = !isMember;
    document.getElementById('nav-import').hidden = !this.authController.isAdmin;
    const section = {
      home: 'releases',
      release: 'releases',
      constructs: 'constructs',
      'release-constructs': 'constructs',
      construct: 'constructs',
      validation: 'validation',
      'release-validation': 'validation',
      import: 'import'
    }[route.name];
    for (const link of nav.querySelectorAll('a[data-nav]')) {
      if (link.dataset.nav === section) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    }
    const user = this.authController.user;
    userArea.innerHTML = user
      ? `<span>${escapeHTML(user.email)}${this.authController.isAdmin ? ' · Admin' : ''}</span><button type="button" id="sign-out">Sign out</button>`
      : '';
    userArea.querySelector('#sign-out')?.addEventListener('click', () => this.authController.signOutUser());
  }

  async #findPackageEntry (
    params
  ) {
    return params.packageName
      ? this.store.findPackage(params.packageName)
      : this.store.findDefaultPackage();
  }

  async #renderMemberPage (
    route
  ) {
    if (route.name === 'import') {
      if (!this.authController.isAdmin) {
        renderMessage(this.container, 'Only admins can import release packages.', true);
        return;
      }
      await new ImportPage(this.store, () => this.store.clearCache()).render(this.container);
      return;
    }
    const packageEntry = await this.#findPackageEntry(route.params);
    if (packageEntry === null) {
      if (route.params.packageName) {
        renderMessage(this.container, `No release package named ${route.params.packageName} has been imported.`, true);
      } else {
        renderNoPackages(this.container, this.authController.isAdmin);
      }
      return;
    }
    const page = {
      home: () => new ReleaseHomePage(this.store, packageEntry),
      release: () => new ReleaseHomePage(this.store, packageEntry),
      validation: () => new ValidationPage(this.store, packageEntry),
      'release-validation': () => new ValidationPage(this.store, packageEntry),
      constructs: () => new ConstructListPage(this.store, packageEntry),
      'release-constructs': () => new ConstructListPage(this.store, packageEntry),
      construct: () => new ConstructPage(this.store, packageEntry, route.params.kind, route.params.name)
    }[route.name];
    if (!page) {
      renderMessage(this.container, 'Page not found.', true);
      return;
    }
    await page().render(this.container);
  }

  async #renderRoute (
    route
  ) {
    const renderNumber = ++this.renderCount;
    this.#updateHeader(route);
    if (!this.authController.isReady) {
      return;
    }
    try {
      if (this.authController.user === null || this.authController.isSignInLink()) {
        await new SignInPage(this.authController).render(this.container);
      } else if (!this.authController.isMember) {
        new NotInvitedPage(this.authController).render(this.container);
      } else {
        await this.#renderMemberPage(route);
      }
    } catch (error) {
      if (renderNumber === this.renderCount) {
        console.error(error);
        const text = error.code === 'storage/unauthorized'
          ? 'You do not have access to this content.'
          : `Something went wrong: ${error.message}`;
        renderMessage(this.container, text, true);
      }
    }
    if (renderNumber === this.renderCount) {
      this.container.focus({ preventScroll: true });
    }
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance properties & methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  start () {
    document.title = SITE_CONFIG.siteName;
    document.querySelector('.site-header__name').textContent = SITE_CONFIG.siteName;
    this.authController.addListener(() => {
      this.store.clearCache();
      this.#renderRoute(this.router.getCurrentRoute());
    });
    this.router.start((route) => this.#renderRoute(route));
    this.authController.start();
  }
}

// ----------------------------------------------------------------------------
// Exports
// ----------------------------------------------------------------------------

new SiteApp().start();

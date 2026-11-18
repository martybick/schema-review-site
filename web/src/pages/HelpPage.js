/**
 * @file HelpPage.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import { escapeHTML } from '../html.js';
import { getSlug, renderMarkdown } from '../markdown.js';

// ----------------------------------------------------------------------------
// HelpPage
// ----------------------------------------------------------------------------

// NOTE: the user manual, from web/help/manual.md. Everything after the
// "<!-- admins -->" line is the admin part, shown only to admins. A list of
// the manual's sections sits beside it; each links to #/help#<section>.
export class HelpPage {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Static variables
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  static MANUAL_PATH = '/help/manual.md';
  static ADMIN_MARKER = '<!-- admins -->';

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Constructor
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  constructor (
    authController
  ) {
    this.authController = authController;
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance properties & methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  async render (
    container
  ) {
    container.innerHTML = '<p class="muted" role="status">Loading the manual…</p>';
    const response = await fetch(HelpPage.MANUAL_PATH, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`The manual could not be loaded (${response.status}).`);
    }
    const [memberPart, adminPart = ''] = (await response.text()).split(HelpPage.ADMIN_MARKER);
    const manual = this.authController.isAdmin ? `${memberPart}\n\n${adminPart}` : memberPart;
    const sections = [...manual.matchAll(/^## (.+)$/gm)].map((match) => match[1].trim());
    const contents = sections
      .map((title) => `<li><a href="#/help#${getSlug(title)}">${escapeHTML(title)}</a></li>`)
      .join('');
    container.innerHTML = `
      <div class="row">
        <article class="row__main manual">${renderMarkdown(manual, { headings: true })}</article>
        <aside class="row__side">
          <nav class="panel stack manual-contents" aria-label="Manual sections">
            <h3>In This Manual</h3>
            <ul class="list-plain">${contents}</ul>
            ${this.authController.isAdmin ? '<p class="small muted">The "For Admins" part is shown only to admins.</p>' : ''}
          </nav>
        </aside>
      </div>`;
  }
}

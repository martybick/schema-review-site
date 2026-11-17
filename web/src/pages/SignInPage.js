/**
 * @file SignInPage.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import { escapeHTML } from '../html.js';
import { SITE_CONFIG } from '../siteConfig.js';

// ----------------------------------------------------------------------------
// SignInPage
// ----------------------------------------------------------------------------

// NOTE: one page for both halves of email-link sign-in: asking for a link,
// and finishing sign-in when the person comes back from the email. If they
// open the link on another device, the page asks for their email again.
export class SignInPage {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Constructor
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  constructor (
    authController
  ) {
    this.authController = authController;
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance internal methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  #renderRequestForm (
    container,
    notice = ''
  ) {
    container.innerHTML = `
      <section class="stack">
        <p class="eyebrow">By invitation</p>
        <h1>Sign In to ${escapeHTML(SITE_CONFIG.siteName)}</h1>
        <p>Enter the email address your invitation was sent to. We will email you a link that signs you in; there is no password.</p>
      </section>
      <form class="form" id="sign-in-form" novalidate>
        <label>Email address
          <input type="email" name="email" autocomplete="email" required value="${escapeHTML(this.authController.getLastEmail() ?? '')}">
        </label>
        <div><button class="button" type="submit">Email me a sign-in link</button></div>
        <p class="small muted">Once you are signed in, this browser keeps you signed in until you choose Sign out.</p>
        <div id="sign-in-status">${notice}</div>
      </form>`;
    const form = container.querySelector('#sign-in-form');
    form.addEventListener('submit', (event) => this.#onRequestLink(event, form));
  }

  async #onRequestLink (
    event,
    form
  ) {
    event.preventDefault();
    const status = form.querySelector('#sign-in-status');
    const email = form.elements.email.value.trim();
    if (!form.elements.email.checkValidity() || email === '') {
      status.innerHTML = '<div class="message message--error" role="alert">Enter a valid email address.</div>';
      return;
    }
    form.querySelector('button').disabled = true;
    try {
      await this.authController.sendSignInLink(email);
      status.innerHTML = `<div class="message" role="status">A sign-in link is on its way to <strong>${escapeHTML(email)}</strong>. Open it on this device to sign in. It may take a minute; check your spam folder if it does not arrive.</div>`;
    } catch (error) {
      status.innerHTML = `<div class="message message--error" role="alert">Could not send the link: ${escapeHTML(error.message)}</div>`;
      form.querySelector('button').disabled = false;
    }
  }

  #renderFinishForm (
    container
  ) {
    container.innerHTML = `
      <section class="stack">
        <h1>Finish Signing In</h1>
        <p>Confirm the email address you asked for the link with.</p>
      </section>
      <form class="form" id="finish-form" novalidate>
        <label>Email address
          <input type="email" name="email" autocomplete="email" required value="${escapeHTML(this.authController.getLastEmail() ?? '')}">
        </label>
        <div><button class="button" type="submit">Sign in</button></div>
        <div id="finish-status"></div>
      </form>`;
    const form = container.querySelector('#finish-form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await this.#finish(container, form.elements.email.value.trim(), form.querySelector('#finish-status'));
    });
  }

  async #finish (
    container,
    email,
    status
  ) {
    try {
      await this.authController.finishSignIn(email);
    } catch (error) {
      const text = error.code === 'auth/invalid-action-code'
        ? 'This sign-in link has expired or was already used. Ask for a new one.'
        : `Could not sign in: ${error.message}`;
      if (status) {
        status.innerHTML = `<div class="message message--error" role="alert">${escapeHTML(text)}</div>`;
      } else {
        this.#renderRequestForm(container, `<div class="message message--error" role="alert">${escapeHTML(text)}</div>`);
      }
    }
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance properties & methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  async render (
    container
  ) {
    if (this.authController.isSignInLink()) {
      const email = this.authController.getPendingEmail();
      if (email) {
        container.innerHTML = '<p class="muted" role="status">Signing you in…</p>';
        await this.#finish(container, email, null);
      } else {
        this.#renderFinishForm(container);
      }
      return;
    }
    this.#renderRequestForm(container);
  }
}

// ----------------------------------------------------------------------------
// NotInvitedPage
// ----------------------------------------------------------------------------

export class NotInvitedPage {
  constructor (
    authController
  ) {
    this.authController = authController;
  }

  render (
    container
  ) {
    const email = this.authController.user?.email ?? '';
    container.innerHTML = `
      <section class="stack">
        <h1>No Access Yet</h1>
        <p>You are signed in as <strong>${escapeHTML(email)}</strong>, but this address has not been invited to ${escapeHTML(SITE_CONFIG.siteName)}.</p>
        <p>If you were invited at another address, sign out and sign in with that one. Otherwise, ask Xcential for an invitation.</p>
        <div><button class="button button--secondary" type="button" id="not-invited-sign-out">Sign out</button></div>
      </section>`;
    container.querySelector('#not-invited-sign-out').addEventListener('click', () => this.authController.signOutUser());
  }
}

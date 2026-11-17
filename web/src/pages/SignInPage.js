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
    notice = '',
    email = null
  ) {
    container.innerHTML = `
      <section class="stack">
        <p class="eyebrow">By invitation</p>
        <h1>Sign In to ${escapeHTML(SITE_CONFIG.siteName)}</h1>
        <p>Use the address your invitation was sent to. There is no password for this site.</p>
      </section>
      <section class="form" aria-labelledby="google-heading">
        <h2 id="google-heading" style="font-size: 18px; line-height: 26px">If your address is a Google account</h2>
        <div><button class="button" type="button" id="google-sign-in">Sign in with Google</button></div>
        <div id="google-status"></div>
      </section>
      <form class="form" id="sign-in-form" novalidate>
        <h2 style="font-size: 18px; line-height: 26px">Otherwise, get a sign-in link by email</h2>
        <label>Email address
          <input type="email" name="email" autocomplete="email" required value="${escapeHTML(email ?? this.authController.getLastEmail() ?? '')}">
        </label>
        <div><button class="button button--secondary" type="submit">Email me a sign-in link</button></div>
        <p class="small muted">Once you are signed in, this browser keeps you signed in until you choose Sign out.</p>
        <div id="sign-in-status">${notice}</div>
      </form>`;
    const form = container.querySelector('#sign-in-form');
    form.addEventListener('submit', (event) => this.#onRequestLink(event, form));
    const googleButton = container.querySelector('#google-sign-in');
    googleButton.addEventListener('click', () => this.#onGoogleSignIn(googleButton, container.querySelector('#google-status')));
  }

  async #onGoogleSignIn (
    button,
    status
  ) {
    button.disabled = true;
    status.innerHTML = '';
    try {
      await this.authController.signInWithGoogle();
    } catch (error) {
      const isClosed = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error.code);
      if (!isClosed) {
        status.innerHTML = `<div class="message message--error" role="alert">Could not sign in with Google: ${escapeHTML(error.message)}</div>`;
      }
      button.disabled = false;
    }
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
        <p>You opened the sign-in link in a different browser from the one you asked for it in. Confirm the email address the link was sent to.</p>
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
      const button = form.querySelector('button');
      if (button.disabled) {
        return;
      }
      button.disabled = true;
      await this.#finish(container, form.elements.email.value.trim(), form.querySelector('#finish-status'));
      button.disabled = false;
    });
  }

  async #finish (
    container,
    email,
    status
  ) {
    if (status) {
      status.innerHTML = '<p class="muted" role="status">Signing you in…</p>';
    }
    try {
      await this.authController.finishSignIn(email);
      if (status) {
        status.innerHTML = '<p class="muted" role="status">Signed in. Opening the site…</p>';
      }
    } catch (error) {
      const isUnusable = ['auth/invalid-action-code', 'auth/expired-action-code', 'auth/argument-error'].includes(error.code);
      if (isUnusable) {
        // NOTE: a link works once and expires; offer a new one at once.
        this.authController.discardSignInLink();
        this.#renderRequestForm(container, '<div class="message message--error" role="alert">That sign-in link can no longer be used: each link works once and expires after a while. Ask for a new one below, and open it in the browser you ask from.</div>', email);
        return;
      }
      const text = error.code === 'auth/invalid-email'
        ? 'That is not the address the link was sent to. Check it and try again.'
        : `Could not sign in: ${error.message}`;
      if (status) {
        status.innerHTML = `<div class="message message--error" role="alert">${escapeHTML(text)}</div>`;
      } else {
        this.#renderRequestForm(container, `<div class="message message--error" role="alert">${escapeHTML(text)}</div>`, email);
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
        <p>If you were invited at another address, sign out and sign in with that one. If you used "Sign in with Google", note that only the exact invited address works. Otherwise, ask Xcential for an invitation.</p>
        <div><button class="button button--secondary" type="button" id="not-invited-sign-out">Sign out</button></div>
      </section>`;
    container.querySelector('#not-invited-sign-out').addEventListener('click', () => this.authController.signOutUser());
  }
}

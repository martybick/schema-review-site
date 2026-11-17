/**
 * @file AuthController.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import {
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signOut
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import { getMetadata, ref } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-storage.js';
import { services } from './firebase.js';

// ----------------------------------------------------------------------------
// AuthController
// ----------------------------------------------------------------------------

// NOTE: sign-in is by email link only; there are no passwords. Anyone can ask
// for a link, but only invited people can read anything (storage.rules). The
// person's role comes from the rules too: config/admin-check and
// config/member-check never exist, so a read that is allowed fails with
// "object-not-found" and a read that is refused fails with "unauthorized".
export class AuthController {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Static variables
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  static PENDING_EMAIL_KEY = 'schemaReview.pendingEmail';
  static ROLE_ADMIN = 'admin';
  static ROLE_USER = 'user';
  static ROLE_NONE = 'none';

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Private instance properties
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  #listeners = new Set();

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Constructor
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  constructor () {
    this.user = null;
    this.role = AuthController.ROLE_NONE;
    this.isReady = false;
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance internal methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  async #findRole () {
    if (this.user === null) {
      return AuthController.ROLE_NONE;
    }
    if (await this.#canRead('config/admin-check')) {
      return AuthController.ROLE_ADMIN;
    }
    if (await this.#canRead('config/member-check')) {
      return AuthController.ROLE_USER;
    }
    return AuthController.ROLE_NONE;
  }

  async #canRead (
    objectPath
  ) {
    try {
      await getMetadata(ref(services.storage, objectPath));
      return true;
    } catch (error) {
      if (error.code === 'storage/object-not-found') {
        return true;
      }
      if (error.code === 'storage/unauthorized' || error.code === 'storage/unauthenticated') {
        return false;
      }
      throw error;
    }
  }

  #notifyListeners () {
    for (const listener of this.#listeners) {
      listener(this);
    }
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance properties & methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  get isAdmin () {
    return this.role === AuthController.ROLE_ADMIN;
  }

  get isMember () {
    return this.role === AuthController.ROLE_ADMIN || this.role === AuthController.ROLE_USER;
  }

  start () {
    onAuthStateChanged(services.auth, async (user) => {
      this.user = user;
      try {
        this.role = await this.#findRole();
      } catch (error) {
        // NOTE: an unexpected Storage error must not lock the person out of
        // the sign-in page; treat it as no access and log it.
        console.error(error);
        this.role = AuthController.ROLE_NONE;
      }
      this.isReady = true;
      this.#notifyListeners();
    });
  }

  addListener (
    listener
  ) {
    this.#listeners.add(listener);
  }

  async sendSignInLink (
    email
  ) {
    const actionCodeSettings = {
      url: `${window.location.origin}/`,
      handleCodeInApp: true
    };
    await sendSignInLinkToEmail(services.auth, email, actionCodeSettings);
    try {
      window.localStorage.setItem(AuthController.PENDING_EMAIL_KEY, email);
    } catch (error) {
      // NOTE: without storage the person types their email again on return.
    }
  }

  isSignInLink () {
    return isSignInWithEmailLink(services.auth, window.location.href);
  }

  getPendingEmail () {
    try {
      return window.localStorage.getItem(AuthController.PENDING_EMAIL_KEY);
    } catch (error) {
      return null;
    }
  }

  async finishSignIn (
    email
  ) {
    await signInWithEmailLink(services.auth, email, window.location.href);
    try {
      window.localStorage.removeItem(AuthController.PENDING_EMAIL_KEY);
    } catch (error) {
      // NOTE: nothing to clean up.
    }
    window.history.replaceState(null, '', `${window.location.pathname}#/`);
  }

  async signOutUser () {
    await signOut(services.auth);
    window.location.hash = '#/';
  }
}

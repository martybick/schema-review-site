/**
 * @file AuthController.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import { getMetadata, ref } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-storage.js';
import { services } from './firebase.js';

// ----------------------------------------------------------------------------
// AuthController
// ----------------------------------------------------------------------------

// NOTE: two ways to sign in, neither with a password on this site: "Sign in
// with Google" for anyone whose invited address is a Google account (Google
// Workspace included), and an emailed sign-in link for everyone else. Anyone
// can sign in, but only invited addresses can read anything (storage.rules). The
// person's role comes from the rules too: config/admin-check and
// config/member-check never exist, so a read that is allowed fails with
// "object-not-found" and a read that is refused fails with "unauthorized".
export class AuthController {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Static variables
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  static PENDING_EMAIL_KEY = 'schemaReview.pendingEmail';
  static LAST_EMAIL_KEY = 'schemaReview.lastEmail';
  static RETURN_TO_KEY = 'schemaReview.returnTo';
  static WELCOME_KEY = 'schemaReview.welcome';
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
    // NOTE: the sign-in link is captured as the page opens, because the
    // address can change before the person finishes signing in.
    this.signInLink = isSignInWithEmailLink(services.auth, window.location.href)
      ? window.location.href
      : null;
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

  // NOTE: remembers the page the person was trying to reach, so sign-in
  // takes them back to it (a shared link to a construct, for example).
  async sendSignInLink (
    email
  ) {
    const actionCodeSettings = {
      url: `${window.location.origin}/`,
      handleCodeInApp: true
    };
    await sendSignInLinkToEmail(services.auth, email, actionCodeSettings);
    writeSetting(AuthController.PENDING_EMAIL_KEY, email);
    writeSetting(AuthController.LAST_EMAIL_KEY, email);
    const returnTo = window.location.hash;
    if (returnTo && returnTo !== '#/' && !returnTo.startsWith('#/import')) {
      writeSetting(AuthController.RETURN_TO_KEY, returnTo);
    } else {
      removeSetting(AuthController.RETURN_TO_KEY);
    }
  }

  // NOTE: a popup keeps the person on the page; if the browser blocks it,
  // the same sign-in runs as a full-page redirect instead.
  async signInWithGoogle () {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const returnTo = window.location.hash;
    try {
      const result = await signInWithPopup(services.auth, provider);
      if (result.user?.email) {
        writeSetting(AuthController.LAST_EMAIL_KEY, result.user.email);
      }
      if (readSetting(AuthController.WELCOME_KEY) !== 'dismissed') {
        writeSetting(AuthController.WELCOME_KEY, 'pending');
      }
    } catch (error) {
      if (error.code === 'auth/popup-blocked') {
        if (returnTo && returnTo !== '#/') {
          writeSetting(AuthController.RETURN_TO_KEY, returnTo);
        }
        await signInWithRedirect(services.auth, provider);
        return;
      }
      throw error;
    }
  }

  isSignInLink () {
    return this.signInLink !== null;
  }

  // NOTE: forgets a sign-in link that cannot be used (expired or already
  // used), so the page offers a new one instead.
  discardSignInLink () {
    this.signInLink = null;
    window.history.replaceState(null, '', `${window.location.pathname}#/`);
  }

  getPendingEmail () {
    return readSetting(AuthController.PENDING_EMAIL_KEY);
  }

  getLastEmail () {
    return readSetting(AuthController.LAST_EMAIL_KEY);
  }

  isWelcomePending () {
    return readSetting(AuthController.WELCOME_KEY) === 'pending';
  }

  dismissWelcome () {
    writeSetting(AuthController.WELCOME_KEY, 'dismissed');
  }

  async finishSignIn (
    email
  ) {
    await signInWithEmailLink(services.auth, email, this.signInLink);
    this.signInLink = null;
    removeSetting(AuthController.PENDING_EMAIL_KEY);
    writeSetting(AuthController.LAST_EMAIL_KEY, email);
    if (readSetting(AuthController.WELCOME_KEY) !== 'dismissed') {
      writeSetting(AuthController.WELCOME_KEY, 'pending');
    }
    const returnTo = readSetting(AuthController.RETURN_TO_KEY) ?? '#/';
    removeSetting(AuthController.RETURN_TO_KEY);
    window.history.replaceState(null, '', `${window.location.pathname}${returnTo}`);
  }

  async signOutUser () {
    await signOut(services.auth);
    window.location.hash = '#/';
  }
}

// ----------------------------------------------------------------------------
// Functions
// ----------------------------------------------------------------------------

// NOTE: browser storage can be unavailable (private windows, strict
// settings); the site then works the same, only without the conveniences.
function readSetting (
  key
) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function writeSetting (
  key,
  value
) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    // NOTE: see readSetting.
  }
}

function removeSetting (
  key
) {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    // NOTE: see readSetting.
  }
}

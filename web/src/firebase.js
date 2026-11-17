/**
 * @file firebase.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

// NOTE: the Firebase SDK loads as ES modules from Google's CDN, pinned to one
// version, so the site needs no build step.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import { connectAuthEmulator, getAuth } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import { connectFirestoreEmulator, getFirestore } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
import { connectStorageEmulator, getStorage } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-storage.js';
import { SITE_CONFIG } from './siteConfig.js';

// ----------------------------------------------------------------------------
// Functions
// ----------------------------------------------------------------------------

function createServices () {
  const app = initializeApp(SITE_CONFIG.firebase);
  const auth = getAuth(app);
  const storage = getStorage(app);
  const db = getFirestore(app);
  const isLocal = SITE_CONFIG.emulatorHosts.includes(window.location.hostname);
  if (isLocal) {
    connectAuthEmulator(auth, `http://${window.location.hostname}:9099`, { disableWarnings: true });
    connectStorageEmulator(storage, window.location.hostname, 9199);
    connectFirestoreEmulator(db, window.location.hostname, 8080);
  }
  return { app, auth, storage, db, isLocal };
}

// ----------------------------------------------------------------------------
// Exports
// ----------------------------------------------------------------------------

export const services = createServices();

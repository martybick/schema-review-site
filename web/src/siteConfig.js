/**
 * @file siteConfig.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Exports
// ----------------------------------------------------------------------------

// NOTE: everything specific to one deployment of the site. A later schema
// project gets its own copy of this file and its own Firebase project.
export const SITE_CONFIG = Object.freeze({
  siteName: 'USLM 2 Review',
  project: 'uslm',
  firebase: {
    apiKey: 'AIzaSyAa1xmVtq-IMJqx60dWbcpByRRS2QtkSVo',
    authDomain: 'uslm-166f4.firebaseapp.com',
    projectId: 'uslm-166f4',
    storageBucket: 'uslm-166f4.firebasestorage.app',
    messagingSenderId: '855794697868',
    appId: '1:855794697868:web:02cab0114f26c78d9f9da9'
  },
  emulatorHosts: ['localhost', '127.0.0.1']
});

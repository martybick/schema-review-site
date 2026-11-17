/**
 * @file buildRules.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ----------------------------------------------------------------------------
// Functions
// ----------------------------------------------------------------------------

// NOTE: writes storage.rules and firestore.rules from their templates in
// scripts/ and config/members.json (not committed; see
// config/members.example.json). The admins listed there are owners: they
// always have access, so the site cannot be locked out. Everyone else is
// invited on the site's People page and stored in the database; the "users"
// list here still works, for people invited before the People page existed.
async function buildRules () {
  const rootPath = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const membersPath = path.join(rootPath, 'config', 'members.json');
  const members = JSON.parse(await readFile(membersPath, 'utf8'));
  const admins = normalizeEmails(members.admins);
  const users = normalizeEmails(members.users).filter((email) => !admins.includes(email));
  if (admins.length === 0) {
    throw new Error('config/members.json must list at least one admin');
  }
  for (const name of ['storage.rules', 'firestore.rules']) {
    const template = await readFile(path.join(rootPath, 'scripts', `${name}.template`), 'utf8');
    const rules = template
      .replaceAll('__ADMINS__', formatList(admins))
      .replaceAll('__USERS__', formatList(users));
    await writeFile(path.join(rootPath, name), rules);
  }
  console.log(`storage.rules and firestore.rules written: ${admins.length} owners, ${users.length} users from config/members.json (invite others on the People page)`);
}

function normalizeEmails (
  emails = []
) {
  for (const email of emails) {
    if (!/^[^\s@'\\]+@[^\s@'\\]+\.[^\s@'\\]+$/.test(email)) {
      throw new Error(`Not an email address: ${email}`);
    }
  }
  return [...new Set(emails.map((email) => email.trim().toLowerCase()))];
}

function formatList (
  emails
) {
  return `[${emails.map((email) => `'${email}'`).join(', ')}]`;
}

// ----------------------------------------------------------------------------
// Exports
// ----------------------------------------------------------------------------

buildRules().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

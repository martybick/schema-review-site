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

// NOTE: writes storage.rules from scripts/storage.rules.template and the
// invitation list in config/members.json (not committed; see
// config/members.example.json). Xcential invites people by adding their email
// address here, then running `npm run rules` and deploying the rules.
// TODO: move membership into the site's database when it exists, so admins
// invite people from the site instead of redeploying rules.
async function buildRules () {
  const rootPath = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const membersPath = path.join(rootPath, 'config', 'members.json');
  const members = JSON.parse(await readFile(membersPath, 'utf8'));
  const admins = normalizeEmails(members.admins);
  const users = normalizeEmails(members.users).filter((email) => !admins.includes(email));
  if (admins.length === 0) {
    throw new Error('config/members.json must list at least one admin');
  }
  const template = await readFile(path.join(rootPath, 'scripts', 'storage.rules.template'), 'utf8');
  const rules = template
    .replace('__ADMINS__', formatList(admins))
    .replace('__USERS__', formatList(users));
  await writeFile(path.join(rootPath, 'storage.rules'), rules);
  console.log(`storage.rules written: ${admins.length} admins, ${users.length} users`);
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

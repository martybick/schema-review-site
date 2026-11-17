# Schema Review Site

A review site for a working group modeling an XML schema: proposed releases, validation against real
documents, and the record of decisions. Built by Xcential; the first deployment serves the Legislative
Branch XML Working Group modeling USLM 2 (`uslm-166f4`).

The site never builds a model itself. Each release arrives as a **release package** built by the
release packager in the modeling repository (for USLM, `martybick/uslm2`, folder `packaging/`), and
the site reads the package as it is: manifest, schemas, Schematron, samples, validation report and
decision records.

## What slice 1 does

- **Sign-in by email link**, for invited people only. Two roles: admin and user.
- **Import a release package** (admins): choose the unzipped package folder; every file is checked
  against the manifest's SHA-256 before anything is uploaded.
- **Release home:** status, sample results, compatibility with the release it builds on, construct
  changes since that release, decisions awaiting ratification, and the package's files.
- **Validation and coverage:** the package's validation run by document type, rule errors grouped by
  message, the compatibility list and run notes.
- **Constructs:** a searchable list, and a page per construct with its documentation, content model,
  where it is used, its XSD source with real line numbers, related decisions and its history.

Not yet: comments, positions, ratifying decisions, re-running validation on demand, alternatives
from branches, bulk corpora, legacy conversion, the monthly log. See the design doc for the plan.

## How it is built

- Plain JavaScript ES modules and classes, no framework and no build step, following Xcential's
  coding conventions (Semistandard; `npm run lint`).
- Firebase: Hosting serves `web/`; Authentication (email link); Storage holds packages under
  `packages/<project>-<release>/`. The Firebase SDK loads from Google's CDN, pinned to one version.
- Access is enforced by `storage.rules`, generated from the invitation list (see below).

| Path | What |
| --- | --- |
| `web/` | The site: `index.html`, `styles/site.css` (Xcential design tokens), `src/` |
| `web/src/siteConfig.js` | Everything specific to one deployment: site name, Firebase config |
| `scripts/buildRules.js` | Writes `storage.rules` from `scripts/storage.rules.template` and `config/members.json` |
| `config/members.example.json` | The shape of the invitation list; the real `config/members.json` is not committed |
| `cors.json` | Lets the site read files from the Storage bucket |
| `tests/e2e/` | End-to-end test against the Firebase emulators |
| `docs/SETUP.md` | First deployment, inviting people, importing packages |

## Common tasks

```
npm install
npm run lint          # Xcential conventions (Semistandard)
npm run rules         # regenerate storage.rules after changing config/members.json
npm run emulators     # run locally at http://127.0.0.1:5000 with the Auth and Storage emulators
npm run deploy        # rules, then Hosting and Storage
```

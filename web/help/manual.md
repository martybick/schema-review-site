# USLM 2 Review: User Manual

This site is where the working group reviews proposed USLM releases: read a release, see what changed, check it against real documents, comment, and settle modeling decisions. The model itself lives in GitHub; the site shows release packages built from it and records what the group says about them.

## How the Pieces Fit

- **The repository is the source of truth.** Schemas, Schematron, samples, the decision register and the problem log live in [martybick/uslm2](https://github.com/martybick/uslm2). Nothing you do on the site changes the model.
- **A release package is a snapshot.** Xcential builds it from a branch with the packager. It holds the schema set, rules, samples, review notes, decisions and a validation report, each file fingerprinted.
- **The site is where the group talks.** Members read releases, comment and state positions. Admins record the outcome.
- **Agreed changes go back to GitHub.** A change the group wants is made on a branch, merged, and shows up in the next package.

Releases on the site come from two places. **GPO releases** are GPO's published schemas, from USLM 1.0.18 (2016) to the 2.1.1 and 2.1.2 drafts. **Xcential proposals** are drafts built on GPO's work: 2.1.3-rc1 (committee reports and CBO estimates) and 2.2.0-rc1 (shared floor structures for the Record, Journal and Calendar).

## Getting In

You need an invitation, then one sign-in per browser.

1. Open [uslm-166f4.web.app](https://uslm-166f4.web.app).
2. If your invited address is a Google account (Google Workspace included), choose **Sign in with Google** and pick that account.
3. Otherwise, type the invited address and choose **Email me a sign-in link**. Open the link in the email, in the same browser if you can.
4. You stay signed in on that browser. To come back, open the site again; bookmark it, or install it as an app from the browser menu.

If you see **No Access Yet**, you signed in with an address that was not invited. Sign out and use the invited one, or ask an admin to add the address you used.

There are two roles. **Members** read everything shown to them, comment and state positions. **Admins** also invite people, import packages, choose what members see, set comment status, record decisions and see the release history.

## Reviewing a Release

The site opens on the release under review. Every release's home page lists the other releases in **Releases on This Site**.

| Page | What it shows | Use it to |
| --- | --- | --- |
| **Releases** (release home) | What the release is, what it builds on, sample results, whether it breaks the release before it, a summary of changes, its decisions and package files | Get the overall picture and open the review notes and change logs |
| **What changed** (button on the release home) | Every construct new, removed or changed since the release it builds on, or any other release you pick; each change as a line-by-line diff of its XSD source, marked "documentation only" or "definition changed"; package files and decisions that differ; validation side by side | See exactly what a release did |
| **Validation and coverage** | Samples by document type, schema errors, Schematron errors grouped by message, the compatibility list, run notes | Find which samples fail and why |
| **Constructs** | A searchable list of every global element and type; a page per construct with documentation, content model, where it is used, its XSD source with line numbers, related decisions, its history and comments | Read the model one construct at a time, and comment on it |
| **Decisions** | The release's modeling choices with their status and positions | Take a side and discuss |

Samples come in two kinds. **Proposal** samples were written for the release and should all be valid. **Regression** samples are documents GPO has published (bills and resolutions, public laws, Statutes at Large, statute compilations, the Federal Register and CFR, committee reports and CBO estimates). A regression sample valid under the release before and invalid now is a compatibility break, listed on the release home with a **See the samples** button.

All validation was done when the package was built, with the JDK's Xerces for the schema and SaxonJS for Schematron. The site shows the results; it does not run the checks itself.

## Comments and Decisions

Comment where the problem is: on the construct's page or the decision's page. Each comment records the release you made it on.

| Type | Use it when |
| --- | --- |
| Defect | The schema or a rule is wrong: it rejects a valid document or accepts an invalid one |
| Gap (cannot be modeled) | Something in a real document has no place in the model |
| Naming | An element, attribute or value name is unclear or inconsistent |
| Documentation | The annotation or review notes are missing, wrong or unclear |
| Alternative proposed | You have a different model; describe it, and link your branch if you made one |
| Question | You want an explanation before taking a view |
| Editorial | Typos and wording |

Put element names and XML in backticks, for example `rollCall`; they show as code. Anyone can reply. An admin sets each comment's status: open, accepted, rejected, deferred or addressed. You can delete your own comments.

On a decision's page you read the options, the proposed choice and the full text from the decision register, then:

1. State your position: **Support**, **Oppose** or **Abstain**, with a short reason. You can change or withdraw it until the decision is settled.
2. Discuss it in the comments below the options.
3. An admin records the group's outcome, usually after a meeting: **Ratified**, **Changed** to another option, or **Reopened**, with a note. Every recording stays in the decision's history.
4. While a decision is ratified or changed, positions are closed. Reopening it opens them again.

## Proposing a Change in GitHub

A modeling proposal is a branch in [martybick/uslm2](https://github.com/martybick/uslm2) with a pull request. Ask Xcential for write access, or work from a fork.

| Path | What | Can you change it? |
| --- | --- | --- |
| `baseline/usgpo-proposed/` | GPO's proposed branch: approved 2.1.0 plus GPO's 2.1.1 and 2.1.2 drafts | Never: it is the reference everything is compared with |
| `baseline/usgpo-history/` | Older GPO releases recovered from GPO's history | Never |
| `proposal/reports-and-cbo/` | The 2.1.3 draft: schema, Schematron, CSS, samples, README, CHANGELOG | Yes |
| `proposal/shared-structures/` | The 2.2.0 draft: floor votes, floor actions, legislative day, calendars; Clerk-to-USLM converter | Yes |
| `decisions/README.md` | The decision register | Yes: add a row and a section for a new decision |
| `issues/README.md` | Problems found by checking the drafts | Yes: record a problem or its fix |
| `packaging/` | The packager and its configuration | Ask Xcential first |

1. Branch from the latest `main`, named for the change, for example `alt/floor-vote-name`.
2. Change the schema in the proposal folder it belongs to. Keep changes additive where you can; a breaking change must say so in the CHANGELOG.
3. Put each rule where it belongs: the XSD holds only rules true for every USLM user; rules for one set of documents go in Schematron, with scope guards in XPath 1.0.
4. Add or update samples in the proposal's `samples/` folder, from production sources where you can, saying where each came from.
5. Write it down: a CHANGELOG entry; a decision in `decisions/README.md` if the change makes a modeling choice; an entry in `issues/README.md` if it fixes a logged problem.
6. Open a pull request saying what the change is, why, what it breaks, and which comment or decision on the site it answers.

To see the results the site will show, build the packages yourself (Node 22 or later, Java 11 or later, `zip`):

```
cd uslm2/packaging
npm install
node src/buildPackages.js --config config/uslm-2.2.json --repository .. --output ~/uslm-packages --release 2.1.3-rc1
```

Each package folder has `validation/report.md`. Xcential builds the package from your branch and imports it, usually as a draft beside the release under review. Do not rely on `xmllint` for 2.1.1 and later: libxml2 2.9 wrongly rejects them.

<!-- admins -->

## For Admins

This part of the manual is shown only to admins. Admins see three extra menu items, **History**, **People** and **Import package**, and extra controls on release, construct and decision pages.

| Task | Where |
| --- | --- |
| Invite, change or remove people | People |
| Add or replace a release | Import package |
| Choose the release the site opens on; hide or show a release | Release Settings panel on a release's home page |
| Set a comment's status | The Status menu on each comment |
| Record a decision's outcome | Record the Outcome panel on a decision's page |
| See releases over time | History |
| Publish a new version of the site | Terminal on the Mac with the site's folder |

### Inviting People

1. Click **People**.
2. Type the address, choose **Member** or **Admin**, and click **Add person**. They can sign in at once; nothing needs publishing.
3. The site sends no email. Click **open a ready-made invitation in your mail program** in the confirmation, or **Email invitation** in the table, and send it.

To change a role, pick it in the table; it applies the next time the person opens the site. To remove someone, click **Remove**; their comments and positions stay. You cannot remove yourself.

The site's owners are named in its setup file (`config/members.json`, never committed) and always have admin access, so the site can never be locked out. They do not appear on the People page. Changing owners means editing that file and publishing.

### Importing a Release

Release packages are built by Xcential from the uslm2 repository and arrive as zip files. Unzip them first; you import the folder.

1. Click **Import package**.
2. Choose one package folder, for example `uslm-2.1.3-rc1` (the folder that holds `manifest.json`), and click **Upload** if the browser asks.
3. Click **Check and import** and wait for "**... is imported**". Every file is checked against the fingerprint in the manifest before anything is uploaded; a changed or missing file stops the import.
4. Repeat for the next package. Import one folder at a time.

Import older releases first: a release's What changed page and compatibility need the release it builds on to be on the site. Importing a release that is already there asks to replace it; your settings, comments and positions are kept. Packages with samples are about 18 MB and take a minute or two.

### Choosing What Members See

On any release's home page, admins see the **Release Settings (Admins)** panel:

- **Open the site on this release** makes it the release everyone lands on.
- **Hide from members** takes it off members' lists and pages; admins still see it, marked "Hidden from members". **Show to members** brings it back.

Hiding controls what the site shows, not who can read the files: an invited person who knows a file's path can still read it. Use it to stage what the group reviews, not to keep anything confidential.

### Running the Review

- **Comments:** each comment has a **Status** menu for admins. Set it as the group works through comments: accepted, rejected, deferred, or addressed once a release fixes it.
- **Decisions:** on a decision's page, the **Record the Outcome** panel records **Ratify** (the proposed option), **Changed to another option** (pick it), or **Reopen**, with a note such as the meeting and what was said. Each recording is kept in the history. Positions close while a decision is ratified or changed.
- **New decisions** come from the decision register in GitHub (`decisions/README.md`) and appear when a package carrying them is imported.

### Release History

**History** shows every imported release on a timeline, hidden releases included.

- **How Much Changed:** each release sits at its release point (when its changes stopped) and the line climbs by the elements and types it added, changed or removed against the release it builds on. Blue is GPO, orange is Xcential; a dashed line is a draft built on an older release, such as 2.2.0-rc1 on 2.1.0.
- **How Many Real Documents Each Release Accepts:** the share of GPO's 160 published samples each release's schema accepts, from 2.0.12 on.

Hover a release for its numbers; click it to open What changed. **Show the numbers and where each date comes from** lists every count and the evidence for each release point, such as the date of release written in the schema header.

### Publishing a New Version of the Site

When Xcential changes the site, publish it from the Mac:

1. Open **Terminal** and type `cd ~/Projects/schema-review-site`, then press Return.
2. Type `git pull` and press Return.
3. Type `npm run deploy` and press Return, and wait for **Deploy complete!**. If Firebase asks whether Cloud Storage may read Firestore, answer yes.
4. Reload the site.

### When Something Goes Wrong

| What you see | What to do |
| --- | --- |
| **No Access Yet** for someone you invited | They signed in with another address. Check the People page for the exact address they used. |
| "That sign-in link can no longer be used" | Links work once and expire. Ask for a new one, or use Sign in with Google. |
| `auth/operation-not-allowed` when asking for a link | In the Firebase console, Authentication, Sign-in method, Email/Password: turn on both switches, including Email link. |
| "Release ... has not been imported, so changes cannot be listed" | Import the release it builds on. |
| "This folder has no manifest.json" | Choose the unzipped package folder itself, not the folder around it or the zip. |
| History says it needs releases with recorded release points | Re-import the packages built with release dates. |
| Anything else | Note the page address and take a screenshot for Xcential. |

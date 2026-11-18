# Setting Up and Running the Site

## First deployment

1. **Get the code** on the computer that has the Firebase CLI:

   ```
   cd ~/Projects
   git clone https://github.com/martybick/schema-review-site
   cd schema-review-site
   npm install
   ```

2. **Name the owners.** Copy `config/members.example.json` to `config/members.json` and list the
   owners under `admins` (Xcential staff who run the review). Owners always have admin access, even
   if the People page is emptied. `users` may stay empty: everyone else is invited on the People
   page. This file is not committed.

3. **Create the Firestore database** (once) in the Firebase console: Firestore Database → Create
   database, production mode. Comments, positions, recorded decisions and the People list live there.

4. **Deploy:** `npm run deploy`. It regenerates `storage.rules` and `firestore.rules` from the owners
   list, then deploys Hosting and both sets of rules. The first time, Firebase may ask whether Cloud
   Storage may read Firestore (the Storage rules look up the People list); answer yes. The site is at https://uslm-166f4.web.app.
   No CORS setting is needed: the site reads Storage through Firebase's API, which accepts any
   origin, and `storage.rules` decides who may read. (`cors.json` is kept in case packages are
   ever read straight from the bucket's `storage.googleapis.com` address.)

5. **Check sign-in settings** in the Firebase console, Authentication → Sign-in method:
   - **Google** enabled, for "Sign in with Google".
   - **Email/Password** with **both** switches on, Email/Password and **Email link (passwordless
     sign-in)**. Without the second, asking for a link fails with `auth/operation-not-allowed`.

## Inviting people

An admin opens **People**, types the address, picks Member or Admin and chooses **Add person**. No
deploy is needed. The site sends no email itself; the confirmation offers a ready-made invitation
that opens in the admin's mail program. Tell the person to open the site and choose **Sign in with Google** if that address is a Google account
(Google Workspace included), or ask for a sign-in link by email. Someone not on the list can still ask for a
link, but sees "No Access Yet" and can read nothing.

To remove someone, choose **Remove** next to their address. Their comments and positions stay.
Owners are removed only by editing `config/members.json` and deploying.

## Importing a release package

1. Build the package with the packager in the modeling repository (`packaging/README.md` there).
2. Unzip it, so you have a folder such as `uslm-2.2.0-rc1/` with `manifest.json` inside.
3. Sign in as an admin, open **Import package**, choose that folder, and select **Check and import**.

Import the release a candidate builds on too (for 2.2.0-rc1, that is 2.1.0). The release home
compares the two, and construct pages show what is new or changed.

## Running locally

```
npm run emulators
```

Open http://127.0.0.1:5000. Sign-in links appear in the Auth emulator at http://127.0.0.1:4000/auth
(the emulator does not send email). Local data is discarded when the emulators stop.

## End-to-end test

`tests/e2e/test_site.py` signs in as an admin, imports packages, and checks every page and feature:
releases, What changed, validation, constructs, comments, decisions and positions, People, release
settings, History and Help, then a member, someone added on the People page, and an uninvited
address, including what the database rules refuse. It ends by checking every kind of page against
WCAG 2.2 AA with axe-core (`npm install` provides it); a new contrast, label or heading problem fails
the test. It needs the emulators running, a `config/members.json` with
`admin@test.example` as admin and `member@test.example` as user (then `npm run rules`), Python
Playwright with Chrome, and the 2.1.0 and 2.2.0-rc1 packages unzipped under one folder:

```
PACKAGES=/path/to/packages python3 tests/e2e/test_site.py
```

Set `CHROME=/path/to/chrome` to use an installed Chrome instead of Playwright's own browser.

## Choosing what the working group sees

On any release's home page, admins see a **Release Settings (Admins)** panel:

- **Open the site on this release** makes it the release everyone lands on.
- **Hide from members** takes it off members' lists and pages; admins still see it, marked
  "Hidden from members". **Show to members** brings it back.

Hiding controls what the site shows, not who can read the files: the package stays in Storage,
readable to anyone invited who knows its path. Use it to stage what the group reviews, not to keep
anything secret.

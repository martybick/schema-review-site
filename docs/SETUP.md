# Setting Up and Running the Site

## First deployment

1. **Get the code** on the computer that has the Firebase CLI:

   ```
   cd ~/Projects
   git clone https://github.com/martybick/schema-review-site
   cd schema-review-site
   npm install
   ```

2. **Write the invitation list.** Copy `config/members.example.json` to `config/members.json` and
   list the admins (Xcential staff who run the review) and users (everyone else invited). This file
   is not committed.

3. **Let the site read from Storage (once).** Browsers need the bucket to allow the site's address.
   In the Google Cloud console for `uslm-166f4`, open Cloud Shell, upload `cors.json`, and run:

   ```
   gcloud storage buckets update gs://uslm-166f4.firebasestorage.app --cors-file=cors.json
   ```

4. **Deploy:** `npm run deploy`. It regenerates `storage.rules` from the invitation list, then
   deploys Hosting and the Storage rules. The site is at https://uslm-166f4.web.app.

5. **Check sign-in settings** in the Firebase console, Authentication: Email/Password enabled with
   **Email link (passwordless sign-in)**; `uslm-166f4.web.app` among the authorized domains.

## Inviting people

Add the address to `config/members.json` (under `admins` or `users`) and run `npm run deploy`. Tell
the person to open the site and ask for a sign-in link. Someone not on the list can still ask for a
link, but sees "No Access Yet" and can read nothing.

Removing someone works the same way: delete the address and deploy.

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

`tests/e2e/test_site.py` signs in as an admin, imports packages, and checks every slice 1 page, then
checks a user and an uninvited address. It needs the emulators running, a `config/members.json` with
`admin@test.example` as admin and `member@test.example` as user (then `npm run rules`), Python
Playwright with Chrome, and the 2.1.0 and 2.2.0-rc1 packages unzipped under one folder:

```
PACKAGES=/path/to/packages python3 tests/e2e/test_site.py
```

Set `CHROME=/path/to/chrome` to use an installed Chrome instead of Playwright's own browser.

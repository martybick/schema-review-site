"""End-to-end check of the schema review site against the Firebase emulators.

Signs in by email link as an admin, imports the 2.1.0 and 2.2.0-rc1 packages,
checks the release, validation and construct pages, then checks a user and an
uninvited address. Screenshots go to /home/claude/e2e/shots.
"""
import json
import os
import shutil
import tempfile
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright, expect

SITE = 'http://127.0.0.1:5000'
OOB = 'http://127.0.0.1:9099/emulator/v1/projects/uslm-166f4/oobCodes'
PACKAGES = os.environ.get('PACKAGES', '../packages')
SHOTS = os.environ.get('SHOTS', 'tests/e2e/shots')
os.makedirs(SHOTS, exist_ok=True)
failures = []


def check(condition, label):
    print(('PASS ' if condition else 'FAIL ') + label)
    if not condition:
        failures.append(label)


def sign_in(page, email, start='/'):
    page.goto(SITE + start)
    page.get_by_label('Email address').fill(email)
    page.get_by_role('button', name='Email me a sign-in link').click()
    expect(page.get_by_text('A sign-in link is on its way')).to_be_visible(timeout=15000)
    codes = json.load(urllib.request.urlopen(OOB))['oobCodes']
    code = [c for c in codes if c['email'] == email and c['requestType'] == 'EMAIL_SIGNIN'][-1]
    page.goto(f"{SITE}/?mode=signIn&oobCode={code['oobCode']}&apiKey=fake-api-key&lang=en")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
    console_errors = []

    # Admin: sign in, import, browse.
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    page.on('console', lambda message: console_errors.append(message.text + ' ' + str(message.location.get('url'))) if message.type == 'error' else None)
    sign_in(page, 'admin@test.example')
    expect(page.get_by_role('heading', name='No Releases Yet')).to_be_visible(timeout=20000)
    check(page.get_by_text('admin@test.example · Admin').is_visible(), 'admin sees their role in the header')
    check(page.locator('#nav-import').is_visible(), 'admin sees Import package')

    for package_name in ['uslm-2.1.0', 'uslm-2.2.0-rc1']:
        page.goto(SITE + '/#/import')
        expect(page.get_by_role('heading', name='Import a Release Package')).to_be_visible()
        page.locator('input[name="folder"]').set_input_files(os.path.join(PACKAGES, package_name))
        page.get_by_role('button', name='Check and import').click()
        expect(page.get_by_text(f'{package_name} is imported')).to_be_visible(timeout=300000)
        print(f'imported {package_name}')
    page.screenshot(path=f'{SHOTS}/1-import.png', full_page=True)

    # A tampered package is refused.
    page.goto(SITE + '/#/import')
    tampered_root = tempfile.mkdtemp()
    tampered = os.path.join(tampered_root, 'uslm-2.1.0')
    shutil.copytree(os.path.join(PACKAGES, 'uslm-2.1.0'), tampered)
    with open(f'{tampered}/stylesheets/uslm.css', 'a') as handle:
        handle.write('\n/* changed */\n')
    page.locator('input[name="folder"]').set_input_files(tampered)
    page.get_by_role('button', name='Check and import').click()
    expect(page.get_by_text('does not match its manifest')).to_be_visible(timeout=60000)
    check(True, 'a package changed after it was built is refused')

    # Release home.
    page.goto(SITE + '/#/')
    expect(page.get_by_role('heading', name='USLM 2.2.0-rc1')).to_be_visible(timeout=30000)
    expect(page.get_by_role('heading', name='Changes Since 2.1.0')).to_be_visible(timeout=60000)
    expect(page.get_by_role('heading', name='Decisions', exact=True)).to_be_visible(timeout=30000)
    body = page.inner_text('main')
    check('28 of 28' in body and '117 of 143' in body, 'release home shows 28 of 28 and 117 of 143 valid')
    check('136 in 9 samples' in body, 'release home shows 136 rule errors in 9 samples')
    check('10 of 126 samples valid under 2.1.0 are now invalid' in body, 'release home shows the compatibility break')
    check('How to record a floor vote by name' in body and 'Proposed: B, a new element' in body, 'decision D1 listed with its proposed choice')
    check('hdoc and floor-day patterns' in body, 'D5 open part listed')
    check(page.locator('#other-releases a', has_text='USLM 2.1.0').count() == 1, 'release home links the other imported releases')
    rows = page.locator('#changes tbody tr').all_inner_texts()
    print('changes rows:', rows)
    check(any(row.startswith('Elements\t77\t') for row in rows), 'changes table: 77 new elements, as the packager comparison found')
    page.screenshot(path=f'{SHOTS}/2-release-home.png', full_page=True)

    # Validation.
    page.get_by_role('link', name='Validation and coverage').click()
    expect(page.get_by_role('heading', name='Validation and Coverage')).to_be_visible(timeout=30000)
    totals = [int(text.replace(',', '')) for text in page.locator('#rule-errors .list-rows > li > span:first-child').all_inner_texts()]
    print('rule error groups:', totals)
    page.locator('a[data-jump="rule-errors"]').first.click()
    page.wait_for_timeout(800)
    check('#/' in page.url and page.locator('#rule-errors').is_visible(), 'the rule error count jumps to the Rule Errors section and stays on the page')
    check(sum(totals) == 136, 'grouped rule errors add up to 136')
    check(page.locator('#compatibility li').count() == 10, 'compatibility lists the 10 broken samples')
    body = page.inner_text('main')
    check('uslm-meta-senate.xsd' in body and 'processing instructions removed' in body, 'run notes show the skipped import and the SaxonJS retry')
    page.screenshot(path=f'{SHOTS}/3-validation.png', full_page=True)

    # Construct list and rollCall.
    page.get_by_role('link', name='Constructs').first.click()
    page.get_by_label('Find a construct by name').fill('rollCall')
    page.get_by_role('link', name='rollCall', exact=True).first.click()
    expect(page.get_by_role('heading', name='<rollCall>')).to_be_visible(timeout=30000)
    expect(page.get_by_text('New in 2.2.0-rc1')).to_be_visible(timeout=60000)
    body = page.inner_text('main')
    check('lines 9378–9413' in body, 'rollCall source shows lines 9378–9413')
    check('floorActions' in body and 'legislativeDay' in body, 'rollCall lists floorActions and legislativeDay as parents')
    check('extends BaseBlockType' in body and 'rollCallMeta' in body, 'rollCall content model shows the extension and rollCallMeta')
    check('D1' in body, 'rollCall links decision D1')
    page.screenshot(path=f'{SHOTS}/4-construct.png', full_page=True)

    # A changed construct.
    page.goto(SITE + '/#/releases/uslm-2.2.0-rc1/constructs/element/citableAsShortTitle')
    expect(page.get_by_text('Defined differently in 2.1.0')).to_be_visible(timeout=60000)
    check(True, 'citableAsShortTitle shows as changed since 2.1.0')
    expect(page.get_by_role('heading', name='What Changed Since 2.1.0')).to_be_visible(timeout=30000)
    check(page.locator('#construct-diff .diff-line--added').count() + page.locator('#construct-diff .diff-line--removed').count() > 0, 'a changed construct shows its line diff')

    # What changed, line by line.
    page.goto(SITE + '/#/releases/uslm-2.2.0-rc1/changes')
    expect(page.get_by_role('heading', name='What Changed in 2.2.0-rc1')).to_be_visible(timeout=60000)
    body = page.inner_text('main').lower()
    check('changed (24)' in body and 'new (77)' in body, 'changes page lists 77 new and 24 changed elements')
    first = page.locator('details.change').first
    first.locator('summary').click()
    expect(first.locator('.diff')).to_be_visible(timeout=15000)
    check(first.locator('.diff-line--added, .diff-line--removed').count() > 0, 'opening a changed construct shows its diff')
    check(page.locator('details.change .change-label', has_text='documentation only').count() + page.locator('details.change .change-label', has_text='definition changed').count() == page.locator('details.change').count(), 'each change says whether only documentation changed')
    expect(page.get_by_role('heading', name='Package Files')).to_be_visible()
    check(page.locator('#files-heading ~ div h3', has_text='Samples').count() == 1, 'changes page shows package file differences')
    page.screenshot(path=f'{SHOTS}/9-changes.png', full_page=False)

    # Slice 2 as admin: a comment, a position, and inviting someone.
    page.goto(SITE + '/#/releases/uslm-2.2.0-rc1/constructs/element/rollCall')
    expect(page.get_by_role('heading', name='Add a Comment')).to_be_visible(timeout=60000)
    page.get_by_label('Type').select_option('naming')
    page.get_by_role('textbox', name='Comment').fill('Should `rollCall` be named `floorVote`?')
    page.get_by_role('button', name='Post comment').click()
    expect(page.get_by_role('heading', name='Comments (1)')).to_be_visible(timeout=15000)
    check(page.locator('.comment-body code', has_text='floorVote').count() == 1, 'admin posts a naming comment on rollCall, with code formatting')

    page.goto(SITE + '/#/releases/uslm-2.2.0-rc1/decisions/D1')
    expect(page.get_by_role('heading', name='How to record a floor vote by name')).to_be_visible(timeout=30000)
    check(page.locator('.choice-list li.is-chosen', has_text='Option B').count() == 1, 'D1 marks option B as proposed')
    page.get_by_label('Support').check()
    page.get_by_label('Reason (optional)').fill('Clearer for floor votes.')
    page.get_by_role('button', name='Save position').click()
    expect(page.get_by_text('1 support')).to_be_visible(timeout=15000)
    check(page.locator('p.small', has_text='Clearer for floor votes.').is_visible(), 'admin states a position with a reason')

    page.goto(SITE + '/#/decisions')
    expect(page.get_by_role('heading', name='Decisions', exact=True)).to_be_visible(timeout=30000)
    check(page.locator('tbody tr').count() == 12, 'decision list shows D1 to D12')
    check('0 of 12 settled' in page.inner_text('main'), 'decision list shows none settled')

    check(page.locator('#nav-people').is_visible(), 'admin sees People')
    page.goto(SITE + '/#/people')
    expect(page.get_by_role('heading', name='Invite Someone')).to_be_visible(timeout=15000)
    page.get_by_label('Email address').fill('Newcomer@Test.example')
    page.get_by_role('button', name='Add person').click()
    expect(page.get_by_text('newcomer@test.example can now sign in.')).to_be_visible(timeout=15000)
    check(page.locator('tbody th', has_text='newcomer@test.example').count() == 1, 'admin adds newcomer@test.example on the People page (lower-cased)')
    check('mailto:newcomer%40test.example' in page.content(), 'People page offers a ready-made invitation email')
    page.get_by_label('Email address').fill('newcomer@test.example')
    page.get_by_role('button', name='Add person').click()
    expect(page.get_by_text('already on the list')).to_be_visible()
    check(True, 'adding the same person twice is refused')
    page.screenshot(path=f'{SHOTS}/6-people.png', full_page=True)
    context.close()

    # Invited user: a shared link survives sign-in; no import; staying signed in.
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    sign_in(page, 'member@test.example', '/#/releases/uslm-2.2.0-rc1/constructs/element/rollCall')
    expect(page.get_by_role('heading', name='<rollCall>')).to_be_visible(timeout=30000)
    check(True, 'a shared link opened while signed out leads to that page after sign-in')
    expect(page.get_by_text('You are signed in on this browser, and you will stay signed in.')).to_be_visible()
    check(True, 'the welcome note appears after the first sign-in')
    page.get_by_role('button', name='Got it').click()
    page.reload()
    expect(page.get_by_role('heading', name='<rollCall>')).to_be_visible(timeout=30000)
    check(not page.get_by_text('you will stay signed in.').is_visible(), 'the welcome note stays dismissed after a reload')
    check(page.locator('#site-user').get_by_text('member@test.example').is_visible(), 'still signed in after a reload')
    page.goto(SITE + '/#/')
    expect(page.get_by_role('heading', name='USLM 2.2.0-rc1')).to_be_visible(timeout=30000)
    check(not page.locator('#nav-import').is_visible(), 'user does not see Import package')
    page.goto(SITE + '/#/import')
    expect(page.get_by_text('Only admins can import release packages.')).to_be_visible()
    check(True, 'user is refused the import page')

    # Slice 2 as a member: reply, oppose, and the rules hold.
    check(not page.locator('#nav-people').is_visible(), 'user does not see People')
    page.goto(SITE + '/#/people')
    expect(page.get_by_text('Only admins can manage people.')).to_be_visible()
    check(True, 'user is refused the People page')
    page.goto(SITE + '/#/releases/uslm-2.2.0-rc1/constructs/element/rollCall')
    expect(page.get_by_role('heading', name='Comments (1)')).to_be_visible(timeout=60000)
    page.get_by_role('button', name='Reply').click()
    page.get_by_label('Your reply').fill('Keep rollCall; it is the Clerk\'s term.')
    page.get_by_role('button', name='Post reply').click()
    expect(page.get_by_text("it is the Clerk's term")).to_be_visible(timeout=15000)
    check(page.locator('select[data-status-for]').count() == 0, 'member replies, and sees no status control')
    page.goto(SITE + '/#/releases/uslm-2.2.0-rc1/decisions/D1')
    expect(page.get_by_text('1 support')).to_be_visible(timeout=30000)
    page.get_by_label('Oppose').check()
    page.get_by_role('button', name='Save position').click()
    expect(page.get_by_text('1 oppose')).to_be_visible(timeout=15000)
    check(page.locator('#record-form').count() == 0, 'member opposes D1, and sees no outcome form')
    denied = page.evaluate("""async () => {
      const { services } = await import('/src/firebase.js');
      const fs = await import('https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js');
      const results = {};
      const attempt = async (name, work) => { try { await work(); results[name] = 'allowed'; } catch (error) { results[name] = error.code; } };
      await attempt('member', () => fs.setDoc(fs.doc(services.db, 'members', 'me@test.example'), { email: 'me@test.example', role: 'admin', addedBy: 'member@test.example', addedAt: fs.serverTimestamp() }));
      await attempt('record', () => fs.setDoc(fs.doc(services.db, 'decisionRecords', 'uslm-D2'), { decisionKey: 'uslm-D2', project: 'uslm', decisionID: 'D2', status: 'ratified', option: 'A', note: '', recordedBy: 'member@test.example', recordedAt: fs.serverTimestamp() }));
      await attempt('otherPosition', () => fs.setDoc(fs.doc(services.db, 'positions', 'uslm-D2__admin@test.example'), { decisionKey: 'uslm-D2', project: 'uslm', email: 'admin@test.example', name: 'x', position: 'support', reason: '', updatedAt: fs.serverTimestamp() }));
      return results;
    }""")
    check(all(value == 'permission-denied' for value in denied.values()), f'a member cannot add people, record decisions or speak for others: {denied}')
    page.once('dialog', lambda dialog: dialog.dismiss())
    page.get_by_role('button', name='Sign out').click()
    page.wait_for_timeout(1000)
    check(page.locator('#site-user').get_by_text('member@test.example').is_visible(), 'cancelling the sign-out question keeps the person signed in')
    page.once('dialog', lambda dialog: dialog.accept())
    page.get_by_role('button', name='Sign out').click()
    expect(page.get_by_role('heading', name='Sign In to USLM 2 Review')).to_be_visible(timeout=15000)
    check(page.get_by_label('Email address').input_value() == 'member@test.example', 'the sign-in form remembers the email address')
    context.close()

    # Link opened in a different browser: confirm the email, double-click
    # Sign in, then reuse the same link in a third browser.
    asker = browser.new_context().new_page()
    asker.goto(SITE + '/')
    asker.get_by_label('Email address').fill('member@test.example')
    asker.get_by_role('button', name='Email me a sign-in link').click()
    expect(asker.get_by_text('A sign-in link is on its way')).to_be_visible(timeout=15000)
    codes = json.load(urllib.request.urlopen(OOB))['oobCodes']
    code = [c for c in codes if c['email'] == 'member@test.example' and c['requestType'] == 'EMAIL_SIGNIN'][-1]
    link = f"{SITE}/?mode=signIn&oobCode={code['oobCode']}&apiKey=fake-api-key&lang=en"
    other = browser.new_context().new_page()
    other.goto(link)
    expect(other.get_by_role('heading', name='Finish Signing In')).to_be_visible(timeout=15000)
    other.get_by_label('Email address').fill('member@test.example')
    other.get_by_role('button', name='Sign in').dblclick()
    expect(other.get_by_role('heading', name='USLM 2.2.0-rc1')).to_be_visible(timeout=30000)
    check(True, 'a link opened in another browser signs in, even with a double click')
    third = browser.new_context().new_page()
    third.goto(link)
    expect(third.get_by_role('heading', name='Finish Signing In')).to_be_visible(timeout=15000)
    third.get_by_label('Email address').fill('member@test.example')
    third.get_by_role('button', name='Sign in').click()
    expect(third.get_by_text('That sign-in link can no longer be used')).to_be_visible(timeout=15000)
    check(third.get_by_role('button', name='Email me a sign-in link').is_visible(), 'a used link explains itself and offers a new one')
    for page_to_close in (asker, other, third):
        page_to_close.context.close()

    # Sign in with Google (the Auth emulator's stand-in Google account).
    google_page = browser.new_context().new_page()
    google_page.goto(SITE + '/#/validation')
    expect(google_page.get_by_role('button', name='Sign in with Google')).to_be_visible(timeout=20000)
    with google_page.expect_popup() as popup_info:
        google_page.get_by_role('button', name='Sign in with Google').click()
    popup = popup_info.value
    popup.get_by_role('button', name='Add new account').click()
    popup.locator('#email-input').fill('member@test.example')
    popup.get_by_role('button', name='Sign in with Google.com').click()
    expect(google_page.get_by_role('heading', name='Validation and Coverage')).to_be_visible(timeout=30000)
    check(True, 'Sign in with Google works for an invited address and keeps the page')
    google_page.context.close()

    # Admin ratifies D1; positions close, even when written directly.
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    sign_in(page, 'admin@test.example', '/#/releases/uslm-2.2.0-rc1/decisions/D1')
    expect(page.get_by_role('heading', name='Record the Outcome')).to_be_visible(timeout=30000)
    page.get_by_label('Note (for example, the meeting and what was said)').fill('Working group meeting, 2026-12-03.')
    page.get_by_role('button', name='Record').click()
    expect(page.get_by_text('Positions are closed')).to_be_visible(timeout=15000)
    check(page.locator('h1 + .pill', has_text='Ratified').count() == 1, 'admin ratifies D1')
    check(page.locator('p.small', has_text='Working group meeting, 2026-12-03.').is_visible(), 'the ratification note shows in the history')
    page.screenshot(path=f'{SHOTS}/7-decision.png', full_page=True)
    page.goto(SITE + '/#/releases/uslm-2.2.0-rc1/constructs/element/rollCall')
    expect(page.locator('select[data-status-for]')).to_be_visible(timeout=60000)
    page.locator('select[data-status-for]').select_option('rejected')
    page.wait_for_timeout(1500)
    page.reload()
    expect(page.locator('select[data-status-for]')).to_have_value('rejected', timeout=60000)
    check(True, 'admin marks the naming comment rejected')
    context.close()

    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    sign_in(page, 'member@test.example', '/#/releases/uslm-2.2.0-rc1/decisions/D1')
    expect(page.get_by_text('Positions are closed')).to_be_visible(timeout=30000)
    blocked = page.evaluate("""async () => {
      const { services } = await import('/src/firebase.js');
      const fs = await import('https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js');
      try {
        await fs.setDoc(fs.doc(services.db, 'positions', 'uslm-D1__member@test.example'), { decisionKey: 'uslm-D1', project: 'uslm', email: 'member@test.example', name: 'm', position: 'support', reason: '', updatedAt: fs.serverTimestamp() });
        return 'allowed';
      } catch (error) { return error.code; }
    }""")
    check(blocked == 'permission-denied', f'positions on a ratified decision are refused by the rules: {blocked}')
    context.close()

    # Someone invited on the People page: the database rules treat them as a
    # member. KLUDGE: the Storage emulator's lookup of the members list goes
    # through this workspace's HTTPS proxy, which refuses it, so whether they
    # can also read packages is checked on the live site after deploying.
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    sign_in(page, 'newcomer@test.example')
    page.wait_for_timeout(3000)
    newcomer = page.evaluate("""async () => {
      const { services } = await import('/src/firebase.js');
      const fs = await import('https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js');
      const results = {};
      const attempt = async (name, work) => { try { await work(); results[name] = 'allowed'; } catch (error) { results[name] = error.code; } };
      await attempt('readMembers', () => fs.getDocs(fs.collection(services.db, 'members')));
      await attempt('comment', () => fs.addDoc(fs.collection(services.db, 'comments'), { target: 'uslm|decision|D2', project: 'uslm', release: '2.2.0-rc1', targetKind: 'decision', targetKey: 'D2', type: 'question', body: 'Does this cover Senate votes?', parentID: null, authorEmail: 'newcomer@test.example', authorName: 'newcomer@test.example', createdAt: fs.serverTimestamp(), status: 'open' }));
      await attempt('position', () => fs.setDoc(fs.doc(services.db, 'positions', 'uslm-D2__newcomer@test.example'), { decisionKey: 'uslm-D2', project: 'uslm', email: 'newcomer@test.example', name: 'n', position: 'abstain', reason: '', updatedAt: fs.serverTimestamp() }));
      return results;
    }""")
    check(all(value == 'allowed' for value in newcomer.values()), f'a person added on the People page can read, comment and state positions: {newcomer}')
    context.close()

    # Staging a demo: the site opens on 2.1.0 and 2.2.0-rc1 is hidden from members.
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    sign_in(page, 'admin@test.example', '/#/releases/uslm-2.1.0')
    expect(page.get_by_role('heading', name='Release Settings (Admins)')).to_be_visible(timeout=30000)
    page.get_by_role('button', name='Open the site on this release').click()
    expect(page.get_by_text('The site opens on this release.')).to_be_visible(timeout=15000)
    page.goto(SITE + '/#/releases/uslm-2.2.0-rc1')
    expect(page.get_by_role('button', name='Hide from members')).to_be_visible(timeout=30000)
    page.get_by_role('button', name='Hide from members').click()
    expect(page.get_by_role('button', name='Show to members')).to_be_visible(timeout=15000)
    check(page.get_by_text('Hidden from members', exact=True).first.is_visible(), 'admin hides 2.2.0-rc1 and still sees it, marked hidden')
    page.goto(SITE + '/#/')
    expect(page.get_by_role('heading', name='USLM 2.1.0')).to_be_visible(timeout=30000)
    check(True, 'the site opens on the release the admin chose')
    page.get_by_role('link', name='History').click()
    expect(page.get_by_role('heading', name='Release History')).to_be_visible(timeout=60000)
    check(page.locator('.history-cell').count() == 7, 'History shows one release column across seven lanes')
    page.locator('.history-cell').nth(5).hover()
    check(page.locator('.history-tooltip').is_visible(), 'hovering a History cell shows its counts')
    context.close()

    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    sign_in(page, 'member@test.example')
    expect(page.get_by_role('heading', name='USLM 2.1.0')).to_be_visible(timeout=30000)
    page.wait_for_timeout(1500)
    check(page.locator('#other-releases a', has_text='2.2.0-rc1').count() == 0 and page.locator('#release-settings').count() == 0, 'a member sees no hidden release and no release settings')
    check(not page.locator('#nav-history').is_visible(), 'a member does not see History')
    page.goto(SITE + '/#/releases/uslm-2.2.0-rc1')
    expect(page.get_by_text('No release package named uslm-2.2.0-rc1')).to_be_visible(timeout=30000)
    check(True, 'a hidden release is not shown to members by its address either')
    context.close()

    stranger = browser.new_context().new_page()
    sign_in(stranger, 'stranger@test.example')
    stranger.wait_for_timeout(3000)
    refused = stranger.evaluate("""async () => {
      const { services } = await import('/src/firebase.js');
      const fs = await import('https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js');
      try { await fs.getDocs(fs.collection(services.db, 'comments')); return 'allowed'; } catch (error) { return error.code; }
    }""")
    check(refused == 'permission-denied', f'an uninvited person cannot read comments: {refused}')
    stranger.context.close()

    # Uninvited address.
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    page = context.new_page()
    sign_in(page, 'stranger@test.example')
    expect(page.get_by_role('heading', name='No Access Yet')).to_be_visible(timeout=30000)
    check(not page.locator('#site-nav').is_visible(), 'uninvited person sees no navigation')
    page.screenshot(path=f'{SHOTS}/5-not-invited-phone.png', full_page=True)
    context.close()
    browser.close()

    relevant = [error for error in console_errors if 'check' not in error]  # role checks read objects that never exist, by design
    print('console errors:', relevant[:10])
    check(len(relevant) == 0, 'no console errors for the admin session')

print(f'\n{len(failures)} failures')
sys.exit(1 if failures else 0)

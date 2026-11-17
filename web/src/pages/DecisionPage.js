/**
 * @file DecisionPage.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import { CommentThread } from '../CommentThread.js';
import { DataStore } from '../DataStore.js';
import { escapeHTML, formatDate } from '../html.js';
import { renderMarkdown } from '../markdown.js';
import { getDecisionLink, getProposedOption, getReleaseLink, loadDecisions, summarizeChoice } from './shared.js';

// ----------------------------------------------------------------------------
// Functions
// ----------------------------------------------------------------------------

// NOTE: a decision is settled once the working group has ratified it or
// recorded a different choice; reopening it unsettles it again.
export function isSettled (
  record
) {
  return record?.status === 'ratified' || record?.status === 'changed';
}

export function renderStatusPill (
  record
) {
  const status = record?.status ?? 'proposed';
  const label = DataStore.DECISION_STATUSES[status] ?? status;
  const option = status === 'changed' && record.option ? ` to ${record.option}` : '';
  return `<span class="pill${isSettled(record) ? ' pill--navy' : ''}">${escapeHTML(label + option)}</span>`;
}

export function countPositions (
  positions
) {
  const counts = { support: 0, oppose: 0, abstain: 0 };
  for (const entry of positions) {
    if (entry.position in counts) {
      counts[entry.position] += 1;
    }
  }
  return counts;
}

export function renderTally (
  counts
) {
  return `<span class="tally"><span class="pill pill--support">${counts.support} support</span><span class="pill pill--oppose">${counts.oppose} oppose</span><span class="pill">${counts.abstain} abstain</span></span>`;
}

// NOTE: decisions belong to the release whose register lists them; when the
// release asked for has none, point to the releases that do.
async function renderNoDecisions (
  container,
  store,
  packageEntry
) {
  const others = [];
  for (const entry of await store.listPackages()) {
    if (entry.name !== packageEntry.name && (await loadDecisions(store, entry)) !== null) {
      others.push(entry);
    }
  }
  const links = others.map((entry) => `<li><a href="${getDecisionLink(entry.name)}">Decisions in ${escapeHTML(entry.manifest.release)}</a></li>`).join('');
  container.innerHTML = `
    <section class="stack">
      <h1>Decisions</h1>
      <p>Release ${escapeHTML(packageEntry.manifest.release)} has no decision register.</p>
      ${links ? `<ul style="margin: 0; padding-left: 20px">${links}</ul>` : ''}
      <p><a href="${getReleaseLink(packageEntry.name)}">Back to the release</a></p>
    </section>`;
}

// ----------------------------------------------------------------------------
// DecisionListPage
// ----------------------------------------------------------------------------

// NOTE: every decision in a release's register, with the working group's
// recorded outcome and the tally of positions.
export class DecisionListPage {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Constructor
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  constructor (
    store,
    dataStore,
    packageEntry
  ) {
    this.store = store;
    this.dataStore = dataStore;
    this.packageEntry = packageEntry;
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance properties & methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  async render (
    container
  ) {
    container.innerHTML = '<p class="muted" role="status">Loading decisions…</p>';
    const register = await loadDecisions(this.store, this.packageEntry);
    if (register === null) {
      await renderNoDecisions(container, this.store, this.packageEntry);
      return;
    }
    const project = this.packageEntry.manifest.project;
    const [records, positions, comments] = await Promise.all([
      this.dataStore.listDecisionRecords(project),
      this.dataStore.listPositions(project),
      this.dataStore.listCommentsByKind(project, 'decision')
    ]);
    const rows = register.decisions.map((decision) => {
      const key = DataStore.getDecisionKey(project, decision.id);
      const record = records.get(key);
      const commentCount = comments.filter((comment) => comment.targetKey === decision.id && !comment.parentID).length;
      return `
        <tr>
          <th scope="row"><a href="${getDecisionLink(this.packageEntry.name, decision.id)}">${escapeHTML(decision.id)}</a></th>
          <td><a href="${getDecisionLink(this.packageEntry.name, decision.id)}">${escapeHTML(decision.title)}</a><br><span class="small muted">${escapeHTML(summarizeChoice(decision.modelingChoice))}</span></td>
          <td>${renderStatusPill(record)}</td>
          <td>${renderTally(countPositions(positions.filter((entry) => entry.decisionKey === key)))}</td>
          <td class="num">${commentCount}</td>
        </tr>`;
    }).join('');
    const settledCount = register.decisions.filter((decision) => isSettled(records.get(DataStore.getDecisionKey(project, decision.id)))).length;
    const openIssues = register.openIssues.map((issue) => `<li>${escapeHTML(issue.title)} <span class="muted">(${escapeHTML(issue.decision)})</span></li>`).join('');
    container.innerHTML = `
      <nav aria-label="Breadcrumb" class="small muted"><a href="${getReleaseLink(this.packageEntry.name)}">${escapeHTML(String(project).toUpperCase())} ${escapeHTML(this.packageEntry.manifest.release)}</a> / Decisions</nav>
      <section class="stack">
        <h1>Decisions</h1>
        <p style="max-width: 820px">Each decision is a modeling choice this release makes. Open one to read the options, state your position (support, oppose or abstain, with a reason) and comment. An admin records the working group's outcome: ratified, changed to another option, or reopened.</p>
        <p class="small muted">${settledCount} of ${register.decisions.length} settled.</p>
      </section>
      <div class="table-box">
        <table>
          <thead><tr><th scope="col">ID</th><th scope="col">Decision and proposed choice</th><th scope="col">Status</th><th scope="col">Positions</th><th scope="col" class="num">Comments</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${openIssues ? `<section class="stack"><h2>Still Open in the Register</h2><ul style="margin: 0; padding-left: 20px; font-size: 14px">${openIssues}</ul></section>` : ''}`;
  }
}

// ----------------------------------------------------------------------------
// DecisionPage
// ----------------------------------------------------------------------------

// NOTE: one decision: the options and the proposed choice from the register,
// the members' positions, the admin's recorded outcome with its history, and
// the comments.
export class DecisionPage {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Constructor
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  constructor (
    store,
    dataStore,
    authController,
    packageEntry,
    decisionID
  ) {
    this.store = store;
    this.dataStore = dataStore;
    this.authController = authController;
    this.packageEntry = packageEntry;
    this.decisionID = decisionID;
    this.project = packageEntry.manifest.project;
    this.decisionKey = DataStore.getDecisionKey(this.project, decisionID);
    this.decision = null;
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance internal methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  #renderOptions (
    chosenOption
  ) {
    const items = this.decision.options.map((option) => `
      <li class="${option.label === chosenOption ? 'is-chosen' : ''}">
        <p><strong>Option ${escapeHTML(option.label)}</strong>${option.label === chosenOption ? ' <span class="pill pill--navy">Proposed</span>' : ''}${option.recommended ? ' <span class="pill">Drafters\' recommendation</span>' : ''}</p>
        <p>${escapeHTML(option.text)}</p>
      </li>`).join('');
    return `<ul class="choice-list">${items}</ul>`;
  }

  #renderPositions (
    positions,
    record
  ) {
    const myEmail = this.authController.user.email.toLowerCase();
    const mine = positions.find((entry) => entry.email === myEmail);
    const list = positions
      .slice()
      .sort((first, second) => first.name.localeCompare(second.name))
      .map((entry) => `
        <li class="stack stack--tight" style="padding: 8px 0; border-bottom: 1px solid var(--surface-300)">
          <p style="font-size: 14px"><span class="pill${entry.position === 'support' ? ' pill--support' : entry.position === 'oppose' ? ' pill--oppose' : ''}">${escapeHTML(DataStore.POSITIONS[entry.position] ?? entry.position)}</span> <strong>${escapeHTML(entry.name)}</strong></p>
          ${entry.reason ? `<p class="small">${escapeHTML(entry.reason)}</p>` : ''}
        </li>`).join('');
    let form;
    if (isSettled(record)) {
      form = '<p class="small muted">Positions are closed because this decision is settled. An admin can reopen it.</p>';
    } else {
      form = `
        <form class="form" id="position-form">
          <fieldset style="border: 0; margin: 0; padding: 0">
            <legend style="font-size: 13px; font-weight: 600; margin-bottom: 6px">${mine ? 'Change your position' : 'Your position'}</legend>
            <div class="radio-row">
              ${Object.entries(DataStore.POSITIONS).map(([value, label]) => `<label><input type="radio" name="position" value="${value}"${mine?.position === value ? ' checked' : ''} required> ${label}</label>`).join('')}
            </div>
          </fieldset>
          <label>Reason (optional)
            <textarea name="reason" rows="3" maxlength="2000">${escapeHTML(mine?.reason ?? '')}</textarea>
          </label>
          <div class="row" style="gap: 12px">
            <button class="button" type="submit">${mine ? 'Update position' : 'Save position'}</button>
            ${mine ? '<button class="button button--secondary" type="button" id="withdraw-position">Withdraw</button>' : ''}
          </div>
          <div class="form-status"></div>
        </form>`;
    }
    return `
      <h2>Positions</h2>
      ${renderTally(countPositions(positions))}
      ${positions.length === 0 ? '<p class="small muted">No one has stated a position yet.</p>' : `<ul style="list-style: none; margin: 0; padding: 0">${list}</ul>`}
      ${form}`;
  }

  #renderRecordForm (
    record,
    chosenOption
  ) {
    if (!this.authController.isAdmin) {
      return '';
    }
    const statuses = isSettled(record)
      ? { reopened: 'Reopen' }
      : { ratified: `Ratify${chosenOption ? ` option ${chosenOption}` : ''}`, changed: 'Changed to another option' };
    const optionChoices = this.decision.options.map((option) => `<option value="${escapeHTML(option.label)}">Option ${escapeHTML(option.label)}</option>`).join('');
    return `
      <section class="panel stack" style="padding: 20px">
        <h2>Record the Outcome</h2>
        <p class="small muted">Admins only. Record what the working group agreed, usually after a meeting.</p>
        <form class="form" id="record-form">
          <fieldset style="border: 0; margin: 0; padding: 0">
            <legend style="font-size: 13px; font-weight: 600; margin-bottom: 6px">Outcome</legend>
            <div class="radio-row" style="flex-direction: column; gap: 8px">
              ${Object.entries(statuses).map(([value, label], index) => `<label><input type="radio" name="status" value="${value}"${index === 0 ? ' checked' : ''}> ${escapeHTML(label)}</label>`).join('')}
            </div>
          </fieldset>
          ${isSettled(record) ? '' : `<label id="option-field" hidden>Option chosen<select name="option">${optionChoices}</select></label>`}
          <label>Note (for example, the meeting and what was said)
            <textarea name="note" rows="3" maxlength="2000"></textarea>
          </label>
          <div><button class="button" type="submit">Record</button></div>
          <div class="form-status"></div>
        </form>
      </section>`;
  }

  #renderHistory (
    events
  ) {
    if (events.length === 0) {
      return '';
    }
    const items = events.map((event) => `
      <li class="stack stack--tight" style="padding: 8px 0; border-bottom: 1px solid var(--surface-300)">
        <p style="font-size: 14px">${renderStatusPill(event)} <span class="small muted">${escapeHTML(formatDate(event.recordedAt?.toDate?.()))} by ${escapeHTML(event.recordedBy)}</span></p>
        ${event.note ? `<p class="small">${escapeHTML(event.note)}</p>` : ''}
      </li>`).join('');
    return `<section class="stack"><h3>History</h3><ul style="list-style: none; margin: 0; padding: 0">${items}</ul></section>`;
  }

  #wireForms (
    container,
    chosenOption
  ) {
    const positionForm = container.querySelector('#position-form');
    positionForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const position = positionForm.elements.position.value;
      positionForm.querySelector('button[type="submit"]').disabled = true;
      try {
        await this.dataStore.savePosition(this.project, this.decisionKey, position, positionForm.elements.reason.value.trim());
        await this.render(container);
      } catch (error) {
        positionForm.querySelector('.form-status').innerHTML = `<div class="message message--error" role="alert">Could not save: ${escapeHTML(error.message)}</div>`;
        positionForm.querySelector('button[type="submit"]').disabled = false;
      }
    });
    container.querySelector('#withdraw-position')?.addEventListener('click', async () => {
      try {
        await this.dataStore.withdrawPosition(this.decisionKey);
        await this.render(container);
      } catch (error) {
        positionForm.querySelector('.form-status').innerHTML = `<div class="message message--error" role="alert">Could not withdraw: ${escapeHTML(error.message)}</div>`;
      }
    });
    const recordForm = container.querySelector('#record-form');
    if (!recordForm) {
      return;
    }
    const optionField = recordForm.querySelector('#option-field');
    recordForm.addEventListener('change', () => {
      if (optionField) {
        optionField.hidden = recordForm.elements.status.value !== 'changed';
      }
    });
    recordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = recordForm.elements.status.value;
      const option = status === 'ratified'
        ? chosenOption
        : status === 'changed'
          ? recordForm.elements.option.value
          : null;
      recordForm.querySelector('button[type="submit"]').disabled = true;
      try {
        await this.dataStore.recordDecision(this.project, this.decisionID, {
          status,
          option,
          note: recordForm.elements.note.value.trim()
        });
        await this.render(container);
      } catch (error) {
        recordForm.querySelector('.form-status').innerHTML = `<div class="message message--error" role="alert">Could not record: ${escapeHTML(error.message)}</div>`;
        recordForm.querySelector('button[type="submit"]').disabled = false;
      }
    });
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance properties & methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  async render (
    container
  ) {
    if (this.decision === null) {
      container.innerHTML = '<p class="muted" role="status">Loading the decision…</p>';
      const register = await loadDecisions(this.store, this.packageEntry);
      if (register === null) {
        await renderNoDecisions(container, this.store, this.packageEntry);
        return;
      }
      this.decision = register.decisions.find((decision) => decision.id === this.decisionID) ?? null;
      if (this.decision === null) {
        container.innerHTML = `
          <section class="stack">
            <h1>Not Found</h1>
            <p>Release ${escapeHTML(this.packageEntry.manifest.release)} has no decision ${escapeHTML(this.decisionID)}.</p>
            <p><a href="${getDecisionLink(this.packageEntry.name)}">All decisions</a></p>
          </section>`;
        return;
      }
    }
    const [records, positions, events] = await Promise.all([
      this.dataStore.listDecisionRecords(this.project),
      this.dataStore.listPositions(this.project, this.decisionKey),
      this.dataStore.listDecisionEvents(this.decisionKey)
    ]);
    const record = records.get(this.decisionKey);
    const chosenOption = getProposedOption(this.decision);
    const commentsBox = container.querySelector('#decision-comments');
    container.innerHTML = `
      <nav aria-label="Breadcrumb" class="small muted"><a href="${getReleaseLink(this.packageEntry.name)}">${escapeHTML(String(this.project).toUpperCase())} ${escapeHTML(this.packageEntry.manifest.release)}</a> / <a href="${getDecisionLink(this.packageEntry.name)}">Decisions</a> / ${escapeHTML(this.decision.id)}</nav>
      <section class="stack">
        <p class="eyebrow">Decision ${escapeHTML(this.decision.id)}</p>
        <div class="row" style="gap: 12px; align-items: center">
          <h1>${escapeHTML(this.decision.title)}</h1>
          ${renderStatusPill(record)}
        </div>
        <p style="max-width: 880px"><strong>Proposed:</strong> ${escapeHTML(summarizeChoice(this.decision.modelingChoice))}.</p>
      </section>
      <div class="row">
        <div class="row__main">
          <section class="stack">
            <h2>Options</h2>
            ${this.#renderOptions(chosenOption)}
          </section>
          <section class="stack">
            <h2>From the Decision Register</h2>
            <div class="prose">${renderMarkdown(this.decision.text)}</div>
          </section>
          <section class="stack" id="decision-comments"></section>
        </div>
        <aside class="row__side">
          <section class="stack">${this.#renderPositions(positions, record)}</section>
          ${this.#renderRecordForm(record, chosenOption)}
          ${this.#renderHistory(events)}
        </aside>
      </div>`;
    this.#wireForms(container, chosenOption);
    const newCommentsBox = container.querySelector('#decision-comments');
    if (commentsBox && this.commentThread) {
      newCommentsBox.replaceWith(commentsBox);
    } else {
      this.commentThread = new CommentThread(this.dataStore, this.authController, {
        project: this.project,
        release: this.packageEntry.manifest.release,
        kind: 'decision',
        key: this.decision.id
      });
      await this.commentThread.render(newCommentsBox);
    }
  }
}

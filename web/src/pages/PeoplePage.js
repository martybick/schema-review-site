/**
 * @file PeoplePage.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import { escapeHTML, formatDate } from '../html.js';
import { SITE_CONFIG } from '../siteConfig.js';

// ----------------------------------------------------------------------------
// PeoplePage
// ----------------------------------------------------------------------------

// NOTE: admins invite people by adding their email address here. The site
// sends no email itself; the admin tells the person, and a ready-made
// invitation opens in the admin's own mail program.
export class PeoplePage {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Static variables
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  static ROLE_LABELS = {
    admin: 'Admin',
    user: 'Member'
  };

  static EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Constructor
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  constructor (
    dataStore,
    authController
  ) {
    this.dataStore = dataStore;
    this.authController = authController;
    this.notice = '';
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance internal methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  #getInvitationLink (
    email
  ) {
    const address = `${window.location.origin}/`;
    const subject = `You're invited to ${SITE_CONFIG.siteName}`;
    const body = [
      'Hello,',
      '',
      `You now have access to ${SITE_CONFIG.siteName}, where the working group reviews proposed releases.`,
      '',
      `1. Open ${address}`,
      `2. Choose "Sign in with Google" if ${email} is a Google account. Otherwise, type ${email} and choose "Email me a sign-in link", then open the link in the email.`,
      '',
      'After the first time, you stay signed in on that browser.'
    ].join('\n');
    return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  #renderRows (
    members
  ) {
    const myEmail = this.authController.user.email.toLowerCase();
    return members.map((member) => {
      const isMe = member.email === myEmail;
      const roleOptions = Object.entries(PeoplePage.ROLE_LABELS)
        .map(([value, label]) => `<option value="${value}"${member.role === value ? ' selected' : ''}>${label}</option>`)
        .join('');
      return `
        <tr>
          <th scope="row">${escapeHTML(member.email)}${isMe ? ' <span class="small muted">(you)</span>' : ''}</th>
          <td>
            ${isMe
              ? escapeHTML(PeoplePage.ROLE_LABELS[member.role] ?? member.role)
              : `<select data-role-for="${escapeHTML(member.email)}" aria-label="Role for ${escapeHTML(member.email)}" style="min-height: 32px; padding: 4px 8px">${roleOptions}</select>`}
          </td>
          <td class="small">${escapeHTML(member.addedBy ?? '')}<br><span class="muted">${escapeHTML(formatDate(member.addedAt?.toDate?.()))}</span></td>
          <td>
            <a class="link-button" href="${escapeHTML(this.#getInvitationLink(member.email))}">Email invitation</a>
            ${isMe ? '' : ` · <button type="button" class="link-button" data-remove="${escapeHTML(member.email)}">Remove</button>`}
          </td>
        </tr>`;
    }).join('');
  }

  // NOTE: listeners go on the page's own element, which each render
  // replaces, so nothing lingers on the shared page container.
  #wireEvents (
    root,
    container
  ) {
    const form = root.querySelector('#add-person');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = form.elements.email.value.trim().toLowerCase();
      const status = form.querySelector('.form-status');
      if (!PeoplePage.EMAIL_PATTERN.test(email)) {
        status.innerHTML = '<div class="message message--error" role="alert">That does not look like an email address.</div>';
        return;
      }
      if (root.querySelector(`[data-member="${CSS.escape(email)}"]`)) {
        status.innerHTML = '<div class="message message--error" role="alert">That person is already on the list. Change their role in the table below.</div>';
        return;
      }
      form.querySelector('button[type="submit"]').disabled = true;
      try {
        await this.dataStore.saveMember(email, form.elements.role.value, true);
        this.notice = `
          <div class="message message--success" role="status">
            <p><strong>${escapeHTML(email)} can now sign in.</strong> The site does not send email, so let them know:
            <a href="${escapeHTML(this.#getInvitationLink(email))}">open a ready-made invitation in your mail program</a>.</p>
          </div>`;
        await this.render(container);
      } catch (error) {
        status.innerHTML = `<div class="message message--error" role="alert">Could not add: ${escapeHTML(error.message)}</div>`;
        form.querySelector('button[type="submit"]').disabled = false;
      }
    });
    root.addEventListener('change', async (event) => {
      const select = event.target.closest('[data-role-for]');
      if (!select) {
        return;
      }
      try {
        await this.dataStore.saveMember(select.dataset.roleFor, select.value, false);
        this.notice = `<div class="message message--success" role="status">${escapeHTML(select.dataset.roleFor)} is now ${select.value === 'admin' ? 'an admin' : 'a member'}. The change applies the next time they open the site.</div>`;
        await this.render(container);
      } catch (error) {
        window.alert(`Could not change the role: ${error.message}`);
        await this.render(container);
      }
    });
    root.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-remove]');
      if (!button) {
        return;
      }
      const email = button.dataset.remove;
      if (!window.confirm(`Remove ${email}?\n\nThey will no longer be able to open the site. Their comments and positions stay.`)) {
        return;
      }
      try {
        await this.dataStore.removeMember(email);
        this.notice = `<div class="message message--success" role="status">${escapeHTML(email)} was removed.</div>`;
        await this.render(container);
      } catch (error) {
        window.alert(`Could not remove: ${error.message}`);
      }
    });
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance properties & methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  async render (
    container
  ) {
    if (!container.querySelector('#add-person')) {
      container.innerHTML = '<p class="muted" role="status">Loading people…</p>';
    }
    const members = await this.dataStore.listMembers();
    const fresh = document.createElement('div');
    fresh.className = 'stack';
    fresh.style.gap = '28px';
    fresh.innerHTML = `
      <section class="stack">
        <h1>People</h1>
        <p style="max-width: 820px">Anyone listed here can open the site by signing in with this email address, with Google or with an email link. <strong>Members</strong> read everything, comment and state positions on decisions. <strong>Admins</strong> can also import release packages, invite people, set the status of comments and record decisions.</p>
        <p class="small muted" style="max-width: 820px">The site's owners are named in its setup file and always have admin access, so they may not appear below.</p>
      </section>
      ${this.notice}
      <section class="panel stack" style="padding: 20px">
        <h2>Invite Someone</h2>
        <form class="form" id="add-person">
          <label>Email address
            <input type="email" name="email" required autocomplete="off" placeholder="name@example.gov">
          </label>
          <label>Role
            <select name="role">
              <option value="user" selected>Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <div><button class="button" type="submit">Add person</button></div>
          <div class="form-status"></div>
        </form>
      </section>
      <section class="stack">
        <h2>Everyone With Access (${members.length})</h2>
        ${members.length === 0
          ? '<p class="muted">No one has been added here yet.</p>'
          : `<div class="table-box"><table>
              <thead><tr><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Added by</th><th scope="col">Actions</th></tr></thead>
              <tbody>${this.#renderRows(members)}</tbody>
            </table></div>`}
      </section>`;
    for (const member of members) {
      const marker = document.createElement('span');
      marker.hidden = true;
      marker.dataset.member = member.email;
      fresh.append(marker);
    }
    container.innerHTML = '';
    container.append(fresh);
    this.notice = '';
    this.#wireEvents(fresh, container);
  }
}

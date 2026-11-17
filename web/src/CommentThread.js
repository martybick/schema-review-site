/**
 * @file CommentThread.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import { DataStore } from './DataStore.js';
import { escapeHTML, formatDate } from './html.js';
import { renderMarkdown } from './markdown.js';

// ----------------------------------------------------------------------------
// CommentThread
// ----------------------------------------------------------------------------

// NOTE: the comments on one thing (a construct or a decision): each comment
// has a type and a status, replies sit under it, admins set the status, and
// authors (or admins) can delete. Comments name the release they were made
// on, so a comment stays meaningful when later releases arrive.
export class CommentThread {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Constructor
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  constructor (
    dataStore,
    authController,
    target
  ) {
    this.dataStore = dataStore;
    this.authController = authController;
    this.target = target;
    this.container = null;
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance internal methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  #canDelete (
    comment
  ) {
    return this.authController.isAdmin || comment.authorEmail === this.authController.user?.email?.toLowerCase();
  }

  #renderComment (
    comment,
    replies
  ) {
    const statusControl = this.authController.isAdmin
      ? `<label class="small" style="flex-direction: row; align-items: center; gap: 8px">Status
          <select data-status-for="${escapeHTML(comment.id)}" style="min-height: 32px; padding: 4px 8px">
            ${Object.entries(DataStore.COMMENT_STATUSES).map(([value, label]) => `<option value="${value}"${comment.status === value ? ' selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>`
      : `<span class="pill">${escapeHTML(DataStore.COMMENT_STATUSES[comment.status] ?? comment.status)}</span>`;
    const replyItems = replies.map((reply) => `
      <li class="stack stack--tight" style="border-left: 3px solid var(--surface-300); padding-left: 12px">
        <p class="small muted"><strong style="color: var(--ink)">${escapeHTML(reply.authorName)}</strong> · ${escapeHTML(formatDate(reply.createdAt?.toDate?.()))}${this.#canDelete(reply) ? ` · <button type="button" class="link-button" data-delete="${escapeHTML(reply.id)}">Delete</button>` : ''}</p>
        <div class="comment-body">${renderMarkdown(reply.body)}</div>
      </li>`).join('');
    return `
      <li class="panel stack" style="padding: 16px 20px">
        <div class="row" style="gap: 12px; align-items: center">
          <span class="pill pill--navy">${escapeHTML(DataStore.COMMENT_TYPES[comment.type] ?? comment.type)}</span>
          <span class="small muted"><strong style="color: var(--ink)">${escapeHTML(comment.authorName)}</strong> · ${escapeHTML(formatDate(comment.createdAt?.toDate?.()))} · on ${escapeHTML(comment.release)}</span>
          <span style="flex: 1 1 auto"></span>
          ${statusControl}
        </div>
        <div class="comment-body">${renderMarkdown(comment.body)}</div>
        ${replyItems ? `<ul class="stack" style="list-style: none; margin: 0; padding: 0">${replyItems}</ul>` : ''}
        <div class="row" style="gap: 16px">
          <button type="button" class="link-button" data-reply="${escapeHTML(comment.id)}">Reply</button>
          ${this.#canDelete(comment) ? `<button type="button" class="link-button" data-delete="${escapeHTML(comment.id)}">Delete</button>` : ''}
        </div>
        <div data-reply-box="${escapeHTML(comment.id)}"></div>
      </li>`;
  }

  #renderForm (
    parentID = null
  ) {
    const typeField = parentID
      ? ''
      : `<label>Type
          <select name="type">
            ${Object.entries(DataStore.COMMENT_TYPES).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
          </select>
        </label>`;
    return `
      <form class="form comment-form" data-parent="${escapeHTML(parentID ?? '')}" style="max-width: 760px">
        ${typeField}
        <label>${parentID ? 'Your reply' : 'Comment'}
          <textarea name="body" rows="${parentID ? 3 : 5}" required placeholder="${parentID ? '' : 'Describe the problem or question. Put element names and XML in `backticks`.'}"></textarea>
        </label>
        <div class="row" style="gap: 12px"><button class="button" type="submit">${parentID ? 'Post reply' : 'Post comment'}</button>${parentID ? '<button class="button button--secondary" type="button" data-cancel-reply>Cancel</button>' : ''}</div>
        <div class="form-status"></div>
      </form>`;
  }

  async #submitForm (
    form
  ) {
    const body = form.elements.body.value.trim();
    const status = form.querySelector('.form-status');
    if (body === '') {
      status.innerHTML = '<div class="message message--error" role="alert">Write something first.</div>';
      return;
    }
    form.querySelector('button[type="submit"]').disabled = true;
    try {
      await this.dataStore.addComment({
        project: this.target.project,
        release: this.target.release,
        targetKind: this.target.kind,
        targetKey: this.target.key,
        type: form.dataset.parent ? 'reply' : form.elements.type.value,
        body,
        parentID: form.dataset.parent || null
      });
      await this.refresh();
    } catch (error) {
      status.innerHTML = `<div class="message message--error" role="alert">Could not post: ${escapeHTML(error.message)}</div>`;
      form.querySelector('button[type="submit"]').disabled = false;
    }
  }

  #wireEvents () {
    this.container.addEventListener('submit', (event) => {
      const form = event.target.closest('form.comment-form');
      if (form) {
        event.preventDefault();
        this.#submitForm(form);
      }
    });
    this.container.addEventListener('click', async (event) => {
      const replyButton = event.target.closest('[data-reply]');
      const deleteButton = event.target.closest('[data-delete]');
      const cancelButton = event.target.closest('[data-cancel-reply]');
      if (replyButton) {
        const box = this.container.querySelector(`[data-reply-box="${CSS.escape(replyButton.dataset.reply)}"]`);
        box.innerHTML = this.#renderForm(replyButton.dataset.reply);
        box.querySelector('textarea').focus();
      } else if (cancelButton) {
        cancelButton.closest('[data-reply-box]').innerHTML = '';
      } else if (deleteButton && window.confirm('Delete this comment? This cannot be undone.')) {
        try {
          await this.dataStore.deleteComment(deleteButton.dataset.delete);
          await this.refresh();
        } catch (error) {
          window.alert(`Could not delete: ${error.message}`);
        }
      }
    });
    this.container.addEventListener('change', async (event) => {
      const select = event.target.closest('[data-status-for]');
      if (select) {
        try {
          await this.dataStore.setCommentStatus(select.dataset.statusFor, select.value);
        } catch (error) {
          window.alert(`Could not change the status: ${error.message}`);
          await this.refresh();
        }
      }
    });
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance properties & methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  async render (
    container
  ) {
    this.container = container;
    this.#wireEvents();
    await this.refresh();
  }

  async refresh () {
    let comments;
    try {
      comments = await this.dataStore.listComments(this.target.project, this.target.kind, this.target.key);
    } catch (error) {
      this.container.innerHTML = `<div class="message message--error" role="alert">Could not load comments: ${escapeHTML(error.message)}</div>`;
      return;
    }
    const topLevel = comments.filter((comment) => !comment.parentID);
    const repliesByParent = new Map();
    for (const comment of comments.filter((entry) => entry.parentID)) {
      if (!repliesByParent.has(comment.parentID)) {
        repliesByParent.set(comment.parentID, []);
      }
      repliesByParent.get(comment.parentID).push(comment);
    }
    this.container.innerHTML = `
      <h2 id="comments-heading">Comments${topLevel.length > 0 ? ` (${topLevel.length})` : ''}</h2>
      ${topLevel.length === 0
        ? '<p class="muted">No comments yet.</p>'
        : `<ul class="stack" style="list-style: none; margin: 0; padding: 0">${topLevel.map((comment) => this.#renderComment(comment, repliesByParent.get(comment.id) ?? [])).join('')}</ul>`}
      <h3>Add a Comment</h3>
      ${this.#renderForm()}`;
  }
}

/**
 * @file DataStore.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Imports & dependencies
// ----------------------------------------------------------------------------

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
import { services } from './firebase.js';

// ----------------------------------------------------------------------------
// DataStore
// ----------------------------------------------------------------------------

// NOTE: everything people add on the site lives in Firestore: the members
// list, comments, positions on decisions, and the working group's recorded
// decisions. Release packages stay in Storage and are never changed here.
// firestore.rules enforces who may do what; this class only shapes the data.
export class DataStore {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Static variables
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  static COMMENT_TYPES = {
    defect: 'Defect',
    gap: 'Gap (cannot be modeled)',
    naming: 'Naming',
    documentation: 'Documentation',
    alternative: 'Alternative proposed',
    question: 'Question',
    editorial: 'Editorial'
  };

  static COMMENT_STATUSES = {
    open: 'Open',
    accepted: 'Accepted',
    rejected: 'Rejected',
    deferred: 'Deferred',
    addressed: 'Addressed'
  };

  static POSITIONS = {
    support: 'Support',
    oppose: 'Oppose',
    abstain: 'Abstain'
  };

  static DECISION_STATUSES = {
    proposed: 'Proposed',
    ratified: 'Ratified',
    changed: 'Changed',
    reopened: 'Reopened'
  };

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Constructor
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  constructor (
    authController
  ) {
    this.authController = authController;
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance internal methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  #getMyEmail () {
    return this.authController.user.email.toLowerCase();
  }

  #getMyName () {
    return this.authController.user.displayName || this.authController.user.email;
  }

  async #readCollection (
    collectionName,
    ...conditions
  ) {
    const snapshot = await getDocs(query(collection(services.db, collectionName), ...conditions));
    return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance properties & methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  static getDecisionKey (
    project,
    decisionID
  ) {
    return `${project}-${decisionID}`;
  }

  // Members

  async listMembers () {
    const members = await this.#readCollection('members');
    return members.sort((first, second) => first.email.localeCompare(second.email));
  }

  async saveMember (
    email,
    role,
    isNew
  ) {
    const normalized = email.trim().toLowerCase();
    const data = isNew
      ? { email: normalized, role, addedBy: this.#getMyEmail(), addedAt: serverTimestamp() }
      : { email: normalized, role, updatedBy: this.#getMyEmail(), updatedAt: serverTimestamp() };
    await setDoc(doc(services.db, 'members', normalized), data, { merge: !isNew });
  }

  async removeMember (
    email
  ) {
    await deleteDoc(doc(services.db, 'members', email));
  }

  // Comments

  static getCommentTarget (
    project,
    targetKind,
    targetKey
  ) {
    return `${project}|${targetKind}|${targetKey}`;
  }

  async listComments (
    project,
    targetKind,
    targetKey
  ) {
    const target = DataStore.getCommentTarget(project, targetKind, targetKey);
    const comments = await this.#readCollection('comments', where('target', '==', target));
    return comments.sort((first, second) => (first.createdAt?.toMillis?.() ?? 0) - (second.createdAt?.toMillis?.() ?? 0));
  }

  // NOTE: every comment of one kind in a project (for counts on list pages).
  async listCommentsByKind (
    project,
    targetKind
  ) {
    const comments = await this.#readCollection('comments', where('project', '==', project));
    return comments.filter((comment) => comment.targetKind === targetKind);
  }

  async addComment (
    {
      project,
      release,
      targetKind,
      targetKey,
      type,
      body,
      parentID = null
    }
  ) {
    await addDoc(collection(services.db, 'comments'), {
      target: DataStore.getCommentTarget(project, targetKind, targetKey),
      project,
      release,
      targetKind,
      targetKey,
      type,
      body,
      parentID,
      authorEmail: this.#getMyEmail(),
      authorName: this.#getMyName(),
      createdAt: serverTimestamp(),
      status: 'open'
    });
  }

  async setCommentStatus (
    commentID,
    status
  ) {
    await updateDoc(doc(services.db, 'comments', commentID), {
      status,
      statusBy: this.#getMyEmail(),
      statusAt: serverTimestamp()
    });
  }

  async deleteComment (
    commentID
  ) {
    await deleteDoc(doc(services.db, 'comments', commentID));
  }

  // Positions

  async listPositions (
    project,
    decisionKey = null
  ) {
    return decisionKey
      ? this.#readCollection('positions', where('decisionKey', '==', decisionKey))
      : this.#readCollection('positions', where('project', '==', project));
  }

  async savePosition (
    project,
    decisionKey,
    position,
    reason
  ) {
    const email = this.#getMyEmail();
    await setDoc(doc(services.db, 'positions', `${decisionKey}__${email}`), {
      decisionKey,
      project,
      email,
      name: this.#getMyName(),
      position,
      reason,
      updatedAt: serverTimestamp()
    });
  }

  async withdrawPosition (
    decisionKey
  ) {
    await deleteDoc(doc(services.db, 'positions', `${decisionKey}__${this.#getMyEmail()}`));
  }

  // Site settings

  async getSiteSettings (
    project
  ) {
    const snapshot = await getDoc(doc(services.db, 'siteSettings', project));
    return snapshot.exists() ? snapshot.data() : { defaultRelease: null, hiddenReleases: [] };
  }

  async saveSiteSettings (
    project,
    {
      defaultRelease,
      hiddenReleases
    }
  ) {
    await setDoc(doc(services.db, 'siteSettings', project), {
      defaultRelease: defaultRelease ?? null,
      hiddenReleases,
      updatedBy: this.#getMyEmail(),
      updatedAt: serverTimestamp()
    });
  }

  // Decision records

  async listDecisionRecords (
    project
  ) {
    const records = await this.#readCollection('decisionRecords', where('project', '==', project));
    return new Map(records.map((record) => [record.id, record]));
  }

  async listDecisionEvents (
    decisionKey
  ) {
    const events = await this.#readCollection('decisionEvents', where('decisionKey', '==', decisionKey));
    return events.sort((first, second) => (second.recordedAt?.toMillis?.() ?? 0) - (first.recordedAt?.toMillis?.() ?? 0));
  }

  // NOTE: the record holds the latest outcome; every recording is also kept
  // as an event, so the history of a decision is never lost.
  async recordDecision (
    project,
    decisionID,
    {
      status,
      option,
      note
    }
  ) {
    const decisionKey = DataStore.getDecisionKey(project, decisionID);
    const data = {
      decisionKey,
      project,
      decisionID,
      status,
      option: option ?? null,
      note,
      recordedBy: this.#getMyEmail(),
      recordedAt: serverTimestamp()
    };
    await setDoc(doc(services.db, 'decisionRecords', decisionKey), data);
    await addDoc(collection(services.db, 'decisionEvents'), data);
  }
}

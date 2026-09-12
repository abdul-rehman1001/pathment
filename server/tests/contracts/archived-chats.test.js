'use strict';

/**
 * Archiving a conversation, and getting it back.
 *
 * The phone could archive and had nowhere to put what it archived: no list of
 * archived threads, and nothing ever called the unarchive endpoint the server
 * has had the whole time. So archiving read as deleting a conversation
 * permanently, from a button labelled Archive.
 *
 * These pin the three things that make it safe: the archive is listable, it is
 * reversible, and a new message brings it back on its own.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const {
  cleanDb,
  createAdmin,
  createMentor,
  createMentee,
  createProgram,
  authHeader,
} = require('../helpers/seed');

let admin;
let mentor;
let mentee;
let conversationId;

async function openThread() {
  const response = await request(app)
    .post('/api/messaging/conversations/direct')
    .set('Authorization', authHeader(mentee))
    .send({ participantId: mentor.id });

  return response.body.data.conversation.id;
}

function listFor(user, archived) {
  return request(app)
    .get(`/api/messaging/conversations${archived ? '?archived=true' : ''}`)
    .set('Authorization', authHeader(user));
}

beforeEach(async () => {
  await cleanDb();
  admin = await createAdmin({ email: 'archive-admin@test.com' });
  mentor = await createMentor({ email: 'archive-mentor@test.com' });
  mentee = await createMentee({ email: 'archive-mentee@test.com' });

  // A mentee may only message their mentor or somebody in their clan, so the
  // two have to actually share one before any of this is reachable.
  const program = await createProgram({ createdBy: admin.id, name: 'Backend' });
  const clan = await models.Clan.create({
    name: 'Node Guild',
    programId: program.id,
    createdBy: admin.id,
  });
  for (const [userId, role] of [[mentor.id, 'lead_mentor'], [mentee.id, 'mentee']]) {
    await models.ClanMembership.create({ clanId: clan.id, userId, role, status: 'active' });
  }

  conversationId = await openThread();

  await request(app)
    .post('/api/messaging/messages')
    .set('Authorization', authHeader(mentee))
    .send({ conversationId, messageText: 'Hello' });
});

describe('archiving', () => {
  test('takes it out of the inbox', async () => {
    await request(app)
      .post(`/api/messaging/conversations/${conversationId}/archive`)
      .set('Authorization', authHeader(mentor));

    const inbox = await listFor(mentor, false);
    expect(inbox.body.data.conversations.map((one) => one.id)).not.toContain(conversationId);
  });

  // The list the phone never asked for, which is why the thread went nowhere.
  test('puts it somewhere that can be listed', async () => {
    await request(app)
      .post(`/api/messaging/conversations/${conversationId}/archive`)
      .set('Authorization', authHeader(mentor));

    const archive = await listFor(mentor, true);
    expect(archive.status).toBe(200);
    expect(archive.body.data.conversations.map((one) => one.id)).toContain(conversationId);
  });

  test('is one person\'s own business, not the other\'s', async () => {
    await request(app)
      .post(`/api/messaging/conversations/${conversationId}/archive`)
      .set('Authorization', authHeader(mentor));

    const theirs = await listFor(mentee, false);
    expect(theirs.body.data.conversations.map((one) => one.id)).toContain(conversationId);
  });

  test('is reversible', async () => {
    await request(app)
      .post(`/api/messaging/conversations/${conversationId}/archive`)
      .set('Authorization', authHeader(mentor));
    await request(app)
      .post(`/api/messaging/conversations/${conversationId}/unarchive`)
      .set('Authorization', authHeader(mentor));

    const inbox = await listFor(mentor, false);
    expect(inbox.body.data.conversations.map((one) => one.id)).toContain(conversationId);
  });
});

describe('a new message', () => {
  /**
   * Archiving is "I am done with this for now", not "never show me this person
   * again", and the app has always said so. Only the flag moves: the history is
   * theirs and they never asked to lose it.
   */
  test('brings an archived conversation back', async () => {
    await request(app)
      .post(`/api/messaging/conversations/${conversationId}/archive`)
      .set('Authorization', authHeader(mentor));

    await request(app)
      .post('/api/messaging/messages')
      .set('Authorization', authHeader(mentee))
      .send({ conversationId, messageText: 'Are you there?' });

    const inbox = await listFor(mentor, false);
    expect(inbox.body.data.conversations.map((one) => one.id)).toContain(conversationId);
  });

  test('does not un-archive it for whoever sent it', async () => {
    await request(app)
      .post(`/api/messaging/conversations/${conversationId}/archive`)
      .set('Authorization', authHeader(mentor));

    await request(app)
      .post('/api/messaging/messages')
      .set('Authorization', authHeader(mentor))
      .send({ conversationId, messageText: 'One last thing' });

    const inbox = await listFor(mentor, false);
    expect(inbox.body.data.conversations.map((one) => one.id)).not.toContain(conversationId);
  });
});

'use strict';

/**
 * The three numbers across the top of the admin home.
 *
 * They read zero on a real organisation with twenty nine mentees in it, above a
 * list of clans naming twenty one and eight. The counts sit one level down,
 * inside `stats`, and the phone read them off the envelope itself, so every
 * field came back undefined and turned into a zero. Nothing errored, and a zero
 * looks exactly like an answer.
 *
 * So this pins the SHAPE as hard as the numbers. Anything that flattens or
 * renames that wrapper breaks the phone silently, and silently is the whole
 * problem.
 */

const request = require('supertest');
const { models } = require('../../src/db');
const app = require('../../src/index');
const {
  cleanDb,
  createAdmin,
  createMentor,
  createMentee,
  createProgram,
  authHeader,
} = require('../helpers/seed');

let admin;

const stats = () =>
  request(app).get('/api/admin/dashboard/stats').set('Authorization', authHeader(admin));

beforeEach(async () => {
  await cleanDb();
  admin = await createAdmin({ email: 'dash-admin@test.com' });
});

describe('the admin dashboard counts', () => {
  test('are nested under stats, which is the level the phone must read', async () => {
    const response = await stats();

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveProperty('stats');
    expect(response.body.data.stats).toHaveProperty('activeMentees');
    expect(response.body.data.stats).toHaveProperty('activeMentors');
    expect(response.body.data.stats).toHaveProperty('totalPrograms');
    expect(response.body.data.stats).toHaveProperty('completionRate');

    // The trap: these are NOT on the envelope, and reading them there gives
    // undefined rather than an error.
    expect(response.body.data.activeMentees).toBeUndefined();
    expect(response.body.data.activeMentors).toBeUndefined();
  });

  test('count the mentees and mentors who are actually there', async () => {
    await createMentee({ email: 'm1@test.com' });
    await createMentee({ email: 'm2@test.com' });
    await createMentor({ email: 'mentor1@test.com' });

    const response = await stats();

    expect(response.body.data.stats.activeMentees).toBe(2);
    expect(response.body.data.stats.activeMentors).toBe(1);
  });

  test('leave out somebody whose account is not active', async () => {
    await createMentee({ email: 'here@test.com' });
    await createMentee({ email: 'gone@test.com', status: 'inactive' });

    const response = await stats();

    expect(response.body.data.stats.activeMentees).toBe(1);
  });

  test('count published programmes, not drafts', async () => {
    await createProgram({ createdBy: admin.id, name: 'Live', status: 'published' });
    await createProgram({ createdBy: admin.id, name: 'Draft', status: 'draft' });

    const response = await stats();

    expect(response.body.data.stats.totalPrograms).toBe(1);
  });

  // A brand new organisation. Every number is genuinely zero here, and the
  // shape still has to be right so the phone reads zero rather than undefined.
  test('answer zeros on an empty organisation rather than leaving fields out', async () => {
    const response = await stats();

    expect(response.body.data.stats.activeMentees).toBe(0);
    expect(response.body.data.stats.activeMentors).toBe(0);
    expect(response.body.data.stats.completionRate).toBe(0);
  });

  test('a mentee counts once, however many clans they sit in', async () => {
    const program = await createProgram({ createdBy: admin.id, name: 'Backend' });
    const mentee = await createMentee({ email: 'dual@test.com' });

    const first = await models.Clan.create({
      name: 'MERN Fellows',
      programId: program.id,
      createdBy: admin.id,
    });
    const second = await models.Clan.create({
      name: 'Node Guild',
      programId: program.id,
      createdBy: admin.id,
    });

    for (const clan of [first, second]) {
      await models.ClanMembership.create({
        clanId: clan.id,
        userId: mentee.id,
        role: 'mentee',
        status: 'active',
      });
    }

    const response = await stats();

    expect(response.body.data.stats.activeMentees).toBe(1);
  });
});

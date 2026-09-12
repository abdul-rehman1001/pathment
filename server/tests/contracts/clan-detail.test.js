'use strict';

/**
 * What one clan carries when it is opened.
 *
 * Both admin lists named a clan and did nothing when it was tapped, so an admin
 * could read that a clan had eighteen people at risk with no way to find out who
 * they were. The screen that answers it reads this endpoint, and every field it
 * reads is pinned here, because a missing key is undefined and `?? null` turns
 * that into a calm looking screen with nobody on it.
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
let lead;
let coMentor;
let mentee;
let pausedMentee;
let program;
let clan;

const openClan = () =>
  request(app).get(`/api/clans/${clan.id}`).set('Authorization', authHeader(admin));

async function join(userId, role, status = 'active') {
  return models.ClanMembership.create({ clanId: clan.id, userId, role, status });
}

beforeEach(async () => {
  await cleanDb();
  admin = await createAdmin({ email: 'detail-admin@test.com' });
  lead = await createMentor({ email: 'detail-lead@test.com', firstName: 'Aisha', lastName: 'Khan' });
  coMentor = await createMentor({ email: 'detail-co@test.com', firstName: 'Omar', lastName: 'Farooq' });
  mentee = await createMentee({ email: 'detail-mentee@test.com', firstName: 'Noor', lastName: 'Hassan' });
  pausedMentee = await createMentee({ email: 'detail-paused@test.com', firstName: 'Zain', lastName: 'Ali' });

  program = await createProgram({ createdBy: admin.id, name: 'Backend' });
  clan = await models.Clan.create({
    name: 'MERN Fellows',
    programId: program.id,
    createdBy: admin.id,
    leadMentorId: lead.id,
  });

  await join(lead.id, 'lead_mentor');
  await join(coMentor.id, 'co_mentor');
  await join(mentee.id, 'mentee');
  await join(pausedMentee.id, 'mentee', 'paused');
});

describe('opening one clan', () => {
  test('names the clan and the programme it belongs to', async () => {
    const response = await openClan();

    expect(response.status).toBe(200);
    expect(response.body.data.clan.name).toBe('MERN Fellows');
    expect(response.body.data.clan.program.name).toBe('Backend');
  });

  test('names the lead mentor, which is the first thing an admin looks for', async () => {
    const response = await openClan();

    const leadMentor = response.body.data.clan.leadMentor;
    expect(leadMentor.firstName).toBe('Aisha');
    expect(leadMentor.lastName).toBe('Khan');
  });

  test('carries the whole roster with the role each person holds', async () => {
    const response = await openClan();

    const rows = response.body.data.clan.memberships;
    const byRole = rows.reduce((count, row) => {
      count[row.role] = (count[row.role] || 0) + 1;
      return count;
    }, {});

    expect(byRole.lead_mentor).toBe(1);
    expect(byRole.co_mentor).toBe(1);
    expect(byRole.mentee).toBe(2);
  });

  test('carries the person behind each membership, not just an id', async () => {
    const response = await openClan();

    const row = response.body.data.clan.memberships.find((one) => one.role === 'mentee');

    expect(row.user).toBeTruthy();
    expect(row.user).toHaveProperty('id');
    expect(row.user).toHaveProperty('firstName');
    expect(row.user).toHaveProperty('lastName');
    expect(row.user).toHaveProperty('email');
    expect(row.user).toHaveProperty('profilePictureUrl');
  });

  // A paused mentee is still in the clan. Dropping them would show an admin a
  // roster missing exactly the person they came looking for.
  test('keeps a paused mentee on the roster and says they are paused', async () => {
    const response = await openClan();

    const rows = response.body.data.clan.memberships;
    const paused = rows.find((one) => one.userId === pausedMentee.id);

    expect(paused).toBeTruthy();
    expect(paused.status).toBe('paused');
  });

  test('answers 404 for a clan that is not there, rather than an empty one', async () => {
    const response = await request(app)
      .get('/api/clans/00000000-0000-0000-0000-000000000000')
      .set('Authorization', authHeader(admin));

    expect(response.status).toBe(404);
  });
});

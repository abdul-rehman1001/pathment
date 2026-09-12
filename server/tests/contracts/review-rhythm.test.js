'use strict';

/**
 * The standing review a mentor sets, pinned to what the endpoint takes.
 *
 * Setting one failed every time from the phone, and the reason was one missing
 * field: the service requires `timezone` and validates it, the client sent
 * none, and the refusal reached the mentor as "Could not set that rhythm. Try
 * again." A wall clock with no zone attached is six o'clock somewhere, so this
 * is not a formality the client can skip.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const {
  cleanDb,
  createAdmin,
  createMentor,
  createProgram,
  authHeader,
} = require('../helpers/seed');

let admin;
let lead;
let program;
let clan;

const RHYTHM = {
  dayOfWeek: 2,
  timeLocal: '18:30',
  timezone: 'Asia/Karachi',
  intervalWeeks: 1,
  durationMinutes: 60,
};

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

beforeEach(async () => {
  await cleanDb();
  admin = await createAdmin({ email: 'rhythm-admin@test.com' });
  lead = await createMentor({ email: 'rhythm-lead@test.com' });
  program = await createProgram({ createdBy: admin.id, name: 'Backend' });
  clan = await models.Clan.create({
    name: 'Node Guild',
    programId: program.id,
    createdBy: admin.id,
  });
  await models.ClanMembership.create({
    clanId: clan.id,
    userId: lead.id,
    role: 'lead_mentor',
    status: 'active',
  });
});

describe('setting a review rhythm', () => {
  test('takes the zone the wall clock was read in', async () => {
    const response = await request(app)
      .post('/api/mentor/review/schedules')
      .set('Authorization', authHeader(lead))
      .send({ clanId: clan.id, startsOn: todayISO(), ...RHYTHM });

    expect(response.status).toBe(201);
    expect(response.body.data.timezone).toBe('Asia/Karachi');
    expect(response.body.data.timeLocal).toBe('18:30');
  });

  // The exact failure testers hit. Nothing sent a zone, so nothing worked.
  test('refuses a rhythm with no zone, which is why none could be set', async () => {
    const { timezone, ...withoutZone } = RHYTHM;
    expect(timezone).toBe('Asia/Karachi');

    const response = await request(app)
      .post('/api/mentor/review/schedules')
      .set('Authorization', authHeader(lead))
      .send({ clanId: clan.id, startsOn: todayISO(), ...withoutZone });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/timezone/i);
  });

  // The phone pads the hour, because this pattern wants two digits either side.
  test('wants the hour padded, so 9am is 09:00 and not 9:00', async () => {
    const response = await request(app)
      .post('/api/mentor/review/schedules')
      .set('Authorization', authHeader(lead))
      .send({ clanId: clan.id, startsOn: todayISO(), ...RHYTHM, timeLocal: '9:00' });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/HH:mm/i);
  });

  test('takes any minute, not only the hours the phone offers as chips', async () => {
    const response = await request(app)
      .post('/api/mentor/review/schedules')
      .set('Authorization', authHeader(lead))
      .send({ clanId: clan.id, startsOn: todayISO(), ...RHYTHM, timeLocal: '18:45' });

    expect(response.status).toBe(201);
    expect(response.body.data.timeLocal).toBe('18:45');
  });

  test('refuses a zone that is not a real one', async () => {
    const response = await request(app)
      .post('/api/mentor/review/schedules')
      .set('Authorization', authHeader(lead))
      .send({ clanId: clan.id, startsOn: todayISO(), ...RHYTHM, timezone: 'Mars/Olympus' });

    expect(response.status).toBe(400);
  });

  test('gives the schedule back with the fields the screen reads', async () => {
    const response = await request(app)
      .post('/api/mentor/review/schedules')
      .set('Authorization', authHeader(lead))
      .send({ clanId: clan.id, startsOn: todayISO(), ...RHYTHM });

    for (const field of ['id', 'clanId', 'dayOfWeek', 'timeLocal', 'timezone', 'intervalWeeks', 'durationMinutes', 'active']) {
      expect(response.body.data).toHaveProperty(field);
    }
  });

  test('refuses a clan this mentor does not run', async () => {
    const stranger = await createMentor({ email: 'rhythm-stranger@test.com' });

    const response = await request(app)
      .post('/api/mentor/review/schedules')
      .set('Authorization', authHeader(stranger))
      .send({ clanId: clan.id, startsOn: todayISO(), ...RHYTHM });

    expect(response.status).toBe(403);
  });
});

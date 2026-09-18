'use strict';

/**
 * TC-A19  View all enrolled mentees for a program
 * TC-A20  Send invitation to a new user
 */

const request = require('supertest');
const app = require('../../src/index');
const {
  cleanDb,
  createAdmin,
  createMentee,
  createProgram,
  createEnrollment,
  createClan,
  authHeader,
} = require('../helpers/seed');

describe('Admin — Enrollments & Invitations', () => {
  let admin;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin();
  });

  // TC-A19
  it('TC-A19: returns all enrolled mentees with status and progress for a program', async () => {
    const program = await createProgram({ createdBy: admin.id, name: 'Web Dev Program', status: 'published' });

    const mentee1 = await createMentee({ email: 'mentee1@test.com' });
    const mentee2 = await createMentee({ email: 'mentee2@test.com' });

    await createEnrollment({ menteeId: mentee1.id, programId: program.id, status: 'pending_match' });
    await createEnrollment({ menteeId: mentee2.id, programId: program.id, status: 'active' });

    const res = await request(app)
      .get(`/api/programs/${program.id}/enrollments`)
      .set('Authorization', authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Response may be paginated or a flat array — handle both shapes
    const enrollments =
      res.body.data?.enrollments ||
      res.body.data?.rows ||
      (Array.isArray(res.body.data) ? res.body.data : []);

    expect(enrollments.length).toBeGreaterThanOrEqual(2);
    enrollments.forEach((e) => {
      expect(e.menteeId || e.mentee?.id).toBeTruthy();
      expect(e.status).toBeTruthy();
    });
  });

  // TC-A20
  it('TC-A20: sends invitation email and creates invite record for new user', async () => {
    // An invite now has to say where the person lands: a mentor needs a clan
    // (the program is derived from it), a mentee needs a program. An invite
    // with no placement is rejected, which is why sending email+role alone
    // stopped working.
    const program = await createProgram({ createdBy: admin.id, name: 'Invite Program', status: 'published' });
    const clan = await createClan({ programId: program.id, createdBy: admin.id, name: 'Invite Clan' });

    const res = await request(app)
      .post('/api/admin/invites')
      .set('Authorization', authHeader(admin))
      .send({
        email: 'newmentor@example.com',
        role: 'mentor',
        clanId: clan.id,
        expiresInHours: 72,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const invite = res.body.data.invite || res.body.data;
    expect(invite.email).toBe('newmentor@example.com');
    expect(invite.role).toBe('mentor');
    expect(invite.expiresAt).toBeTruthy();
  });
});

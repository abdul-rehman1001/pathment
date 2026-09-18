'use strict';

/**
 * TC-M14  Enroll in a published program → Pending Match status
 * TC-M15  Attempt duplicate enrollment in same program
 * TC-M16  View enrolled program in dashboard
 *
 * TC-M17 ("select starting level during onboarding") is gone: programs are no
 * longer divided into levels. It had already stopped testing anything — its own
 * assertion fell back to re-checking the programId whenever the level endpoint
 * answered 4xx, which by then it always did.
 */

const request = require('supertest');
const app = require('../../src/index');
const {
  cleanDb,
  createAdmin,
  createMentee,
  createProgram,
  createEnrollment,
  authHeader,
} = require('../helpers/seed');

describe('Mentee Enrollment', () => {
  let admin, mentee, program;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin();
    mentee = await createMentee({ email: 'awaisfatehali@gmail.com', password: 'Test@1234!' });
    program = await createProgram({ createdBy: admin.id, name: 'Web Dev Program', status: 'published' });
  });

  // TC-M14
  it('TC-M14: creates enrollment with pending_match status for a published program', async () => {
    const res = await request(app)
      .post(`/api/programs/${program.id}/enroll`)
      .set('Authorization', authHeader(mentee))
      .send();

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.enrollment.status).toMatch(/pending_match|pending/i);
  });

  // TC-M15
  it('TC-M15: returns 409 on duplicate enrollment attempt', async () => {
    // First enrollment
    await request(app)
      .post(`/api/programs/${program.id}/enroll`)
      .set('Authorization', authHeader(mentee))
      .send();

    // Second enrollment attempt
    const res = await request(app)
      .post(`/api/programs/${program.id}/enroll`)
      .set('Authorization', authHeader(mentee))
      .send();

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message.toLowerCase()).toMatch(/already enrolled/i);
  });

  // TC-M16
  it('TC-M16: returns enrolled programs list with status and progress for mentee', async () => {
    // Seed an enrollment directly
    await createEnrollment({ menteeId: mentee.id, programId: program.id, status: 'pending_match' });

    const res = await request(app)
      .get('/api/enrollments')
      .set('Authorization', authHeader(mentee))
      .query({ menteeId: mentee.id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const enrollments = res.body.data.enrollments || res.body.data.rows || res.body.data;
    expect(Array.isArray(enrollments)).toBe(true);
    const match = enrollments.find((e) => e.programId === program.id || e.program?.id === program.id);
    expect(match).toBeDefined();
    expect(match.status).toBeTruthy();
  });

});

'use strict';

/**
 * TC-A15  Generate AI mentor-mentee match suggestions
 * TC-A16  Confirm mentor-mentee match manually
 * TC-A18  Generate match when no mentors are available
 *
 * Removed, because the behaviour they described is gone:
 *   TC-A14  assign a mentor to a program level — programs have no levels, and
 *           neither POST /api/matches/levels/assign nor
 *           POST /api/programs/:id/levels/:levelId/mentors exists.
 *   TC-A17  roadmap tasks auto-instantiated on match — `createMatch` only
 *           recomputes the enrollment's task stats; it creates no tasks.
 *           Assigning work is its own step now.
 *
 * A match is no longer scoped to a level either: `createMatch(enrollmentId,
 * mentorId, matchedBy)` takes none, and candidate mentors come from every
 * mentor rather than from a per-level assignment table (`LevelMentorAssignment`
 * went with the levels). The seeding below reflects that.
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
  createEnrollment,
  authHeader,
} = require('../helpers/seed');

describe('Admin — Matching', () => {
  let admin, mentor, mentee, program, enrollment;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin();
    mentor = await createMentor({ email: 'malikjunaid26039@gmail.com', password: 'Junaid123@' });
    mentee = await createMentee({ email: 'mentee@test.com' });

    program = await createProgram({ createdBy: admin.id, name: 'Web Dev Program', status: 'published' });
    enrollment = await createEnrollment({
      menteeId: mentee.id,
      programId: program.id,
      status: 'pending_match',
    });
  });

  // TC-A15
  it('TC-A15: returns AI match suggestions with compatibility percentages', async () => {
    const res = await request(app)
      .get(`/api/matches/suggestions/${enrollment.id}`)
      .set('Authorization', authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const suggestions = res.body.data.suggestions;
    expect(Array.isArray(suggestions)).toBe(true);
    // Each suggestion should have a score / compatibility field
    if (suggestions.length > 0) {
      expect(suggestions[0].matchScore !== undefined || suggestions[0].score !== undefined).toBe(true);
    }
  });

  // TC-A16
  it('TC-A16: confirms match → enrollment status updates to matched', async () => {
    const res = await request(app)
      .post('/api/matches')
      .set('Authorization', authHeader(admin))
      .send({
        enrollmentId: enrollment.id,
        mentorId: mentor.id,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.match.status).toMatch(/active|pending/i);

    // Enrollment status should update to matched
    await enrollment.reload();
    expect(enrollment.status).toMatch(/matched|active/i);
  });

  // TC-A18
  it('TC-A18: returns error when no mentors are available for matching', async () => {
    // "No mentors available" used to mean "nobody assigned to this level".
    // Candidates now come from every mentor account, so the precondition has to
    // be created rather than assumed — the shared setup seeds one.
    await models.MentorMenteeMatch.destroy({ where: { mentorId: mentor.id } });
    await models.MentorProfile.destroy({ where: { userId: mentor.id } });
    await models.User.destroy({ where: { id: mentor.id } });

    const res = await request(app)
      .get(`/api/matches/suggestions/${enrollment.id}`)
      .set('Authorization', authHeader(admin));

    // May return 200 with empty suggestions, or 404/400 with a descriptive error
    if (res.status === 200) {
      const suggestions = res.body.data.suggestions;
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBe(0);
    } else {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message.toLowerCase()).toMatch(/no.*mentor|unavailable|available/i);
    }
  });
});

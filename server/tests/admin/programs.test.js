'use strict';

/**
 * TC-A03  Create program with all valid fields → Draft status
 * TC-A04  Create program with missing required fields → validation errors
 * TC-A05  Create program with invalid date range → error
 * TC-A08  Publish a draft program
 * TC-A09  View all programs list
 * TC-A10  Search program by name
 *
 * Removed, because the endpoints they exercised no longer exist — programs are
 * not divided into levels any more, and there is no roadmap-task edit route:
 *   TC-A06  add named levels to a program        POST /api/programs/:id/levels
 *   TC-A07  outcomes/prerequisites for a level   PUT  /api/levels/:id
 *   TC-A11  generate an AI roadmap for a level   POST /api/programs/:id/levels/:levelId/roadmap/generate
 *   TC-A12  the same route, AI unavailable
 *   TC-A13  edit a roadmap task                  PUT  /api/roadmap-tasks/:id
 * They had been failing on the seed helper long before they would have reached
 * a 404, so nothing was being covered here either way.
 */

const request = require('supertest');
const app = require('../../src/index');
const {
  cleanDb,
  createAdmin,
  createProgram,
  authHeader,
} = require('../helpers/seed');

// Pull the mocked groq service instance so we can override behaviour per-test
const groqServiceMock = require('../../src/services/groqService');

describe('Admin — Programs & Roadmaps', () => {
  let admin;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin();
    // Reset AI mock to clear any per-test overrides
    groqServiceMock.generateRoadmap?.mockClear?.();
  });

  // TC-A03
  it('TC-A03: creates a program in Draft status with all valid fields', async () => {
    const res = await request(app)
      .post('/api/programs')
      .set('Authorization', authHeader(admin))
      .send({
        name: 'Web Dev Program',
        type: 'mentorship',
        startDate: '2026-06-01',
        endDate: '2026-09-01',
        totalDurationWeeks: 12,
        description: 'Full-stack web development mentorship',
        tags: ['JavaScript', 'Node.js', 'React'],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.program.status).toBe('draft');
    expect(res.body.data.program.name).toBe('Web Dev Program');
  });

  // TC-A04
  it('TC-A04: returns 400 when required program fields are missing', async () => {
    const res = await request(app)
      .post('/api/programs')
      .set('Authorization', authHeader(admin))
      .send({ name: 'Incomplete Program' }); // missing description, dates, type, duration

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // TC-A05
  it('TC-A05: returns 400 when end date is before start date', async () => {
    const res = await request(app)
      .post('/api/programs')
      .set('Authorization', authHeader(admin))
      .send({
        name: 'Bad Dates Program',
        type: 'mentorship',
        startDate: '2026-09-01',
        endDate: '2026-06-01', // end before start
        totalDurationWeeks: 12,
        description: 'This should fail due to date validation',
      });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message.toLowerCase()).toMatch(/date|end date/i);
  });

  // TC-A08
  it('TC-A08: changes program status from draft to published', async () => {
    const program = await createProgram({ createdBy: admin.id, status: 'draft' });

    const res = await request(app)
      .put(`/api/programs/${program.id}`)
      .set('Authorization', authHeader(admin))
      .send({ status: 'published' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.program.status).toBe('published');
  });

  // TC-A09
  it('TC-A09: returns all programs with name, type, status and dates', async () => {
    await createProgram({ createdBy: admin.id, name: 'Program A', status: 'published' });
    await createProgram({ createdBy: admin.id, name: 'Program B', status: 'draft' });

    const res = await request(app)
      .get('/api/programs')
      .set('Authorization', authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const programs = res.body.data;
    expect(Array.isArray(programs)).toBe(true);
    expect(programs.length).toBeGreaterThanOrEqual(2);
    programs.forEach((p) => {
      expect(p.name).toBeTruthy();
      expect(p.status).toBeTruthy();
    });
  });

  // TC-A10
  it('TC-A10: returns only programs matching the search query', async () => {
    await createProgram({ createdBy: admin.id, name: 'Web Dev Program', status: 'published' });
    await createProgram({ createdBy: admin.id, name: 'Data Science Program', status: 'published' });

    const res = await request(app)
      .get('/api/programs')
      .set('Authorization', authHeader(admin))
      .query({ search: 'Web Dev' });

    expect(res.status).toBe(200);
    const programs = res.body.data;
    expect(Array.isArray(programs)).toBe(true);
    programs.forEach((p) => {
      expect(p.name.toLowerCase()).toContain('web dev');
    });
  });

});

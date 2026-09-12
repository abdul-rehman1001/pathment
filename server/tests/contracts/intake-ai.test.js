'use strict';

/**
 * What the phone is told before it runs an AI review, and what an applicants
 * table is given to draw.
 *
 * The plan is the whole safety of this feature: it is what an admin reads
 * BEFORE a model scores forty people. Every number on that sheet is pinned
 * here, including the one that matters most, which is how many questions have
 * no rubric written for them. A question with no rubric still gets a confident
 * score, drawn from nothing.
 *
 * The run itself is not exercised, deliberately: it calls a real model through
 * whichever AI connection is configured, and a test that needs a live key and a
 * budget is a test that gets skipped and then deleted.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const { cleanDb, createAdmin, createProgram, authHeader } = require('../helpers/seed');

let admin;
let program;
let cohort;
let assessment;

async function makeApplication(email, patch = {}) {
  return models.Application.create({
    cohortId: cohort.id,
    email,
    firstName: 'Hina',
    lastName: 'Zafar',
    status: 'under_review',
    ...patch,
  });
}

async function makeSubmission(applicationId, patch = {}) {
  return models.AssessmentSubmission.create({
    applicationId,
    assessmentId: assessment.id,
    status: 'submitted',
    submittedAt: new Date(),
    answers: {},
    ...patch,
  });
}

const planFor = (ids) =>
  request(app)
    .post(`/api/intake/cohorts/${cohort.id}/ai-grade/plan`)
    .set('Authorization', authHeader(admin))
    .send({ applicationIds: ids });

beforeEach(async () => {
  await cleanDb();
  admin = await createAdmin({ email: 'intake-admin@test.com' });
  program = await createProgram({ createdBy: admin.id, name: 'Backend' });

  assessment = await models.Assessment.create({
    title: 'Entry assessment',
    createdBy: admin.id,
    aiRubric: 'Weigh reasoning over syntax',
  });

  await models.AssessmentQuestion.create({
    assessmentId: assessment.id,
    prompt: 'Why this programme?',
    type: 'long_text',
    points: 20,
    position: 1,
    rubric: 'Look for something specific to them',
  });

  // The one with no rubric. This is the row the preflight has to warn about.
  await models.AssessmentQuestion.create({
    assessmentId: assessment.id,
    prompt: 'Describe a hard bug you fixed',
    type: 'long_text',
    points: 20,
    position: 2,
    rubric: null,
  });

  cohort = await models.Cohort.create({
    programId: program.id,
    name: 'Spring 2026 Cohort',
    createdBy: admin.id,
    assessmentId: assessment.id,
    passThreshold: 70,
  });
});

describe('the scoring plan, read before anything is scored', () => {
  test('counts who is being scored and who has handed nothing in', async () => {
    const withWork = await makeApplication('ready@test.com');
    const without = await makeApplication('nothing@test.com');
    await makeSubmission(withWork.id);

    const response = await planFor([withWork.id, without.id]);

    expect(response.status).toBe(200);
    expect(response.body.data.applicants.selected).toBe(2);
    expect(response.body.data.applicants.withSubmission).toBe(1);
    expect(response.body.data.applicants.withoutSubmission).toBe(1);
  });

  test('does not count somebody part way through as ready to score', async () => {
    const partway = await makeApplication('partway@test.com');
    await makeSubmission(partway.id, { status: 'in_progress', submittedAt: null });

    const response = await planFor([partway.id]);

    expect(response.body.data.applicants.withSubmission).toBe(0);
    expect(response.body.data.applicants.withoutSubmission).toBe(1);
  });

  test('names every written question and whether it has a rubric', async () => {
    const one = await makeApplication('ready@test.com');
    await makeSubmission(one.id);

    const response = await planFor([one.id]);

    const plan = response.body.data.assessments[0];
    expect(plan.title).toBe('Entry assessment');
    expect(plan.questions).toHaveLength(2);

    const missing = plan.questions.filter((q) => !q.rubric);
    expect(missing).toHaveLength(1);
    expect(missing[0].prompt).toBe('Describe a hard bug you fixed');
  });

  test('carries the points each question is worth', async () => {
    const one = await makeApplication('ready@test.com');
    await makeSubmission(one.id);

    const response = await planFor([one.id]);

    for (const question of response.body.data.assessments[0].questions) {
      expect(question).toHaveProperty('id');
      expect(question).toHaveProperty('prompt');
      expect(question).toHaveProperty('type');
      expect(question.points).toBe(20);
    }
  });

  test('answers an empty plan rather than an error when nobody is selected', async () => {
    const response = await planFor([]);

    expect(response.status).toBe(200);
    expect(response.body.data.assessments).toEqual([]);
  });
});

describe('the applicants table', () => {
  test('carries the score, the AI overall and the cohort pass mark', async () => {
    const one = await makeApplication('scored@test.com');
    await makeSubmission(one.id, { maxScore: 82, aiDraft: { overall: 77, perQuestion: {} } });

    const response = await request(app)
      .get(`/api/intake/cohorts/${cohort.id}/applications`)
      .set('Authorization', authHeader(admin));

    expect(response.status).toBe(200);
    expect(response.body.data.passThreshold).toBe(70);

    const row = response.body.data.applications.find((r) => r.email === 'scored@test.com');
    expect(row.maxScore).toBe(82);
    expect(row.aiOverall).toBe(77);
  });

  // A zero is a real mark. Sending it as null would draw a dash where somebody
  // scored nothing, which reads as "not marked yet" and is the opposite.
  test('keeps a genuine zero rather than sending it as nothing', async () => {
    const one = await makeApplication('zero@test.com');
    await makeSubmission(one.id, { maxScore: 0 });

    const response = await request(app)
      .get(`/api/intake/cohorts/${cohort.id}/applications`)
      .set('Authorization', authHeader(admin));

    const row = response.body.data.applications.find((r) => r.email === 'zero@test.com');
    expect(row.maxScore).toBe(0);
  });

  test('says null for somebody who has not been scored, not zero', async () => {
    await makeApplication('unmarked@test.com');

    const response = await request(app)
      .get(`/api/intake/cohorts/${cohort.id}/applications`)
      .set('Authorization', authHeader(admin));

    const row = response.body.data.applications.find((r) => r.email === 'unmarked@test.com');
    expect(row.maxScore).toBeNull();
    expect(row.aiOverall).toBeNull();
  });
});

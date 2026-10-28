'use strict';

/**
 * Regression: a roadmap that contains a talk step must still load.
 *
 * `linearRoadmapService.getSteps` asks for `talkIds` in its `attributes` list.
 * Sequelize does not reject an attribute it has never heard of - it passes the
 * name straight through as a column identifier - so while `RoadmapTask` had no
 * `talkIds` attribute the query went out asking for a column literally named
 * "talkIds", and Postgres answered:
 *
 *     column RoadmapTask.talkIds does not exist
 *
 * That took GET /api/mentor/roadmaps down in production with a 500, and it was
 * unfixable by migration: the column `talk_ids` was there all along, under the
 * name the model should have been mapping to. The second test is the half that
 * was failing silently - an undeclared attribute is dropped on write, so every
 * talk ever attached to a roadmap step was being thrown away.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const {
  cleanDb, createAdmin, createMentor, createProgram, createClan,
  createRoadmap, authHeader,
} = require('../helpers/seed');

describe('roadmap steps that reference talks', () => {
  let admin, mentor, program, roadmap, talk;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: 'admin@test.com' });
    mentor = await createMentor({ email: 'mentor@test.com' });
    program = await createProgram({ createdBy: admin.id });
    await createClan({ programId: program.id, createdBy: admin.id, leadMentor: mentor });

    roadmap = await createRoadmap({ programId: program.id, createdBy: mentor.id });
    // listForMentor only returns local roadmaps this mentor's clan team owns.
    await roadmap.update({ source: 'local', ownerMentorId: mentor.id });

    const category = await models.TalkCategory.create({ name: 'Technology', nameKey: 'technology' });
    talk = await models.Talk.create({
      title: 'Simple made easy',
      speaker: 'Rich Hickey',
      url: 'https://www.youtube.com/watch?v=SxdOUGdseq4',
      urlKey: 'https://www.youtube.com/watch?v=sxdougdseq4',
      uploadedBy: mentor.id,
    });
    await models.TalkCategoryLink.create({ talkId: talk.id, categoryId: category.id });
  });

  it('serves the mentor roadmap list when a step carries talk ids', async () => {
    await models.RoadmapTask.create({
      roadmapId: roadmap.id,
      title: 'Watch: Simple made easy',
      description: 'Then write up what you would simplify in your own project.',
      type: 'talk',
      taskOrder: 1,
      difficulty: 'easy',
      deliverable: 'A short write-up',
      talkIds: [talk.id],
    });

    const res = await request(app)
      .get('/api/mentor/roadmaps')
      .set('Authorization', authHeader(mentor));

    expect(res.status).toBe(200);
    const mine = res.body.data.local.find((r) => r.id === roadmap.id);
    expect(mine).toBeTruthy();
    expect(mine.steps).toHaveLength(1);
    expect(mine.steps[0].talkIds).toEqual([talk.id]);
  });

  it('persists talk ids on a roadmap step instead of dropping them', async () => {
    const step = await models.RoadmapTask.create({
      roadmapId: roadmap.id,
      title: 'Watch: Simple made easy',
      description: 'Then write up what you would simplify.',
      type: 'talk',
      taskOrder: 1,
      difficulty: 'easy',
      deliverable: 'A short write-up',
      talkIds: [talk.id],
    });

    // Straight back out of the database, not from the instance in memory: an
    // undeclared attribute survives in `dataValues` and is never written.
    const reloaded = await models.RoadmapTask.findByPk(step.id);
    expect(reloaded.talkIds).toEqual([talk.id]);
  });

  it('leaves a step with no talks as an empty list, not null', async () => {
    const step = await models.RoadmapTask.create({
      roadmapId: roadmap.id, title: 'Build a REST API', type: 'project',
      description: 'Ship it.', deliverable: 'GitHub link',
      taskOrder: 1, difficulty: 'medium',
    });
    const reloaded = await models.RoadmapTask.findByPk(step.id);
    expect(reloaded.talkIds).toEqual([]);
  });
});

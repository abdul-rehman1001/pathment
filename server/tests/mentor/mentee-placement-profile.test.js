'use strict';

/**
 * Placing somebody in a clan as a mentee must give them a mentee profile.
 *
 * The bug: `mentee_profiles` was only written at registration, and only for
 * somebody who signed up AS a mentee. `clanService.addMember` granted the mentee
 * capability and created the enrollment, but not the profile row. So a mentor
 * added to a clan as a learner had a membership, an enrollment and the
 * capability, and no profile — and every `/gamification/user/:id/*` endpoint,
 * all of which key on that row, answered 404 on their own You screen.
 *
 * These lock in: the row is created with the placement, an existing one is left
 * alone rather than reset, and adding a mentor as a mentor still creates
 * nothing.
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const gamificationService = require('../../src/services/gamificationService');
const { cleanDb, createMentor, createMentee, createProgram } = require('../helpers/seed');

describe('a mentee placement carries a mentee profile', () => {
  let lead, program, clan;

  beforeEach(async () => {
    await cleanDb();
    lead = await createMentor({ email: 'lead@test.com' });
    program = await createProgram({ createdBy: lead.id });
    clan = await models.Clan.create({
      programId: program.id,
      name: 'Backend Bears',
      leadMentorId: lead.id,
      createdBy: lead.id,
    });
    await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });
  });

  it('creates one for a mentor placed as a learner, who had none', async () => {
    const alsoLearning = await createMentor({ email: 'both@test.com' });

    expect(await models.MenteeProfile.findOne({ where: { userId: alsoLearning.id } })).toBeNull();

    await clanService.addMember(clan.id, { userId: alsoLearning.id, role: 'mentee' });

    const profile = await models.MenteeProfile.findOne({ where: { userId: alsoLearning.id } });
    expect(profile).not.toBeNull();
    expect(Number(profile.totalPoints)).toBe(0);
    expect(profile.currentLevel).toBe(1);
  });

  it('lets that person read their own points instead of a 404', async () => {
    const alsoLearning = await createMentor({ email: 'both@test.com' });
    await clanService.addMember(clan.id, { userId: alsoLearning.id, role: 'mentee' });

    const stats = await gamificationService.getUserGamificationStats(alsoLearning.id);
    expect(stats).toBeTruthy();
  });

  it('leaves an existing profile alone rather than resetting their points', async () => {
    const mentee = await createMentee({ email: 'learner@test.com' });
    const before = await models.MenteeProfile.findOne({ where: { userId: mentee.id } });
    await before.update({ totalPoints: 240, currentLevel: 3 });

    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });

    const after = await models.MenteeProfile.findOne({ where: { userId: mentee.id } });
    expect(after.id).toBe(before.id);
    expect(Number(after.totalPoints)).toBe(240);
    expect(after.currentLevel).toBe(3);
  });

  it('creates nothing for somebody added to the team', async () => {
    const co = await createMentor({ email: 'co@test.com' });

    await clanService.addMember(clan.id, { userId: co.id, role: 'co_mentor' });

    expect(await models.MenteeProfile.findOne({ where: { userId: co.id } })).toBeNull();
  });

  it('creates exactly one when somebody is placed, removed and placed again', async () => {
    const alsoLearning = await createMentor({ email: 'both@test.com' });

    await clanService.addMember(clan.id, { userId: alsoLearning.id, role: 'mentee' });
    await clanService.removeMember(clan.id, alsoLearning.id, 'mentee');
    await clanService.addMember(clan.id, { userId: alsoLearning.id, role: 'mentee' });

    const profiles = await models.MenteeProfile.findAll({ where: { userId: alsoLearning.id } });
    expect(profiles).toHaveLength(1);
  });
});

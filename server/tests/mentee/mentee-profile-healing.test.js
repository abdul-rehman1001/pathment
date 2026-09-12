'use strict';

/**
 * Points & Badges answered `404 Mentee profile not found` to people who really
 * were mentees.
 *
 * `mentee_profiles` is what points, badges, levels and the leaderboard hang
 * off, and registration only writes that row for somebody who signed up AS a
 * mentee. Anybody who became a learner afterwards — a mentor placed into a clan
 * as a member — got a membership, an enrollment and the mentee capability but
 * no profile row, so their own Points & Badges screen was a red error box.
 *
 * Placement writes the row now, and the read path heals it, so the fix does not
 * depend on a backfill script having been run against a given database.
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const gamificationService = require('../../src/services/gamificationService');
const { cleanDb, createMentor, createProgram } = require('../helpers/seed');

describe('a mentor who also learns in a clan', () => {
  let lead, dual, program, clan;

  beforeEach(async () => {
    await cleanDb();
    lead = await createMentor({ email: 'lead@test.com' });
    dual = await createMentor({ email: 'dual@test.com' });
    program = await createProgram({ createdBy: lead.id });
    clan = await models.Clan.create({
      programId: program.id, name: 'Community', leadMentorId: lead.id, createdBy: lead.id
    });
    await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });
    await clanService.addMember(clan.id, { userId: dual.id, role: 'mentee' });
  });

  it('gets a mentee profile the moment they are placed', async () => {
    const profile = await models.MenteeProfile.findOne({ where: { userId: dual.id } });
    expect(profile).not.toBeNull();
    expect(Number(profile.totalPoints)).toBe(0);
    expect(Number(profile.currentLevel)).toBe(1);
  });

  it('reads their own stats even if the row was never written', async () => {
    // Exactly the state everybody placed before the placement fix is in.
    await models.MenteeProfile.destroy({ where: { userId: dual.id } });

    const stats = await gamificationService.getUserGamificationStats(dual.id);
    expect(stats.totalPoints).toBe(0);
    expect(stats.totalBadges).toBe(0);
    expect(await models.MenteeProfile.findOne({ where: { userId: dual.id } })).not.toBeNull();
  });

  it('heals without clobbering a profile that already has points', async () => {
    await models.MenteeProfile.update({ totalPoints: 250 }, { where: { userId: dual.id } });
    const stats = await gamificationService.getUserGamificationStats(dual.id);
    expect(stats.totalPoints).toBe(250);
  });

  it('still 404s for somebody who is not a learner anywhere', async () => {
    await expect(gamificationService.getUserGamificationStats(lead.id))
      .rejects.toThrow(/Mentee profile not found/);
  });
});

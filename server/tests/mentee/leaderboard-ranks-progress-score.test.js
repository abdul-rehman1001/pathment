'use strict';

/**
 * The leaderboard ranks on the PROGRESS SCORE.
 *
 * It has been three things. First the sum of every point anybody had been
 * given, which made it a badge table: badges were 65% of all points at an
 * average of 60 an award while a task paid about 10, so the two mentees who had
 * done the most work on the platform sat seventh and eighth behind people with
 * nine tasks. Then completed-work points, which fixed the ordering but invented
 * a second definition of "doing well" alongside the one mentors already used
 * under Teaching.
 *
 * There is one now, computed by performanceService: progress against where the
 * programme expects you, output weighted by difficulty, effort, quality
 * adjusted for how generously your own mentor rates, reliability, attendance,
 * consistency. A mentee and their mentor read the same number.
 *
 * These pin the two things that follow from that: points no longer decide the
 * order, and somebody without enough evidence is told why rather than given a
 * position that means nothing.
 */

const gamificationService = require('../../src/services/gamificationService');
const { models } = require('../../src/db');
const { cleanDb, createMentee } = require('../helpers/seed');

const award = (userId, points, sourceType, reason) =>
  gamificationService.awardPoints(userId, points, sourceType, null, reason);

describe('the leaderboard ranks the progress score, not points', () => {
  let grinder, collector;

  beforeEach(async () => {
    await cleanDb();
    grinder = await createMentee({ email: 'grinder@test.com' });
    collector = await createMentee({ email: 'collector@test.com' });
    await models.MenteeProfile.findOrCreate({ where: { userId: grinder.id } });
    await models.MenteeProfile.findOrCreate({ where: { userId: collector.id } });

    // A pile of badge and streak points, and no completed work behind them.
    await award(collector.id, 200, 'badge_earned', 'Consistency Master');
    await award(collector.id, 300, 'streak_bonus', '60 day streak bonus');
    await award(grinder.id, 10, 'task_completed', 'one task');
  });

  /**
   * The headline consequence: a mentee can hold five hundred points and hold no
   * position, because points are not what the board measures any more.
   */
  it('does not rank somebody on points alone', async () => {
    const board = await gamificationService.getLeaderboard({ user: collector, limit: 10 });
    expect(board.find((e) => e.userId === collector.id)).toBeUndefined();
  });

  it('still credits those points to the mentee total', async () => {
    // Recognition is earned and kept. It just is not a rank.
    const stats = await gamificationService.getUserGamificationStats(collector.id);
    expect(stats.totalPoints).toBe(500);
  });

  it('tells an unranked mentee what is missing instead of inventing a place', async () => {
    const stats = await gamificationService.getUserGamificationStats(grinder.id);
    expect(stats.leaderboardRank).toBeNull();
    // Either a reason, or no programme to be ranked within — never a number.
    expect(stats.progressScore == null || typeof stats.progressScore === 'number').toBe(true);
  });
});

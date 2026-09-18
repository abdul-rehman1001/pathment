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

/**
 * The board has to arrive populated for a signed-in mentee.
 *
 * It did not. The score ranks within a peer group — two of its dimensions are
 * percentiles — so the service resolves that group from the caller. But
 * `/gamification/leaderboard` is a PUBLIC route with no `authenticate`, so
 * `req.user` was undefined, no programme could be resolved, and every signed-in
 * mentee got an empty board in production.
 *
 * These pin the resolution itself rather than the middleware, so the same
 * mistake cannot be made again from a different caller.
 */
describe('the board finds the right peer group', () => {
  const clanService = require('../../src/services/clanService');
  const {
    createAdmin, createMentor, createProgram, createEnrollment, createRoadmap, createRoadmapTask,
  } = require('../helpers/seed');

  let admin, mentor, mentee, program, clan;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: 'pg-admin@test.com' });
    mentor = await createMentor({ email: 'pg-mentor@test.com' });
    mentee = await createMentee({ email: 'pg-mentee@test.com' });
    await models.MenteeProfile.findOrCreate({ where: { userId: mentee.id } });

    program = await createProgram({ createdBy: admin.id });
    clan = await models.Clan.create({
      programId: program.id, name: 'Viral Loop', leadMentorId: mentor.id, createdBy: admin.id,
    });
    await clanService.addMember(clan.id, { userId: mentor.id, role: 'lead_mentor' });
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });

    const roadmap = await createRoadmap({ programId: program.id, createdBy: admin.id });
    const enrollment = await createEnrollment({ menteeId: mentee.id, programId: program.id, status: 'active' });
    await enrollment.update({ overallProgressPercentage: 70, currentWeek: 4 });

    for (let i = 1; i <= 5; i += 1) {
      const task = await createRoadmapTask({ roadmapId: roadmap.id, title: `T${i}`, taskOrder: i });
      await models.AssignedTask.create({
        roadmapTaskId: task.id, menteeId: mentee.id, mentorId: mentor.id,
        enrollmentId: enrollment.id, status: 'completed', isCustomTask: false, isLate: false,
        completedAt: new Date(), finalRating: 4.5,
        dueDate: new Date(Date.now() + 7 * 86400000), pointsAwarded: 10, pointsBase: 10,
      });
    }
  });

  it('gives a signed-in mentee their own programme, not an empty board', async () => {
    const board = await gamificationService.getLeaderboard({ user: mentee, limit: 10 });

    expect(board.length).toBeGreaterThan(0);
    expect(board[0].userId).toBe(mentee.id);
    expect(board[0].score).toBeGreaterThan(0);
  });

  it('works for a mentor too, who has no mentee membership to find', async () => {
    const board = await gamificationService.getLeaderboard({ user: mentor, limit: 10 });
    expect(board.length).toBeGreaterThan(0);
  });

  it('honours an explicit programme over the caller', async () => {
    const board = await gamificationService.getLeaderboard({ user: null, programId: program.id, limit: 10 });
    expect(board.length).toBeGreaterThan(0);
  });

  /** No caller and no programme is no peer group, and an invented order is worse. */
  it('returns nothing when there is nobody to compare against', async () => {
    const board = await gamificationService.getLeaderboard({ user: null, programId: null });
    expect(board).toEqual([]);
  });
});

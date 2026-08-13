'use strict';

/**
 * Home said "3 days logged in a row". Points said 0. Both were reporting "your
 * streak".
 *
 * The phone counted consecutive days in the daily log. The server kept a
 * counter on the mentee profile that was advanced from exactly one place, when
 * a mentor approved a submission, so it was really a run of days somebody got
 * work approved. A mentee logging every day while waiting on a review watched
 * one screen climb and the other sit at zero.
 *
 * These pin the single definition: the daily log is the streak, the server
 * counts it from those rows, and logging a day is what moves it.
 */

const gamificationService = require('../../src/services/gamificationService');
const dailyLogService = require('../../src/services/dailyLogService');
const { models } = require('../../src/db');
const { shiftDayKey } = require('../../src/services/streak');
const { cleanDb, createMentee } = require('../helpers/seed');
const { todayInZone } = require('../../src/utils/timezone');

const TODAY = () => todayInZone('UTC');

async function logDays(menteeId, count, endingOn = TODAY()) {
  for (let index = count - 1; index >= 0; index -= 1) {
    await dailyLogService.upsert(menteeId, {
      dateKey: shiftDayKey(endingOn, -index),
      tasksDone: [],
      slotsDone: [],
      note: 'Worked on it',
    });
  }
}

describe('where a streak comes from', () => {
  let mentee;

  beforeEach(async () => {
    await cleanDb();
    mentee = await createMentee();
    await models.MenteeProfile.findOrCreate({ where: { userId: mentee.id } });
    await models.UserSettings.findOrCreate({
      where: { userId: mentee.id },
      defaults: { timezone: 'UTC' },
    });
  });

  it('is zero before anything is logged', async () => {
    const stats = await gamificationService.getUserGamificationStats(mentee.id);
    expect(stats.currentStreak).toBe(0);
  });

  it('counts the days in the log, with no approval needed', async () => {
    await logDays(mentee.id, 3);

    const stats = await gamificationService.getUserGamificationStats(mentee.id);
    expect(stats.currentStreak).toBe(3);
  });

  /** The bug, stated directly: both screens read one number. */
  it('gives the same answer to the log screen and the points screen', async () => {
    await logDays(mentee.id, 5);

    const fromLog = await gamificationService.readStreak(mentee.id);
    const fromStats = await gamificationService.getUserGamificationStats(mentee.id);

    expect(fromStats.currentStreak).toBe(fromLog.current);
    expect(fromStats.currentStreak).toBe(5);
  });

  it('writes the counted value onto the profile, which badges read', async () => {
    await logDays(mentee.id, 4);

    const profile = await models.MenteeProfile.findOne({ where: { userId: mentee.id } });
    expect(Number(profile.currentStreakDays)).toBe(4);
  });

  it('breaks when a day is missed', async () => {
    // Three days ending a week ago, and nothing since.
    await logDays(mentee.id, 3, shiftDayKey(TODAY(), -7));

    const stats = await gamificationService.getUserGamificationStats(mentee.id);
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(3);
  });

  it('does not break just because today is not logged yet', async () => {
    await logDays(mentee.id, 2, shiftDayKey(TODAY(), -1));

    const stats = await gamificationService.getUserGamificationStats(mentee.id);
    expect(stats.currentStreak).toBe(2);
  });

  it('repairs a stored counter that disagrees with the log', async () => {
    await models.MenteeProfile.update(
      { currentStreakDays: 99 },
      { where: { userId: mentee.id } },
    );

    await logDays(mentee.id, 2);

    // Nothing had to be migrated. The next write recounts and the wrong number
    // is gone, which is the point of deriving it.
    const stats = await gamificationService.getUserGamificationStats(mentee.id);
    expect(stats.currentStreak).toBe(2);
  });

  it('never lowers a longest streak somebody has already been shown', async () => {
    await models.MenteeProfile.update(
      { longestStreakDays: 40 },
      { where: { userId: mentee.id } },
    );

    await logDays(mentee.id, 2);

    const stats = await gamificationService.getUserGamificationStats(mentee.id);
    expect(stats.longestStreak).toBe(40);
  });

  describe('the milestone bonus', () => {
    async function bonusRows() {
      return models.PointsHistory.findAll({
        where: { userId: mentee.id, sourceType: 'streak_bonus' },
      });
    }

    it('is paid once when the seventh day is logged', async () => {
      await logDays(mentee.id, 7);
      expect(await bonusRows()).toHaveLength(1);
    });

    // Recounting happens on every log and on every read, so this is the one
    // that would quietly pay somebody five times for the same week.
    it('is not paid again for recounting the same streak', async () => {
      await logDays(mentee.id, 7);
      await gamificationService.updateStreak(mentee.id);
      await gamificationService.updateStreak(mentee.id);

      expect(await bonusRows()).toHaveLength(1);
    });

    it('is not paid before the milestone', async () => {
      await logDays(mentee.id, 6);
      expect(await bonusRows()).toHaveLength(0);
    });
  });
});

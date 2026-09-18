'use strict';

/**
 * Migration 102, exercised against the shape production was actually in.
 *
 * Laiba Azeem's ledger: the 7/14/30/60 set paid once legitimately, then the
 * whole set again three more times over the following month. 3,276 points
 * shown, 1,326 earned. The repair keeps the first award of each milestone and
 * takes back the repeats, then rebuilds the running total so the history reads
 * straight rather than describing a sequence that never happened.
 */

const { models } = require('../../src/db');
const { up } = require('../../scripts/migrations/102_repair_duplicate_streak_bonuses');
const { cleanDb, createMentee } = require('../helpers/seed');

/** Append a ledger row, maintaining the running total the way awardPoints does. */
async function award(userId, change, sourceType, reason, running) {
  await models.PointsHistory.create({
    userId, pointsChange: change, pointsBefore: running,
    pointsAfter: running + change, sourceType, reason,
  });
  return running + change;
}

describe('repairing duplicated streak bonuses', () => {
  let mentee, clean;

  beforeEach(async () => {
    await cleanDb();
    mentee = await createMentee({ email: 'inflated@test.com' });
    clean = await createMentee({ email: 'honest@test.com' });
    await models.MenteeProfile.findOrCreate({ where: { userId: mentee.id } });
    await models.MenteeProfile.findOrCreate({ where: { userId: clean.id } });

    // The inflated mentee: real work, then the same milestones over and over.
    let running = 0;
    running = await award(mentee.id, 141, 'task_completed', 'tasks', running);
    for (let round = 0; round < 4; round += 1) {
      running = await award(mentee.id, 50, 'streak_bonus', '7 day streak bonus', running);
      running = await award(mentee.id, 100, 'streak_bonus', '14 day streak bonus', running);
      running = await award(mentee.id, 200, 'streak_bonus', '30 day streak bonus', running);
      running = await award(mentee.id, 300, 'streak_bonus', '60 day streak bonus', running);
    }
    await models.MenteeProfile.update(
      { totalPoints: running, currentLevel: 3 }, { where: { userId: mentee.id } }
    );

    // Somebody who was paid correctly must come through untouched.
    let honest = 0;
    honest = await award(clean.id, 80, 'task_completed', 'tasks', honest);
    honest = await award(clean.id, 50, 'streak_bonus', '7 day streak bonus', honest);
    await models.MenteeProfile.update(
      { totalPoints: honest, currentLevel: 1 }, { where: { userId: clean.id } }
    );
  });

  it('keeps one award per milestone and takes back the repeats', async () => {
    const result = await up();

    expect(result.removed).toBe(12);          // three extra rounds of four
    expect(result.pointsRemoved).toBe(1950);

    const rows = await models.PointsHistory.findAll({
      where: { userId: mentee.id, sourceType: 'streak_bonus' }, raw: true
    });
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.pointsChange).sort((a, b) => a - b)).toEqual([50, 100, 200, 300]);
  });

  it('corrects the total and the level to what was really earned', async () => {
    await up();

    const profile = await models.MenteeProfile.findOne({ where: { userId: mentee.id } });
    expect(Number(profile.totalPoints)).toBe(791);   // 141 of work + 650 of streaks
    expect(Number(profile.currentLevel)).toBe(2);    // was 3 on inflated points
  });

  it('rebuilds the running total so the history reads straight', async () => {
    await up();

    const rows = await models.PointsHistory.findAll({
      where: { userId: mentee.id }, order: [['createdAt', 'ASC'], ['id', 'ASC']], raw: true
    });
    let expected = 0;
    for (const row of rows) {
      expect(Number(row.pointsBefore)).toBe(expected);
      expected += Number(row.pointsChange);
      expect(Number(row.pointsAfter)).toBe(expected);
    }
  });

  it('leaves a correctly paid mentee alone', async () => {
    await up();

    const profile = await models.MenteeProfile.findOne({ where: { userId: clean.id } });
    expect(Number(profile.totalPoints)).toBe(130);
    const rows = await models.PointsHistory.findAll({ where: { userId: clean.id }, raw: true });
    expect(rows).toHaveLength(2);
  });

  it('does nothing on a second run', async () => {
    await up();
    const second = await up();

    expect(second.removed).toBe(0);
    const profile = await models.MenteeProfile.findOne({ where: { userId: mentee.id } });
    expect(Number(profile.totalPoints)).toBe(791);
  });

  it('reports without writing when asked to preview', async () => {
    const result = await up({ dryRun: true });

    expect(result.removed).toBe(0);
    const rows = await models.PointsHistory.findAll({
      where: { userId: mentee.id, sourceType: 'streak_bonus' }, raw: true
    });
    expect(rows).toHaveLength(16);   // untouched
  });
});

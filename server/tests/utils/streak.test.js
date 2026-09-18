'use strict';

/**
 * The counting rule, on its own, with no database.
 *
 * These cases are deliberately the same ones the mobile client tests, because
 * the two are separate implementations of one rule and the only thing stopping
 * them drifting apart is that they are pinned to the same examples.
 */

const {
  shiftDayKey,
  currentStreak,
  longestStreak,
  milestonesReached,
  milestoneFromReason,
} = require('../../src/services/streak');

describe('shiftDayKey', () => {
  it('moves whole calendar days', () => {
    expect(shiftDayKey('2026-08-14', -1)).toBe('2026-08-13');
    expect(shiftDayKey('2026-08-14', 1)).toBe('2026-08-15');
  });

  it('crosses months and years', () => {
    expect(shiftDayKey('2026-09-01', -1)).toBe('2026-08-31');
    expect(shiftDayKey('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('knows about leap years', () => {
    expect(shiftDayKey('2028-03-01', -1)).toBe('2028-02-29');
    expect(shiftDayKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  // The keys are calendar labels, not instants. Stepping through a clock change
  // must not produce the same day twice or skip one.
  it('is unaffected by daylight saving', () => {
    expect(shiftDayKey('2026-03-29', -1)).toBe('2026-03-28');
    expect(shiftDayKey('2026-10-25', -1)).toBe('2026-10-24');
  });
});

describe('currentStreak', () => {
  const TODAY = '2026-08-14';

  it('is nothing when nothing has been logged', () => {
    expect(currentStreak([], TODAY)).toBe(0);
  });

  it('counts a run ending today', () => {
    expect(currentStreak(['2026-08-12', '2026-08-13', '2026-08-14'], TODAY)).toBe(3);
  });

  /**
   * The important one. Somebody who has not logged yet today has not broken
   * anything: it may be nine in the morning. Ending the run at midnight would
   * have every mentee wake up to a number they earned reading zero.
   */
  it('still counts a run ending yesterday', () => {
    expect(currentStreak(['2026-08-12', '2026-08-13'], TODAY)).toBe(2);
  });

  it('is broken by a gap of one day', () => {
    expect(currentStreak(['2026-08-10', '2026-08-11', '2026-08-14'], TODAY)).toBe(1);
    expect(currentStreak(['2026-08-10', '2026-08-11'], TODAY)).toBe(0);
  });

  it('does not care what order the days arrive in', () => {
    expect(currentStreak(['2026-08-14', '2026-08-12', '2026-08-13'], TODAY)).toBe(3);
  });

  it('counts a day logged twice once', () => {
    expect(currentStreak(['2026-08-13', '2026-08-13', '2026-08-14'], TODAY)).toBe(2);
  });

  it('ignores a day it cannot read rather than throwing', () => {
    expect(currentStreak(['not a date', '2026-08-14'], TODAY)).toBe(1);
  });

  it('counts across a month boundary', () => {
    expect(currentStreak(['2026-07-31', '2026-08-01'], '2026-08-01')).toBe(2);
  });

  it('is not clipped by any window', () => {
    const fifty = Array.from({ length: 50 }, (_, index) => shiftDayKey(TODAY, -index));
    expect(currentStreak(fifty, TODAY)).toBe(50);
  });
});

describe('longestStreak', () => {
  it('is nothing when nothing has been logged', () => {
    expect(longestStreak([])).toBe(0);
  });

  it('finds the best run, wherever it sits', () => {
    expect(
      longestStreak([
        '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04',
        '2026-02-10',
        '2026-03-01', '2026-03-02',
      ]),
    ).toBe(4);
  });

  it('counts a single lonely day as one', () => {
    expect(longestStreak(['2026-01-01'])).toBe(1);
  });
});

describe('milestonesReached', () => {
  /**
   * The old rule took (previous, current) and paid everything in between, so it
   * depended on a stored counter. That counter drops to zero whenever a streak
   * breaks — or whenever a recount runs before the day's first log — and the
   * next call re-paid every milestone under the streak.
   *
   * It was not theoretical. In production eleven mentees collected 8,250 points
   * that way; one was paid the seven-day bonus eight times, another took the
   * whole 7/14/30/60 set four times and sat top of the leaderboard on 3,276
   * points having earned 1,326.
   *
   * The test below that asserted "pays again for a milestone reached again
   * after a break" is gone: it described the overpayment as intended. What has
   * been paid is now a fact about the ledger, and this function only says what
   * a run of a given length qualifies for.
   */
  it('lists every milestone at or below the run', () => {
    expect(milestonesReached(7)).toEqual([7]);
    expect(milestonesReached(30)).toEqual([7, 14, 30]);
    expect(milestonesReached(100)).toEqual([7, 14, 30, 60, 100]);
  });

  it('lists nothing below the first milestone', () => {
    expect(milestonesReached(0)).toEqual([]);
    expect(milestonesReached(6)).toEqual([]);
  });

  it('does not care what the streak was before — that is the whole point', () => {
    // Same answer whether the mentee just got here or has been here for weeks.
    expect(milestonesReached(60)).toEqual(milestonesReached(60));
    expect(milestonesReached(61)).toEqual([7, 14, 30, 60]);
  });
});

describe('milestoneFromReason', () => {
  // How an already-paid bonus is recognised in the ledger, including the rows
  // written before any of this was fixed.
  it('reads the milestone back out of a ledger reason', () => {
    expect(milestoneFromReason('7 day streak bonus')).toBe(7);
    expect(milestoneFromReason('100 day streak bonus')).toBe(100);
  });

  it('ignores anything that is not a milestone we pay for', () => {
    expect(milestoneFromReason('9 day streak bonus')).toBeNull();
    expect(milestoneFromReason('task completed')).toBeNull();
    expect(milestoneFromReason(null)).toBeNull();
    expect(milestoneFromReason('')).toBeNull();
  });
});

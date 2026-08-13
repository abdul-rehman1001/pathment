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
  milestonesCrossed,
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

describe('milestonesCrossed', () => {
  it('pays once for the milestone just reached', () => {
    expect(milestonesCrossed(6, 7)).toEqual([7]);
  });

  // Recounting is allowed to happen several times a day, so this is what stops
  // the same seven days being paid for twice.
  it('pays nothing for standing still', () => {
    expect(milestonesCrossed(7, 7)).toEqual([]);
    expect(milestonesCrossed(8, 8)).toEqual([]);
  });

  it('pays for every milestone crossed at once, which backfilling can do', () => {
    expect(milestonesCrossed(5, 30)).toEqual([7, 14, 30]);
  });

  it('pays nothing when a streak breaks', () => {
    expect(milestonesCrossed(9, 1)).toEqual([]);
    expect(milestonesCrossed(30, 0)).toEqual([]);
  });

  it('pays again for a milestone reached again after a break', () => {
    expect(milestonesCrossed(6, 7)).toEqual([7]);
  });
});

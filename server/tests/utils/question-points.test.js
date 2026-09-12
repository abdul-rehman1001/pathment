'use strict';

/**
 * Kit questions on the same points curve as everything else.
 *
 * config/points.js has said since the leaderboard shipped that points follow
 * difficulty and there are no hand-typed per-task numbers, and kit questions
 * were the one place that was not enforced. The field was free at both ends, so
 * a mentor saved 10000 and a two question interview came out worth 10,100:
 * more than a mentee earns in a year of finishing steps, and enough to make two
 * mentees on two mentors' kits incomparable.
 */

const {
  TASK_POINTS_BY_DIFFICULTY,
  snapToDifficultyPoints,
} = require('../../src/config/points');

describe('snapToDifficultyPoints', () => {
  // The exact numbers from the report.
  it('brings a typed number back onto the curve', () => {
    expect(snapToDifficultyPoints(10000)).toBe(40);
    expect(snapToDifficultyPoints(100)).toBe(40);
  });

  it('leaves a value already on it alone', () => {
    for (const points of Object.values(TASK_POINTS_BY_DIFFICULTY)) {
      expect(snapToDifficultyPoints(points)).toBe(points);
    }
  });

  // Snapped rather than rejected: a kit written before the rule still has to
  // save, and the nearest step is what the phone shows for it.
  it('picks the nearest step for anything in between', () => {
    expect(snapToDifficultyPoints(6)).toBe(5);
    expect(snapToDifficultyPoints(12)).toBe(10);
    expect(snapToDifficultyPoints(25)).toBe(20);
    expect(snapToDifficultyPoints(0)).toBe(5);
  });

  it('falls back to the middle rather than to NaN', () => {
    expect(snapToDifficultyPoints(undefined)).toBe(TASK_POINTS_BY_DIFFICULTY.medium);
    expect(snapToDifficultyPoints(null)).toBe(TASK_POINTS_BY_DIFFICULTY.medium);
    expect(snapToDifficultyPoints('lots')).toBe(TASK_POINTS_BY_DIFFICULTY.medium);
  });

  it('never lets a kit be worth an arbitrary amount', () => {
    const kit = [10000, 100, 7, 3].map(snapToDifficultyPoints);
    expect(kit.every((points) => Object.values(TASK_POINTS_BY_DIFFICULTY).includes(points))).toBe(true);
  });
});

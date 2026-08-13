'use strict';

/**
 * What a streak is.
 *
 * Pathment had two answers to that and they disagreed on screen. The phone
 * counted consecutive days in the daily log and said "3 days logged in a row".
 * The server kept a counter on the mentee profile that was only ever advanced
 * when a mentor approved a submission, so it was really a run of days somebody
 * got work approved, and the Points screen showed it under the same word. A
 * mentee logging every day and waiting on a review saw a growing streak in one
 * place and a zero in the other.
 *
 * The daily log wins, because it is the thing a mentee controls and the thing
 * the product asks of them: show up and say what you did. An approval depends
 * on somebody else being at their desk, and a streak nobody can protect by
 * their own effort is not a streak.
 *
 * The counting lives here, in one file, with no database in it, so both the
 * "what is it now" read and the "did they just earn a badge" write can use the
 * same function, and so the rule can be tested against a list of dates.
 *
 * These functions mirror `currentStreak` on the mobile client exactly. The two
 * are separate implementations of one rule, which is not ideal, but it is the
 * price of the phone being able to answer offline. The tests on both sides use
 * the same cases so they cannot drift apart quietly.
 */

/** Shift a 'YYYY-MM-DD' key by whole days, staying in calendar terms. */
function shiftDayKey(dateKey, offsetDays) {
  // Parsed as UTC on purpose. These keys are already calendar days in
  // somebody's own zone, so this is date arithmetic on a label, not a moment
  // in time, and going through UTC keeps it free of daylight saving.
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().split('T')[0];
}

const VALID_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Days logged in an unbroken run ending today or yesterday.
 *
 * Yesterday still counts. Somebody who has not logged yet today has not broken
 * anything: it may be nine in the morning. Ending the run at midnight would
 * mean every mentee starts each day watching a number they earned drop to zero.
 *
 * @param {string[]} dateKeys  every logged day, 'YYYY-MM-DD', any order
 * @param {string} todayKey    today in the mentee's own zone
 */
function currentStreak(dateKeys, todayKey) {
  const logged = new Set(dateKeys.filter((key) => VALID_KEY.test(key)));

  const startsToday = logged.has(todayKey);
  if (!startsToday && !logged.has(shiftDayKey(todayKey, -1))) return 0;

  let streak = 0;
  let cursor = startsToday ? todayKey : shiftDayKey(todayKey, -1);

  while (logged.has(cursor)) {
    streak += 1;
    cursor = shiftDayKey(cursor, -1);
  }

  return streak;
}

/**
 * The longest unbroken run anywhere in the history, whether or not it reaches
 * today. This is what "longest streak" on the Points screen means.
 */
function longestStreak(dateKeys) {
  const sorted = [...new Set(dateKeys.filter((key) => VALID_KEY.test(key)))].sort();
  if (sorted.length === 0) return 0;

  let longest = 1;
  let run = 1;

  for (let index = 1; index < sorted.length; index += 1) {
    run = sorted[index] === shiftDayKey(sorted[index - 1], 1) ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  return longest;
}

/** The milestones worth a bonus, and what each is worth. */
const STREAK_BONUSES = { 7: 50, 14: 100, 30: 200, 60: 300, 100: 500 };

/**
 * Which milestones a streak has just passed.
 *
 * Given where it was and where it now is, this returns the milestones in
 * between. Two things depend on it. A streak recounted rather than incremented
 * can be recomputed several times in one day, and this returns nothing the
 * second time, so nobody is paid twice for the same seven days. And a mentee
 * backfilling days they forgot to log can cross more than one milestone at
 * once, which the old code, only ever able to step by one, could not express.
 */
function milestonesCrossed(previous, current) {
  return Object.keys(STREAK_BONUSES)
    .map(Number)
    .filter((milestone) => milestone > previous && milestone <= current)
    .sort((left, right) => left - right);
}

module.exports = {
  shiftDayKey,
  currentStreak,
  longestStreak,
  milestonesCrossed,
  STREAK_BONUSES,
};

/**
 * Standard task points — the single source of truth.
 *
 * A task's points are determined ENTIRELY by its difficulty, so the same
 * difficulty always earns the same points for every mentee. Mentors set
 * difficulty; points follow. This keeps grading consistent and the leaderboard
 * fair/ungameable (no hand-typed per-task numbers).
 *
 * To re-tune the curve org-wide, change it here (or later, surface it as an
 * admin setting in system_settings and read the override before falling back).
 */
const TASK_POINTS_BY_DIFFICULTY = Object.freeze({
  easy: 5,
  medium: 10,
  hard: 20,
  expert: 40,
});

// Fallback when a difficulty is missing/unknown (difficulty is required on
// roadmap tasks, so this is just a safety net) — the neutral middle.
const DEFAULT_TASK_POINTS = TASK_POINTS_BY_DIFFICULTY.medium;

/** The standard points for a difficulty (case-insensitive). */
function pointsForDifficulty(difficulty) {
  const key = String(difficulty || '').toLowerCase();
  return TASK_POINTS_BY_DIFFICULTY[key] ?? DEFAULT_TASK_POINTS;
}

/**
 * A question's points, brought onto the same curve as everything else.
 *
 * Kit questions were the one place the rule above was not applied: the field
 * was free at both ends, so a mentor could save 10000 and a two question
 * interview was worth more than a mentee earns in a year of finishing steps.
 * Two mentees on two mentors' kits were not comparable, which is the one thing
 * this file exists to prevent.
 *
 * Snapped rather than rejected. A kit written before the rule still has to
 * save, and the nearest step is what the phone shows for it, so the number it
 * lands on is the number the mentor was already looking at.
 */
function snapToDifficultyPoints(points) {
  // null and an empty string both mean "not given", and both are 0 to Number,
  // which would snap them to the cheapest step rather than the neutral middle.
  if (points === null || points === undefined || points === '') return DEFAULT_TASK_POINTS;

  const value = Number(points);
  if (!Number.isFinite(value)) return DEFAULT_TASK_POINTS;

  return Object.values(TASK_POINTS_BY_DIFFICULTY).reduce((nearest, allowed) =>
    Math.abs(allowed - value) < Math.abs(nearest - value) ? allowed : nearest
  );
}

module.exports = {
  TASK_POINTS_BY_DIFFICULTY,
  DEFAULT_TASK_POINTS,
  pointsForDifficulty,
  snapToDifficultyPoints,
};

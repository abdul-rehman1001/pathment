const { models } = require('../db');

/**
 * One definition of "this person is a learner, give them the row that makes
 * that true".
 *
 * `mentee_profiles` is what points, badges, levels and the leaderboard hang
 * off. Registration only writes one for somebody who signed up AS a mentee, so
 * anybody who became a learner later — a mentor placed into a clan as a member,
 * an admin who joined a cohort — held a membership, an enrollment and the
 * mentee capability but no profile row, and every `/gamification/user/:id/*`
 * call answered `404 Mentee profile not found` on their own Points & Badges
 * screen.
 *
 * The shape below is what registration writes, so a row created here is
 * indistinguishable from one created there. Three callers share it — the
 * placement path (clanService), the read path (gamificationService) and the
 * one-off backfill — because three copies of it is how the read path came to
 * disagree with the write path in the first place.
 */
const MENTEE_PROFILE_DEFAULTS = {
  interests: [],
  currentEducation: null,
  currentOccupation: null,
  priorExperience: null,
  preferredLearningStyle: 'visual',
  learningGoals: [],
  currentLevel: 1,
  totalPoints: 0
};

/**
 * The user's mentee profile, created if it is missing. Idempotent, and safe to
 * call on a read path: it writes only the empty defaults, so healing a missing
 * row can never overwrite real data.
 *
 * Callers must have established that the person IS a learner — placement does
 * so by placing them; a read path should check the mentee capability first.
 */
async function ensureMenteeProfile(userId, options = {}) {
  if (!userId) return null;
  const [profile] = await models.MenteeProfile.findOrCreate({
    where: { userId },
    defaults: { userId, ...MENTEE_PROFILE_DEFAULTS },
    ...(options.transaction ? { transaction: options.transaction } : {})
  });
  return profile;
}

module.exports = { MENTEE_PROFILE_DEFAULTS, ensureMenteeProfile };

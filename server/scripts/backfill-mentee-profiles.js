/**
 * Give a mentee profile to anybody who is a mentee but never got one.
 *
 * Points, badges and the leaderboard all hang off `mentee_profiles`, and until
 * now that row was only created at registration, and only for somebody who
 * signed up AS a mentee. Placing an existing mentor into a clan as a learner
 * gave them a membership, an enrollment and the mentee capability, but no
 * profile row, so every `/gamification/user/:id/*` call answered 404 and their
 * own You screen was broken.
 *
 * `clanService.addMember` creates the row now, which stops it happening again.
 * This heals the people it already happened to.
 *
 * Safe to run repeatedly: it only creates what is missing and touches nothing
 * that exists, so running it twice gives the same answer as once.
 *
 * Run:        node server/scripts/backfill-mentee-profiles.js
 * Dry run:    node server/scripts/backfill-mentee-profiles.js --dry
 */
require('dotenv').config();

const { models, sequelize } = require('../src/db');

/** The same shape registration writes, so a healed row is indistinguishable. */
const DEFAULTS = {
  interests: [],
  currentEducation: null,
  currentOccupation: null,
  priorExperience: null,
  preferredLearningStyle: 'visual',
  learningGoals: [],
  currentLevel: 1,
  totalPoints: 0
};

async function main() {
  const dry = process.argv.includes('--dry');

  console.log(`▶ Finding mentees with no profile${dry ? ' (dry run, nothing will be written)' : ''}`);

  // Anybody holding a live mentee placement. A removed membership is not a
  // mentee, and a mentor with no mentee row has nothing to fix.
  const memberships = await models.ClanMembership.findAll({
    where: { role: 'mentee', status: ['active', 'paused'] },
    attributes: ['userId'],
    include: [{ model: models.Clan, as: 'clan', attributes: ['name'] }]
  });

  const userIds = [...new Set(memberships.map((row) => row.userId).filter(Boolean))];
  console.log(`  ${userIds.length} people are placed as a mentee`);

  let created = 0;
  let already = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      const existing = await models.MenteeProfile.findOne({ where: { userId } });
      if (existing) {
        already += 1;
        continue;
      }

      const user = await models.User.findByPk(userId, {
        attributes: ['id', 'firstName', 'lastName', 'email']
      });
      const who = user
        ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
        : userId.slice(0, 8);

      if (!dry) {
        await models.MenteeProfile.create({ userId, ...DEFAULTS });
      }

      created += 1;
      console.log(`  ${dry ? 'would create' : 'created'}  ${who}`);
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${userId.slice(0, 8)} failed: ${error.message}`);
    }
  }

  console.log(
    `\n${dry ? '✓ Dry run complete' : '✅ Done'} — ${created} ${dry ? 'to create' : 'created'}, ` +
      `${already} already had one` +
      (failed ? `, ${failed} failed` : '')
  );

  await sequelize.close();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Backfill failed:', error.message);
    process.exit(1);
  });

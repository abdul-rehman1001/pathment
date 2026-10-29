/**
 * Migration: 145_mentee_clan_change_request
 *
 * A mentee may now raise a clan change themselves, and a mentee does not
 * always know where they should go.
 *
 * `clan_change_requests` was built for the two origins that already existed,
 * and both of them name a destination up front: an admin raises the row
 * because they have already decided, and a mentor asks ONE named clan to take
 * their mentee. So `to_clan_id` was NOT NULL, which is correct for both.
 *
 * It is wrong for the mentee's own ask. "I am in the wrong clan and here is
 * why" is the whole of what most mentees can honestly say - the timezone
 * clashes, the pace is wrong, they cannot make the review slot. Which clan
 * fixes that is an admin's judgement, made against capacity and the roster
 * the mentee cannot see. Forcing them to name one would make them guess, and
 * a guess in that column reads downstream as a decision somebody made.
 *
 * So the destination becomes optional: NULL means "the mentee asked to move
 * and left the choice open", and the admin supplies the clan when they
 * approve. A mentee who does have a preference still names it, and it arrives
 * as exactly that - a preference the admin can accept or override.
 *
 * `origin` already allows any 20-character string at the database level (the
 * 'mentee' value is admitted by the model's own validation), and 'cancelled'
 * is already in `status`, so neither needs touching here.
 *
 * Partial index: the one read this adds is "this mentee's open ask", which the
 * mentee's own page runs on every visit and `createRequest` runs to refuse a
 * second one. Pending rows are a tiny fraction of the table forever, because
 * every row leaves that state and never returns.
 *
 * Reversible with one caveat, stated in `down()`.
 *
 * Run:      node server/scripts/migrations/145_mentee_clan_change_request.js
 * Preview:  node server/scripts/migrations/145_mentee_clan_change_request.js --dry-run
 * Rollback: node server/scripts/migrations/145_mentee_clan_change_request.js --rollback
 */
const sequelize = require('./_db');

const STATEMENTS = [
  'ALTER TABLE clan_change_requests ALTER COLUMN to_clan_id DROP NOT NULL',
  `CREATE INDEX IF NOT EXISTS clan_change_requests_mentee_pending_idx
     ON clan_change_requests (mentee_id)
     WHERE status = 'pending'`,
];

async function up({ dryRun = false } = {}) {
  console.log(dryRun ? '=== DRY RUN ===\n' : '▶ Running migration 145: mentee clan change requests\n');
  if (dryRun) {
    STATEMENTS.forEach((sql) => console.log(`${sql.replace(/\s+/g, ' ')} …`));
    console.log('\nRe-run without --dry-run to apply.');
    return;
  }
  await sequelize.transaction(async (transaction) => {
    for (const sql of STATEMENTS) await sequelize.query(sql, { transaction });
  });
  console.log('  ✓ clan_change_requests.to_clan_id is nullable');
  console.log('  ✓ clan_change_requests_mentee_pending_idx');
}

/**
 * Restoring NOT NULL fails if any open mentee request is still undecided, and
 * that is the right outcome: those rows are real asks from real people, and
 * silently inventing a destination for them to satisfy a constraint would be
 * worse than refusing. Decide them, or delete them, then roll back.
 */
async function down() {
  const [[{ count }]] = await sequelize.query(
    'SELECT COUNT(*)::int AS count FROM clan_change_requests WHERE to_clan_id IS NULL',
  );
  if (count > 0) {
    throw new Error(
      `${count} request(s) have no destination clan. Decide or delete them before rolling back.`,
    );
  }
  await sequelize.query('DROP INDEX IF EXISTS clan_change_requests_mentee_pending_idx');
  await sequelize.query('ALTER TABLE clan_change_requests ALTER COLUMN to_clan_id SET NOT NULL');
  console.log('  ✓ Reverted 145');
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback')
    ? down()
    : up({ dryRun: process.argv.includes('--dry-run') }))
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}

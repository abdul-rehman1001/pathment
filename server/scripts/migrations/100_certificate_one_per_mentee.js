/**
 * Migration: 100_certificate_one_per_mentee
 *
 * One certificate per person per template, enforced by the database.
 *
 * Both an admin and a mentor can issue for the same clan, often from rosters
 * loaded minutes apart, so two sends for the same people is ordinary traffic.
 * The service skips anyone already issued — but a check-then-insert races: two
 * requests can both read "not issued" before either writes. Only a unique index
 * actually prevents a mentee holding two of the same credential.
 *
 * Existing duplicates are collapsed first, keeping the NEWEST row. The newest is
 * the one that reflects the most recent decision — a mentor's override lands as
 * a later issuance — and it is the one whose certificate number has been shared
 * least widely.
 *
 * Run:      node server/scripts/migrations/100_certificate_one_per_mentee.js
 * Rollback: node server/scripts/migrations/100_certificate_one_per_mentee.js --rollback
 */
const sequelize = require('./_db');

const UNIQ = 'certificate_instances_template_mentee_uniq';

async function indexExists(name, t) {
  const [rows] = await sequelize.query(
    'SELECT 1 FROM pg_indexes WHERE indexname = :name',
    { replacements: { name }, transaction: t }
  );
  return rows.length > 0;
}

async function up() {
  console.log('▶ Running migration 100: one certificate per mentee per template');

  await sequelize.transaction(async (t) => {
    if (await indexExists(UNIQ, t)) {
      console.log(`  ℹ ${UNIQ} exists, skipping`);
      return;
    }

    // Collapse existing duplicates, newest kept.
    const [dupes] = await sequelize.query(
      `SELECT template_id, mentee_id, COUNT(*)::int AS copies
         FROM certificate_instances
        WHERE mentee_id IS NOT NULL
        GROUP BY template_id, mentee_id
       HAVING COUNT(*) > 1`,
      { transaction: t }
    );

    if (dupes.length) {
      const [removed] = await sequelize.query(
        `DELETE FROM certificate_instances
          WHERE id IN (
            SELECT id FROM (
              SELECT id,
                     ROW_NUMBER() OVER (
                       PARTITION BY template_id, mentee_id
                       ORDER BY created_at DESC, id DESC
                     ) AS rn
                FROM certificate_instances
               WHERE mentee_id IS NOT NULL
            ) ranked
            WHERE ranked.rn > 1
          )
          RETURNING id`,
        { transaction: t }
      );
      console.log(`  ✓ Collapsed ${dupes.length} duplicated credential(s), removing ${removed.length} extra row(s)`);
    } else {
      console.log('  ℹ No duplicate certificates found');
    }

    await sequelize.query(
      `CREATE UNIQUE INDEX ${UNIQ}
         ON certificate_instances (template_id, mentee_id)
       WHERE mentee_id IS NOT NULL`,
      { transaction: t }
    );
    console.log(`  ✓ Created unique index ${UNIQ}`);
  });

  console.log('✅ Migration 100 complete');
}

async function down() {
  console.log('▶ Rolling back migration 100');
  await sequelize.transaction(async (t) => {
    if (await indexExists(UNIQ, t)) {
      await sequelize.query(`DROP INDEX ${UNIQ}`, { transaction: t });
      console.log(`  ✓ Dropped ${UNIQ}`);
    }
    // Rows collapsed on the way up are NOT restored: they were duplicates of a
    // credential the recipient still holds, and re-creating them would hand
    // somebody two certificate numbers for one achievement.
    console.log('  ℹ Collapsed duplicates are not restored (by design)');
  });
  console.log('✅ Rollback 100 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => {
    try {
      await (isRollback ? down() : up());
      process.exit(0);
    } catch (e) {
      console.error('Migration failed:', e.message);
      process.exit(1);
    }
  })();
}

module.exports = { up, down };

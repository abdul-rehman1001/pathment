/**
 * Migration: 101_certificate_clan_approval
 *
 * The admin's approval of a clan, which is what unlocks issuing for it.
 *
 * The round has four states per clan, and only the last one is stored:
 *
 *   not sent   the admin has not handed the grades over yet
 *   pending    mentors are reviewing            } derived from
 *   verified   every mentee signed off          } certificate_verifications
 *   approved   the admin released it  ← THIS TABLE
 *
 * Verified and approved are deliberately different things. "My mentors have
 * finished checking" is the mentors' statement; "these may now go out" is the
 * admin's, and it is the second one that lets a mentor press send. Without the
 * split a clan finishing its review would start mailing certificates with
 * nobody having decided the cohort was ready.
 *
 * Run:      node server/scripts/migrations/101_certificate_clan_approval.js
 * Rollback: node server/scripts/migrations/101_certificate_clan_approval.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const UNIQ = 'certificate_clan_approvals_template_clan_uniq';

async function tableExists(table, t) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = :table`,
    { replacements: { table }, transaction: t }
  );
  return rows.length > 0;
}

async function indexExists(name, t) {
  const [rows] = await sequelize.query(
    'SELECT 1 FROM pg_indexes WHERE indexname = :name',
    { replacements: { name }, transaction: t }
  );
  return rows.length > 0;
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 101: admin approval per clan');

  await sequelize.transaction(async (t) => {
    if (await tableExists('certificate_clan_approvals', t)) {
      console.log('  ℹ certificate_clan_approvals exists, skipping create');
    } else {
      await qi.createTable('certificate_clan_approvals', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        template_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'certificate_templates', key: 'id' },
          onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        clan_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'clans', key: 'id' },
          onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        approved_by: {
          type: Sequelize.UUID, allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        approved_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        /**
         * Approving a clan whose mentors had NOT finished reviewing is allowed —
         * an admin is never blocked — but it is a different decision and worth
         * being able to see afterwards.
         */
        approved_before_verified: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        note: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
      }, { transaction: t });
      console.log('  ✓ Created certificate_clan_approvals');
    }

    if (await indexExists(UNIQ, t)) {
      console.log(`  ℹ ${UNIQ} exists, skipping`);
    } else {
      // A clan is approved or it is not — approving twice is the same fact, so
      // the second write updates the first rather than stacking.
      await sequelize.query(
        `CREATE UNIQUE INDEX ${UNIQ} ON certificate_clan_approvals (template_id, clan_id)`,
        { transaction: t }
      );
      console.log(`  ✓ Created unique index ${UNIQ}`);
    }

    // Certificates issued before this table existed were issued under the old
    // rule, where no approval was required. Back-fill an approval for every
    // clan that already has issued certificates, so those clans do not
    // suddenly look un-released and block their own mentors.
    const [clansWithIssued] = await sequelize.query(
      `SELECT DISTINCT ci.template_id, cm.clan_id
         FROM certificate_instances ci
         JOIN clan_memberships cm ON cm.user_id = ci.mentee_id AND cm.role = 'mentee'
         JOIN clans c ON c.id = cm.clan_id
        WHERE cm.clan_id IS NOT NULL`,
      { transaction: t }
    );
    let backfilled = 0;
    for (const row of clansWithIssued) {
      const [existing] = await sequelize.query(
        `SELECT 1 FROM certificate_clan_approvals
          WHERE template_id = :templateId AND clan_id = :clanId`,
        { replacements: { templateId: row.template_id, clanId: row.clan_id }, transaction: t }
      );
      if (existing.length) continue;
      await sequelize.query(
        `INSERT INTO certificate_clan_approvals
           (id, template_id, clan_id, approved_at, approved_before_verified, note, created_at, updated_at)
         VALUES (gen_random_uuid(), :templateId, :clanId, NOW(), false,
                 'Back-filled: certificates were already issued for this clan before approval existed.',
                 NOW(), NOW())`,
        { replacements: { templateId: row.template_id, clanId: row.clan_id }, transaction: t }
      );
      backfilled += 1;
    }
    console.log(`  ✓ Back-filled ${backfilled} approval(s) for clans with certificates already issued`);
  });

  console.log('✅ Migration 101 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 101');
  await sequelize.transaction(async (t) => {
    if (await tableExists('certificate_clan_approvals', t)) {
      await qi.dropTable('certificate_clan_approvals', { transaction: t });
      console.log('  ✓ Dropped certificate_clan_approvals');
    }
  });
  console.log('✅ Rollback 101 complete');
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

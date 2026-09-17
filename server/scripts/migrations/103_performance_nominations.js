/**
 * Migration: 103_performance_nominations
 *
 * Top-performer nominations: a mentor's judgement, recorded next to the data.
 *
 * An admin running a fellowship of several hundred cannot know who deserves the
 * recognition, and cannot take a mentor's word for it unexamined either. A row
 * here therefore carries the mentor's REASONING, the system's independent rank
 * for that mentee at the moment of nomination, and the signals behind it — so
 * agreement and disagreement are both visible at a glance.
 *
 * Two levels share the table: a mentor nominates inside their clan, and the
 * admin promotes from the pooled clan nominations to a fellowship award.
 *
 * The unique index is per (mentee, program, level): the same person cannot be
 * nominated twice for the same award, which is what stops two co-mentors of one
 * clan filing the same name and the admin seeing it as two endorsements.
 *
 * Run:      node server/scripts/migrations/103_performance_nominations.js
 * Rollback: node server/scripts/migrations/103_performance_nominations.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const TABLE = 'performance_nominations';
const UNIQ = 'performance_nominations_mentee_program_level_uniq';

async function tableExists(t) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=:table`,
    { replacements: { table: TABLE }, transaction: t }
  );
  return rows.length > 0;
}

async function indexExists(name, t) {
  const [rows] = await sequelize.query('SELECT 1 FROM pg_indexes WHERE indexname = :name',
    { replacements: { name }, transaction: t });
  return rows.length > 0;
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 103: performance nominations');

  await sequelize.transaction(async (t) => {
    if (await tableExists(t)) {
      console.log(`  ℹ ${TABLE} exists, skipping create`);
    } else {
      await qi.createTable(TABLE, {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        mentee_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        // Null while a suggestion is only the system's opinion — nobody has put
        // their name to it yet, and that difference matters to the admin.
        nominated_by: {
          type: Sequelize.UUID, allowNull: true,
          references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        program_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'programs', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        clan_id: {
          type: Sequelize.UUID, allowNull: true,
          references: { model: 'clans', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        level: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'clan' },
        reasoning: { type: Sequelize.TEXT, allowNull: true },
        system_rank: { type: Sequelize.INTEGER, allowNull: true },
        system_out_of: { type: Sequelize.INTEGER, allowNull: true },
        system_signals: { type: Sequelize.JSONB, allowNull: true },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'nominated' },
        decision_note: { type: Sequelize.TEXT, allowNull: true },
        decided_by: {
          type: Sequelize.UUID, allowNull: true,
          references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        decided_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
      }, { transaction: t });

      await qi.addIndex(TABLE, ['mentee_id'], { transaction: t });
      await qi.addIndex(TABLE, ['program_id'], { transaction: t });
      await qi.addIndex(TABLE, ['clan_id'], { transaction: t });
      await qi.addIndex(TABLE, ['status'], { transaction: t });
      console.log(`  ✓ Created ${TABLE}`);
    }

    if (await indexExists(UNIQ, t)) {
      console.log(`  ℹ ${UNIQ} exists, skipping`);
    } else {
      // One nomination per person per award. Two co-mentors of the same clan
      // filing the same name is one endorsement, not two, and the admin must
      // not read it as agreement between them.
      await sequelize.query(
        `CREATE UNIQUE INDEX ${UNIQ} ON ${TABLE} (mentee_id, program_id, level)`,
        { transaction: t }
      );
      console.log(`  ✓ Created unique index ${UNIQ}`);
    }
  });

  console.log('✅ Migration 103 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 103');
  await sequelize.transaction(async (t) => {
    if (await tableExists(t)) {
      await qi.dropTable(TABLE, { transaction: t });
      console.log(`  ✓ Dropped ${TABLE}`);
    }
  });
  console.log('✅ Rollback 103 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => {
    try { await (isRollback ? down() : up()); process.exit(0); }
    catch (e) { console.error('Migration failed:', e.message); process.exit(1); }
  })();
}

module.exports = { up, down };

/**
 * Migration: 076_notification_audience
 *
 * Add `notifications.audience` so the bell + notifications list can scope to the
 * role the viewer is currently in (a dual-role mentor/mentee sees only the active
 * role's items). Values: 'mentor' | 'mentee' | 'admin' | 'any'.
 *
 * Purely additive and safe:
 *   - new column, NOT NULL, DEFAULT 'any' (so existing rows are valid instantly),
 *   - one-time backfill of existing rows from the action_url namespace
 *     (/mentor/… → mentor, etc.), which classifies ~99.7% of real rows; anything
 *     role-neutral or url-less stays 'any' (always shown, never hidden).
 * Going forward the value is set at dispatch from the event matrix + action URL
 * (see resolveAudience), so this backfill is a floor, not the ongoing mechanism.
 *
 * Run:      node server/scripts/migrations/076_notification_audience.js
 * Rollback: node server/scripts/migrations/076_notification_audience.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const TABLE = 'notifications';
const COLUMN = 'audience';

async function columnExists(transaction) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = '${TABLE}' AND column_name = '${COLUMN}'`,
    { transaction }
  );
  return rows.length > 0;
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 076: notifications.audience');

  await sequelize.transaction(async (transaction) => {
    // 1. Add the column with a safe default so every existing row is valid.
    //    Check-first (not catch-after): a failed statement poisons the whole
    //    Postgres transaction, so the backfill below couldn't run on a re-run.
    if (await columnExists(transaction)) {
      console.log(`  ℹ ${TABLE}.${COLUMN} exists, skipping add`);
    } else {
      await qi.addColumn(TABLE, COLUMN, {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: 'any',
      }, { transaction });
      console.log(`  ✓ Added ${TABLE}.${COLUMN}`);
    }

    // 2. Backfill existing rows from the action_url namespace. Only touch rows
    //    still at the default so a re-run (or rows already dispatched with a real
    //    audience) are left alone — idempotent.
    const [, meta] = await sequelize.query(`
      UPDATE ${TABLE}
         SET ${COLUMN} = CASE
           WHEN action_url LIKE '/mentor/%' THEN 'mentor'
           WHEN action_url LIKE '/mentee/%' THEN 'mentee'
           WHEN action_url LIKE '/admin/%'  THEN 'admin'
           ELSE 'any'
         END
       WHERE ${COLUMN} = 'any'
    `, { transaction });
    console.log(`  ✓ Backfilled ${meta?.rowCount ?? 0} row(s) from action_url`);
  });

  console.log('✅ Migration 076 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 076');
  try {
    await qi.removeColumn(TABLE, COLUMN);
    console.log(`  ✓ Dropped ${TABLE}.${COLUMN}`);
  } catch (e) {
    if (!/does not exist|no such column/i.test(e.message)) throw e;
  }
  console.log('✅ Rollback 076 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };

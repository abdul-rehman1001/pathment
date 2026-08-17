/**
 * Migration: 094_feedback_platform
 *
 * A bug report that does not say where it happened is a bug report somebody has
 * to reply to before they can start. Until now the only clue was `user_agent`,
 * which is a browser string: every report from the phone arrived with it empty
 * and was indistinguishable from a web report by somebody with a strict browser.
 *
 *   - `platform`     'web' | 'android' | 'ios'. Backfilled to 'web' because
 *                    every existing row predates the mobile app being able to
 *                    report at all, so that is a fact rather than a guess.
 *   - `app_version`  which build. The first question on any bug is "which
 *                    version", and on mobile old builds live in the wild for
 *                    months after a fix ships.
 *   - `device`       "Pixel 7, Android 14". One free text column rather than
 *                    three, because nothing queries it: it is read by a person
 *                    trying to reproduce something.
 *
 * Run:      node server/scripts/migrations/094_feedback_platform.js
 * Rollback: node server/scripts/migrations/094_feedback_platform.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function columnExists(table, column, t) {
  const [r] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='${table}' AND column_name='${column}'`,
    { transaction: t }
  );
  return r.length > 0;
}

async function indexExists(name, t) {
  const [r] = await sequelize.query(`SELECT 1 FROM pg_indexes WHERE indexname='${name}'`, {
    transaction: t
  });
  return r.length > 0;
}

const COLUMNS = {
  platform: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'web' },
  app_version: { type: Sequelize.STRING(32), allowNull: true },
  device: { type: Sequelize.STRING(120), allowNull: true }
};

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 094: where a feedback report came from');

  await sequelize.transaction(async (t) => {
    for (const [name, spec] of Object.entries(COLUMNS)) {
      if (await columnExists('feedback_reports', name, t)) {
        console.log(`  ℹ feedback_reports.${name} exists, skipping`);
        continue;
      }
      await qi.addColumn('feedback_reports', name, spec, { transaction: t });
      console.log(`  ✓ Added feedback_reports.${name}`);
    }

    // Triage is done per platform far more often than per anything else: a
    // crash on Android is one person's morning and a web layout bug is
    // another's.
    if (await indexExists('feedback_reports_platform_idx', t)) {
      console.log('  ℹ feedback_reports_platform_idx exists, skipping');
    } else {
      await qi.addIndex('feedback_reports', ['platform'], {
        name: 'feedback_reports_platform_idx',
        transaction: t
      });
      console.log('  ✓ Added feedback_reports_platform_idx');
    }
  });

  console.log('✓ Migration 094 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 094');

  await sequelize.transaction(async (t) => {
    if (await indexExists('feedback_reports_platform_idx', t)) {
      await qi.removeIndex('feedback_reports', 'feedback_reports_platform_idx', { transaction: t });
      console.log('  ✓ Dropped feedback_reports_platform_idx');
    }

    for (const name of Object.keys(COLUMNS)) {
      if (await columnExists('feedback_reports', name, t)) {
        await qi.removeColumn('feedback_reports', name, { transaction: t });
        console.log(`  ✓ Dropped feedback_reports.${name}`);
      }
    }
  });

  console.log('✓ Rollback 094 complete');
}

const rollback = process.argv.includes('--rollback');

(rollback ? down() : up())
  .then(() => sequelize.close())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error('✖ Migration 094 failed:', error.message);
    await sequelize.close();
    process.exit(1);
  });

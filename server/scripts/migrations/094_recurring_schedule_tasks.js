/**
 * Migration: 094_recurring_schedule_tasks
 *
 * Adds schedule_slot_id and occurrence_date to assigned_tasks table to support
 * recurring schedule task materialization and duplicate prevention.
 *
 *   - `schedule_slot_id`  UUID NULL -> links an AssignedTask to its MenteeSchedule slot
 *   - `occurrence_date`   DATEONLY NULL -> the target date of this specific recurring occurrence
 *
 * Uniqueness:
 *   - (mentee_id, schedule_slot_id, occurrence_date) unique index WHERE schedule_slot_id IS NOT NULL
 *
 * Run:      node server/scripts/migrations/094_recurring_schedule_tasks.js
 * Rollback: node server/scripts/migrations/094_recurring_schedule_tasks.js --rollback
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
  const [r] = await sequelize.query(
    `SELECT 1 FROM pg_indexes WHERE indexname='${name}'`,
    { transaction: t }
  );
  return r.length > 0;
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 094: recurring schedule tasks');

  await sequelize.transaction(async (t) => {
    if (await columnExists('assigned_tasks', 'schedule_slot_id', t)) {
      console.log('  ℹ assigned_tasks.schedule_slot_id exists, skipping');
    } else {
      await qi.addColumn(
        'assigned_tasks',
        'schedule_slot_id',
        { type: Sequelize.STRING(255), allowNull: true },
        { transaction: t }
      );
      console.log('  ✓ Added assigned_tasks.schedule_slot_id');
    }

    if (await columnExists('assigned_tasks', 'occurrence_date', t)) {
      console.log('  ℹ assigned_tasks.occurrence_date exists, skipping');
    } else {
      await qi.addColumn(
        'assigned_tasks',
        'occurrence_date',
        { type: Sequelize.DATEONLY, allowNull: true },
        { transaction: t }
      );
      console.log('  ✓ Added assigned_tasks.occurrence_date');
    }

    if (await indexExists('assigned_tasks_slot_occurrence_unique', t)) {
      console.log('  ℹ assigned_tasks_slot_occurrence_unique exists, skipping');
    } else {
      await sequelize.query(
        `CREATE UNIQUE INDEX assigned_tasks_slot_occurrence_unique 
         ON assigned_tasks (mentee_id, schedule_slot_id, occurrence_date) 
         WHERE schedule_slot_id IS NOT NULL;`,
        { transaction: t }
      );
      console.log('  ✓ Created assigned_tasks_slot_occurrence_unique index');
    }
  });

  console.log('✅ Migration 094 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 094');

  await sequelize.transaction(async (t) => {
    if (await indexExists('assigned_tasks_slot_occurrence_unique', t)) {
      await sequelize.query(
        'DROP INDEX IF EXISTS assigned_tasks_slot_occurrence_unique;',
        { transaction: t }
      );
      console.log('  ✓ Dropped assigned_tasks_slot_occurrence_unique index');
    }

    if (await columnExists('assigned_tasks', 'occurrence_date', t)) {
      await qi.removeColumn('assigned_tasks', 'occurrence_date', { transaction: t });
      console.log('  ✓ Dropped assigned_tasks.occurrence_date');
    }

    if (await columnExists('assigned_tasks', 'schedule_slot_id', t)) {
      await qi.removeColumn('assigned_tasks', 'schedule_slot_id', { transaction: t });
      console.log('  ✓ Dropped assigned_tasks.schedule_slot_id');
    }
  });

  console.log('✅ Rollback 094 complete');
}

const rollback = process.argv.includes('--rollback');

(rollback ? down() : up())
  .then(() => sequelize.close())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error('❌ Migration 094 failed:', error.message);
    await sequelize.close();
    process.exit(1);
  });

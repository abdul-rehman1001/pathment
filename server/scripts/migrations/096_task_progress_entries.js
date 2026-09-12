/**
 * Migration: 096_task_progress_entries
 *
 * A mentee's day-by-day notes on a single assigned task. See
 * docs/specs/task-progress-log.md for why this is its own table rather than a
 * wider `daily_log_entries`: that table's UNIQUE (mentee_id, date_key) is load
 * bearing for the upsert, its `tasks_done` array would become a second source of
 * truth, and the mobile app reads its current shape.
 *
 *   assigned_task_id  the task these notes belong to
 *   mentee_id         denormalised so "did this person show up" is one index hit
 *   date_key          'YYYY-MM-DD' in the MENTEE's timezone, not UTC
 *   note              what they did that day
 *   minutes_spent     optional, hidden in the UI for now
 *
 * Uniqueness: (assigned_task_id, date_key). One entry per task per day, so
 * "logged 3 of 4 days" stays a meaningful sentence.
 *
 * Run:      node server/scripts/migrations/096_task_progress_entries.js
 * Rollback: node server/scripts/migrations/096_task_progress_entries.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function tableExists(table, t) {
  const [r] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name='${table}'`, { transaction: t });
  return r.length > 0;
}
async function indexExists(name, t) {
  const [r] = await sequelize.query(`SELECT 1 FROM pg_indexes WHERE indexname='${name}'`, { transaction: t });
  return r.length > 0;
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 096: task progress entries');

  await sequelize.transaction(async (t) => {
    if (await tableExists('task_progress_entries', t)) {
      console.log('  ℹ task_progress_entries exists, skipping create');
    } else {
      await qi.createTable('task_progress_entries', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        assigned_task_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'assigned_tasks', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE',
        },
        mentee_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE',
        },
        date_key: { type: Sequelize.STRING(10), allowNull: false },
        note: { type: Sequelize.TEXT, allowNull: false },
        minutes_spent: { type: Sequelize.INTEGER, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      }, { transaction: t });
      console.log('  ✓ Created task_progress_entries');
    }

    const uniq = 'task_progress_entries_task_date_unique';
    if (await indexExists(uniq, t)) {
      console.log(`  ℹ ${uniq} exists, skipping`);
    } else {
      await qi.addIndex('task_progress_entries', ['assigned_task_id', 'date_key'], {
        name: uniq, unique: true, transaction: t,
      });
      console.log(`  ✓ Added unique index ${uniq}`);
    }

    const byMentee = 'task_progress_entries_mentee_date';
    if (await indexExists(byMentee, t)) {
      console.log(`  ℹ ${byMentee} exists, skipping`);
    } else {
      await qi.addIndex('task_progress_entries', ['mentee_id', 'date_key'], { name: byMentee, transaction: t });
      console.log(`  ✓ Added index ${byMentee}`);
    }
  });

  console.log('✅ Migration 096 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('◀ Rolling back migration 096');
  await sequelize.transaction(async (t) => {
    if (await tableExists('task_progress_entries', t)) {
      await qi.dropTable('task_progress_entries', { transaction: t });
      console.log('  ✓ Dropped task_progress_entries');
    }
  });
  console.log('✅ Rollback 096 complete');
}

// Guarded so the file can be required by a runner without executing.
if (require.main === module) {
  (async () => {
    try {
      await (process.argv.includes('--rollback') ? down() : up());
      process.exit(0);
    } catch (err) {
      console.error('❌ Migration 096 failed:', err);
      process.exit(1);
    }
  })();
}

module.exports = { up, down };

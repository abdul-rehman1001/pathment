const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function columnExists(table, column, t) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = :table AND column_name = :column`,
    { replacements: { table, column }, transaction: t }
  );
  return rows.length > 0;
}

async function addColumn(qi, table, column, spec, t) {
  if (await columnExists(table, column, t)) {
    console.log(`  ℹ ${table}.${column} exists, skipping`);
    return;
  }
  await qi.addColumn(table, column, spec, { transaction: t });
  console.log(`  ✓ Added ${table}.${column}`);
}

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 097: clan public join window');

  await sequelize.transaction(async (t) => {
    // UTC instants (wall-clock + timezone converted on write, same as cohort apply window).
    await addColumn(qi, 'clans', 'public_join_starts_at', { type: S.DATE, allowNull: true }, t);
    await addColumn(qi, 'clans', 'public_join_ends_at', { type: S.DATE, allowNull: true }, t);
    await addColumn(qi, 'clans', 'public_join_timezone', { type: S.STRING(64), allowNull: true }, t);
  });

  console.log('✓ Migration 097 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 097');

  await sequelize.transaction(async (t) => {
    for (const col of ['public_join_timezone', 'public_join_ends_at', 'public_join_starts_at']) {
      if (await columnExists('clans', col, t)) {
        await qi.removeColumn('clans', col, { transaction: t });
        console.log(`  ✓ Dropped clans.${col}`);
      }
    }
  });

  console.log('✓ Rollback 097 complete');
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

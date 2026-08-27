
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const PENDING_UNIQ = 'clan_join_requests_pending_clan_user_uniq';
const SLUG_UNIQ = 'clans_public_join_slug_uniq';

async function columnExists(table, column, t) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = :table AND column_name = :column`,
    { replacements: { table, column }, transaction: t }
  );
  return rows.length > 0;
}

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
    `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = :name`,
    { replacements: { name }, transaction: t }
  );
  return rows.length > 0;
}

async function addBoolColumn(qi, table, column, t) {
  if (await columnExists(table, column, t)) {
    console.log(`  ℹ ${table}.${column} exists, skipping`);
    return;
  }
  await qi.addColumn(
    table,
    column,
    { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    { transaction: t }
  );
  console.log(`  ✓ Added ${table}.${column} (default false)`);
}

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 096: clan public join');

  await sequelize.transaction(async (t) => {
    await addBoolColumn(qi, 'clans', 'public_join_allowed', t);
    await addBoolColumn(qi, 'clans', 'public_join_enabled', t);

    if (await columnExists('clans', 'public_join_slug', t)) {
      console.log('  ℹ clans.public_join_slug exists, skipping');
    } else {
      await qi.addColumn(
        'clans',
        'public_join_slug',
        { type: S.STRING(64), allowNull: true },
        { transaction: t }
      );
      console.log('  ✓ Added clans.public_join_slug');
    }

    if (!(await indexExists(SLUG_UNIQ, t))) {
      await sequelize.query(
        `CREATE UNIQUE INDEX "${SLUG_UNIQ}" ON clans (public_join_slug)`,
        { transaction: t }
      );
      console.log(`  ✓ Created unique index ${SLUG_UNIQ}`);
    } else {
      console.log(`  ℹ Index ${SLUG_UNIQ} exists, skipping`);
    }

    if (await tableExists('clan_join_requests', t)) {
      console.log('  ℹ clan_join_requests exists, skipping create');
    } else {
      await qi.createTable(
        'clan_join_requests',
        {
          id: { type: S.UUID, defaultValue: S.UUIDV4, primaryKey: true, allowNull: false },
          clan_id: {
            type: S.UUID,
            allowNull: false,
            references: { model: 'clans', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          user_id: {
            type: S.UUID,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          status: { type: S.STRING(20), allowNull: false, defaultValue: 'pending' },
          source: { type: S.STRING(32), allowNull: false, defaultValue: 'public_link' },
          message: { type: S.TEXT, allowNull: true },
          resolution_note: { type: S.TEXT, allowNull: true },
          reviewed_by: {
            type: S.UUID,
            allowNull: true,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          reviewed_at: { type: S.DATE, allowNull: true },
          created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
          updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') }
        },
        { transaction: t }
      );
      console.log('  ✓ Created clan_join_requests');
    }

    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS clan_join_requests_clan_status_idx
       ON clan_join_requests (clan_id, status)`,
      { transaction: t }
    );
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS clan_join_requests_user_status_idx
       ON clan_join_requests (user_id, status)`,
      { transaction: t }
    );
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS clan_join_requests_status_idx
       ON clan_join_requests (status)`,
      { transaction: t }
    );
    console.log('  ✓ Ensured clan_join_requests lookup indexes');

    if (!(await indexExists(PENDING_UNIQ, t))) {
      await sequelize.query(
        `CREATE UNIQUE INDEX "${PENDING_UNIQ}"
         ON clan_join_requests (clan_id, user_id)
         WHERE status = 'pending'`,
        { transaction: t }
      );
      console.log(`  ✓ Created partial unique index ${PENDING_UNIQ}`);
    } else {
      console.log(`  ℹ Index ${PENDING_UNIQ} exists, skipping`);
    }
  });

  console.log('Migration 096 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('Rolling back migration 096');

  await sequelize.transaction(async (t) => {
    if (await indexExists(PENDING_UNIQ, t)) {
      await sequelize.query(`DROP INDEX IF EXISTS "${PENDING_UNIQ}"`, { transaction: t });
      console.log(`  Dropped ${PENDING_UNIQ}`);
    }

    if (await tableExists('clan_join_requests', t)) {
      await qi.dropTable('clan_join_requests', { transaction: t });
      console.log('   Dropped clan_join_requests');
    }

    if (await indexExists(SLUG_UNIQ, t)) {
      await sequelize.query(`DROP INDEX IF EXISTS "${SLUG_UNIQ}"`, { transaction: t });
      console.log(`  Dropped ${SLUG_UNIQ}`);
    }

    for (const col of ['public_join_slug', 'public_join_enabled', 'public_join_allowed']) {
      if (await columnExists('clans', col, t)) {
        await qi.removeColumn('clans', col, { transaction: t });
        console.log(`   Dropped clans.${col}`);
      }
    }
  });

  console.log(' Rollback 096 complete');
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

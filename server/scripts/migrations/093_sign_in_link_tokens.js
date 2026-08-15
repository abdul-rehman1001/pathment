/**
 * Migration: 093_sign_in_link_tokens
 *
 * Signing in by emailed link. The phone keyboard is the reason: a mentee typing
 * a password they set once, months ago, on a phone, is the single most common
 * way somebody stops using an app they were invited to.
 *
 *   - `token`         the SHA-256 of the link's secret, never the secret. A
 *                     dump of this table is a pile of hashes, not a pile of
 *                     working sessions.
 *   - `expires_at`    fifteen minutes. Shorter than a password reset on purpose:
 *                     that one still makes you choose a password, this one hands
 *                     over a session outright.
 *   - `used_at`       spent the moment it works. A link in an inbox that already
 *                     signed somebody in must not do it twice.
 *   - `requested_ip`  the only realistic abuse here is mailbombing an address
 *                     somebody knows, and a rate limit you cannot audit after
 *                     the fact is a guess.
 *
 * Run:      node server/scripts/migrations/093_sign_in_link_tokens.js
 * Rollback: node server/scripts/migrations/093_sign_in_link_tokens.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function tableExists(table, t) {
  const [r] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name='${table}'`,
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

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 093: sign in link tokens');

  await sequelize.transaction(async (t) => {
    if (await tableExists('sign_in_link_tokens', t)) {
      console.log('  ℹ sign_in_link_tokens exists, skipping create');
    } else {
      await qi.createTable(
        'sign_in_link_tokens',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            primaryKey: true
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onDelete: 'CASCADE'
          },
          token: { type: Sequelize.STRING(255), allowNull: false, unique: true },
          expires_at: { type: Sequelize.DATE, allowNull: false },
          used_at: { type: Sequelize.DATE, allowNull: true },
          requested_ip: { type: Sequelize.STRING(64), allowNull: true },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('NOW()')
          }
        },
        { transaction: t }
      );
      console.log('  ✓ Created sign_in_link_tokens');
    }

    if (await indexExists('sign_in_link_tokens_user_id_idx', t)) {
      console.log('  ℹ sign_in_link_tokens_user_id_idx exists, skipping');
    } else {
      await qi.addIndex('sign_in_link_tokens', ['user_id'], {
        name: 'sign_in_link_tokens_user_id_idx',
        transaction: t
      });
      console.log('  ✓ Added sign_in_link_tokens_user_id_idx');
    }
  });

  console.log('✓ Migration 093 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 093');

  await sequelize.transaction(async (t) => {
    if (await tableExists('sign_in_link_tokens', t)) {
      await qi.dropTable('sign_in_link_tokens', { transaction: t });
      console.log('  ✓ Dropped sign_in_link_tokens');
    } else {
      console.log('  ℹ sign_in_link_tokens does not exist, nothing to drop');
    }
  });

  console.log('✓ Rollback 093 complete');
}

const rollback = process.argv.includes('--rollback');

(rollback ? down() : up())
  .then(() => sequelize.close())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error('✖ Migration 093 failed:', error.message);
    await sequelize.close();
    process.exit(1);
  });

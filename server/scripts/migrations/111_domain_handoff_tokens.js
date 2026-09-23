/**
 * One-time credentials used only while moving an authenticated browser from a
 * legacy workspace subdomain to app.pathment.me/w/:workspace.
 *
 * Real access/refresh tokens never cross in the URL. The browser receives a
 * random two-minute code and the database stores only its SHA-256 digest.
 */
const { Sequelize } = require('sequelize');

async function up({ db = require('./_db') } = {}) {
  await db.query(`CREATE TABLE IF NOT EXISTS domain_handoff_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    remember_session BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`CREATE INDEX IF NOT EXISTS domain_handoff_tokens_user_org_idx
    ON domain_handoff_tokens (user_id, organization_id, created_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS domain_handoff_tokens_expiry_idx
    ON domain_handoff_tokens (expires_at) WHERE used_at IS NULL`);
}

async function down({ db = require('./_db') } = {}) {
  await db.query('DROP TABLE IF EXISTS domain_handoff_tokens');
}

module.exports = { up, down };
if (require.main === module) {
  const db = require('./_db');
  (process.argv.includes('--rollback') ? down({ db }) : up({ db }))
    .catch(error => { console.error(error); process.exitCode = 1; })
    .finally(() => db.close());
}

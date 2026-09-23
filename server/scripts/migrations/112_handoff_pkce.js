// Nullable for compatibility with existing rows; unbound rows cannot be redeemed.
async function up({ db = require('./_db') } = {}) {
  await db.query('ALTER TABLE domain_handoff_tokens ADD COLUMN IF NOT EXISTS code_challenge VARCHAR(43)');
}
async function down({ db = require('./_db') } = {}) {
  await db.query('ALTER TABLE domain_handoff_tokens DROP COLUMN IF EXISTS code_challenge');
}
module.exports = { up, down };
if (require.main === module) {
  const db = require('./_db');
  (process.argv.includes('--rollback') ? down({ db }) : up({ db }))
    .catch(error => { console.error(error); process.exitCode = 1; })
    .finally(() => db.close());
}

// Remove only known Sequelize duplicates after proving their definitions match
// the retained unique token index. No token rows or sessions are changed.
async function up({ db = require('./_db') } = {}) {
  await db.transaction(async transaction => {
    const query = (sql, replacements) => db.query(sql, { transaction, replacements });
    await query("SET LOCAL lock_timeout = '5s'");
    await query("SET LOCAL statement_timeout = '30s'");
    await query('LOCK TABLE public.refresh_tokens IN ACCESS EXCLUSIVE MODE');
    const [indexes] = await query(`SELECT c.relname AS name, i.indisunique AS unique,
      i.indisvalid AS valid, i.indisprimary AS primary, con.conname AS constraint,
      con.contype AS constraint_type, am.amname AS method,
      i.indkey::text AS keys, i.indclass::text AS classes,
      i.indcollation::text AS collations, i.indoption::text AS options,
      i.indnatts AS attributes, i.indnkeyatts AS key_attributes,
      pg_get_expr(i.indexprs, i.indrelid) AS expressions,
      pg_get_expr(i.indpred, i.indrelid) AS predicate
      FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_am am ON am.oid = c.relam
      LEFT JOIN pg_constraint con ON con.conindid = i.indexrelid AND con.contype IN ('p', 'u', 'x')
      WHERE i.indrelid = 'public.refresh_tokens'::regclass`);
    const retained = indexes.find(index => index.name === 'refresh_tokens_token_key');
    if (!retained?.unique || !retained.valid || retained.primary || retained.predicate || retained.expressions) {
      throw new Error('Expected valid unique refresh_tokens_token_key; manual inspection required');
    }
    const [columns] = await query(`SELECT attnum::text AS number FROM pg_attribute
      WHERE attrelid = 'public.refresh_tokens'::regclass AND attname = 'token' AND NOT attisdropped`);
    if (retained.keys !== columns[0]?.number || retained.attributes !== 1) {
      throw new Error('Retained index is not a single token index');
    }
    const definition = ['method', 'keys', 'classes', 'collations', 'options', 'attributes', 'key_attributes', 'expressions', 'predicate'];
    for (const name of ['refresh_tokens_token_key1', 'refresh_tokens_token_key2', 'refresh_tokens_token']) {
      const index = indexes.find(candidate => candidate.name === name);
      if (!index) continue;
      if (!index.valid || index.primary || (index.constraint && index.constraint_type !== 'u') ||
          definition.some(key => index[key] !== retained[key])) {
        throw new Error(`Unexpected definition for ${name}; refusing to drop it`);
      }
      // No CASCADE: PostgreSQL rejects a drop if any foreign key depends on it.
      if (index.constraint) {
        const identifier = db.getQueryInterface().quoteIdentifier(index.constraint);
        await query(`ALTER TABLE public.refresh_tokens DROP CONSTRAINT ${identifier}`);
      } else {
        await query(`DROP INDEX public."${name}"`);
      }
    }
  });
}

async function down() {
  // Redundant indexes have no logical effect; deliberately do not recreate waste.
}

module.exports = { up, down };
if (require.main === module) {
  const db = require('./_db');
  (process.argv.includes('--rollback') ? down() : up({ db }))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => db.close());
}

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Sequelize } = require('sequelize');
const { up } = require('../../scripts/migrations/113_refresh_token_indexes');

test('token index cleanup preserves sessions and rejects unexpected schema', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'migration113-'));
  const data = path.join(dir, 'data');
  const bin = process.env.MIGRATION_TEST_PG_BIN || '/usr/lib/postgresql/16/bin';
  const run = (name, args) => execFileSync(path.join(bin, name), args, { stdio: 'pipe' });
  let db;
  let started = false;
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'migration_test', '--no-locale']);
    run('pg_ctl', ['-D', data, '-l', path.join(dir, 'postgres.log'), '-o', `-F -k ${dir} -h ''`, '-w', 'start']);
    started = true;
    db = new Sequelize('postgres', 'migration_test', '', { dialect: 'postgres', host: dir, logging: false });
    const query = sql => db.query(sql);
    const rows = async sql => (await query(sql))[0];
    const reset = async () => {
      await query(`DROP TABLE IF EXISTS token_reference; DROP TABLE IF EXISTS refresh_tokens;
        CREATE TABLE refresh_tokens (id INTEGER PRIMARY KEY, token TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ);
        ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_token_key1 UNIQUE(token);
        ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_token_key2 UNIQUE(token);
        CREATE INDEX refresh_tokens_token ON refresh_tokens(token);
        INSERT INTO refresh_tokens VALUES (1, 'active', now() + interval '1 day'), (2, 'expired', now() - interval '1 day')`);
    };
    await t.test('rerunnable; retains uniqueness and every row', async () => {
      await reset();
      const before = await rows('SELECT * FROM refresh_tokens ORDER BY id');
      await up({ db });
      await up({ db });
      assert.deepEqual(await rows('SELECT * FROM refresh_tokens ORDER BY id'), before);
      assert.equal((await rows("SELECT * FROM pg_indexes WHERE tablename='refresh_tokens'")).length, 2);
      await assert.rejects(query("INSERT INTO refresh_tokens(id, token) VALUES(3, 'active')"));
    });
    await t.test('unexpected index definition rolls back all removals', async () => {
      await reset();
      await query('DROP INDEX refresh_tokens_token; CREATE INDEX refresh_tokens_token ON refresh_tokens(expires_at)');
      await assert.rejects(up({ db }), /Unexpected definition/);
      assert.equal((await rows("SELECT * FROM pg_indexes WHERE tablename='refresh_tokens'")).length, 5);
    });
    await t.test('retained index must actually index token', async () => {
      await reset();
      await query('ALTER TABLE refresh_tokens DROP CONSTRAINT refresh_tokens_token_key; CREATE UNIQUE INDEX refresh_tokens_token_key ON refresh_tokens(id)');
      await assert.rejects(up({ db }), /single token index/);
    });
  } finally {
    if (db) await db.close();
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(dir, { recursive: true, force: true });
  }
});

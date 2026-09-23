const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Sequelize } = require('sequelize');

// Never loads dotenv or DATABASE_URL. Each caller owns its cluster and socket.
module.exports = async function withPrivatePostgres(operation) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pathment-isolation-'));
  const data = path.join(dir, 'data');
  const bin = process.env.MIGRATION_TEST_PG_BIN || '/usr/lib/postgresql/16/bin';
  const run = (name, args) => execFileSync(path.join(bin, name), args, { stdio: 'pipe' });
  let db;
  let started = false;
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'isolation_test', '--no-locale']);
    run('pg_ctl', ['-D', data, '-l', path.join(dir, 'postgres.log'), '-o', `-F -k ${dir} -h ''`, '-w', 'start']);
    started = true;
    db = new Sequelize('postgres', 'isolation_test', '', { dialect: 'postgres', host: dir, logging: false });
    await operation(db);
  } finally {
    if (db) await db.close();
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(dir, { recursive: true, force: true });
  }
};

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { Sequelize } = require('sequelize');

test('fresh demo bootstrap, partial-user recovery and repeated seeding', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'pathment-demo-test-'));
  const data = path.join(directory, 'data');
  const bin = process.env.MIGRATION_TEST_PG_BIN || '/usr/lib/postgresql/16/bin';
  const run = (name, args) => execFileSync(path.join(bin, name), args, { stdio: 'pipe' });
  let started = false;
  let db;
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'demo_test', '--no-locale']);
    run('pg_ctl', ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-F -k ${directory} -h ''`, '-w', 'start']);
    started = true;
    const env = { ...process.env, NODE_ENV: 'test', DB_SSL: 'false',
      DATABASE_URL: `postgres://demo_test@localhost/postgres?host=${encodeURIComponent(directory)}`,
      DEFAULT_ORGANIZATION_SLUG: 'devweekends', TENANT_SLUG: 'devweekends' };
    const script = (file, extraEnv = {}) => spawnSync(process.execPath, [file], {
      cwd: path.resolve(__dirname, '../..'), env: { ...env, ...extraEnv },
      encoding: 'utf8', maxBuffer: 10_000_000, timeout: 120_000,
    });
    const successful = file => {
      const result = script(file);
      assert.equal(result.status, 0, (result.stdout + result.stderr).slice(-4000));
    };
    successful('scripts/syncDatabase.js');
    db = new Sequelize('postgres', 'demo_test', '', { dialect: 'postgres', host: directory, logging: false });
    // Reproduce the user's failed attempt: an identity with no workspace yet.
    await db.query(`INSERT INTO users (id,first_name,last_name,email,password_hash,role,status,email_verified,created_at,updated_at)
      VALUES (gen_random_uuid(),'Demo','Partial','admin@demo.pathment.com','unused','admin','active',true,NOW(),NOW())`);
    successful('scripts/seed-demo.js');
    successful('scripts/seed-demo.js');
    const [missing] = await db.query(`SELECT id FROM users u WHERE NOT EXISTS
      (SELECT 1 FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id
       WHERE m.user_id=u.id AND o.slug='devweekends' AND m.status='active')`);
    assert.equal(missing.length, 0);
    const [plans] = await db.query('SELECT key FROM plans');
    assert.equal(plans.length, 3);
    const [programs] = await db.query('SELECT organization_id FROM programs');
    assert.ok(programs.length > 0 && programs.every(row => row.organization_id));
    // Real-account guard must fire before the destructive namespace cleanup.
    await db.query("UPDATE users SET email='real@example.test' WHERE email='admin@demo.pathment.com'");
    const rejected = script('scripts/seed-demo.js');
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /dedicated demo database/);
    const [preserved] = await db.query('SELECT id FROM programs');
    assert.equal(preserved.length, programs.length);
    const production = script('scripts/seed-demo.js', { NODE_ENV: 'production' });
    assert.notEqual(production.status, 0);
    assert.match(production.stderr, /disabled in production/);
  } finally {
    if (db) await db.close();
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(directory, { recursive: true, force: true });
  }
});

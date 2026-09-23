const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { Sequelize } = require('sequelize');

test('restricted staging fixtures are atomic, repeatable and preserve DevWeekends', async () => {
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
    successful('scripts/seed-demo.js');
    const [before] = await db.query('SELECT id FROM users ORDER BY id');
    const hash = require('bcrypt').hashSync('Random-local-test-password-only-987!', 12);
    const fixtureEnv = { STAGING_WORKSPACE_DEMO: 'true', APP_URL: 'https://staging.pathment.me',
      MULTI_TENANT_WORKSPACES_ENABLED: 'false', STAGING_DEMO_CONFIRM: 'pathment-staging', STAGING_DEMO_PASSWORD_HASH: hash };
    const wrong = script('scripts/seed-staging-workspaces.js', { ...fixtureEnv, APP_URL: 'https://app.pathment.me' });
    assert.notEqual(wrong.status, 0);
    for (let i = 0; i < 2; i++) {
      const seeded = script('scripts/seed-staging-workspaces.js', fixtureEnv);
      assert.equal(seeded.status, 0, seeded.stdout + seeded.stderr);
    }
    const [after] = await db.query('SELECT id FROM users ORDER BY id');
    assert.equal(after.length, before.length + 9);
    assert.ok(before.every(u => after.some(v => v.id === u.id)));
    const [counts] = await db.query(`SELECT o.slug, COUNT(*)::int AS members FROM organization_memberships m
      JOIN organizations o ON o.id=m.organization_id GROUP BY o.slug ORDER BY o.slug`);
    assert.deepEqual(counts.filter(c => c.slug.startsWith('demo-')).map(c => c.members), [5, 5]);
    const [wrongMembership] = await db.query(`SELECT m.id FROM organization_memberships m JOIN users u ON u.id=m.user_id
      JOIN organizations o ON o.id=m.organization_id WHERE u.email LIKE '%workspace-demo.pathment.test' AND o.slug='devweekends'`);
    assert.equal(wrongMembership.length, 0);
    const [crossed] = await db.query(`SELECT c.id FROM clans c JOIN programs p ON p.id=c.program_id WHERE c.organization_id<>p.organization_id`);
    assert.equal(crossed.length, 0);
  } finally {
    if (db) await db.close();
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(directory, { recursive: true, force: true });
  }
});

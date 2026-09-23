const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Sequelize } = require('sequelize');
const retention = require('../../src/services/dataRetentionService');

test('approved retention preserves active sessions, security events and email delivery records', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'retention-'));
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
    await db.query(`CREATE TABLE refresh_tokens(id INTEGER PRIMARY KEY, expires_at TIMESTAMPTZ);
      INSERT INTO refresh_tokens VALUES (1, NOW() + INTERVAL '1 day'), (2, NOW() - INTERVAL '6 days'), (3, NOW() - INTERVAL '8 days');
      CREATE TABLE email_queue(id INTEGER PRIMARY KEY, status TEXT, sent_at TIMESTAMPTZ, body_html TEXT NOT NULL, body_text TEXT, provider_message_id TEXT);
      INSERT INTO email_queue VALUES (1, 'sent', NOW() - INTERVAL '31 days', 'html', 'text', 'keep'),
        (2, 'pending', NOW() - INTERVAL '31 days', 'html', 'text', 'pending'),
        (3, 'dead', NOW() - INTERVAL '31 days', 'html', 'text', 'dead'),
        (4, 'sent', NOW() - INTERVAL '29 days', 'html', 'text', 'recent');
      CREATE TABLE audit_logs(id INTEGER PRIMARY KEY, created_at TIMESTAMPTZ, action TEXT, new_values JSONB);
      INSERT INTO audit_logs VALUES
        (1, NOW() - INTERVAL '91 days', 'POST /api/activity/session/heartbeat', '{"status":200}'),
        (2, NOW() - INTERVAL '91 days', 'POST /api/auth/login', '{"status":200}'),
        (3, NOW() - INTERVAL '91 days', 'POST /api/activity/session/heartbeat', '{"status":403}'),
        (4, NOW() - INTERVAL '89 days', 'POST /api/activity/session/heartbeat', '{"status":200}'),
        (5, NOW() - INTERVAL '91 days', 'ROLE_GRANTED', '{}')`);
    const expected = { expiredTokens: 1, sentEmailBodies: 1, routineAudit: 1 };
    assert.deepEqual(await retention.report(db), expected);
    assert.deepEqual(await retention.report(db), expected, 'preview is read-only');
    assert.deepEqual(await retention.apply(db, { batchSize: 1 }), expected);
    assert.deepEqual(await retention.report(db), { expiredTokens: 0, sentEmailBodies: 0, routineAudit: 0 });
    const [tokens] = await db.query('SELECT id FROM refresh_tokens ORDER BY id');
    assert.deepEqual(tokens.map(row => row.id), [1, 2]);
    const [events] = await db.query('SELECT id FROM audit_logs ORDER BY id');
    assert.deepEqual(events.map(row => row.id), [2, 3, 4, 5]);
    const [emails] = await db.query('SELECT * FROM email_queue ORDER BY id');
    assert.equal(emails.length, 4);
    assert.equal(emails[0].provider_message_id, 'keep');
    assert.equal(emails[0].body_html, '');
    assert.equal(emails[0].body_text, '');
    assert.ok(emails.slice(1).every(row => row.body_html === 'html'));
    await assert.rejects(retention.apply(db, { batchSize: 0 }), /Invalid retention/);
  } finally {
    if (db) await db.close();
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(dir, { recursive: true, force: true });
  }
});

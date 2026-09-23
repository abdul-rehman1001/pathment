const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Sequelize, DataTypes } = require('sequelize');

// Owns a private PostgreSQL cluster; never reads dotenv or DATABASE_URL.
test('role assignment sync works repeatedly and after a truncated legacy index', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'pathment-index-'));
  const data = path.join(directory, 'data');
  const bin = process.env.MIGRATION_TEST_PG_BIN || '/usr/lib/postgresql/16/bin';
  const run = (name, args) => execFileSync(path.join(bin, name), args, { stdio: 'pipe' });
  let started = false;
  let db;
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'index_test', '--no-locale']);
    run('pg_ctl', ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-F -k ${directory} -h ''`, '-w', 'start']);
    started = true;
    db = new Sequelize('postgres', 'index_test', '', { dialect: 'postgres', host: directory, logging: false });
    const RoleAssignment = require('../../src/models/auth/RoleAssignment')(db, DataTypes);
    await RoleAssignment.sync();
    await RoleAssignment.sync();
    const name = 'role_assignments_org_scope_uniq';
    await db.query(`DROP INDEX "${name}"`);
    await db.query(`CREATE UNIQUE INDEX "role_assignments_organization_id_user_id_role_scope_type_scope_id"
      ON role_assignments (organization_id,user_id,role,scope_type,scope_id)`);
    await RoleAssignment.sync();
    await RoleAssignment.sync();
    const indexes = await db.getQueryInterface().showIndex('role_assignments');
    assert.equal(indexes.filter(index => index.name === name).length, 1);
    assert.ok(indexes.find(index => index.name === name).unique);
    assert.ok(indexes.every(index => Buffer.byteLength(index.name) <= 63));
  } finally {
    if (db) await db.close();
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(directory, { recursive: true, force: true });
  }
});

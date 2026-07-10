/**
 * Migration: 075_clan_membership_multi_role
 *
 * A person may hold MORE THAN ONE role in the same clan — most commonly a mentee
 * who is promoted to co-mentor of the clan they're still learning in.
 *
 * `clan_memberships` was UNIQUE (clan_id, user_id), i.e. one row = one role per
 * person per clan. `clanService.addMember` therefore *overwrote* the role in
 * place: promoting a mentee to co-mentor destroyed their `role='mentee'` row.
 * Every mentee-facing read filters on that role, so the person vanished from the
 * clan roster, from "My Mentees", and could no longer be assigned tasks.
 *
 * Widen the key to (clan_id, user_id, role) so the roles coexist:
 *   - one row per role, `addMember`/`removeMember` operate per role,
 *   - a user still holds at most ONE mentor role per clan (enforced in the
 *     service, not the DB — lead/co/core swap in place).
 *
 * Data repair: a mentor-role row that still carries an `enrollment_id` into its
 * own clan's program is a mentee whose role was clobbered by the old upsert
 * (only mentee placements ever set enrollment_id). Restore their mentee row.
 * The repair MUST run after the key is widened — under the old key the restored
 * row collides with the mentor row it sits beside.
 *
 * Everything below runs in ONE transaction (Postgres DDL is transactional), so a
 * failure at any step leaves the database exactly as it was. Re-running is safe.
 *
 * Run:      node server/scripts/migrations/075_clan_membership_multi_role.js
 * Preview:  node server/scripts/migrations/075_clan_membership_multi_role.js --dry-run
 * Rollback: node server/scripts/migrations/075_clan_membership_multi_role.js --rollback
 */
const sequelize = require('./_db');

const TABLE = 'clan_memberships';
const NEW_INDEX = 'clan_memberships_clan_id_user_id_role';
const OLD_INDEX = 'clan_memberships_clan_id_user_id';
const MENTOR_ROLES = "('lead_mentor','co_mentor','core_team')";

/**
 * Who lost their mentee row to the old upsert. The signal is an active mentor
 * membership still pointing at an enrollment in its own clan's program: only the
 * `role === 'mentee'` branch of `addMember` ever writes enrollment_id, so a
 * mentor row carrying one was a mentee before it was overwritten.
 *
 * This runs against live data, so every clause below is a guard against
 * restoring someone who should NOT be a mentee of this clan:
 *   - e.mentee_id = cm.user_id  → the enrollment is theirs, not one that landed
 *     on the row by some other path.
 *   - e.status live             → don't resurrect people who dropped or were rejected.
 *   - no mentee row here        → idempotent; a re-run restores nothing.
 *   - no ACTIVE mentee row in the same PROGRAM → the reassign-then-promote case:
 *     a mentee moved A→B keeps a removed row in A carrying A's enrollment, which
 *     the old upsert reactivated as co_mentor. Restoring it would place them as a
 *     mentee of two clans at once. Their real placement (B) wins.
 */
const REPAIR_SOURCE = `
    FROM ${TABLE} cm
    JOIN clans c ON c.id = cm.clan_id
    JOIN users u ON u.id = cm.user_id
    JOIN enrollments e ON e.id = cm.enrollment_id
                      AND e.program_id = c.program_id
                      AND e.mentee_id = cm.user_id
   WHERE cm.role IN ${MENTOR_ROLES}
     AND cm.status = 'active'
     AND cm.enrollment_id IS NOT NULL
     AND e.status NOT IN ('rejected', 'dropped')
     AND NOT EXISTS (
       SELECT 1 FROM ${TABLE} m2
        WHERE m2.clan_id = cm.clan_id AND m2.user_id = cm.user_id AND m2.role = 'mentee'
     )
     AND NOT EXISTS (
       SELECT 1 FROM ${TABLE} m3
         JOIN clans c3 ON c3.id = m3.clan_id
        WHERE m3.user_id = cm.user_id AND m3.role = 'mentee' AND m3.status = 'active'
          AND c3.program_id = c.program_id
     )`;

/** Unique indexes on the table whose column list is exactly `cols`, by name. */
async function uniqueIndexesOn(cols, transaction) {
  const [rows] = await sequelize.query(`
    SELECT i.relname AS name, pg_get_indexdef(x.indexrelid) AS def
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    WHERE t.relname = '${TABLE}' AND x.indisunique AND NOT x.indisprimary
  `, { transaction });
  const want = `(${cols.join(', ')})`;
  return rows.filter((r) => r.def.endsWith(want)).map((r) => r.name);
}

/**
 * Drop by name. A unique key backed by a table CONSTRAINT (ALTER TABLE ... ADD
 * UNIQUE) can't be dropped with DROP INDEX, and vice versa — `sync` creates the
 * index form, older migrations the constraint form, so handle both.
 */
async function dropUnique(name, transaction) {
  const [[constraint]] = await sequelize.query(
    `SELECT 1 FROM pg_constraint WHERE conname = '${name}' AND conrelid = '${TABLE}'::regclass`,
    { transaction }
  );
  if (constraint) {
    await sequelize.query(`ALTER TABLE ${TABLE} DROP CONSTRAINT "${name}"`, { transaction });
    console.log(`  ✓ Dropped constraint ${name}`);
  } else {
    await sequelize.query(`DROP INDEX IF EXISTS "${name}"`, { transaction });
    console.log(`  ✓ Dropped index ${name}`);
  }
}

/** gen_random_uuid() is core from Postgres 13. Fail loudly rather than mid-run. */
async function assertPostgres13(transaction) {
  const [[{ v }]] = await sequelize.query(
    `SELECT current_setting('server_version_num')::int AS v`, { transaction }
  );
  if (v < 130000) {
    throw new Error(`Postgres ${v} is too old for gen_random_uuid(); needs 13+ (or CREATE EXTENSION pgcrypto)`);
  }
}

/** Exactly who the repair would touch — no writes. */
async function preview() {
  console.log('▶ Migration 075 — DRY RUN (no changes will be made)\n');
  await assertPostgres13();

  const oldKey = await uniqueIndexesOn(['clan_id', 'user_id']);
  const newKey = await uniqueIndexesOn(['clan_id', 'user_id', 'role']);
  console.log(`  unique key on (clan_id, user_id):        ${oldKey.join(', ') || '— none'}`);
  console.log(`  unique key on (clan_id, user_id, role):  ${newKey.join(', ') || '— none'}`);

  const [rows] = await sequelize.query(`
    SELECT u.email, u.role AS account_role, cm.role AS clan_role, c.name AS clan, e.status AS enrollment
    ${REPAIR_SOURCE}
     ORDER BY u.email
  `);
  console.log(`\n  Mentee memberships to restore: ${rows.length}`);
  for (const r of rows) {
    console.log(`    · ${r.email}  (account: ${r.account_role}, holds ${r.clan_role} in "${r.clan}", enrollment: ${r.enrollment})`);
  }

  // The counterweight: mentor rows the repair deliberately leaves alone.
  const [[{ count: untouched }]] = await sequelize.query(`
    SELECT COUNT(*)::int AS count FROM ${TABLE}
     WHERE role IN ${MENTOR_ROLES} AND status = 'active' AND enrollment_id IS NULL
  `);
  console.log(`\n  Mentor memberships left untouched (no enrollment_id): ${untouched}`);
  const [[{ count: total }]] = await sequelize.query(`SELECT COUNT(*)::int AS count FROM ${TABLE}`);
  console.log(`  Total rows in ${TABLE}: ${total}`);
  console.log('\n✅ Dry run complete — nothing was written.');
}

async function up() {
  console.log('▶ Running migration 075: clan memberships allow multiple roles per clan');

  await sequelize.transaction(async (transaction) => {
    await assertPostgres13(transaction);

    // 1. Widen the key FIRST. The restored mentee row sits beside a mentor row
    //    for the same (clan, user) — under the old key that's a unique violation.
    const stale = await uniqueIndexesOn(['clan_id', 'user_id'], transaction);
    if (!stale.length) console.log('  ℹ No (clan_id, user_id) unique index found, skipping');
    for (const name of stale) await dropUnique(name, transaction);

    const existing = await uniqueIndexesOn(['clan_id', 'user_id', 'role'], transaction);
    if (existing.length) {
      console.log(`  ℹ Unique index on (clan_id, user_id, role) exists (${existing[0]})`);
    } else {
      await sequelize.query(`CREATE UNIQUE INDEX "${NEW_INDEX}" ON ${TABLE} (clan_id, user_id, role)`, { transaction });
      console.log(`  ✓ Index ${NEW_INDEX}`);
    }

    // 2. Restore the mentee rows the old upsert overwrote. The NOT EXISTS in
    //    REPAIR_SOURCE makes this idempotent on a re-run. Name them BEFORE the
    //    insert: a raw INSERT's row count isn't reliably reported back, and this
    //    number is what tells you whether to trust the run.
    const [affected] = await sequelize.query(
      `SELECT u.email, c.name AS clan ${REPAIR_SOURCE} ORDER BY u.email`,
      { transaction }
    );

    await sequelize.query(`
      INSERT INTO ${TABLE} (id, clan_id, user_id, role, status, enrollment_id, joined_at, created_at, updated_at)
      SELECT gen_random_uuid(), cm.clan_id, cm.user_id, 'mentee', 'active', cm.enrollment_id,
             COALESCE(cm.joined_at, NOW()), NOW(), NOW()
      ${REPAIR_SOURCE}
    `, { transaction });

    console.log(`  ✓ Restored ${affected.length} clobbered mentee membership(s)`);
    for (const r of affected) console.log(`      · ${r.email} → mentee of "${r.clan}"`);
  });

  console.log('✅ Migration 075 complete');
}

async function down() {
  console.log('▶ Rolling back migration 075');

  await sequelize.transaction(async (transaction) => {
    // DESTRUCTIVE: the old key can't hold a dual-role member, so each is collapsed
    // back to one row by dropping the mentee side. Anyone deliberately made a
    // mentee-and-co-mentor after this migration loses the mentee half.
    const [removed] = await sequelize.query(`
      DELETE FROM ${TABLE} m
       WHERE m.role = 'mentee'
         AND EXISTS (
           SELECT 1 FROM ${TABLE} other
            WHERE other.clan_id = m.clan_id AND other.user_id = m.user_id
              AND other.role IN ${MENTOR_ROLES}
         )
      RETURNING m.id
    `, { transaction });
    console.log(`  ✓ Collapsed ${removed.length} dual-role membership(s)`);

    for (const name of await uniqueIndexesOn(['clan_id', 'user_id', 'role'], transaction)) {
      await dropUnique(name, transaction);
    }
    const existing = await uniqueIndexesOn(['clan_id', 'user_id'], transaction);
    if (!existing.length) {
      await sequelize.query(`CREATE UNIQUE INDEX "${OLD_INDEX}" ON ${TABLE} (clan_id, user_id)`, { transaction });
      console.log(`  ✓ Index ${OLD_INDEX}`);
    }
  });

  console.log('✅ Rollback 075 complete');
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const isRollback = argv.some((a) => a === '--rollback' || a === '-r');
  const isDryRun = argv.some((a) => a === '--dry-run' || a === '-n');
  const run = isDryRun ? preview : (isRollback ? down : up);
  (async () => { try { await run(); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down, preview };

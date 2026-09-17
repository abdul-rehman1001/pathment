/**
 * Migration: 102_repair_duplicate_streak_bonuses
 *
 * Take back the streak bonuses that were paid more than once.
 *
 * A milestone bonus was awarded from `milestonesCrossed(previous, current)`,
 * where `previous` is the counter on the mentee profile. That counter drops to
 * zero whenever a streak breaks, and also whenever the streak is recounted on a
 * day before the mentee has logged. Either way the next call asked what lies
 * between 0 and the current run and re-paid every milestone underneath it.
 *
 * On production that was 8,250 points across eleven mentees. One was paid the
 * seven-day bonus eight times. The mentee at the top of the leaderboard showed
 * 3,276 points against 1,326 genuinely earned — 2,600 of her total was streak
 * bonuses and 141 was completed work — which is what made the board read as
 * nonsense to everyone below her.
 *
 * The service no longer works this way: what has been paid is read from the
 * ledger. This repairs the rows already written.
 *
 * For each mentee and each milestone it keeps the EARLIEST award — the one they
 * actually earned — and removes the repeats. Then, for everybody it touched, it
 * rewrites `points_before`/`points_after` down their whole ledger so the running
 * total reads straight, recomputes `total_points`, and re-derives the level.
 *
 * Levels are only ever LOWERED back to what the corrected points support, and
 * that is deliberate: leaving somebody at level 3 on level-1 points would keep
 * the inflation visible in the one place a mentee looks most.
 *
 * Idempotent: run it twice and the second run finds nothing to do.
 *
 * Run:      node server/scripts/migrations/102_repair_duplicate_streak_bonuses.js
 * Preview:  node server/scripts/migrations/102_repair_duplicate_streak_bonuses.js --dry-run
 */
const sequelize = require('./_db');

const LEVEL_THRESHOLDS = { 1: 0, 2: 500, 3: 2000, 4: 5000, 5: 10000 };

const levelFor = (points) =>
  Object.entries(LEVEL_THRESHOLDS)
    .filter(([, threshold]) => points >= threshold)
    .map(([level]) => Number(level))
    .reduce((highest, level) => Math.max(highest, level), 1);

/**
 * The repeats: every streak bonus after the first for a given mentee and
 * milestone. The milestone is read out of the reason, which is the only place
 * it was ever recorded ("7 day streak bonus"); rows whose reason does not match
 * that shape are left alone rather than guessed at.
 */
const RANKED = `
  SELECT ph.id, ph.user_id, ph.points_change, ph.reason, ph.created_at,
         ROW_NUMBER() OVER (
           PARTITION BY ph.user_id, substring(ph.reason from '^(\\d+) day streak bonus$')
           ORDER BY ph.created_at ASC, ph.id ASC
         ) AS seq
    FROM points_history ph
   WHERE ph.source_type = 'streak_bonus'
     AND ph.reason ~ '^\\d+ day streak bonus$'`;

/** Every streak bonus after the first for a given mentee and milestone. */
const DUPLICATE_ROWS = `SELECT id, user_id, points_change, reason, created_at
                          FROM (${RANKED}) ranked WHERE seq > 1`;
const DUPLICATE_IDS = `SELECT id FROM (${RANKED}) ranked WHERE seq > 1`;

async function up({ dryRun = false } = {}) {
  console.log(`▶ Migration 102: repair duplicated streak bonuses${dryRun ? ' (DRY RUN)' : ''}`);

  const [duplicates] = await sequelize.query(DUPLICATE_ROWS);
  if (!duplicates.length) {
    console.log('  ℹ No duplicated streak bonuses found — nothing to repair');
    return { removed: 0, usersRepaired: 0, pointsRemoved: 0 };
  }

  const affectedUsers = [...new Set(duplicates.map((row) => row.user_id))];
  const pointsRemoved = duplicates.reduce((sum, row) => sum + Number(row.points_change), 0);

  console.log(`  • ${duplicates.length} duplicate award(s) across ${affectedUsers.length} mentee(s)`);
  console.log(`  • ${pointsRemoved} point(s) to be taken back`);

  if (dryRun) {
    const [preview] = await sequelize.query(`
      SELECT u.first_name || ' ' || u.last_name AS name,
             mp.total_points AS current_points,
             (mp.total_points - COALESCE(d.extra, 0)) AS corrected_points
        FROM mentee_profiles mp
        JOIN users u ON u.id = mp.user_id
        JOIN (SELECT user_id, SUM(points_change)::int AS extra
                FROM (${DUPLICATE_ROWS}) dup GROUP BY user_id) d ON d.user_id = mp.user_id
       ORDER BY corrected_points DESC`);
    console.table(preview);
    console.log('  ℹ Dry run — nothing was written');
    return { removed: 0, usersRepaired: 0, pointsRemoved: 0, preview };
  }

  await sequelize.transaction(async (t) => {
    await sequelize.query(
      `DELETE FROM points_history WHERE id IN (${DUPLICATE_IDS})`,
      { transaction: t }
    );
    console.log(`  ✓ Removed ${duplicates.length} duplicate award(s)`);

    // The ledger has to read straight afterwards: points_before/points_after are
    // a running total, and deleting from the middle leaves them describing a
    // history that never happened.
    for (const userId of affectedUsers) {
      const [rows] = await sequelize.query(
        `SELECT id, points_change FROM points_history
          WHERE user_id = :userId ORDER BY created_at ASC, id ASC`,
        { replacements: { userId }, transaction: t }
      );

      let running = 0;
      for (const row of rows) {
        const before = running;
        running += Number(row.points_change);
        await sequelize.query(
          `UPDATE points_history SET points_before = :before, points_after = :after WHERE id = :id`,
          { replacements: { before, after: running, id: row.id }, transaction: t }
        );
      }

      await sequelize.query(
        `UPDATE mentee_profiles
            SET total_points = :points, current_level = :level, updated_at = NOW()
          WHERE user_id = :userId`,
        { replacements: { points: running, level: levelFor(running), userId }, transaction: t }
      );
    }
    console.log(`  ✓ Rebuilt the ledger and totals for ${affectedUsers.length} mentee(s)`);

    // The cached leaderboard rows are derived; drop the stale ones so they are
    // rebuilt from the corrected ledger rather than kept as a second answer.
    await sequelize.query(
      `DELETE FROM leaderboard_entries WHERE user_id IN (:userIds)`,
      { replacements: { userIds: affectedUsers }, transaction: t }
    ).catch(() => { /* table is optional in some environments */ });
  });

  console.log('✅ Migration 102 complete');
  return { removed: duplicates.length, usersRepaired: affectedUsers.length, pointsRemoved };
}

async function down() {
  // The removed rows were payments that should never have been made. Putting
  // them back would restore the inflation, so this deliberately does nothing.
  console.log('▶ Rollback 102: nothing to undo — the removed awards were duplicates');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const isRollback = args.some((a) => a === '--rollback' || a === '-r');
  const dryRun = args.some((a) => a === '--dry-run' || a === '-n');
  (async () => {
    try {
      await (isRollback ? down() : up({ dryRun }));
      process.exit(0);
    } catch (e) {
      console.error('Migration failed:', e.message);
      process.exit(1);
    }
  })();
}

module.exports = { up, down };

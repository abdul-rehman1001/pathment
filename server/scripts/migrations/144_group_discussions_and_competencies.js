const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

/**
 * Group discussions and presentations, and the rubric they are scored against.
 *
 * Deliberately NOT a new kind of session. A cohort review already carries a
 * schedule, a Jitsi room, attendance, who joined when, and how long each
 * person actually spoke - which is most of what running a group discussion
 * needs. A discussion is that same session with a scenario attached and
 * somebody watching; a presentation is the same again with one speaker at a
 * time. So this adds three columns to the session and a running order to the
 * entry, rather than a parallel table that would need its own scheduling,
 * its own call and its own attendance all over again.
 *
 * The competency tables are the other half. Everything the platform measures
 * today comes from an artifact - did you submit, was it on time, how was it
 * rated - and none of it can see how somebody reasons out loud or handles
 * being told they are wrong. `competency_scores` is where that goes, and the
 * polymorphic source is the point: a score made in a live discussion, on a
 * submission, or in an interview is the same claim about the same person and
 * belongs in one place, or every surface invents its own and they disagree.
 */

async function tableExists(name) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=:name`,
    { replacements: { name }, type: Sequelize.QueryTypes.SELECT },
  );
  return Boolean(rows);
}

async function columnExists(table, column) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=:table AND column_name=:column`,
    { replacements: { table, column }, type: Sequelize.QueryTypes.SELECT },
  );
  return Boolean(rows);
}

async function addColumn(table, column, ddl) {
  if (!await tableExists(table)) return;
  if (await columnExists(table, column)) return;
  await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  console.log(`  ✓ ${table}.${column}`);
}

async function up() {
  console.log('▶ Running migration 144: group discussions and competencies\n');

  // ── the session becomes three things, defaulting to what it already was ──
  await addColumn('cohort_review_sessions', 'kind', "VARCHAR(16) NOT NULL DEFAULT 'review'");
  await addColumn('cohort_review_sessions', 'scenario', 'TEXT');
  await addColumn('cohort_review_sessions', 'facilitator_id', 'UUID REFERENCES users(id) ON DELETE SET NULL');

  if (await tableExists('cohort_review_sessions')) {
    await sequelize.query(`
      ALTER TABLE cohort_review_sessions DROP CONSTRAINT IF EXISTS "cohort_review_sessions_kind_check";
      ALTER TABLE cohort_review_sessions ADD CONSTRAINT "cohort_review_sessions_kind_check"
        CHECK (kind IN ('review', 'discussion', 'presentation'))
    `);
    console.log('  ✓ kind is one of review | discussion | presentation');
  }

  // Who speaks when. Null for a discussion, where nobody has a turn.
  await addColumn('cohort_review_entries', 'speaking_order', 'INTEGER');

  // ── the rubric ──
  if (!await tableExists('competencies')) {
    await sequelize.query(`
      CREATE TABLE competencies (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name             VARCHAR(80) NOT NULL,
        name_key         VARCHAR(80) NOT NULL,
        description      TEXT,
        position         INTEGER NOT NULL DEFAULT 0,
        active           BOOLEAN NOT NULL DEFAULT TRUE,
        created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await sequelize.query(
      'CREATE UNIQUE INDEX competencies_org_name_key_uniq ON competencies (organization_id, name_key)',
    );
    await sequelize.query('CREATE INDEX competencies_org_active_idx ON competencies (organization_id, active, position)');
    console.log('  ✓ competencies');
  }

  if (!await tableExists('competency_scores')) {
    await sequelize.query(`
      CREATE TABLE competency_scores (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        competency_id    UUID NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
        mentee_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        -- A four point scale, on purpose. A five point scale has a middle, and
        -- a middle is where a tired reviewer puts everybody.
        score            INTEGER NOT NULL CHECK (score >= 1 AND score <= 4),
        note             TEXT,
        -- Where the judgement was made. One row shape for every surface.
        source_type      VARCHAR(24) NOT NULL,
        source_id        UUID,
        scored_by        UUID REFERENCES users(id) ON DELETE SET NULL,
        scored_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // One score per competency per source: re-scoring somebody in the same
    // discussion is a correction, not a second opinion.
    await sequelize.query(`
      CREATE UNIQUE INDEX competency_scores_one_per_source_uniq
        ON competency_scores (competency_id, mentee_id, source_type, source_id)
        WHERE source_id IS NOT NULL
    `);
    await sequelize.query('CREATE INDEX competency_scores_mentee_idx ON competency_scores (organization_id, mentee_id, scored_at DESC)');
    await sequelize.query('CREATE INDEX competency_scores_source_idx ON competency_scores (source_type, source_id)');
    console.log('  ✓ competency_scores');
  }

  console.log('\n✓ Migration 144 complete');
}

async function down() {
  await sequelize.query('DROP TABLE IF EXISTS competency_scores');
  await sequelize.query('DROP TABLE IF EXISTS competencies');
  await sequelize.query('ALTER TABLE cohort_review_entries DROP COLUMN IF EXISTS speaking_order');
  await sequelize.query('ALTER TABLE cohort_review_sessions DROP CONSTRAINT IF EXISTS "cohort_review_sessions_kind_check"');
  await sequelize.query('ALTER TABLE cohort_review_sessions DROP COLUMN IF EXISTS facilitator_id');
  await sequelize.query('ALTER TABLE cohort_review_sessions DROP COLUMN IF EXISTS scenario');
  await sequelize.query('ALTER TABLE cohort_review_sessions DROP COLUMN IF EXISTS kind');
  console.log('Rollback complete');
}

module.exports = { up, down };

if (require.main === module) {
  up()
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => sequelize.close());
}

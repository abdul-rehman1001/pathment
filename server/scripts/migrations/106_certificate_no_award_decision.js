/** Explicit no-award decisions are not missing grades or certificate tiers. */
async function up({ db = require('./_db') } = {}) {
  await db.transaction(async transaction => {
    await db.query(`ALTER TABLE certificate_verifications
      ADD COLUMN IF NOT EXISTS decision VARCHAR(20) NOT NULL DEFAULT 'undecided',
      ADD COLUMN IF NOT EXISTS ai_decision VARCHAR(20) NOT NULL DEFAULT 'undecided',
      ADD COLUMN IF NOT EXISTS decision_history JSONB NOT NULL DEFAULT '[]'::jsonb`, { transaction });
    await db.query(`UPDATE certificate_verifications SET decision='award'
      WHERE decision='undecided' AND final_tier IS NOT NULL`, { transaction });
    await db.query(`UPDATE certificate_verifications SET ai_decision='award'
      WHERE ai_decision='undecided' AND ai_tier IS NOT NULL`, { transaction });
    await db.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='certificate_review_decision_valid') THEN
        ALTER TABLE certificate_verifications ADD CONSTRAINT certificate_review_decision_valid CHECK (
          decision IN ('award', 'no_certificate', 'undecided') AND
          ai_decision IN ('award', 'no_certificate', 'undecided') AND
          (decision <> 'no_certificate' OR final_tier IS NULL) AND
          (ai_decision <> 'no_certificate' OR ai_tier IS NULL)
        );
      END IF;
    END $$`, { transaction });
  });
}
async function down() { throw new Error('No automatic rollback: this would erase certificate review decisions.'); }
module.exports = { up, down };
if (require.main === module) {
  const db = require('./_db');
  (process.argv.includes('--rollback') ? down() : up({ db }))
    .catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
}

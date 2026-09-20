/** Restore missing recommendations without replacing existing results or reviews.
 * Prefer surviving queue evidence; otherwise preserve only the review's known
 * tier/score. Lost AI prose cannot be reconstructed and is explicitly labelled.
 * Run with --dry-run first to report counts without changing data.
 */
async function up({ db = require('./_db'), dryRun = false } = {}) {
  const [templates] = await db.query('SELECT id FROM certificate_templates');
  let restored = 0;
  for (const { id } of templates) {
    await db.transaction(async transaction => {
      const [[template]] = await db.query('SELECT ai_evaluation FROM certificate_templates WHERE id=:id FOR UPDATE', {
        replacements: { id }, transaction
      });
      if (!template) return;
      const previous = template.ai_evaluation || {};
      const results = Array.isArray(previous.results) ? [...previous.results] : [];
      const known = new Set(results.map(r => r.mentee_id || r.id));
      const [jobs] = await db.query(`SELECT DISTINCT ON (mentee_id) mentee_id, result, created_at
        FROM ai_evaluation_queue WHERE template_id=:id AND status='completed' AND result IS NOT NULL
        ORDER BY mentee_id, created_at DESC`, { replacements: { id }, transaction });
      const [reviews] = await db.query(`SELECT mentee_id, ai_tier, ai_match_score FROM certificate_verifications
        WHERE template_id=:id AND ai_tier IS NOT NULL`, { replacements: { id }, transaction });
      const candidates = jobs.filter(j => j.result && !j.result._failed).map(j => ({
        ...j.result, mentee_id: j.mentee_id, evaluatedAt: j.created_at
      }));
      candidates.push(...reviews.map(row => ({
        mentee_id: row.mentee_id, certificate_tier: row.ai_tier, match_score: row.ai_match_score,
        restored_from_review: true,
        reasoning: 'Tier and match score recovered from the dispatched review. The original AI reasoning is unavailable.'
      })));
      let added = 0;
      for (const result of candidates) {
        if (known.has(result.mentee_id)) continue;
        known.add(result.mentee_id);
        results.push(result);
        added++;
      }
      if (added && !dryRun) await db.query(`UPDATE certificate_templates SET ai_evaluation=CAST(:evaluation AS jsonb)
        WHERE id=:id`, { replacements: { id, evaluation: JSON.stringify({ ...previous, results }) }, transaction });
      restored += added;
    });
  }
  console.log(`${dryRun ? 'Recoverable' : 'Restored'} certificate recommendations: ${restored}`);
  return restored;
}
async function down() { /* Data recovery is deliberately not undone. */ }
module.exports = { up, down };
if (require.main === module) {
  const db = require('./_db');
  (process.argv.includes('--rollback') ? down() : up({ db, dryRun: process.argv.includes('--dry-run') }))
    .catch(error => { console.error(error); process.exitCode = 1; })
    .finally(() => db.close());
}

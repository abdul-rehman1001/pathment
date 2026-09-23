// Account tokens are global; the same approved retention policy applies to all
// workspaces. This operator-only service deliberately does not use request scope.
const ROUTINE_ACTIONS = [
  'POST /api/activity/session/heartbeat',
  'POST /api/activity/session/start',
  'POST /api/activity/session/end',
  'POST /api/activity/event',
];

const POLICIES = {
  expiredTokens: {
    table: 'refresh_tokens',
    predicate: "expires_at < NOW() - INTERVAL '7 days'",
  },
  sentEmailBodies: {
    table: 'email_queue',
    predicate: "status = 'sent' AND sent_at < NOW() - INTERVAL '30 days' AND (COALESCE(body_html, '') <> '' OR COALESCE(body_text, '') <> '')",
    update: "body_html = '', body_text = ''",
  },
  routineAudit: {
    table: 'audit_logs',
    predicate: `created_at < NOW() - INTERVAL '90 days' AND action IN (:actions)
      AND new_values->>'status' ~ '^[23][0-9][0-9]$'`,
  },
};

async function report(db) {
  const counts = {};
  for (const [name, policy] of Object.entries(POLICIES)) {
    const [[row]] = await db.query(`SELECT count(*)::int AS count FROM ${policy.table} WHERE ${policy.predicate}`, {
      replacements: { actions: ROUTINE_ACTIONS },
    });
    counts[name] = row.count;
  }
  return counts;
}

async function apply(db, { batchSize = 500, maxBatches = 100 } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000 ||
      !Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 1000) {
    throw new Error('Invalid retention batch limits');
  }
  const counts = {};
  for (const [name, policy] of Object.entries(POLICIES)) {
    counts[name] = 0;
    for (let batch = 0; batch < maxBatches; batch++) {
      const count = await db.transaction(async transaction => {
        await db.query("SET LOCAL lock_timeout = '2s'", { transaction });
        await db.query("SET LOCAL statement_timeout = '15s'", { transaction });
        const mutation = policy.update
          ? `UPDATE ${policy.table} target SET ${policy.update} FROM candidates WHERE target.id = candidates.id`
          : `DELETE FROM ${policy.table} target USING candidates WHERE target.id = candidates.id`;
        const [[row]] = await db.query(`WITH candidates AS (
          SELECT id FROM ${policy.table} WHERE ${policy.predicate}
          LIMIT :batchSize FOR UPDATE SKIP LOCKED
        ), changed AS (${mutation} RETURNING target.id)
        SELECT count(*)::int AS count FROM changed`, {
          transaction, replacements: { actions: ROUTINE_ACTIONS, batchSize },
        });
        return row.count;
      });
      counts[name] += count;
      if (count < batchSize) break;
    }
  }
  return counts;
}

module.exports = { report, apply };

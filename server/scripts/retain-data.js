// Read-only by default. Apply only the explicitly approved, fixed policies.
const db = require('./migrations/_db');
const retention = require('../src/services/dataRetentionService');
(async () => {
  const applying = process.argv.includes('--apply');
  const counts = await (applying ? retention.apply(db) : retention.report(db));
  console.log(JSON.stringify({ mode: applying ? 'applied' : 'preview', counts }));
})().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => db.close());

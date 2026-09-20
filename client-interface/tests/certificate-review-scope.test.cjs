const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Run this isolated TypeScript utility on the project's Node 20 runtime.
const source = fs.readFileSync(path.join(__dirname, '../lib/utils/certificate-review-scope.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const loaded = { exports: {} };
new Function('exports', 'module', compiled.outputText)(loaded.exports, loaded);
const { scopeCertificateReviews } = loaded.exports;

const clan = { clanId: 'clan', clanName: 'My clan', pending: 6, verified: 10, canSend: false, approved: false };
const reviews = Array.from({ length: 16 }, (_, i) => ({
  menteeId: String(i), clanId: 'clan', status: i < 10 ? 'verified' : 'pending',
}));
const roster = reviews.slice(0, 10).map(row => ({ id: row.menteeId }));

test('six historical pending reviews do not block ten active signed-off mentees', () => {
  const result = scopeCertificateReviews(roster, reviews, [clan]);
  assert.equal(result.rows.length, 10);
  assert.equal(result.rows.filter(row => row.status !== 'verified').length, 0);
  assert.deepEqual(result.clans, [{ ...clan, pending: 0, verified: 10 }]);
  assert.equal(result.clans[0].canSend, false, 'sign-off does not grant admin approval');
  assert.equal(clan.pending, 6, 'server response is not mutated');
});

test('counts active pending reviews and preserves server approval', () => {
  const result = scopeCertificateReviews([{ id: '0' }, { id: '10' }], reviews, [
    { ...clan, canSend: true, approved: true },
    { ...clan, clanId: 'other' },
  ]);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.clans, [{ ...clan, pending: 1, verified: 1, canSend: true, approved: true }]);
});

test('empty or not-yet-loaded roster has no review counts', () => {
  assert.deepEqual(scopeCertificateReviews([], reviews, [clan]), { rows: [], clans: [] });
  assert.deepEqual(scopeCertificateReviews(roster, [], []), { rows: [], clans: [] });
});

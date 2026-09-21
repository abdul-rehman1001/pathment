const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../lib/mentorAttention.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const loaded = { exports: {} };
new Function('exports', 'module', compiled.outputText)(loaded.exports, loaded);
const { needsMentorAttention, mentorAttentionReason } = loaded.exports;
const healthy = { risk: 'low', pendingApprovals: 0, openBlockers: 0, momentum: 'flat' };

test('attention includes a pending review or roadblock even when risk is low', () => {
  assert.equal(needsMentorAttention({ ...healthy, pendingApprovals: 1 }), true);
  assert.equal(needsMentorAttention({ ...healthy, openBlockers: 1 }), true);
});
test('legacy risk levels and declining momentum enter the unified attention view', () => {
  for (const risk of ['watch', 'high']) assert.equal(needsMentorAttention({ ...healthy, risk }), true);
  assert.equal(needsMentorAttention({ ...healthy, momentum: 'down' }), true);
  assert.equal(needsMentorAttention(healthy), false);
});
test('overlapping signals count one person, with actionable reasons', () => {
  const mentee = { ...healthy, risk: 'high', openBlockers: 2, pendingApprovals: 3 };
  assert.equal([healthy, mentee].filter(needsMentorAttention).length, 1);
  assert.match(mentorAttentionReason(mentee), /2 roadblocks.*3 awaiting review/);
  assert.equal(mentorAttentionReason(healthy), 'On track');
});

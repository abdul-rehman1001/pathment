// Isolated handoff checks: explicitly omit DB environment/setup hooks.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/domain-handoff-security.test.js'],
  maxWorkers: 1,
};

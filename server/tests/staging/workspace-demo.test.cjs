const { test } = require('node:test');
const assert = require('node:assert/strict');
const { enabled, isDemo, allows } = require('../../src/utils/stagingWorkspaceDemo');
const env = { STAGING_WORKSPACE_DEMO: 'true', APP_URL: 'https://staging.pathment.me', MULTI_TENANT_WORKSPACES_ENABLED: 'false' };
test('demo exception requires explicit staging configuration and does not enable creation', () => {
  assert.equal(enabled(env), true);
  for (const patch of [{ STAGING_WORKSPACE_DEMO: 'false' }, { APP_URL: 'https://app.pathment.me' }, { APP_URL: 'https://staging.pathment.me.attacker.test' }, { MULTI_TENANT_WORKSPACES_ENABLED: 'true' }]) {
    assert.equal(enabled({ ...env, ...patch }), false);
  }
  assert.equal(isDemo({ slug: 'demo-academy' }, env), true);
  assert.equal(isDemo({ slug: 'demo-fellowship' }, env), true);
  assert.equal(isDemo({ slug: 'devweekends' }, env), false);
  assert.equal(isDemo({ slug: 'other' }, env), false);
});
test('only exact reviewed read/session/plan routes are accessible', () => {
  assert.equal(allows('GET', '/api/organizations/demo'), true);
  assert.equal(allows('GET', '/api/organizations/demo/'), true);
  assert.equal(allows('POST', '/api/auth/login'), true);
  for (const [method, path] of [
    ['POST', '/api/organizations'], ['DELETE', '/api/organizations/demo'],
    ['GET', '/api/organizations/demo/anything'], ['POST', '/api/auth/register'],
    ['GET', '/api/admin/users'], ['GET', '/api/certificates/templates'],
    ['GET', '/api/messaging/conversations'], ['POST', '/api/tasks'],
    ['PATCH', '/api/organizations/current'], ['GET', '/api/organizations/%64emo'],
  ]) assert.equal(allows(method, path), false, `${method} ${path}`);
});
test('fixture addresses are accepted by the actual sign-in validator', () => {
  const { authSchemas } = require('../../src/validations/authValidation');
  const emails = ['owner@workspace-demo.example.com', ...['demo-academy', 'demo-fellowship'].flatMap(slug =>
    ['admin', 'mentor', 'mentee1', 'mentee2'].map(role => `${role}@${slug}.example.com`))];
  for (const email of emails) {
    const { error } = authSchemas.login.validate({ email, password: 'Demo-Local123!' });
    assert.equal(error, undefined, email);
  }
});

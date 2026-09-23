/** A deliberately restricted staging rehearsal, never a multi-tenant release switch. */
const SLUGS = new Set(['demo-academy', 'demo-fellowship']);
const ALLOWED = new Set([
  'POST /api/auth/login', 'POST /api/auth/refresh', 'POST /api/auth/logout',
  'GET /api/auth/me', 'GET /api/organizations/me', 'GET /api/organizations/current',
  'GET /api/organizations/demo', 'POST /api/organizations/current/plan-request',
]);
function enabled(env = process.env) {
  return env.STAGING_WORKSPACE_DEMO === 'true' &&
    env.APP_URL === 'https://staging.pathment.me' &&
    env.MULTI_TENANT_WORKSPACES_ENABLED !== 'true';
}
function isDemo(organization, env = process.env) {
  return enabled(env) && SLUGS.has(organization?.slug);
}
function allows(method, path) {
  return ALLOWED.has(`${method} ${path.replace(/\/+$/, '')}`);
}
module.exports = { enabled, isDemo, allows, SLUGS };

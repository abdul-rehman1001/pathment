const { test } = require('node:test');
const assert = require('node:assert/strict');
const withPostgres = require('../helpers/privatePostgres.cjs');

test('workspace creation provisions an isolated owner, plan and defaults through the real API', async () => {
  await withPostgres(async adminDb => {
    await adminDb.query('CREATE DATABASE pathment_isolation_test');
    Object.assign(process.env, {
      NODE_ENV: 'test', DB_SSL: 'false', MULTI_TENANT_WORKSPACES_ENABLED: 'false',
      DATABASE_URL: `postgres://isolation_test@localhost/pathment_isolation_test?host=${encodeURIComponent(adminDb.config.host)}`,
      JWT_SECRET: 'isolated-workspace-test-secret', JWT_REFRESH_SECRET: 'isolated-refresh-secret',
      DEFAULT_ORGANIZATION_SLUG: 'devweekends', TENANT_SLUG: 'devweekends',
      RESEND_API_KEY: '', AI_API_KEY: '', GROQ_API_KEY: '', OPENAI_API_KEY: '',
    });
    // No external delivery during integration tests; all application/auth/DB
    // boundaries below are real. Starting the Express app does not start workers.
    const notifications = require.resolve('../../src/services/notificationOrchestrator');
    require.cache[notifications] = { exports: { dispatch: async () => ({ delivered: 0 }) } };
    const { sequelize, models } = require('../../src/db');
    assert.equal(sequelize.config.host, adminDb.config.host);
    const { runWithRequestContext } = require('../../src/utils/auditContext');
    const { generateAccessToken } = require('../../src/utils/jwt');
    const request = require('supertest');
    let app;
    try {
      const { GLOBAL_MODELS } = require('../../src/config/tenantOwnership');
      assert.deepEqual(Object.values(models).filter(model => !model.rawAttributes.organizationId && !GLOBAL_MODELS.has(model.name)).map(model => model.name), [], 'every model must explicitly declare global or workspace ownership');
      await sequelize.sync();
      const legacy = await models.Organization.create({ name: 'DevWeekends', slug: 'devweekends' });
      const plan = await models.Plan.create({ key: 'starter', name: 'Starter', limits: { members: 25, programs: 1, clans: 3 }, features: {} });
      await models.OrganizationSubscription.create({ organizationId: legacy.id, planId: plan.id, status: 'active' });
      const owner = await models.User.create({ email: 'owner@example.com', passwordHash: 'not-a-login-hash', firstName: 'Workspace', lastName: 'Owner', role: 'mentee', status: 'active', emailVerified: true });
      const legacyAdmin = await models.User.create({ email: 'legacy@example.com', passwordHash: 'not-a-login-hash', firstName: 'Legacy', lastName: 'Admin', role: 'admin', status: 'active', emailVerified: true });
      process.env.MULTI_TENANT_WORKSPACES_ENABLED = 'true';
      app = require('../../src/index');
      const token = generateAccessToken({ id: owner.id });
      const otherToken = generateAccessToken({ id: legacyAdmin.id });
      const created = await request(app).post('/api/organizations').set('Authorization', `Bearer ${token}`)
        .set('X-Pathment-Workspace', 'devweekends').send({ name: 'Independent workspace', slug: 'independent', timezone: 'UTC' });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const workspace = created.body.data.organization;
      assert.equal(workspace.membershipRole, 'owner');
      const overview = await request(app).get('/api/organizations/current').set('Authorization', `Bearer ${token}`).set('X-Pathment-Workspace', workspace.slug);
      assert.equal(overview.status, 200, JSON.stringify(overview.body));
      assert.equal(overview.body.data.usage.members, 1);
      assert.equal(overview.body.data.usage.programs, 0);
      assert.equal(overview.body.data.subscription.plan.key, 'starter');
      const ownerIdentity = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).set('X-Pathment-Workspace', workspace.slug);
      assert.equal(ownerIdentity.status, 200);
      assert.ok(ownerIdentity.body.data.user.capabilities.includes('admin'), 'workspace ownership grants admin despite the original account role');
      const rejected = await request(app).get('/api/organizations/current').set('Authorization', `Bearer ${otherToken}`).set('X-Pathment-Workspace', workspace.slug);
      assert.equal(rejected.status, 403);
      const account = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${otherToken}`).set('X-Pathment-Workspace', workspace.slug);
      assert.equal(account.status, 200, 'an account can authenticate before accepting an invitation');
      assert.deepEqual(account.body.data.user.capabilities, []);
      assert.equal(account.body.data.user.adminProfile, undefined);
      await runWithRequestContext({ organizationId: workspace.id, userId: owner.id }, async () => {
        assert.equal(await models.AdminProfile.count(), 1);
        assert.ok(await models.Badge.count() > 0);
        assert.equal(await models.MenteeProfile.count(), 0);
        assert.equal(await models.User.count(), 1, 'the member directory is not imported');
        await models.RegistrationInvite.create({
          tokenHash: require('../../src/utils/jwt').hashToken('test-workspace-invite'),
          email: legacyAdmin.email, role: 'mentee', invitedBy: owner.id,
          expiresAt: new Date(Date.now() + 60_000),
        });
      });
      const accepted = await request(app).post('/api/auth/invites/test-workspace-invite/accept')
        .set('Authorization', `Bearer ${otherToken}`).set('X-Pathment-Workspace', workspace.slug);
      assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
      const replay = await request(app).post('/api/auth/invites/test-workspace-invite/accept')
        .set('Authorization', `Bearer ${otherToken}`).set('X-Pathment-Workspace', workspace.slug);
      assert.equal(replay.status, 400);
      await runWithRequestContext({ organizationId: workspace.id, userId: owner.id }, async () => {
        assert.equal(await models.MenteeProfile.count(), 1);
        assert.equal((await models.MenteeProfile.findOne()).totalPoints, 0);
        assert.equal((await models.User.findByPk(legacyAdmin.id)).passwordHash, 'not-a-login-hash');
        const authz = require('../../src/services/authzService');
        assert.equal(await authz.hasAdminAccess(legacyAdmin), false, 'a global admin role grants no authority here');
        assert.ok((await authz.getCapabilities(legacyAdmin)).includes('mentee'));
        const recipients = await require('../../src/services/workspaceRecipients').admins();
        assert.deepEqual(recipients.map(row => row.id), [owner.id], 'admin notifications follow this workspace, not the account role');
      });
      const slots = new Map();
      for (const org of [legacy, workspace]) {
        await runWithRequestContext({ organizationId: org.id, userId: owner.id }, async () => {
          slots.set(org.id, await models.AvailabilitySlot.create({ mentorId: owner.id, day: 'Monday', date: '2026-10-05', time: '09:00' }));
          await models.AnalyticsEvent.create({ userId: owner.id, eventType: org.slug, eventCategory: 'test' });
          await models.ScheduledJob.create({ jobName: 'weekly-report', jobType: 'notification' });
        });
      }
      const visited = new Set();
      await require('../../src/utils/workspaceExecution').forEachWorkspace(async org => {
        assert.equal(await models.AvailabilitySlot.count(), 1);
        assert.equal((await models.AvailabilitySlot.findOne()).id, slots.get(org.id).id);
        assert.equal((await models.AnalyticsEvent.findOne()).eventType, org.slug);
        await models.ScheduledJob.increment('totalRuns', { by: 1, where: { jobName: 'weekly-report' } });
        visited.add(org.id);
      });
      assert.equal(visited.size, 2, 'background passes see each workspace independently');
      await runWithRequestContext({ organizationId: workspace.id, userId: owner.id }, async () => {
        assert.equal((await models.ScheduledJob.findOne()).totalRuns, 1);
        assert.equal(await models.AvailabilitySlot.findByPk(slots.get(legacy.id).id), null);
      });
      const assessment = await request(app).post('/api/assessments').set('Authorization', `Bearer ${token}`)
        .set('X-Pathment-Workspace', workspace.slug).send({ title: 'Private assessment' });
      assert.equal(assessment.status, 201, JSON.stringify(assessment.body));
      const assessmentId = assessment.body.data.assessment.id;
      const foreignAssessment = await request(app).get(`/api/assessments/${assessmentId}`)
        .set('Authorization', `Bearer ${otherToken}`).set('X-Pathment-Workspace', legacy.slug);
      assert.equal(foreignAssessment.status, 404, 'an admin cannot read another workspace assessment by ID');
      const unauthorizedAuthor = await request(app).post('/api/assessments')
        .set('Authorization', `Bearer ${otherToken}`).set('X-Pathment-Workspace', workspace.slug).send({ title: 'Unauthorized' });
      assert.equal(unauthorizedAuthor.status, 403, 'global admin is only a mentee in the invited workspace');
      const duplicate = await request(app).post('/api/organizations').set('Authorization', `Bearer ${token}`).send({ name: 'Duplicate', slug: workspace.slug });
      assert.equal(duplicate.status, 409);
    } finally {
      await sequelize.close();
    }
  });
});

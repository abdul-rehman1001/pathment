'use strict';

const request = require('supertest');
process.env.CLIENT_URL = `${process.env.CLIENT_URL || 'http://localhost:3000'},https://*.pathment.me`;
process.env.MULTI_TENANT_WORKSPACES_ENABLED = 'true';
process.env.APP_URL = 'https://app.pathment.me';
const { createHash } = require('crypto');
const verifier = 'a'.repeat(43);
const codeChallenge = createHash('sha256').update(verifier).digest('base64url');
const app = require('../../src/index');
const { models } = require('../../src/db');
const { createMentee, cleanDb } = require('../helpers/seed');
const { generateAccessToken } = require('../../src/utils/jwt');

describe('legacy-domain session handoff', () => {
  let organization;
  let user;
  let accessToken;

  beforeEach(async () => {
    await cleanDb();
    organization = await models.Organization.findOne({ where: { slug: 'devweekends' } });
    user = await createMentee({ email: `handoff-${Date.now()}@test.com` });
    accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role });
  });

  afterAll(async () => { await cleanDb(); });

  it('moves an existing member session exactly once without exposing its tokens', async () => {
    const created = await request(app)
      .post('/api/auth/domain-handoff')
      .set('Origin', 'https://devweekends.pathment.me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Pathment-Workspace', organization.slug)
      .send({ rememberSession: true, codeChallenge });

    expect(created.status).toBe(201);
    expect(created.body.data.workspace).toBe('devweekends');
    expect(created.body.data.token).toHaveLength(64);
    expect(created.body.data).not.toHaveProperty('accessToken');
    expect(created.body.data).not.toHaveProperty('refreshToken');
    const stored = await models.DomainHandoffToken.findOne({
      where: { userId: user.id, organizationId: organization.id },
      skipOrganizationScope: true,
    });
    expect(stored.tokenHash).not.toBe(created.body.data.token);

    const consumed = await request(app)
      .post('/api/auth/domain-handoff/consume')
      .set('Origin', 'https://app.pathment.me')
      .set('X-Pathment-Workspace', organization.slug)
      .send({ codeVerifier: verifier, token: created.body.data.token, workspace: organization.slug });

    expect(consumed.status).toBe(200);
    expect(consumed.body.data.user.id).toBe(user.id);
    expect(consumed.body.data.rememberSession).toBe(true);
    expect(consumed.body.data.tokens.accessToken).toBeTruthy();
    expect(consumed.body.data.tokens.refreshToken).toBeTruthy();

    const replay = await request(app)
      .post('/api/auth/domain-handoff/consume')
      .set('Origin', 'https://app.pathment.me')
      .set('X-Pathment-Workspace', organization.slug)
      .send({ codeVerifier: verifier, token: created.body.data.token, workspace: organization.slug });
    expect(replay.status).toBe(400);
  });

  it('allows the legacy workspace origin during the migration window', async () => {
    const response = await request(app)
      .options('/api/auth/domain-handoff')
      .set('Origin', 'https://devweekends.pathment.me')
      .set('Access-Control-Request-Method', 'POST');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://devweekends.pathment.me');
  });

  it('cannot redeem a code in another workspace', async () => {
    const other = await models.Organization.create({
      name: 'Other workspace', slug: `other-${Date.now()}`, status: 'active', timezone: 'UTC',
    });
    const created = await request(app)
      .post('/api/auth/domain-handoff')
      .set('Origin', 'https://devweekends.pathment.me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Pathment-Workspace', organization.slug)
      .send({ codeChallenge });

    const wrongWorkspace = await request(app)
      .post('/api/auth/domain-handoff/consume')
      .set('Origin', 'https://app.pathment.me')
      .set('X-Pathment-Workspace', other.slug)
      .send({ codeVerifier: verifier, token: created.body.data.token, workspace: other.slug });
    expect(wrongWorkspace.status).toBe(400);
  });
  it('rejects the wrong verifier without spending the code or revoking the source session', async () => {
    const created = await request(app).post('/api/auth/domain-handoff')
      .set('Origin', 'https://devweekends.pathment.me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Pathment-Workspace', organization.slug)
      .send({ codeChallenge });
    const wrong = await request(app).post('/api/auth/domain-handoff/consume')
      .set('Origin', 'https://app.pathment.me')
      .set('X-Pathment-Workspace', organization.slug)
      .send({ token: created.body.data.token, workspace: organization.slug, codeVerifier: 'b'.repeat(43) });
    expect(wrong.status).toBe(400);
    const correct = await request(app).post('/api/auth/domain-handoff/consume')
      .set('Origin', 'https://app.pathment.me')
      .set('X-Pathment-Workspace', organization.slug)
      .send({ token: created.body.data.token, workspace: organization.slug, codeVerifier: verifier });
    expect(correct.status).toBe(200);
    const source = await request(app).post('/api/auth/domain-handoff')
      .set('Origin', 'https://devweekends.pathment.me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Pathment-Workspace', organization.slug)
      .send({ codeChallenge });
    expect(source.status).toBe(201);
  });

  it('rejects missing and legacy redemption origins despite wildcard CORS', async () => {
    for (const origin of [null, 'https://devweekends.pathment.me']) {
      const attempt = request(app).post('/api/auth/domain-handoff/consume')
        .set('X-Pathment-Workspace', organization.slug);
      if (origin) attempt.set('Origin', origin);
      const response = await attempt.send({ token: 'a'.repeat(64), workspace: organization.slug, codeVerifier: verifier });
      expect(response.status).toBe(403);
    }
  });

});

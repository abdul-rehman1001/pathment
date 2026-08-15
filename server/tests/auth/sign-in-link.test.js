'use strict';

/**
 * Signing in by emailed link.
 *
 * The properties worth guarding are all security ones, and every single one of
 * them is the kind that looks fine in a demo and is a hole in production:
 *
 *  - the request endpoint answers the same whether the account exists, so it
 *    cannot be used to ask whether somebody is a Pathment member
 *  - the token is stored hashed, so a database dump is not a pile of sessions
 *  - it works exactly once, and asking again spends the older ones
 *  - it expires, and expiry is checked when it is spent
 *  - a suspended account is refused at the moment of use, not the moment of
 *    sending
 *  - and it does NOT skip two factor, which is the one somebody would
 *    reasonably assume it did
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const { hashToken } = require('../../src/utils/jwt');
const authService = require('../../src/services/authService');
const { cleanDb, createUser } = require('../helpers/seed');

let seq = 0;
const uniqueEmail = () => `link-${Date.now()}-${seq++}@test.com`;

/** The raw token never leaves the service, so tests plant their own. */
async function plant(user, { token = 'raw-token-value', minutes = 15 } = {}) {
  return models.SignInLinkToken.create({
    userId: user.id,
    token: hashToken(token),
    expiresAt: new Date(Date.now() + minutes * 60 * 1000)
  });
}

describe('sign in link', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  describe('asking for one', () => {
    it('answers the same for an address with no account', async () => {
      const real = await createUser({ email: uniqueEmail(), role: 'mentee' });

      const known = await request(app).post('/api/auth/sign-in-link').send({ email: real.email });
      const unknown = await request(app)
        .post('/api/auth/sign-in-link')
        .send({ email: uniqueEmail() });

      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(unknown.body.message).toBe(known.body.message);
    });

    it('makes a token for a real account and none for a stranger', async () => {
      const user = await createUser({ email: uniqueEmail(), role: 'mentee' });

      await authService.requestSignInLink(user.email);
      await authService.requestSignInLink(uniqueEmail());

      const all = await models.SignInLinkToken.findAll();
      expect(all).toHaveLength(1);
      expect(all[0].userId).toBe(user.id);
    });

    it('never stores the token it emailed', async () => {
      const user = await createUser({ email: uniqueEmail(), role: 'mentee' });
      await authService.requestSignInLink(user.email);

      const row = await models.SignInLinkToken.findOne({ where: { userId: user.id } });
      // A sixty four character hex digest, not something you could paste into a
      // browser.
      expect(row.token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('spends the older links when a new one is asked for', async () => {
      const user = await createUser({ email: uniqueEmail(), role: 'mentee' });
      await plant(user, { token: 'first' });

      await authService.requestSignInLink(user.email);

      const first = await models.SignInLinkToken.findOne({ where: { token: hashToken('first') } });
      expect(first.usedAt).not.toBeNull();
    });

    it('says nothing and sends nothing for an unverified account', async () => {
      const user = await createUser({ email: uniqueEmail(), role: 'mentee', emailVerified: false });

      await authService.requestSignInLink(user.email);

      expect(await models.SignInLinkToken.count()).toBe(0);
    });

    it('says nothing and sends nothing for a suspended account', async () => {
      const user = await createUser({ email: uniqueEmail(), role: 'mentee', status: 'suspended' });

      await authService.requestSignInLink(user.email);

      expect(await models.SignInLinkToken.count()).toBe(0);
    });
  });

  describe('spending one', () => {
    it('hands back a session', async () => {
      const user = await createUser({ email: uniqueEmail(), role: 'mentee' });
      await plant(user, { token: 'good-token' });

      const res = await request(app)
        .post('/api/auth/sign-in-link/verify')
        .send({ token: 'good-token', client: 'mobile' });

      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe(user.id);
      expect(res.body.data.tokens.accessToken).toBeTruthy();
      expect(res.body.data.tokens.refreshToken).toBeTruthy();
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('works exactly once', async () => {
      const user = await createUser({ email: uniqueEmail(), role: 'mentee' });
      await plant(user, { token: 'once-only' });

      const first = await request(app)
        .post('/api/auth/sign-in-link/verify')
        .send({ token: 'once-only' });
      const second = await request(app)
        .post('/api/auth/sign-in-link/verify')
        .send({ token: 'once-only' });

      expect(first.status).toBe(200);
      expect(second.status).toBe(400);
    });

    it('refuses an expired link', async () => {
      const user = await createUser({ email: uniqueEmail(), role: 'mentee' });
      await plant(user, { token: 'stale', minutes: -1 });

      const res = await request(app)
        .post('/api/auth/sign-in-link/verify')
        .send({ token: 'stale' });

      expect(res.status).toBe(400);
    });

    it('refuses a token nobody issued', async () => {
      const res = await request(app)
        .post('/api/auth/sign-in-link/verify')
        .send({ token: 'invented' });

      expect(res.status).toBe(400);
    });

    it('refuses an account suspended after the link was sent', async () => {
      const user = await createUser({ email: uniqueEmail(), role: 'mentee' });
      await plant(user, { token: 'then-suspended' });

      await user.update({ status: 'suspended' });

      const res = await request(app)
        .post('/api/auth/sign-in-link/verify')
        .send({ token: 'then-suspended' });

      expect(res.status).toBe(401);
    });

    it('does not skip two factor', async () => {
      // The one somebody would reasonably assume it did. Reading an inbox is
      // one factor; letting a link past the second would quietly make two
      // factor mean nothing for everybody who turned it on.
      const user = await createUser({ email: uniqueEmail(), role: 'mentee' });
      await user.update({ twoFactorEnabled: true });
      await plant(user, { token: 'needs-second-factor' });

      const res = await request(app)
        .post('/api/auth/sign-in-link/verify')
        .send({ token: 'needs-second-factor' });

      expect(res.status).toBe(200);
      expect(res.body.data.requiresTwoFactor).toBe(true);
      expect(res.body.data.temporaryToken).toBeTruthy();
      expect(res.body.data.tokens).toBeUndefined();
    });
  });
});

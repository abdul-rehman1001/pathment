'use strict';

/**
 * The GLOBAL /api backstop.
 *
 * A single combined budget, counting successes and exempting nothing, meant a
 * normal session could lock itself out: one dashboard load is ~20 reads and
 * background polling adds tens more per window, so users hit 429 on /auth/me and
 * every other endpoint. These pin the three properties that keep that from
 * recurring — reads and writes are budgeted separately, liveness traffic is free,
 * and one user's spending never lands in another's bucket.
 */

const { callerKey, isExempt, SAFE_METHODS } = require('../../src/middlewares/rateLimiter');
const { generateAccessToken } = require('../../src/utils/jwt');

const reqWith = (overrides = {}) => ({
  method: 'GET', path: '/mentor/cohort', headers: {}, ip: '203.0.113.7', ...overrides,
});

const bearer = (id) => ({
  authorization: `Bearer ${generateAccessToken({ id, email: 'a@b.com', role: 'mentor' })}`,
});

describe('global API rate limiter', () => {
  describe('callerKey — who owns the budget', () => {
    it('keys on the user id from the token', () => {
      const id = 'fbd2995d-617c-4d30-9195-adfc880082c6';
      expect(callerKey(reqWith({ headers: bearer(id) }))).toBe(`u:${id}`);
    });

    it('gives the same user the same bucket across token refreshes', () => {
      const id = 'fbd2995d-617c-4d30-9195-adfc880082c6';
      // Two separately-signed tokens for one person (iat differs).
      expect(callerKey(reqWith({ headers: bearer(id) })))
        .toBe(callerKey(reqWith({ headers: bearer(id) })));
    });

    it('separates users who share leading id characters', () => {
      // The old key covered only ~8 leading hex chars, so these two collided and
      // silently shared one budget.
      const a = 'fbd2995d-617c-4d30-9195-adfc880082c6';
      const b = 'fbd2995d-0000-0000-0000-000000000000';
      expect(callerKey(reqWith({ headers: bearer(a) })))
        .not.toBe(callerKey(reqWith({ headers: bearer(b) })));
    });

    it('falls back to the IP when unauthenticated', () => {
      expect(callerKey(reqWith())).toMatch(/^ip:/);
    });

    it('does not throw on a malformed bearer token', () => {
      const key = callerKey(reqWith({ headers: { authorization: 'Bearer not.a.jwt' } }));
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });
  });

  describe('isExempt — traffic that must never cost a user their session', () => {
    it('exempts the health check', () => {
      expect(isExempt(reqWith({ path: '/health' }))).toBe(true);
    });

    it('exempts the activity heartbeat', () => {
      expect(isExempt(reqWith({ method: 'POST', path: '/activity/session/heartbeat' }))).toBe(true);
    });

    it('exempts CORS preflight, which the client never chose to send', () => {
      expect(isExempt(reqWith({ method: 'OPTIONS' }))).toBe(true);
    });

    it('does NOT exempt ordinary endpoints', () => {
      expect(isExempt(reqWith({ path: '/mentor/cohort' }))).toBe(false);
      expect(isExempt(reqWith({ method: 'POST', path: '/tasks' }))).toBe(false);
    });
  });

  describe('read/write split', () => {
    it('treats GET and HEAD as reads', () => {
      expect(SAFE_METHODS.has('GET')).toBe(true);
      expect(SAFE_METHODS.has('HEAD')).toBe(true);
    });

    it('treats mutations as writes', () => {
      for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) {
        expect(SAFE_METHODS.has(m)).toBe(false);
      }
    });

    it('budgets reads well above writes', () => {
      const config = require('../../src/config');
      expect(config.rateLimit.maxRequests).toBeGreaterThan(config.rateLimit.maxWriteRequests);
      // A dashboard load plus a window of polling must fit many times over.
      expect(config.rateLimit.maxRequests).toBeGreaterThanOrEqual(1000);
    });
  });
});

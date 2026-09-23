const { AsyncLocalStorage } = require('async_hooks');
const { models } = require('../db');

/**
 * Per-request audit context (IP + user-agent) carried via AsyncLocalStorage, so
 * every audit write picks up "who/where" automatically without threading req
 * through dozens of service signatures. The requestContext middleware seeds it.
 */
const store = new AsyncLocalStorage();

const runWithRequestContext = (ctx, fn) => store.run(ctx, fn);
const getRequestContext = () => store.getStore() || {};

/**
 * Record the acting user on the current request context. Called by the auth
 * middleware once the JWT is resolved, so audit writes that don't pass an
 * explicit userId still attribute the action to who actually did it.
 */
const setRequestUser = (userId) => {
  const ctx = store.getStore();
  if (ctx) ctx.userId = userId;
};

/** Bind every downstream query/audit/job spawned by this request to a workspace. */
const setRequestOrganization = (organizationId, organizationSlug = null) => {
  const ctx = store.getStore();
  if (ctx) {
    ctx.organizationId = organizationId || null;
    ctx.organizationSlug = organizationSlug || null;
  }
};

/**
 * The single audit writer. Merges actor/IP/user-agent from the current request
 * context when the caller didn't provide them, and never throws (audit must not
 * break a real request).
 */
async function createAuditLog(data) {
  try {
    if (!models.AuditLog) return;
    const ctx = getRequestContext();
    await models.AuditLog.create({
      ...data,
      userId: data.userId || ctx.userId || null,
      ipAddress: data.ipAddress || ctx.ip || null,
      userAgent: data.userAgent || ctx.userAgent || null,
      ...(models.AuditLog.rawAttributes.organizationId
        ? { organizationId: data.organizationId || ctx.organizationId || null }
        : {}),
    });
  } catch (error) {
    console.warn('Audit log failed:', error.message);
  }
}

module.exports = { runWithRequestContext, getRequestContext, setRequestUser, setRequestOrganization, createAuditLog };

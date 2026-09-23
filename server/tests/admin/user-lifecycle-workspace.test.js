'use strict';

// Unit-only regression coverage: never import a real database connection.
jest.mock('../../src/db', () => ({
  sequelize: {},
  models: {
    OrganizationMembership: { findOne: jest.fn(), update: jest.fn() },
    User: { findByPk: jest.fn(), findOne: jest.fn(), update: jest.fn(), destroy: jest.fn() },
    UserSession: { destroy: jest.fn() },
    RefreshToken: { destroy: jest.fn() },
    Enrollment: { findAll: jest.fn(), update: jest.fn() },
    AssignedTask: { destroy: jest.fn() },
  },
}));
jest.mock('../../src/utils/auditContext', () => ({
  getRequestContext: jest.fn(), createAuditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/socket', () => ({ disconnectWorkspaceUser: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/authService', () => ({ forgotPassword: jest.fn() }));
jest.mock('../../src/services/securityService', () => ({ disable2FA: jest.fn() }));

const { models } = require('../../src/db');
const { getRequestContext, createAuditLog } = require('../../src/utils/auditContext');
const service = require('../../src/services/adminService');
const auth = require('../../src/services/authService');
const { disconnectWorkspaceUser } = require('../../src/socket');
const security = require('../../src/services/securityService');

const operations = [
  ['suspendUser', ['target', 'actor']],
  ['unsuspendUser', ['target', 'actor']],
  ['deleteUser', ['target', 'actor']],
  ['updateUser', ['target', { email: 'attacker@example.com', role: 'mentor', firstName: 'Changed' }, 'actor']],
  ['setUserPassword', ['target', 'new-password', 'actor']],
  ['disableUserTwoFactor', ['target', 'actor']],
  ['sendUserPasswordReset', ['target']],
];

describe('admin lifecycle workspace boundary', () => {
  let memberships;
  beforeEach(() => {
    jest.clearAllMocks();
    getRequestContext.mockReturnValue({ organizationId: 'workspace-a' });
    memberships = [
      { id: 'membership-a', organizationId: 'workspace-a', userId: 'target', role: 'member', status: 'active' },
      { id: 'membership-b', organizationId: 'workspace-b', userId: 'target', role: 'owner', status: 'active' },
    ];
    models.OrganizationMembership.findOne.mockImplementation(async ({ where }) => {
      const row = memberships.find(m => m.organizationId === where.organizationId && m.userId === where.userId);
      return row ? { ...row } : null;
    });
    models.OrganizationMembership.update.mockImplementation(async (values, { where }) => {
      const row = memberships.find(m => Object.entries(where).every(([key, value]) => m[key] === value));
      if (!row) return [0];
      Object.assign(row, values);
      return [1];
    });
  });

  afterEach(() => {
    for (const model of [models.User, models.UserSession, models.RefreshToken, models.Enrollment, models.AssignedTask]) {
      for (const method of Object.values(model)) expect(method).not.toHaveBeenCalled();
    }
    expect(auth.forgotPassword).not.toHaveBeenCalled();
    expect(security.disable2FA).not.toHaveBeenCalled();
  });

  it('suspends and reactivates only the selected membership, preserving the other workspace', async () => {
    expect(await service.suspendUser('target', 'actor')).toMatchObject({ scope: 'workspace', membershipStatus: 'suspended' });
    expect(memberships.map(m => m.status)).toEqual(['suspended', 'active']);
    expect(disconnectWorkspaceUser).toHaveBeenCalledWith('target', 'workspace-a');
    expect(disconnectWorkspaceUser.mock.invocationCallOrder[0]).toBeLessThan(createAuditLog.mock.invocationCallOrder[0]);
    await service.unsuspendUser('target', 'actor');
    expect(memberships.map(m => m.status)).toEqual(['active', 'active']);
    expect(disconnectWorkspaceUser).toHaveBeenCalledTimes(1);
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'workspace-a', entityId: 'membership-a' }));
  });

  it.each(['active', 'suspended', 'invited'])('removes a %s membership without deleting identity or learning data', async status => {
    memberships[0].status = status;
    expect(await service.deleteUser('target', 'actor')).toMatchObject({ membershipStatus: 'left' });
    expect(memberships.map(m => m.status)).toEqual(['left', 'active']);
    expect(disconnectWorkspaceUser).toHaveBeenCalledWith('target', 'workspace-a');
    await expect(service.unsuspendUser('target', 'actor')).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each(operations)('%s rejects a target outside the workspace', async (method, args) => {
    memberships.shift();
    await expect(service[method](...args)).rejects.toMatchObject({ statusCode: 404 });
    expect(models.OrganizationMembership.update).not.toHaveBeenCalled();
  });

  it.each(operations)('%s requires explicit workspace context', async (method, args) => {
    getRequestContext.mockReturnValue({});
    await expect(service[method](...args)).rejects.toThrow('active workspace');
    expect(models.OrganizationMembership.findOne).not.toHaveBeenCalled();
  });

  it.each(operations.slice(3))('%s rejects global mutations for shared AND single-workspace identities', async (method, args) => {
    await expect(service[method](...args)).rejects.toMatchObject({ statusCode: 403 });
    memberships.pop();
    await expect(service[method](...args)).rejects.toMatchObject({ statusCode: 403 });
    expect(models.OrganizationMembership.update).not.toHaveBeenCalled();
  });

  it.each(['owner', 'admin'])('protects workspace %s membership', async role => {
    memberships[0].role = role;
    for (const method of ['suspendUser', 'unsuspendUser', 'deleteUser']) {
      await expect(service[method]('target', 'actor')).rejects.toThrow('owners and admins');
    }
    expect(models.OrganizationMembership.update).not.toHaveBeenCalled();
  });

  it.each(['suspendUser', 'unsuspendUser', 'deleteUser'])('%s protects the acting member', async method => {
    await expect(service[method]('target', 'target')).rejects.toThrow('own workspace membership');
    expect(models.OrganizationMembership.update).not.toHaveBeenCalled();
  });

  it('does not activate invited memberships or repeat suspension', async () => {
    memberships[0].status = 'invited';
    await expect(service.unsuspendUser('target', 'actor')).rejects.toThrow('not suspended');
    await expect(service.suspendUser('target', 'actor')).rejects.toThrow('Only active');
    memberships[0].status = 'suspended';
    await expect(service.suspendUser('target', 'actor')).rejects.toThrow('Only active');
  });

  it('fails safely when membership status or role changes concurrently', async () => {
    models.OrganizationMembership.update.mockResolvedValueOnce([0]);
    await expect(service.suspendUser('target', 'actor')).rejects.toMatchObject({ statusCode: 409 });
    expect(models.OrganizationMembership.update).toHaveBeenCalledWith({ status: 'suspended' }, {
      where: { id: 'membership-a', organizationId: 'workspace-a', userId: 'target', status: 'active', role: 'member' },
    });
    expect(createAuditLog).not.toHaveBeenCalled();
    expect(disconnectWorkspaceUser).not.toHaveBeenCalled();
  });
});

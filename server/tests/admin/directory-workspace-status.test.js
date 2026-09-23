'use strict';

// Isolated controller tests: all database access is mocked.
jest.mock('../../src/db', () => {
  const models = {};
  for (const name of ['User', 'OrganizationMembership', 'ClanMembership', 'Enrollment', 'AssignedTask', 'TaskFeedback', 'Application']) {
    models[name] = { findAll: jest.fn(), findOne: jest.fn(), findAndCountAll: jest.fn(), count: jest.fn() };
  }
  return { models };
});
jest.mock('../../src/middlewares/errorHandler', () => ({ catchAsync: fn => fn }));
jest.mock('../../src/utils/auditContext', () => ({ getRequestContext: jest.fn() }));
jest.mock('../../src/services/authzService', () => ({ adminProgramScope: jest.fn().mockResolvedValue(null) }));
jest.mock('../../src/services/programReviewService', () => ({ getMentorFeedbackSummary: jest.fn().mockResolvedValue(null) }));

const { Op } = require('sequelize');
const { models } = require('../../src/db');
const { getRequestContext } = require('../../src/utils/auditContext');
const mentors = require('../../src/controllers/mentorController');
const mentees = require('../../src/controllers/menteeController');
const { workspaceMemberStatuses } = require('../../src/controllers/workspaceMemberStatus');

const endpoints = [
  ['mentor directory', mentors.getAllMentors, 'mentors', true],
  ['mentee directory', mentees.getAllMentees, 'mentees', true],
  ['mentor detail', mentors.getMentorById, 'mentor', false],
  ['mentee detail', mentees.getMenteeById, 'mentee', false],
];

describe('workspace membership status in admin directories and details', () => {
  let user;
  let req;
  let res;
  beforeEach(() => {
    jest.clearAllMocks();
    for (const model of Object.values(models)) {
      model.findAll.mockResolvedValue([]);
      model.findOne.mockResolvedValue(null);
      model.count.mockResolvedValue(0);
    }
    getRequestContext.mockReturnValue({ organizationId: 'workspace-a', userId: 'admin' });
    user = { id: 'shared-user', status: 'active', firstName: 'Shared', email: 'shared@example.com' };
    const row = { ...user, toJSON: () => ({ ...user }) };
    models.User.findAndCountAll.mockResolvedValue({ count: 1, rows: [row] });
    models.User.findOne.mockResolvedValue(row);
    models.OrganizationMembership.findAll.mockImplementation(async ({ where }) => [
      { userId: user.id, status: where.organizationId === 'workspace-a' ? 'suspended' : 'active' },
    ]);
    req = { query: {}, params: { id: user.id }, user: { id: 'admin' } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  it.each(endpoints)('%s serializes the selected workspace status without changing global identity', async (_name, endpoint, key, isList) => {
    for (const [organizationId, expected] of [['workspace-a', 'suspended'], ['workspace-b', 'active']]) {
      getRequestContext.mockReturnValue({ organizationId, userId: 'admin' });
      await endpoint(req, res);
      const payload = res.json.mock.calls.at(-1)[0];
      const record = isList ? payload.data[key][0] : payload.data[key];
      expect(record).toMatchObject({ ...user, status: expected });
      expect(record).not.toHaveProperty('organizationMemberships');
      if (isList) expect(payload.pagination).toEqual({ page: 1, limit: 20, totalItems: 1, totalPages: 1 });
      expect(models.OrganizationMembership.findAll).toHaveBeenLastCalledWith({
        where: { organizationId, userId: { [Op.in]: [user.id] }, status: { [Op.in]: ['active', 'suspended'] } },
        attributes: ['userId', 'status'], raw: true,
      });
      expect(user.status).toBe('active');
    }
    if (isList) {
      const query = models.User.findAndCountAll.mock.calls[0][0];
      expect(query.where.status).toBeUndefined();
      expect(query.where.role).toBe(key === 'mentors' ? 'mentor' : 'mentee');
    }
  });

  it.each(endpoints)('%s never falls back to global status for absent/removed membership', async (_name, endpoint) => {
    models.OrganizationMembership.findAll.mockResolvedValue([]);
    await expect(endpoint(req, res)).rejects.toMatchObject({ statusCode: 404 });
    expect(res.json).not.toHaveBeenCalled();
  });

  it.each(endpoints)('%s fails closed without workspace context', async (_name, endpoint) => {
    getRequestContext.mockReturnValue({ userId: 'admin' });
    await expect(endpoint(req, res)).rejects.toMatchObject({ statusCode: 400 });
    expect(res.json).not.toHaveBeenCalled();
  });

  it('loads statuses in one batch and skips database access for an empty page', async () => {
    models.OrganizationMembership.findAll.mockResolvedValue([
      { userId: 'one', status: 'suspended' }, { userId: 'two', status: 'active' },
    ]);
    expect(await workspaceMemberStatuses(['one', 'two'])).toEqual(new Map([['one', 'suspended'], ['two', 'active']]));
    expect(models.OrganizationMembership.findAll).toHaveBeenCalledTimes(1);
    expect(await workspaceMemberStatuses([])).toEqual(new Map());
    expect(models.OrganizationMembership.findAll).toHaveBeenCalledTimes(1);
  });
});

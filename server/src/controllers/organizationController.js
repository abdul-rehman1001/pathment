const organizationService = require('../services/organizationService');
const { successResponse } = require('../utils/responses');
const { catchAsync } = require('../middlewares/errorHandler');

const current = catchAsync(async (req, res) => {
  const data = await organizationService.overview(req.user.id, req.organizationId);
  res.json(successResponse('Organization retrieved', data));
});

const listMine = catchAsync(async (req, res) => {
  const organizations = await organizationService.memberships(req.user.id);
  res.json(successResponse('Organizations retrieved', { organizations }));
});

const create = catchAsync(async (req, res) => {
  const organization = await organizationService.create(req.user.id, req.body || {});
  res.status(201).json(successResponse('Organization created', { organization }, 201));
});

const listPlans = catchAsync(async (_req, res) => {
  const plans = await organizationService.plans();
  res.json(successResponse('Plans retrieved', { plans }));
});

const updateCurrent = catchAsync(async (req, res) => {
  const organization = await organizationService.update(req.user.id, req.organizationId, req.body || {});
  res.json(successResponse('Organization updated', { organization }));
});

const requestPlan = catchAsync(async (req, res) => {
  const subscription = await organizationService.requestPlan(req.user.id, req.organizationId, req.body?.planKey);
  res.json(successResponse('Plan change requested', { subscription }));
});

module.exports = { current, listMine, create, listPlans, updateCurrent, requestPlan };

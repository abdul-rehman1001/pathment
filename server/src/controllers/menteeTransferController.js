const svc = require('../services/menteeTransferService');
const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');

/**
 * Mentor-to-mentor mentee transfers. The service owns every permission check
 * (clan-scoped `mentee.transfer`) and the feature gate, so these stay thin.
 */

// Feature availability — cheap, no DB. The UI needs it before rendering the
// action, to choose between the live button, a "Coming soon" teaser, and the
// "New" badge in the week after release.
const config = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Mentee transfer config', svc.config()));
});

const targets = catchAsync(async (req, res) => {
  const data = await svc.targets(req.user, req.query.menteeId, { q: req.query.q });
  res.status(200).json(successResponse('Clans this mentee can move to', data));
});

const create = catchAsync(async (req, res) => {
  const request = await svc.request(req.user, {
    menteeId: req.body?.menteeId,
    toClanId: req.body?.toClanId,
    reason: req.body?.reason,
  });
  res.status(201).json(successResponse('Move request sent', { request }));
});

const incoming = catchAsync(async (req, res) => {
  const requests = await svc.incoming(req.user);
  res.status(200).json(successResponse('Incoming move requests', { requests }));
});

const outgoing = catchAsync(async (req, res) => {
  const requests = await svc.outgoing(req.user);
  res.status(200).json(successResponse('Your move requests', { requests }));
});

const respond = catchAsync(async (req, res) => {
  const request = await svc.respond(req.user, req.params.id, {
    accept: req.body?.accept === true || req.body?.accept === 'true',
    note: req.body?.note,
  });
  res.status(200).json(successResponse(request.status === 'approved' ? 'Mentee moved' : 'Request declined', { request }));
});

const cancel = catchAsync(async (req, res) => {
  const result = await svc.cancel(req.user, req.params.id);
  res.status(200).json(successResponse('Request withdrawn', result));
});

module.exports = { config, targets, create, incoming, outgoing, respond, cancel };

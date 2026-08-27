const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const clanPublicJoinService = require('../services/clanPublicJoinService');

const getPublicJoinState = catchAsync(async (req, res) => {
  const state = await clanPublicJoinService.getPublicJoinState(req.params.id, req.user);
  res.status(200).json(successResponse('Public join state retrieved', state));
});

const setPublicJoinAccess = catchAsync(async (req, res) => {
  const state = await clanPublicJoinService.setPublicJoinAccess(
    req.params.id,
    req.body.allowed,
    req.user
  );
  res.status(200).json(successResponse(
    req.body.allowed ? 'Public joining access granted' : 'Public joining access removed',
    state
  ));
});

const generatePublicJoinLink = catchAsync(async (req, res) => {
  const state = await clanPublicJoinService.generateOrEnableLink(req.params.id, req.user);
  res.status(200).json(successResponse('Public joining link ready', state));
});

const disablePublicJoinLink = catchAsync(async (req, res) => {
  const state = await clanPublicJoinService.disableLink(req.params.id, req.user);
  res.status(200).json(successResponse('Public joining link disabled', state));
});

const regeneratePublicJoinLink = catchAsync(async (req, res) => {
  const state = await clanPublicJoinService.regenerateLink(req.params.id, req.user);
  res.status(200).json(successResponse('Public joining link regenerated', state));
});

const listJoinRequests = catchAsync(async (req, res) => {
  const requests = await clanPublicJoinService.listJoinRequests(req.params.id, req.user, {
    status: req.query.status
  });
  res.status(200).json(successResponse('Join requests retrieved', { requests }));
});

const approveJoinRequest = catchAsync(async (req, res) => {
  const result = await clanPublicJoinService.approveJoinRequest(
    req.params.id,
    req.params.requestId,
    req.user
  );
  res.status(200).json(successResponse('Join request approved', result));
});

const rejectJoinRequest = catchAsync(async (req, res) => {
  const request = await clanPublicJoinService.rejectJoinRequest(
    req.params.id,
    req.params.requestId,
    req.user,
    { note: req.body?.note }
  );
  res.status(200).json(successResponse('Join request rejected', { request }));
});

const getPublicClanJoin = catchAsync(async (req, res) => {
  const info = await clanPublicJoinService.getPublicClanInfo(
    req.params.token,
    req.user?.id || null
  );
  res.status(200).json(successResponse('Clan joining info retrieved', info));
});

const submitPublicJoinRequest = catchAsync(async (req, res) => {
  const request = await clanPublicJoinService.createJoinRequest(
    req.params.token,
    req.user,
    { message: req.body?.message }
  );
  res.status(201).json(successResponse('Join request submitted', { request }, 201));
});

module.exports = {
  getPublicJoinState,
  setPublicJoinAccess,
  generatePublicJoinLink,
  disablePublicJoinLink,
  regeneratePublicJoinLink,
  listJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  getPublicClanJoin,
  submitPublicJoinRequest
};

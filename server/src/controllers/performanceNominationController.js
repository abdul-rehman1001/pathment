const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const service = require('../services/performanceNominationService');

/** The data's own ranking for a clan or a whole programme. */
const evidence = catchAsync(async (req, res) => {
  res.json(successResponse('Completed work evidence', await service.evidence(req.params.id, req.user, req.query.page)));
});

const getRanking = catchAsync(async (req, res) => {
  const data = await service.ranking({
    programId: req.query.programId,
    clanId: req.query.clanId || null,
    limit: Number(req.query.limit) || 50
  });
  res.status(200).json(successResponse('Performance ranking', data));
});

const list = catchAsync(async (req, res) => {
  const data = await service.list({
    user: req.user,
    programId: req.query.programId || null,
    status: req.query.status || null
  });
  res.status(200).json(successResponse('Nominations retrieved', data));
});

const nominate = catchAsync(async (req, res) => {
  const data = await service.nominate(req.params.menteeId, req.body, req.user);
  res.status(201).json(successResponse('Nomination submitted', data, 201));
});

const draft = catchAsync(async (req, res) => {
  const data = await service.aiDraft(req.params.menteeId, req.body, req.user);
  res.status(200).json(successResponse('Draft ready', data));
});

const decide = catchAsync(async (req, res) => {
  const data = await service.decide(req.params.id, req.body, req.user);
  res.status(200).json(successResponse('Decision recorded', data));
});

module.exports = { evidence, getRanking, list, nominate, draft, decide };

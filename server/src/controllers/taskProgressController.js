const svc = require('../services/taskProgressService');
const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');

/**
 * Day-by-day progress notes on an assigned task. The service owns ownership
 * checks (the task must belong to the caller) and the mentor permission check,
 * so these stay thin.
 */

// Mentee: record or replace today's note on their own task.
const log = catchAsync(async (req, res) => {
  const entry = await svc.log(req.user.id, req.params.id, {
    note: req.body?.note,
    minutesSpent: req.body?.minutesSpent,
  });
  res.status(200).json(successResponse('Progress saved', { entry }));
});

// Mentee: their own timeline for a task.
const mine = catchAsync(async (req, res) => {
  const data = await svc.listForTask(req.params.id, { menteeId: req.user.id });
  res.status(200).json(successResponse('Task progress', data));
});

// Mentee: drop one day, within the edit window.
const remove = catchAsync(async (req, res) => {
  const result = await svc.remove(req.user.id, req.params.id, req.params.dateKey);
  res.status(200).json(successResponse('Progress removed', result));
});

// Mentor: the same timeline, read only, gated on canViewMentee.
const forMentor = catchAsync(async (req, res) => {
  const data = await svc.listForMentor(req.user, req.params.id);
  res.status(200).json(successResponse('Task progress', data));
});

module.exports = { log, mine, remove, forMentor };

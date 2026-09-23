const { models } = require('../db');
const matchingService = require('../services/matchingService');
const { successResponse } = require('../utils/responses');
const { catchAsync } = require('../middlewares/errorHandler');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');

/**
 * Create mentor-mentee match
 * POST /api/matches
 */
exports.createMatch = catchAsync(async (req, res) => {
  const { enrollmentId, mentorId } = req.body;
  const matchedBy = req.user.id;

  const match = await matchingService.createMatch(enrollmentId, mentorId, matchedBy);
  res.status(201).json(successResponse('Match created successfully', { match }, 201));
});

/**
 * Get AI match suggestions for enrollment
 * GET /api/matches/suggestions/:enrollmentId
 */
exports.getAISuggestions = catchAsync(async (req, res) => {
  const { enrollmentId } = req.params;
  
  const suggestions = await matchingService.getAISuggestions(enrollmentId);
  res.status(200).json(successResponse('AI suggestions retrieved', { suggestions }));
});

/**
 * Get all matches with filters
 * GET /api/matches
 */
exports.getMatches = catchAsync(async (req, res) => {
  const { status, mentorId, menteeId, enrollmentId } = req.query;
  const filters = { status, mentorId, menteeId, enrollmentId };
  
  const matches = await matchingService.getMatches(filters);
  res.status(200).json(successResponse('Matches retrieved', { matches }));
});

/**
 * Auto-match all pending enrollments using AI suggestions
 * POST /api/matches/auto-match
 */
exports.autoMatchPending = catchAsync(async (req, res) => {
  const { programId } = req.body;
  const matchedBy = req.user.id;

  const { results, summary } = await matchingService.autoMatchPending(programId || null, matchedBy);

  res.status(200).json(successResponse(
    `Auto-match complete: ${summary.matched} matched, ${summary.skipped} skipped, ${summary.failed} failed`,
    { results, summary }
  ));
});

/**
 * Update match status
 * PATCH /api/matches/:id/status
 */
exports.updateMatchStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  const match = await matchingService.updateMatchStatus(id, status, req.user.id, (await req.loadWorkspaceRole()));
  res.status(200).json(successResponse('Match status updated', { match }));
});

exports.getMentorAssignedLevels = catchAsync(async (req, res) => {
  const mentorId = req.user.id;
  const programs = await matchingService.getMentorAssignedLevels(mentorId);
  res.status(200).json(successResponse('Mentor level assignments retrieved', { programs }));
});

/**
 * Submit a satisfaction rating for a match
 * PATCH /api/matching/:id/rate
 *
 * - Mentee  → sets menteeSatisfactionRating  (rates their mentor)
 * - Mentor  → sets mentorSatisfactionRating  (rates their mentee)
 * - Admin   → can set either field explicitly
 *
 * Body: { rating: 1-5 }
 */
exports.submitRating = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { rating } = req.body;
  const { id: userId, role } = req.user;

  if (rating == null || isNaN(rating) || rating < 1 || rating > 5) {
    throw new ValidationError('rating must be a number between 1 and 5');
  }

  const match = await models.MentorMenteeMatch.findByPk(id);
  if (!match) throw new NotFoundError('Match not found');

  const updates = {};

  if (role === 'mentee') {
    if (match.menteeId !== userId) throw new ForbiddenError('You are not the mentee of this match');
    updates.menteeSatisfactionRating = parseFloat(rating);
  } else if (role === 'mentor') {
    if (match.mentorId !== userId) throw new ForbiddenError('You are not the mentor of this match');
    updates.mentorSatisfactionRating = parseFloat(rating);
  } else if (role === 'admin') {
    // Admin can specify which side to rate via query param ?side=mentee|mentor
    const side = req.query.side;
    if (side === 'mentor') {
      updates.mentorSatisfactionRating = parseFloat(rating);
    } else {
      // default to mentee-side rating for admin
      updates.menteeSatisfactionRating = parseFloat(rating);
    }
  } else {
    throw new ForbiddenError('Not authorised to rate this match');
  }

  await match.update(updates);

  res.status(200).json(successResponse('Rating submitted successfully', {
    matchId: id,
    ...updates,
  }));
});

module.exports = exports;

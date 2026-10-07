const express = require('express');
const Joi = require('joi');
const gamificationController = require('../controllers/gamificationController');
const { authenticate, authorize, optionalAuth } = require('../middlewares/auth');
const { requirePermission, requirePermissionMinScope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');
const { validate } = require('../middlewares/validate');

const router = express.Router();

// Public routes.
//
// The leaderboard takes `optionalAuth` rather than nothing: it ranks by the
// progress score, two of whose dimensions are percentiles, so the peer group is
// part of the answer and the caller's own programme is the sensible one. Left
// unauthenticated it had no way to know that and returned an empty board to
// every signed-in mentee. Anonymous callers still reach it and can name a
// programme with ?programId=; without either there is no peer group and so no
// honest ranking to give.
router.get('/leaderboard', optionalAuth, gamificationController.getLeaderboard);
router.get('/badges', gamificationController.getAllBadges);
router.get('/challenges', gamificationController.getAllChallenges);

// User-centric routes (authenticated; controller enforces ownership / role checks)
router.get('/user/:userId/stats', authenticate, gamificationController.getUserStats);
router.get('/user/:userId/badges', authenticate, gamificationController.getUserBadges);
router.get('/user/:userId/points-history', authenticate, gamificationController.getUserPointsHistory);
router.get('/challenges/user/:userId', authenticate, gamificationController.getUserChallenges);

// Authenticated challenge participation
router.post(
  '/challenges/:challengeId/join',
  authenticate,
  authorize(['mentee', 'mentor']),
  gamificationController.joinChallenge
);

// Admin routes
router.post(
  '/badges',
  authenticate,
  requirePermissionMinScope(PERMISSIONS.GAMIFICATION_MANAGE),
  validate(Joi.object({
    name: Joi.string().max(100).required(),
    description: Joi.string().required(),
    category: Joi.string().max(50).default('milestone'),
    criteriaType: Joi.string().valid(
      'points_milestone', 'coins_earned', 'tasks_completed', 'programs_completed',
      'streak_days', 'avg_rating', 'level_reached', 'skill_mastery', 'custom',
      // Mentor auto (event-table backed)
      'reviews_given', 'tasks_approved', 'meetings_logged',
      'mentees_guided', 'clans_led', 'mentor_avg_rating'
    ).required(),
    criteriaValue: Joi.object({
      threshold: Joi.number().integer().min(0),
      count: Joi.number().integer().min(0),
      days: Joi.number().integer().min(0),
      minRating: Joi.number().min(0),
      minResponses: Joi.number().integer().min(1),
      level: Joi.number().integer().min(1),
      skillId: Joi.string().uuid(),
      minProficiency: Joi.number().min(0),
      targetRole: Joi.string().valid('mentee', 'mentor'),
      relatedRoadmapTaskId: Joi.string().uuid(),
      relatedTaskId: Joi.string().uuid(),
    }).unknown(true).required(),
    pointsReward: Joi.number().integer().min(0).default(0),
    isActive: Joi.boolean().default(true),
    isSecret: Joi.boolean().default(false),
    // Absolute CDN URLs or local presets under /badges/*
    iconUrl: Joi.string().uri({ allowRelative: true }).allow('', null).optional()
  })),
  gamificationController.createBadge
);

router.patch(
  '/badges/:badgeId',
  authenticate,
  requirePermissionMinScope(PERMISSIONS.GAMIFICATION_MANAGE),
  validate(Joi.object({
    name: Joi.string().max(100),
    description: Joi.string(),
    category: Joi.string().max(50),
    criteriaType: Joi.string().valid(
      'points_milestone', 'coins_earned', 'tasks_completed', 'programs_completed',
      'streak_days', 'avg_rating', 'level_reached', 'skill_mastery', 'custom',
      'reviews_given', 'tasks_approved', 'meetings_logged',
      'mentees_guided', 'clans_led', 'mentor_avg_rating'
    ),
    criteriaValue: Joi.object().unknown(true),
    pointsReward: Joi.number().integer().min(0),
    isActive: Joi.boolean(),
    isSecret: Joi.boolean(),
    iconUrl: Joi.string().uri({ allowRelative: true }).allow('', null),
    targetRole: Joi.string().valid('mentee', 'mentor'),
  })),
  gamificationController.updateBadge
);

router.post(
  '/badges/award',
  authenticate,
  requirePermissionMinScope(PERMISSIONS.GAMIFICATION_MANAGE),
  validate(Joi.object({
    userId: Joi.string().uuid().required(),
    badgeId: Joi.string().uuid().required(),
    context: Joi.object().optional()
  })),
  gamificationController.awardBadgeManual
);

router.post(
  '/setup-badges',
  authenticate,
  requirePermissionMinScope(PERMISSIONS.GAMIFICATION_MANAGE),
  gamificationController.setupDefaultBadges
);

module.exports = router;

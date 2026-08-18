const express = require('express');
const Joi = require('joi');
const gamificationController = require('../controllers/gamificationController');
const { authenticate, authorize } = require('../middlewares/auth');
const { requirePermission, requirePermissionMinScope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');
const { validate } = require('../middlewares/validate');

const router = express.Router();

// Public routes
router.get('/leaderboard', gamificationController.getLeaderboard);
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
    category: Joi.string().max(50).required(),
    criteriaType: Joi.string().required(),
    criteriaValue: Joi.object().required(),
    pointsReward: Joi.number().integer().min(0).default(0),
    isActive: Joi.boolean().default(true),
    isSecret: Joi.boolean().default(false),
    iconUrl: Joi.string().uri().optional()
  })),
  gamificationController.createBadge
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

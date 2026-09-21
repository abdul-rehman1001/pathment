const express = require('express');
const router = express.Router();
const { validateQuery, validateParams } = require('../middlewares/validate');
const Joi = require('joi');
const controller = require('../controllers/performanceNominationController');
const { authenticate, authorize } = require('../middlewares/auth');

// Mentors nominate inside their own clans, admins anywhere. The role list here
// only says who may ask; the service derives the real scope from the clans the
// person actually mentors.

router.get('/:id/evidence', authenticate, authorize(['admin', 'mentor']), validateParams(Joi.object({ id: Joi.string().uuid().required() })), validateQuery(Joi.object({ page: Joi.number().integer().min(1).max(100000).default(1) })), controller.evidence);
router.get('/ranking', authenticate, authorize(['admin', 'mentor']), controller.getRanking);
router.get('/', authenticate, authorize(['admin', 'mentor']), controller.list);
router.post('/:menteeId/draft', authenticate, authorize(['admin', 'mentor']), controller.draft);
router.post('/:menteeId', authenticate, authorize(['admin', 'mentor']), controller.nominate);
router.patch('/:id/decision', authenticate, authorize(['admin']), controller.decide);

module.exports = router;

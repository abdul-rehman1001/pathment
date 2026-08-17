const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/feedbackReportController');
const { authenticate } = require('../middlewares/auth');
const { requirePermissionMinScope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');
const upload = require('../middlewares/upload');
const { validateBody, validateQuery } = require('../middlewares/validate');
const { feedbackSchemas } = require('../validations/feedbackValidation');

// ── Any authenticated user ───────────────────────────────────────────────────
// Submit feedback / a bug report, with an optional screenshot or short clip.
// The upload runs first: multer is what parses a multipart body, so nothing is
// in req.body to validate until it has.
router.post(
  '/',
  authenticate,
  upload.singleSafeMedia('attachment'),
  validateBody(feedbackSchemas.create),
  ctrl.create
);
// The reporter's own submissions + their current status.
router.get('/mine', authenticate, ctrl.listMine);

// ── Admin triage (feedback.manage) ────────────────────────────────────────────
router.get(
  '/',
  authenticate,
  requirePermissionMinScope(PERMISSIONS.FEEDBACK_MANAGE),
  validateQuery(feedbackSchemas.listQuery),
  ctrl.listAll
);
router.patch(
  '/:id',
  authenticate,
  requirePermissionMinScope(PERMISSIONS.FEEDBACK_MANAGE),
  validateBody(feedbackSchemas.updateStatus),
  ctrl.updateStatus
);

module.exports = router;

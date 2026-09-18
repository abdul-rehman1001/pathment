const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { requirePermissionMinScope, requireMenteeAccess } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');
const { verifyAccessToken } = require('../utils/jwt');
const { models } = require('../db');
const {
  startSession,
  heartbeat,
  endSession,
  logEvent,
  logPageView,
  getMySummary,
  getMenteeSummary,
  getAdminOverview,
} = require('../controllers/activityController');

// ─── Beacon-compatible heartbeat (must be BEFORE router.use(authenticate)) ───
// sendBeacon cannot set Authorization headers, so we accept token in body.
router.post('/session/heartbeat', async (req, res, next) => {
  // Try standard Bearer token first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticate(req, res, () => heartbeat(req, res, next));
  }
  // Beacon fallback: token in body
  const bodyToken = req.body?._token;
  if (!bodyToken) {
    console.warn('[ACTIVITY] heartbeat: no auth token (header or body)');
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  try {
    const decoded = verifyAccessToken(bodyToken);
    const user = await models.User.findByPk(decoded.id, { attributes: { exclude: ['password'] } });
    if (!user || user.status !== 'active') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    req.user = user;
    return heartbeat(req, res, next);
  } catch (err) {
    console.warn('[ACTIVITY] heartbeat beacon auth failed', err.message);
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

// All other activity routes require standard authentication
router.use(authenticate);

// ─── Session lifecycle ───────────────────────────────────────────────────────
router.post('/session/start', startSession);
router.post('/session/end', endSession);

// ─── Event & page-view logging ───────────────────────────────────────────────
router.post('/event', logEvent);
router.post('/page-view', logPageView);

// ─── Summaries ───────────────────────────────────────────────────────────────
router.get('/me/summary', getMySummary);

// Viewing a mentee's activity needs mentee.view at that mentee's scope (their
// clan's mentors + admins); blocks analysts and other mentees. Uses the shared
// mentee gate rather than scope.mentee so this matches the profile/tasks/
// enrollments endpoints on the same screen — see requireMenteeAccess.
router.get('/mentee/:id/summary', requireMenteeAccess('id'), getMenteeSummary);

// Admin-only aggregate overview
router.get('/admin/overview', requirePermissionMinScope(PERMISSIONS.ANALYTICS_VIEW), getAdminOverview);

module.exports = router;

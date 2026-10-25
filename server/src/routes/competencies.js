const express = require('express');
const router = express.Router();
const c = require('../controllers/competencyController');
const { authenticate } = require('../middlewares/auth');
const { requirePermissionAnyScope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');

// Anyone who can score needs to read the rubric, which is every mentor.
router.get('/', authenticate, c.list);
router.get('/standing', authenticate, c.standing);

// The rubric itself is a workspace-wide decision, so it is an admin's to make:
// a mentor adding their own sixth competency would make two clans' scores
// incomparable, which is the one thing a rubric exists to prevent.
const canManage = requirePermissionAnyScope(PERMISSIONS.SYSTEM_SETTINGS);
router.post('/', authenticate, canManage, c.create);
router.patch('/:id', authenticate, canManage, c.update);
router.delete('/:id', authenticate, canManage, c.retire);

module.exports = router;

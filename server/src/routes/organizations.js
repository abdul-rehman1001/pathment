const express = require('express');
const controller = require('../controllers/organizationController');
const { authenticate, authenticateAccount } = require('../middlewares/auth');

const router = express.Router();
router.get('/plans', controller.listPlans);
router.post('/', authenticateAccount, controller.create);
router.get('/me', authenticateAccount, controller.listMine);
router.use(authenticate);
router.get('/current', controller.current);
router.patch('/current', controller.updateCurrent);
router.post('/current/plan-request', controller.requestPlan);

module.exports = router;

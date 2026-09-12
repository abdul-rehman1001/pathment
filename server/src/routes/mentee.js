const express = require('express');
const router = express.Router();
const cohortController = require('../controllers/cohortController');
const dailyLogController = require('../controllers/dailyLogController');
const taskProgressController = require('../controllers/taskProgressController');
const mentorshipPauseController = require('../controllers/mentorshipPauseController');
const reviewMeetingController = require('../controllers/reviewMeetingController');
const { authenticate, authorize } = require('../middlewares/auth');

/**
 * Mentee-area routes - scoped to the logged-in mentee (distinct from the
 * admin-facing /mentees directory listing).
 */

// The mentee's own fairness read for the "My Progress" page.
router.get('/progress', authenticate, authorize(['mentee', 'admin']), cohortController.getMyProgress);

// Daily check-in log.
router.get('/daily-log', authenticate, authorize(['mentee', 'admin']), dailyLogController.getMyDailyLogs);
router.post('/daily-log', authenticate, authorize(['mentee', 'admin']), dailyLogController.saveMyDailyLog);

// Day-by-day progress on ONE assigned task. Writing here also logs the day in
// the daily log above, so the streak counts work done where the work happens.
// The service checks the task actually belongs to the caller.
router.get('/tasks/:id/progress', authenticate, authorize(['mentee', 'admin']), taskProgressController.mine);
router.post('/tasks/:id/progress', authenticate, authorize(['mentee', 'admin']), taskProgressController.log);
router.delete('/tasks/:id/progress/:dateKey', authenticate, authorize(['mentee', 'admin']), taskProgressController.remove);

// Is my mentee side paused? Powers the "you're paused" gate. Any signed-in user
// can ask about their own state (a mentor who is also a mentee included).
router.get('/pause-state', authenticate, mentorshipPauseController.selfPauseState);

// Live cohort-review video: discover the active room, and self-report presence.
router.get('/review/active', authenticate, reviewMeetingController.active);
router.post('/review/:id/join', authenticate, reviewMeetingController.join);
router.post('/review/:id/leave', authenticate, reviewMeetingController.leave);

module.exports = router;

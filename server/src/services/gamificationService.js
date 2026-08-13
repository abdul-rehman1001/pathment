const { models, Sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { todayInZone } = require('../utils/timezone');
const {
  currentStreak,
  longestStreak,
  milestonesCrossed,
  STREAK_BONUSES
} = require('./streak');

class GamificationService {
  async awardPoints(menteeId, pointsAmount, sourceType, sourceId = null, reason = null) {
    if (!menteeId || !pointsAmount || pointsAmount <= 0) {
      throw new ValidationError('Invalid points amount or mentee ID');
    }

    const menteeProfile = await models.MenteeProfile.findOne({
      where: { userId: menteeId }
    });

    if (!menteeProfile) {
      throw new NotFoundError('Mentee profile not found');
    }

    const pointsBefore = Number(menteeProfile.totalPoints || 0);
    const pointsAfter = pointsBefore + Number(pointsAmount);

    const history = await models.PointsHistory.create({
      userId: menteeId,
      pointsChange: pointsAmount,
      pointsBefore,
      pointsAfter,
      sourceType,
      sourceId,
      reason
    });

    await menteeProfile.update({ totalPoints: pointsAfter });

    // Keep core points-award successful even if non-critical side effects fail.
    try {
      await this.checkLevelUp(menteeId);
    } catch (error) {
      console.error('[Gamification] checkLevelUp failed:', error.message);
    }

    try {
      await this.updateLeaderboardEntry(menteeId);
    } catch (error) {
      console.error('[Gamification] updateLeaderboardEntry failed:', error.message);
    }

    try {
      await this.checkAndAwardBadges(menteeId);
    } catch (error) {
      console.error('[Gamification] checkAndAwardBadges failed:', error.message);
    }

    return {
      pointsAwarded: Number(pointsAmount),
      totalPoints: pointsAfter,
      history
    };
  }

  /**
   * Apply a SIGNED points delta (can be negative) and record it. Used when a
   * mentor edits an already-approved review and the awarded points change — we
   * reconcile only the difference so the running total and the points history
   * stay correct. The total is floored at 0; the history row records the actual
   * applied change (which may be smaller than the requested delta if it would
   * have gone negative). A zero (or non-finite) delta is a no-op.
   */
  async adjustPoints(menteeId, delta, sourceType, sourceId = null, reason = null) {
    const change = Number(delta);
    if (!menteeId || !Number.isFinite(change) || change === 0) {
      return null;
    }

    const menteeProfile = await models.MenteeProfile.findOne({
      where: { userId: menteeId }
    });

    if (!menteeProfile) {
      throw new NotFoundError('Mentee profile not found');
    }

    const pointsBefore = Number(menteeProfile.totalPoints || 0);
    const pointsAfter = Math.max(0, pointsBefore + change);
    const applied = pointsAfter - pointsBefore;
    if (applied === 0) {
      return { applied: 0, totalPoints: pointsAfter };
    }

    await models.PointsHistory.create({
      userId: menteeId,
      pointsChange: applied,
      pointsBefore,
      pointsAfter,
      sourceType,
      sourceId,
      reason
    });

    await menteeProfile.update({ totalPoints: pointsAfter });

    try {
      await this.checkLevelUp(menteeId);
    } catch (error) {
      console.error('[Gamification] checkLevelUp failed:', error.message);
    }

    try {
      await this.updateLeaderboardEntry(menteeId);
    } catch (error) {
      console.error('[Gamification] updateLeaderboardEntry failed:', error.message);
    }

    try {
      await this.checkAndAwardBadges(menteeId);
    } catch (error) {
      console.error('[Gamification] checkAndAwardBadges failed:', error.message);
    }

    return { applied, totalPoints: pointsAfter };
  }

  async awardBadge(userId, badgeId, unlockContext = {}) {
    const existing = await models.UserBadge.findOne({
      where: { userId, badgeId }
    });

    if (existing) {
      return { alreadyOwned: true };
    }

    const badge = await models.Badge.findByPk(badgeId);
    if (!badge) {
      throw new NotFoundError('Badge not found');
    }

    const userBadge = await models.UserBadge.create({
      userId,
      badgeId,
      unlockContext
    });

    if (badge.pointsReward && badge.pointsReward > 0) {
      await this.awardPoints(
        userId,
        badge.pointsReward,
        'badge_earned',
        badge.id,
        `Earned badge: ${badge.name}`
      );
    }

    try {
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.BADGE_EARNED || 'badge_earned',
        recipients: [{ userId }],
        payload: {
          title: 'Badge earned',
          message: `You earned the ${badge.name} badge.`,
          actionUrl: '/mentee/profile/badges',
          actionLabel: 'View badges',
          relatedEntityType: 'badge',
          relatedEntityId: badge.id,
          emailSubject: `Pathment: Badge earned - ${badge.name}`
        }
      });
    } catch (notificationError) {
      console.error('[Gamification] Failed to send badge notification:', notificationError.message);
    }

    return {
      success: true,
      badge: userBadge,
      badgeDetails: badge
    };
  }

  async checkAndAwardBadges(userId) {
    const menteeProfile = await models.MenteeProfile.findOne({ where: { userId } });
    if (!menteeProfile) return;

    // Bulk-fetch the two lists once, not a findOne per badge (that was the N+1
    // that made task approval slow). Reuse the loaded profile for every criteria
    // check so checkBadgeCriteria doesn't re-query it per badge either.
    const [activeBadges, ownedBadges] = await Promise.all([
      models.Badge.findAll({ where: { isActive: true } }),
      models.UserBadge.findAll({ where: { userId }, attributes: ['badgeId'] })
    ]);
    const ownedBadgeIds = new Set(ownedBadges.map((ub) => ub.badgeId));

    for (const badge of activeBadges) {
      if (ownedBadgeIds.has(badge.id)) continue;

      const isCriteriaMet = await this.checkBadgeCriteria(userId, badge, menteeProfile);
      if (!isCriteriaMet) continue;

      await this.awardBadge(userId, badge.id, {
        triggeredAt: new Date().toISOString(),
        reason: badge.criteriaType
      });
    }
  }

  async checkBadgeCriteria(userId, badge, menteeProfile = null) {
    const { criteriaType, criteriaValue } = badge;

    // Callers that already hold the profile (checkAndAwardBadges) pass it in to
    // avoid a per-badge re-query; standalone callers still fetch it.
    if (!menteeProfile) {
      menteeProfile = await models.MenteeProfile.findOne({ where: { userId } });
    }
    if (!menteeProfile) return false;

    switch (criteriaType) {
      case 'points_milestone':
        return Number(menteeProfile.totalPoints || 0) >= Number(criteriaValue.threshold || 0);
      case 'tasks_completed':
        return Number(menteeProfile.totalTasksCompleted || 0) >= Number(criteriaValue.count || 0);
      case 'programs_completed':
        return Number(menteeProfile.totalProgramsCompleted || 0) >= Number(criteriaValue.count || 0);
      case 'streak_days':
        return Number(menteeProfile.currentStreakDays || 0) >= Number(criteriaValue.days || 0);
      case 'avg_rating':
        return Number(menteeProfile.avgTaskRating || 0) >= Number(criteriaValue.minRating || 0);
      case 'level_reached':
        return Number(menteeProfile.currentLevel || 1) >= Number(criteriaValue.level || 1);
      case 'skill_mastery': {
        if (!criteriaValue.skillId) return false;

        const userSkill = await models.UserSkill.findOne({
          where: {
            userId,
            skillId: criteriaValue.skillId
          }
        });

        return !!userSkill && Number(userSkill.proficiencyLevel || 0) >= Number(criteriaValue.minProficiency || 0);
      }
      case 'custom':
      default:
        return false;
    }
  }

  async updateLeaderboardEntry(userId, programId = null) {
    const menteeProfile = await models.MenteeProfile.findOne({ where: { userId } });
    if (!menteeProfile) return;

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const periods = [
      { type: 'daily', start: today, end: today },
      { type: 'weekly', start: this.getWeekStart(now), end: today },
      { type: 'monthly', start: this.getMonthStart(now), end: today },
      { type: 'all_time', start: '2000-01-01', end: today }
    ];

    const higherRankedCount = await models.MenteeProfile.count({
      where: {
        totalPoints: { [Sequelize.Op.gt]: Number(menteeProfile.totalPoints || 0) }
      }
    });

    const rank = higherRankedCount + 1;
    const points = Number(menteeProfile.totalPoints || 0);

    // Each period is a distinct row (unique by user/program/periodType/start), so
    // the four upserts don't touch each other — run them in parallel.
    await Promise.all(periods.map(async (period) => {
      const existing = await models.LeaderboardEntry.findOne({
        where: {
          userId,
          programId,
          periodType: period.type,
          periodStart: period.start
        }
      });

      if (existing) {
        await existing.update({ rank, points, periodEnd: period.end, isVisible: true });
      } else {
        await models.LeaderboardEntry.create({
          userId,
          programId,
          rank,
          points,
          periodType: period.type,
          periodStart: period.start,
          periodEnd: period.end,
          isVisible: true
        });
      }
    }));
  }

  async checkLevelUp(userId) {
    const menteeProfile = await models.MenteeProfile.findOne({ where: { userId } });
    if (!menteeProfile) return;

    const currentLevel = Number(menteeProfile.currentLevel || 1);
    const currentPoints = Number(menteeProfile.totalPoints || 0);

    const levelThresholds = {
      1: 0,
      2: 500,
      3: 2000,
      4: 5000,
      5: 10000
    };

    let newLevel = currentLevel;
    for (const [level, threshold] of Object.entries(levelThresholds)) {
      if (currentPoints >= threshold) {
        newLevel = Number(level);
      }
    }

    if (newLevel <= currentLevel) return;

    await menteeProfile.update({ currentLevel: newLevel });

    try {
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.LEVEL_UP || 'level_up',
        recipients: [{ userId }],
        payload: {
          title: 'Level up',
          message: `You reached level ${newLevel}.`,
          actionUrl: '/mentee/profile/progress',
          actionLabel: 'View progress',
          relatedEntityType: 'mentee_profile',
          relatedEntityId: userId,
          emailSubject: `Pathment: Level ${newLevel}`
        }
      });
    } catch (notificationError) {
      console.error('[Gamification] Failed to send level-up notification:', notificationError.message);
    }
  }

  /** Today's calendar date in this mentee's own zone, which is what a day is. */
  async _todayFor(userId) {
    const settings = await models.UserSettings.findOne({
      where: { userId },
      attributes: ['timezone']
    });
    return todayInZone(settings?.timezone || 'UTC');
  }

  /**
   * The streak as the daily log says it is, without touching anything.
   *
   * Reads rather than counters. A stored counter can only be right if every
   * event that should have moved it did, and this one was advanced from a
   * single place - a mentor approving a submission - so it was wrong for every
   * mentee who logged their days and was waiting on a review. Counting the log
   * cannot drift, needs no repair for the rows that are already wrong, and
   * gives the same answer as the phone because it is the same rule.
   */
  async readStreak(userId) {
    const [entries, todayKey] = await Promise.all([
      models.DailyLogEntry.findAll({
        where: { menteeId: userId },
        attributes: ['dateKey'],
        raw: true
      }),
      this._todayFor(userId)
    ]);

    const dateKeys = entries.map((entry) => entry.dateKey);

    return {
      current: currentStreak(dateKeys, todayKey),
      longest: longestStreak(dateKeys),
      todayKey
    };
  }

  /**
   * Recount the streak, store it, and pay for any milestone just passed.
   *
   * Safe to call more than once a day and safe to call from anywhere: it
   * derives the number instead of stepping it, so a second call the same
   * afternoon changes nothing and awards nothing.
   */
  async updateStreak(userId) {
    const menteeProfile = await models.MenteeProfile.findOne({ where: { userId } });
    if (!menteeProfile) return;

    const { current, longest, todayKey } = await this.readStreak(userId);
    const previous = Number(menteeProfile.currentStreakDays || 0);

    await menteeProfile.update({
      currentStreakDays: current,
      // Never lowered. Some of these were earned under the old counter, and
      // taking back a longest streak somebody already saw would be worse than
      // carrying a number the log cannot account for.
      longestStreakDays: Math.max(longest, Number(menteeProfile.longestStreakDays || 0)),
      lastActivityDate: todayKey
    });

    for (const milestone of milestonesCrossed(previous, current)) {
      await this.awardPoints(
        userId,
        STREAK_BONUSES[milestone],
        'streak_bonus',
        null,
        `${milestone} day streak bonus`
      );
    }

    await this.checkAndAwardBadges(userId);
  }

  /**
   * Leaderboard ranked by points EARNED IN THE PERIOD - computed live from the
   * PointsHistory ledger so daily/weekly/monthly are actually different from
   * all-time (they previously all showed the same all-time rank).
   */
  async getLeaderboard(programId = null, periodType = 'all_time', limit = 50) {
    const now = new Date();
    let since = null; // 'YYYY-MM-DD' window start; null = all-time
    if (periodType === 'daily') since = now.toISOString().split('T')[0];
    else if (periodType === 'weekly') since = this.getWeekStart(now);
    else if (periodType === 'monthly') since = this.getMonthStart(now);

    const where = {};
    if (since) where.createdAt = { [Sequelize.Op.gte]: since };

    const rows = await models.PointsHistory.findAll({
      attributes: ['userId', [Sequelize.fn('SUM', Sequelize.col('points_change')), 'pts']],
      where,
      group: ['userId'],
      order: [[Sequelize.fn('SUM', Sequelize.col('points_change')), 'DESC']],
      limit,
      raw: true
    });

    const positive = rows.filter((r) => Number(r.pts) > 0);
    if (!positive.length) return [];

    const userIds = positive.map((r) => r.userId);
    const users = await models.User.findAll({
      where: { id: userIds },
      attributes: ['id', 'firstName', 'lastName', 'email']
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    return positive.map((r, index) => ({
      id: `lb-${r.userId}-${periodType}`,
      userId: r.userId,
      rank: index + 1,
      points: Number(r.pts) || 0,
      periodType,
      user: byId.get(r.userId) || null
    }));
  }

  async getUserBadges(userId) {
    return models.UserBadge.findAll({
      where: { userId },
      include: [{ model: models.Badge }],
      order: [['unlockedAt', 'DESC']]
    });
  }

  async getUserPointsHistory(userId, limit = 50) {
    return models.PointsHistory.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit
    });
  }

  async getUserGamificationStats(userId) {
    const menteeProfile = await models.MenteeProfile.findOne({ where: { userId } });
    if (!menteeProfile) {
      throw new NotFoundError('Mentee profile not found');
    }

    const totalBadges = await models.UserBadge.count({ where: { userId } });
    const recentBadges = await this.getUserBadges(userId);
    const recentPoints = await this.getUserPointsHistory(userId, 10);

    let userLeaderboardRank = await models.LeaderboardEntry.findOne({
      where: {
        userId,
        periodType: 'all_time',
        programId: null
      }
    });

    if (!userLeaderboardRank) {
      const higherRankedCount = await models.MenteeProfile.count({
        where: {
          totalPoints: { [Sequelize.Op.gt]: Number(menteeProfile.totalPoints || 0) }
        }
      });

      userLeaderboardRank = { rank: higherRankedCount + 1 };
    }

    // Counted from the daily log at the moment of asking, so this screen and
    // the phone cannot disagree. The stored counter is still written, because
    // badge criteria read it, but nothing displays it.
    //
    // What stood here was a patch over the bug rather than a fix: if the stored
    // streak was zero but points had been earned today it reported 1. That made
    // the number look alive on the day something was approved and hid the fact
    // that it was counting the wrong thing the rest of the time.
    const streak = await this.readStreak(userId);

    return {
      totalPoints: Number(menteeProfile.totalPoints || 0),
      currentLevel: Number(menteeProfile.currentLevel || 1),
      currentStreak: streak.current,
      longestStreak: Math.max(streak.longest, Number(menteeProfile.longestStreakDays || 0)),
      totalBadges,
      totalTasksCompleted: Number(menteeProfile.totalTasksCompleted || 0),
      totalProgramsCompleted: Number(menteeProfile.totalProgramsCompleted || 0),
      avgTaskRating: parseFloat(menteeProfile.avgTaskRating) || 0,
      leaderboardRank: userLeaderboardRank ? userLeaderboardRank.rank : null,
      recentBadges: recentBadges.slice(0, 5),
      recentPoints
    };
  }

  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
  }

  getMonthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
  }

  async createDefaultBadges() {
    const defaultBadges = [
      {
        name: 'First Steps',
        description: 'Complete your first task',
        category: 'milestone',
        criteriaType: 'tasks_completed',
        criteriaValue: { count: 1 },
        pointsReward: 10,
        isActive: true,
        isSecret: false
      },
      {
        name: 'Achievement Collector',
        description: 'Earn 5 badges',
        category: 'achievement',
        criteriaType: 'custom',
        criteriaValue: { manual: true },
        pointsReward: 50,
        isActive: true,
        isSecret: false
      },
      {
        name: 'Quick Learner',
        description: 'Complete 5 tasks',
        category: 'milestone',
        criteriaType: 'tasks_completed',
        criteriaValue: { count: 5 },
        pointsReward: 25,
        isActive: true,
        isSecret: false
      },
      {
        name: 'Staying Strong',
        description: 'Maintain a 7-day streak',
        category: 'streak',
        criteriaType: 'streak_days',
        criteriaValue: { days: 7 },
        pointsReward: 50,
        isActive: true,
        isSecret: false
      },
      {
        name: 'Consistency Master',
        description: 'Maintain a 30-day streak',
        category: 'streak',
        criteriaType: 'streak_days',
        criteriaValue: { days: 30 },
        pointsReward: 200,
        isActive: true,
        isSecret: false
      },
      {
        name: 'Rising Star',
        description: 'Reach level 3',
        category: 'level',
        criteriaType: 'level_reached',
        criteriaValue: { level: 3 },
        pointsReward: 100,
        isActive: true,
        isSecret: false
      },
      {
        name: 'Excellence',
        description: 'Achieve 4.5+ average rating',
        category: 'quality',
        criteriaType: 'avg_rating',
        criteriaValue: { minRating: 4.5 },
        pointsReward: 150,
        isActive: true,
        isSecret: false
      },
      {
        name: 'Program Master',
        description: 'Complete your first program',
        category: 'milestone',
        criteriaType: 'programs_completed',
        criteriaValue: { count: 1 },
        pointsReward: 100,
        isActive: true,
        isSecret: false
      },
      {
        name: 'Points Collector',
        description: 'Earn 500 points',
        category: 'points',
        criteriaType: 'points_milestone',
        criteriaValue: { threshold: 500 },
        pointsReward: 0,
        isActive: true,
        isSecret: false
      },
      {
        name: 'Legend',
        description: 'Reach level 5',
        category: 'level',
        criteriaType: 'level_reached',
        criteriaValue: { level: 5 },
        pointsReward: 500,
        isActive: true,
        isSecret: true
      }
    ];

    for (const badgeData of defaultBadges) {
      await models.Badge.findOrCreate({
        where: { name: badgeData.name },
        defaults: badgeData
      });
    }

    const count = await models.Badge.count();
    return count;
  }
}

module.exports = new GamificationService();

const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');
const performanceService = require('./performanceService');
const authzService = require('./authzService');
const certificateService = require('./certificateService');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { VISIBLE_MEMBERSHIP_STATUSES } = require('../config/membership');
const logger = require('../utils/logger');

/**
 * Top-performer nominations.
 *
 * An admin running a fellowship of several hundred cannot know who deserves the
 * recognition. A mentor of a dozen can — but an admin cannot simply take their
 * word for it either, and asking them to is how recognition quietly becomes a
 * popularity contest.
 *
 * So three things are put side by side and none of them decides alone:
 *
 *   the ranking    what the record says, computed live from the same composite
 *                  the certificates already grade on, so this is not a third
 *                  definition of "doing well" competing with the other two
 *   the reasoning  what the mentor knows that the record cannot hold, required
 *                  of them, because a nomination without it is only a vote
 *   the evidence   the roadmap and the tasks under it, already on screen behind
 *                  the certificate drawer
 *
 * The disagreement is the useful part. Nominated and ranked first needs no
 * scrutiny; nominated and ranked fourteenth of twenty tells an admin precisely
 * where to read closely — without overruling a mentor who may be right about
 * something no metric holds.
 */
class PerformanceNominationService {
  /**
   * The data's own ranking of a clan, or of a whole programme.
   *
   * Computed on read. There is no batch job and nothing to schedule: a stale
   * ranking beside a live nomination would be its own kind of lie, and this is
   * cheap enough that freezing it buys nothing.
   */
  async ranking({ programId = null, clanId = null, limit = 50 }) {
    const resolved = await this._resolveProgram(programId, clanId);
    const menteeIds = await this._menteeIdsFor(resolved, clanId);
    if (!menteeIds.length) return [];

    // The SAME score the mentor portal shows under Teaching and the mentee
    // leaderboard ranks by. A third definition of "doing well" is how a mentor
    // and an admin end up arguing about whose number is right instead of about
    // the mentee.
    // `counted` is how many are rankable in total; `ranked` has already been cut
    // to the limit. Using the cut length made "ranked 3 of 5" out of a clan of
    // thirty-eight — the denominator has to be the whole field, not the page.
    const { ranked, notRanked, counted } = await performanceService.leaderboard(menteeIds, { clanId, limit });

    const shape = (row) => ({
      menteeId: row.id,
      mentee: {
        id: row.id,
        firstName: (row.name || '').split(' ')[0] || '',
        lastName: (row.name || '').split(' ').slice(1).join(' '),
        email: '',
        profilePictureUrl: row.profilePictureUrl ?? null
      },
      clanId,
      clanName: null,
      rank: row.rank,
      score: row.score,
      band: row.band,
      signals: {
        tasksCompleted: row.evidence?.tasksCompleted ?? 0,
        completionRate: row.evidence?.absoluteProgress ?? 0,
        onTimeRate: row.evidence?.onTimeRate ?? 0,
        avgRating: row.evidence?.avgRating ?? null,
        effortHours: row.evidence?.effortHours ?? null,
        activeWeeks: row.evidence?.activeWeeks ?? null,
        attendancePct: row.evidence?.attendance
          ? Math.round(((row.evidence.attendance.present || 0) /
              Math.max(1, row.evidence.attendance.total || 1)) * 100)
          : null,
        openBlockers: 0,
        blockersResolved: 0
      }
    });

    /**
     * Both halves go back, and that is not a detail.
     *
     * The score has an eligibility bar — three reviewed tasks, 20% of the
     * programme — below which somebody cannot be ranked honestly. If the
     * nomination screen only listed the ranked, a mentor could not put forward
     * the quiet one who joined late and turned the clan around, which is
     * precisely the judgement the data cannot make and the reason a human is
     * being asked at all. They appear with no rank and the reason why, and the
     * admin sees that absence rather than a fabricated position.
     */
    return {
      ranked: ranked.map((row) => ({ ...shape(row), rank: row.rank, notRankedBecause: null })),
      notRanked: notRanked.map((row) => ({
        ...shape(row), rank: null, notRankedBecause: row.notRankedBecause
      })),
      rankedCount: counted
    };
  }

  /**
   * Put somebody forward. The reasoning is required and the rank is captured
   * now, so the record still reads honestly in three months when the mentee's
   * numbers have moved on.
   */
  async nominate(menteeId, { programId, clanId = null, level = 'clan', reasoning }, user) {
    if (!String(reasoning || '').trim()) {
      throw new ValidationError('Tell us why this mentee deserves it.');
    }
    // A mentor picks a clan from the sidebar; the programme follows from it and
    // is not something they should have to know, let alone send.
    programId = await this._resolveProgram(programId, clanId);

    await this._assertCanNominate(user, menteeId, programId, clanId);

    const existing = await models.PerformanceNomination.findOne({
      where: { menteeId, programId, level }
    });
    if (existing) {
      throw new ValidationError('This mentee has already been nominated for this award.');
    }

    const board = await this.ranking({ programId, clanId, limit: 500 });
    const placed = board.ranked.find((row) => row.menteeId === menteeId)
      ?? board.notRanked.find((row) => row.menteeId === menteeId);

    const nomination = await models.PerformanceNomination.create({
      menteeId,
      nominatedBy: user.id,
      programId,
      clanId,
      level,
      reasoning: String(reasoning).trim(),
      systemRank: placed?.rank ?? null,
      systemOutOf: board.rankedCount || null,
      systemSignals: placed?.signals ?? null,
      status: 'nominated'
    });

    await this._notifyAdmins(nomination);
    return this._serialize(await this._withRelations(nomination.id));
  }

  async evidence(id, user, page = 1) {
    const nomination = await models.PerformanceNomination.findByPk(id);
    if (!nomination) throw new NotFoundError('Nomination not found');
    if (await authzService.hasAdminAccess(user)) {
      await authzService.assertProgramInScope(user, nomination.programId);
    } else {
      const clans = await certificateService.getMentorScopedMenteeClans(user, nomination.programId);
      if (!clans.includes(nomination.clanId)) throw new ForbiddenError('This nomination is outside your clans');
    }
    const limit = 10;
    const currentPage = Math.max(1, Math.floor(Number(page) || 1));
    const result = await models.AssignedTask.findAndCountAll({
      where: { menteeId: nomination.menteeId, status: 'completed' },
      include: [
        { model: models.Enrollment, as: 'enrollment', attributes: [], where: { programId: nomination.programId }, required: true },
        { model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title', 'type'], required: false },
        { model: models.TaskSubmission, as: 'submissions', separate: true, limit: 1, order: [['version', 'DESC']],
          include: [
            { model: models.TaskSubmissionFile, as: 'files', attributes: ['id', 'fileName', 'fileUrl'] },
            { model: models.TaskFeedback, as: 'feedback', attributes: ['id', 'feedbackText', 'rating', 'isApproved'] },
          ] },
      ],
      attributes: ['id', 'titleOverride', 'typeOverride', 'completedAt', 'pointsAwarded', 'isLate'],
      order: [['completedAt', 'DESC'], ['id', 'ASC']], limit, offset: (currentPage - 1) * limit, distinct: true,
    });
    return { total: result.count, page: currentPage, pages: Math.max(1, Math.ceil(result.count / limit)),
      tasks: result.rows.map(task => ({
        id: task.id, title: task.titleOverride || task.roadmapTask?.title || 'Task',
        type: task.typeOverride || task.roadmapTask?.type, completedAt: task.completedAt,
        points: task.pointsAwarded, isLate: task.isLate,
        submission: task.submissions?.[0] ? {
          text: task.submissions[0].submissionText, urls: task.submissions[0].submissionUrls,
          submittedAt: task.submissions[0].submittedAt, files: task.submissions[0].files,
          feedback: task.submissions[0].feedback,
        } : null,
      })) };
  }

  /** What this user may see: admins everything, mentors their own clans. */
  async list({ user, programId = null, status = null }) {
    const where = {};
    if (programId) where.programId = programId;
    if (status) where.status = status;

    const isAdmin = await authzService.hasAdminAccess(user);
    if (!isAdmin) {
      const clanIds = await certificateService.getMentorScopedMenteeClans(user, programId);
      if (!clanIds.length) return [];
      where.clanId = { [Op.in]: clanIds };
    }

    const rows = await models.PerformanceNomination.findAll({
      where,
      include: this._relations(),
      order: [['createdAt', 'DESC']]
    });
    return rows.map((row) => this._serialize(row));
  }

  /**
   * The admin's decision. `shortlisted` promotes a clan nomination into the
   * fellowship conversation; `awarded` and `declined` close it.
   */
  async decide(id, { status, decisionNote = null }, user) {
    if (!['shortlisted', 'awarded', 'declined'].includes(status)) {
      throw new ValidationError('Unknown decision');
    }
    if (!(await authzService.hasAdminAccess(user))) {
      throw new ForbiddenError('Only an admin decides this award');
    }

    const nomination = await models.PerformanceNomination.findByPk(id);
    if (!nomination) throw new NotFoundError('Nomination not found');

    nomination.status = status;
    nomination.decisionNote = decisionNote ? String(decisionNote).trim() : null;
    nomination.decidedBy = user.id;
    nomination.decidedAt = new Date();
    await nomination.save();

    await this._notifyDecision(nomination);
    return this._serialize(await this._withRelations(nomination.id));
  }

  /**
   * A first draft of the reasoning, written from the mentee's actual numbers.
   *
   * Offered, never submitted: the mentor edits it, and what they send is theirs.
   * A drafted rationale nobody changed is worth less than a short one somebody
   * meant, so this exists to get past the blank box, not to fill it.
   */
  async aiDraft(menteeId, { programId = null, clanId = null }, user) {
    programId = await this._resolveProgram(programId, clanId);
    await this._assertCanNominate(user, menteeId, programId, clanId);

    const board = await this.ranking({ programId, clanId, limit: 500 });
    const placed = board.ranked.find((row) => row.menteeId === menteeId)
      ?? board.notRanked.find((row) => row.menteeId === menteeId);
    if (!placed) throw new NotFoundError('No record for this mentee yet');

    const name = placed.mentee ? `${placed.mentee.firstName} ${placed.mentee.lastName}`.trim() : 'This mentee';
    const s = placed.signals;
    const brief = [
      `Mentee: ${name}`,
      placed.rank
        ? `Ranked ${placed.rank} of ${board.rankedCount} on the record`
        : `Not yet ranked — ${placed.notRankedBecause}`,
      `Progress score: ${placed.score}/100 (${placed.band})`,
      `Tasks completed: ${s.tasksCompleted}`,
      `Through the programme: ${s.completionRate}%`,
      `On-time delivery: ${s.onTimeRate}%`,
      s.avgRating != null ? `Average mentor rating: ${s.avgRating}/5` : null,
      s.attendancePct != null ? `Cohort review attendance: ${s.attendancePct}%` : null,
      s.activeWeeks != null ? `Weeks with finished work: ${s.activeWeeks}` : null
    ].filter(Boolean).join('\n');

    const system =
      'You are a mentor writing one short paragraph nominating a mentee as a top performer. ' +
      'Use ONLY the data provided and never invent facts. Return plain text, 2-3 sentences, ' +
      'warm and specific, naming the numbers that make the case. No markdown.';

    try {
      const text = await require('./groqService').generateText({
        system, prompt: `Data:\n${brief}\n\nWrite the nomination now.`,
        feature: 'summary', userId: user.id, temperature: 0.5, maxTokens: 220
      });
      const draft = String(text || '').trim();
      if (draft) return { draft, signals: s, rank: placed.rank, outOf: board.rankedCount };
    } catch (error) {
      logger.warn(`[topPerformer] AI draft failed, using the numbers: ${error.message}`);
    }

    // Always returns something usable — the button must not depend on the model.
    const draft =
      `${name.split(' ')[0]} scores ${placed.score}/100 (${placed.band}) with ` +
      `${s.tasksCompleted} tasks completed and ${s.onTimeRate}% delivered on time` +
      `${s.avgRating != null ? `, rated ${s.avgRating}/5 by their mentor` : ''}. ` +
      `${placed.rank ? `The record places them ${placed.rank} of ${board.rankedCount}.` : `They are not ranked yet — ${placed.notRankedBecause}.`}`;
    return { draft, signals: s, rank: placed.rank, outOf: board.rankedCount };
  }

  // ── internals ─────────────────────────────────────────────────────────────

  _relations() {
    return [
      { model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl'] },
      { model: models.User, as: 'nominator', attributes: ['id', 'firstName', 'lastName'], required: false },
      { model: models.User, as: 'decider', attributes: ['id', 'firstName', 'lastName'], required: false },
      { model: models.Clan, as: 'clan', attributes: ['id', 'name'], required: false }
    ];
  }

  _withRelations(id) {
    return models.PerformanceNomination.findByPk(id, { include: this._relations() });
  }

  _serialize(row) {
    if (!row) return null;
    const who = (u) => (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : null);
    return {
      id: row.id,
      menteeId: row.menteeId,
      mentee: row.mentee ? {
        id: row.mentee.id,
        firstName: row.mentee.firstName,
        lastName: row.mentee.lastName,
        email: row.mentee.email,
        profilePictureUrl: row.mentee.profilePictureUrl
      } : null,
      programId: row.programId,
      clanId: row.clanId,
      clanName: row.clan?.name ?? null,
      level: row.level,
      reasoning: row.reasoning,
      nominatedBy: who(row.nominator),
      systemRank: row.systemRank,
      systemOutOf: row.systemOutOf,
      systemSignals: row.systemSignals,
      status: row.status,
      decisionNote: row.decisionNote,
      decidedBy: who(row.decider),
      decidedAt: row.decidedAt,
      createdAt: row.createdAt
    };
  }

  /** The programme a clan belongs to, when the caller only knows the clan. */
  async _resolveProgram(programId, clanId) {
    if (programId) return programId;
    if (!clanId) throw new ValidationError('A programme or a clan is required');
    const clan = await models.Clan.findByPk(clanId, { attributes: ['programId'] });
    if (!clan) throw new NotFoundError('Clan not found');
    return clan.programId;
  }

  /** Mentees of a programme, or of one clan inside it. */
  async _menteeIdsFor(programId, clanId) {
    const where = { role: 'mentee', status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES } };
    if (clanId) where.clanId = clanId;

    const memberships = await models.ClanMembership.findAll({
      where,
      include: [{
        model: models.Clan, as: 'clan',
        where: { programId }, attributes: ['id'], required: true
      }],
      attributes: ['userId']
    });
    return [...new Set(memberships.map((m) => m.userId))];
  }

  /**
   * A mentor nominates inside their own clans; an admin anywhere. Scope comes
   * from the clans they actually mentor, never from the account's base role —
   * a co-mentor promoted from a mentee still reads 'mentee' on that column.
   */
  async _assertCanNominate(user, menteeId, programId, clanId) {
    if (!user) throw new ForbiddenError('You cannot nominate');
    if (await authzService.hasAdminAccess(user)) return;

    const clanIds = await certificateService.getMentorScopedMenteeClans(user, programId, { clanId });
    if (!clanIds.length) throw new ForbiddenError('You do not mentor this clan');

    const membership = await models.ClanMembership.findOne({
      where: {
        userId: menteeId, role: 'mentee',
        clanId: { [Op.in]: clanIds },
        status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES }
      }
    });
    if (!membership) throw new ForbiddenError('That mentee is not in a clan you mentor');
  }

  async _notifyAdmins(nomination) {
    try {
      const admins = await models.User.findAll({
        where: { role: 'admin', status: 'active' }, attributes: ['id']
      });
      if (!admins.length) return;
      const mentee = await models.User.findByPk(nomination.menteeId, { attributes: ['firstName', 'lastName'] });
      const name = mentee ? `${mentee.firstName} ${mentee.lastName}`.trim() : 'A mentee';
      const placing = nomination.systemRank
        ? ` The record ranks them ${nomination.systemRank} of ${nomination.systemOutOf}.`
        : '';

      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.TOP_PERFORMER_NOMINATED,
        recipients: admins.map((a) => ({ userId: a.id })),
        payload: {
          title: `${name} nominated as a top performer`,
          message: `A mentor has put ${name} forward with their reasoning.${placing}`,
          actionUrl: '/admin/top-performers',
          actionLabel: 'Review nomination',
          relatedEntityType: 'PerformanceNomination'
        }
      });
    } catch (error) {
      logger.warn(`[topPerformer] admin notification failed: ${error.message}`);
    }
  }

  async _notifyDecision(nomination) {
    try {
      const mentee = await models.User.findByPk(nomination.menteeId, { attributes: ['firstName', 'lastName'] });
      const name = mentee ? `${mentee.firstName} ${mentee.lastName}`.trim() : 'the mentee';
      const recipients = [];
      // The nominating mentor hears either way — they asked a question and
      // deserve the answer.
      if (nomination.nominatedBy) recipients.push({ userId: nomination.nominatedBy });
      // The mentee only hears when they have won. Being told you were put
      // forward and turned down is a worse outcome than never knowing.
      if (nomination.status === 'awarded') recipients.push({ userId: nomination.menteeId });
      if (!recipients.length) return;

      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.TOP_PERFORMER_DECIDED,
        recipients,
        payload: {
          title: nomination.status === 'awarded'
            ? `${name} is a top performer`
            : `Decision on ${name}'s nomination`,
          message: nomination.status === 'awarded'
            ? `The award has been confirmed.`
            : `The nomination was marked ${nomination.status}.`,
          actionUrl: '/admin/top-performers',
          actionLabel: 'See nominations',
          relatedEntityType: 'PerformanceNomination'
        }
      });
    } catch (error) {
      logger.warn(`[topPerformer] decision notification failed: ${error.message}`);
    }
  }
}

module.exports = new PerformanceNominationService();

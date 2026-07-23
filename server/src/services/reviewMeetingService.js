const crypto = require('crypto');
const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors/errorTypes');
const authzService = require('./authzService');
const cfg = require('../config/reviewMeeting');

/**
 * reviewMeetingService — live video (Jitsi) for a cohort review.
 *
 * The mentor HOSTS: they open the room (start), and their page is the source of
 * truth for attendance seen from the roster and for contribution (dominant-
 * speaker talk time). Mentees JOIN through Pathment, which sets their identity
 * and self-reports their own presence (never someone else's). A direct-link
 * joiner is visible to the host but only mentor-confirmed — see the spec.
 *
 * Provider-flexible: the room URL is built from config.jitsiDomain, so pointing
 * at a self-hosted Jitsi or JaaS later needs no code change.
 */
class ReviewMeetingService {
  _fullName(u) { return u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Guest' : 'Guest'; }

  _joinConfig(session, displayName) {
    return {
      sessionId: session.id,
      provider: session.meetingProvider || cfg.provider,
      domain: cfg.jitsiDomain,
      room: session.meetingRoom,
      url: session.meetingUrl,
      externalUrl: session.externalMeetingUrl || null,
      displayName: displayName || null,
      startedAt: session.meetingStartedAt,
      endedAt: session.meetingEndedAt,
    };
  }

  async _hostSession(mentorId, sessionId) {
    const session = await models.CohortReviewSession.findByPk(sessionId);
    if (!session) throw new NotFoundError('Review session not found');
    const clanIds = await authzService.mentoredClanIds(mentorId);
    if (session.clanId ? !clanIds.includes(session.clanId) : session.mentorId !== mentorId) {
      throw new ForbiddenError('You do not mentor this clan');
    }
    return session;
  }

  /** Is this mentee an active member of the session's clan? (self-report guard) */
  async _menteeInClan(userId, session) {
    if (!session.clanId) return false;
    const m = await models.ClanMembership.findOne({
      where: { userId, clanId: session.clanId, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
      attributes: ['id'], raw: true,
    });
    return !!m;
  }

  // ── host: open / close the room ──────────────────────────────────────────
  /** Start (or return) the live room for a session. Idempotent. */
  async startMeeting(mentorId, sessionId, { externalUrl } = {}) {
    const session = await this._hostSession(mentorId, sessionId);
    const patch = {};
    if (!session.meetingRoom) {
      // Non-guessable slug — the natural way in is Pathment's Join button, not
      // this URL. Kept readable-ish for support.
      patch.meetingProvider = cfg.provider;
      patch.meetingRoom = `pathment-review-${session.id.slice(0, 8)}-${crypto.randomBytes(6).toString('hex')}`;
      patch.meetingUrl = `https://${cfg.jitsiDomain}/${patch.meetingRoom}`;
    }
    if (!session.meetingStartedAt) patch.meetingStartedAt = new Date();
    patch.meetingEndedAt = null; // reopening clears a prior end
    if (externalUrl !== undefined) patch.externalMeetingUrl = externalUrl || null;
    if (Object.keys(patch).length) await session.update(patch);

    const host = await models.User.findByPk(mentorId, { attributes: ['id', 'firstName', 'lastName'] });
    return this._joinConfig(session, this._fullName(host));
  }

  /** Close the room (stops new auto-attendance; contribution is finalized separately). */
  async endMeeting(mentorId, sessionId) {
    const session = await this._hostSession(mentorId, sessionId);
    if (!session.meetingEndedAt) await session.update({ meetingEndedAt: new Date() });
    return this._joinConfig(session, null);
  }

  /** Host's embed config + live roster (attendance/talk state per mentee). */
  async hostView(mentorId, sessionId) {
    const session = await this._hostSession(mentorId, sessionId);
    // Reconcile first so the roster covers EVERY clan mentee, not just those who
    // already self-reported — otherwise the mentor can't mark a direct joiner
    // present, or even see who hasn't shown up.
    try { await require('./cohortReviewService')._reconcileEntries(session); } catch { /* roster falls back to existing entries */ }
    const host = await models.User.findByPk(mentorId, { attributes: ['id', 'firstName', 'lastName'] });
    const entries = await models.CohortReviewEntry.findAll({
      where: { sessionId },
      include: [{ model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName'] }],
    });
    const roster = entries.map((e) => ({
      menteeId: e.menteeId,
      name: this._fullName(e.mentee),
      attendance: e.attendance,
      autoPresent: e.autoPresent,
      joinedAt: e.joinedAt,
      secondsPresent: e.secondsPresent,
      talkSeconds: e.talkSeconds,
      contributionPoints: e.contributionPoints,
    }));
    return { meeting: this._joinConfig(session, this._fullName(host)), roster, live: !!session.meetingStartedAt && !session.meetingEndedAt };
  }

  // ── mentee: discover + join + leave ──────────────────────────────────────
  /** The live review the signed-in mentee can join right now (or null). */
  async activeForMentee(userId) {
    const clanIds = (await models.ClanMembership.findAll({
      where: { userId, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
      attributes: ['clanId'], raw: true,
    })).map((m) => m.clanId).filter(Boolean);
    if (!clanIds.length) return null;

    const session = await models.CohortReviewSession.findOne({
      where: {
        clanId: { [Op.in]: clanIds },
        status: 'in_progress',
        meetingStartedAt: { [Op.ne]: null },
        meetingEndedAt: null,
      },
      order: [['meeting_started_at', 'DESC']],
    });
    if (!session) return null;
    const user = await models.User.findByPk(userId, { attributes: ['id', 'firstName', 'lastName'] });
    const clan = await models.Clan.findByPk(session.clanId, { attributes: ['name'] });
    return { ...this._joinConfig(session, this._fullName(user)), clanName: clan?.name || 'your clan' };
  }

  /** Mark the AUTHENTICATED mentee present (self-report). Only marks themselves. */
  async selfPresent(userId, sessionId) {
    const session = await models.CohortReviewSession.findByPk(sessionId);
    if (!session) throw new NotFoundError('Review session not found');
    if (!(await this._menteeInClan(userId, session))) throw new ForbiddenError('You are not a mentee of this clan');

    const [entry] = await models.CohortReviewEntry.findOrCreate({
      where: { sessionId, menteeId: userId },
      defaults: { sessionId, menteeId: userId, status: 'pending' },
    });
    const patch = {};
    // Never override a mentor's manual absent/excused; only auto-fill an unset one.
    if (!entry.attendance || (entry.attendance === 'present')) { patch.attendance = 'present'; patch.autoPresent = true; }
    if (!entry.joinedAt) patch.joinedAt = new Date();
    if (Object.keys(patch).length) await entry.update(patch);

    // Re-engage a paused mentee who shows up — reuse the existing behaviour.
    require('./mentorshipPauseService').autoResumeIfPaused(userId, 'joined a review').catch(() => {});
    return { present: entry.attendance === 'present' };
  }

  /** Stamp the mentee's leave + accumulate presence seconds. */
  async selfLeave(userId, sessionId, seconds = 0) {
    const entry = await models.CohortReviewEntry.findOne({ where: { sessionId, menteeId: userId } });
    if (!entry) return { ok: true };
    const add = Math.max(0, Math.min(24 * 3600, parseInt(seconds, 10) || 0));
    await entry.update({ leftAt: new Date(), secondsPresent: (entry.secondsPresent || 0) + add });
    return { ok: true };
  }

  // ── host: contribution ────────────────────────────────────────────────────
  /** Record accumulated dominant-speaker seconds per mentee (host-observed). */
  async recordTalkTime(mentorId, sessionId, items = []) {
    await this._hostSession(mentorId, sessionId);
    if (!Array.isArray(items)) throw new ValidationError('items must be an array');
    for (const it of items) {
      if (!it || !it.menteeId) continue;
      const secs = Math.max(0, Math.min(24 * 3600, parseInt(it.seconds, 10) || 0));
      const [entry] = await models.CohortReviewEntry.findOrCreate({
        where: { sessionId, menteeId: it.menteeId },
        defaults: { sessionId, menteeId: it.menteeId, status: 'pending' },
      });
      // Monotonic — never lower an accumulated count on a late/re-send.
      if (secs > (entry.talkSeconds || 0)) await entry.update({ talkSeconds: secs });
    }
    return { ok: true };
  }

  /**
   * Scoring list for the mentor: the WHOLE roster, with `proposed` pre-set for
   * anyone who spoke past the threshold. Returning everyone (not just speakers)
   * lets the mentor also credit someone who contributed in chat or by helping —
   * talk time is a proxy, not the definition of contributing.
   */
  async proposeContribution(mentorId, sessionId) {
    const view = await this.hostView(mentorId, sessionId);
    return view.roster
      .filter((r) => r.attendance === 'present' || r.talkSeconds > 0)
      .map((r) => ({
        menteeId: r.menteeId,
        name: r.name,
        talkSeconds: r.talkSeconds,
        alreadyAwarded: r.contributionPoints > 0,
        proposed: r.talkSeconds >= cfg.contributionThresholdSeconds,
      }));
  }

  /**
   * Award the contribution point to the confirmed mentees. Idempotent per
   * (session, mentee) — a re-finalize never double-awards.
   */
  async finalizeContribution(mentorId, sessionId, menteeIds = []) {
    await this._hostSession(mentorId, sessionId);
    if (!Array.isArray(menteeIds)) throw new ValidationError('menteeIds must be an array');
    const gamificationService = require('./gamificationService');
    let awarded = 0;
    for (const menteeId of [...new Set(menteeIds)]) {
      const entry = await models.CohortReviewEntry.findOne({ where: { sessionId, menteeId } });
      if (!entry || entry.contributionPoints > 0) continue; // already awarded → skip
      try {
        await gamificationService.awardPoints(menteeId, cfg.contributionPoints, 'review_contribution', sessionId, 'Contributed in the cohort review');
        await entry.update({ contributionPoints: cfg.contributionPoints });
        awarded += 1;
      } catch (e) {
        // A mentee with no MenteeProfile (edge) shouldn't sink the batch.
        console.warn('[reviewMeeting] contribution award failed for', menteeId, e.message);
      }
    }
    return { awarded };
  }
}

module.exports = new ReviewMeetingService();

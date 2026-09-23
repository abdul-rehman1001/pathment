const { Op } = require('sequelize');
const { models } = require('../db');
const { ForbiddenError, ValidationError, NotFoundError } = require('../utils/errors/errorTypes');
const { createAuditLog } = require('../utils/auditContext');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');

const LOCK_KEY = 'cohort_review_delete_locked';

/**
 * cohortReviewLockService - org-wide "deletion lock" for cohort review sessions.
 *
 * When the lock is ON (a system_settings flag), mentors can't delete or reopen
 * review sessions unless they hold an active, admin-issued grant. A mentor asks
 * via an unlock REQUEST; an admin approves (minting a time-boxed GRANT) or
 * declines. cohortReviewService delegates assertCanDelete() to this module and
 * enforces it at the top of deleteSession/reopenSession.
 */
class CohortReviewLockService {
  // ── flag (system_settings) ───────────────────────────────────────────────
  async isDeleteLocked() {
    const row = await models.SystemSettings.findOne({ where: { settingKey: LOCK_KEY }, attributes: ['settingValue'] });
    return row?.settingValue === 'true';
  }

  async setDeleteLock(locked, adminId) {
    const value = locked ? 'true' : 'false';
    const [row] = await models.SystemSettings.findOrCreate({
      where: { settingKey: LOCK_KEY },
      defaults: {
        settingKey: LOCK_KEY, settingValue: value, settingType: 'boolean',
        category: 'cohort_review', isPublic: false, lastModifiedBy: adminId || null,
      },
    });
    if (row.settingValue !== value || row.lastModifiedBy !== (adminId || null)) {
      row.settingValue = value;
      row.lastModifiedBy = adminId || null;
      await row.save();
    }
    createAuditLog({
      userId: adminId,
      action: locked ? 'REVIEW_LOCK_ENABLED' : 'REVIEW_LOCK_DISABLED',
      entityType: 'system_settings',
      entityId: null,
      newValues: { locked },
    }).catch(() => {});
    return Boolean(locked);
  }

  // ── grants ─────────────────────────────────────────────────────────────────
  async hasActiveGrant(mentorId) {
    const grant = await models.CohortReviewUnlockGrant.findOne({
      where: { mentorId, revokedAt: null, expiresAt: { [Op.gt]: new Date() } },
      order: [['expires_at', 'DESC']],
    });
    return grant || null;
  }

  /** Throw if the org lock is ON and this mentor has no active grant. */
  async assertCanDelete(mentorId) {
    const locked = await this.isDeleteLocked();
    if (!locked) return;
    const grant = await this.hasActiveGrant(mentorId);
    if (!grant) {
      throw new ForbiddenError('Deletion is locked by your organization. Request access from an admin.');
    }
  }

  // ── mentor: request unlock ──────────────────────────────────────────────────
  async requestUnlock(mentorId, { sessionId, reason } = {}) {
    const existing = await models.CohortReviewUnlockRequest.findOne({
      where: { mentorId, status: 'pending' },
    });
    if (existing) throw new ValidationError('You already have a pending unlock request.');

    const request = await models.CohortReviewUnlockRequest.create({
      mentorId,
      sessionId: sessionId || null,
      reason: (reason || '').trim() || null,
      status: 'pending',
    });

    createAuditLog({
      userId: mentorId,
      action: 'REVIEW_UNLOCK_REQUESTED',
      entityType: 'cohort_review_unlock_request',
      entityId: request.id,
      newValues: { sessionId: sessionId || null, reason: request.reason },
    }).catch(() => {});

    this._notifyAdmins(mentorId, request).catch(() => {});
    return request;
  }

  async _notifyAdmins(mentorId, request) {
    const [mentor, admins] = await Promise.all([
      models.User.findByPk(mentorId, { attributes: ['firstName', 'lastName'] }),
      require('./workspaceRecipients').admins(),
    ]);
    if (!admins.length) return;
    const who = mentor ? `${mentor.firstName || ''} ${mentor.lastName || ''}`.trim() : 'A mentor';
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.REVIEW_UNLOCK_REQUESTED,
      recipients: admins.map((a) => ({ userId: a.id })),
      payload: {
        title: 'Cohort-review change requested',
        message: `${who} requested access to edit or delete a locked cohort-review record. Approve or decline under Settings → Review Lock.`,
        actionUrl: '/admin/settings?tab=review-lock',
        actionLabel: 'Review request',
        relatedEntityType: 'cohort_review_unlock_request',
        relatedEntityId: request.id,
        emailSubject: `Pathment: ${who} requested to change a locked review`,
      },
      dedupe: { relatedEntityType: 'cohort_review_unlock_request', relatedEntityId: request.id },
    });
  }

  // ── admin: list / respond ────────────────────────────────────────────────────
  async _leadClanName(mentorId) {
    const m = await models.ClanMembership.findOne({
      where: { userId: mentorId, role: 'lead_mentor', status: 'active' },
      include: [{ model: models.Clan, as: 'clan', attributes: ['name'] }],
      order: [['joined_at', 'ASC']],
    });
    return m?.clan?.name || null;
  }

  async listRequests({ status } = {}) {
    const where = {};
    if (status && status !== 'all') where.status = status;
    const requests = await models.CohortReviewUnlockRequest.findAll({
      where,
      include: [
        { model: models.User, as: 'mentor', attributes: ['id', 'firstName', 'lastName'] },
        { model: models.CohortReviewSession, as: 'session', attributes: ['id', 'sessionDate'] },
      ],
      order: [['created_at', 'DESC']],
    });
    const out = [];
    for (const r of requests) {
      const clanName = r.mentor ? await this._leadClanName(r.mentor.id) : null;
      out.push({
        id: r.id,
        mentor: r.mentor
          ? { id: r.mentor.id, name: `${r.mentor.firstName || ''} ${r.mentor.lastName || ''}`.trim(), clanName }
          : null,
        sessionId: r.sessionId,
        sessionDate: r.session ? r.session.sessionDate : null,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt,
        reviewedBy: r.reviewedBy,
        reviewedAt: r.reviewedAt,
        decisionNote: r.decisionNote,
      });
    }
    return out;
  }

  async respondToRequest(requestId, adminId, { approve, durationHours = 48, expiresAt: expiresAtInput, note } = {}) {
    const request = await models.CohortReviewUnlockRequest.findByPk(requestId);
    if (!request) throw new NotFoundError('Unlock request not found');
    if (request.status !== 'pending') throw new ValidationError('This request has already been handled.');

    request.reviewedBy = adminId || null;
    request.reviewedAt = new Date();
    request.decisionNote = (note || '').trim() || null;

    if (approve) {
      request.status = 'approved';
      await request.save();

      // Either a preset duration OR an exact expiry (ISO instant from the admin's
      // local date/time picker). The instant is timezone-correct because the
      // client sends a UTC ISO string.
      let expiresAt;
      if (expiresAtInput) {
        expiresAt = new Date(expiresAtInput);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
          throw new ValidationError('The access window must end at a valid time in the future.');
        }
      } else {
        const hours = Number(durationHours) > 0 ? Number(durationHours) : 48;
        expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
      }
      const grant = await models.CohortReviewUnlockGrant.create({
        mentorId: request.mentorId,
        grantedBy: adminId || null,
        requestId: request.id,
        reason: request.reason,
        expiresAt,
      });

      createAuditLog({
        userId: adminId,
        action: 'REVIEW_UNLOCK_GRANTED',
        entityType: 'cohort_review_unlock_grant',
        entityId: grant.id,
        newValues: { mentorId: request.mentorId, requestId: request.id, expiresAt },
      }).catch(() => {});

      this._notifyMentor(request.mentorId, true, { grant, note: request.decisionNote }).catch(() => {});
      return { request, grant };
    }

    request.status = 'declined';
    await request.save();

    createAuditLog({
      userId: adminId,
      action: 'REVIEW_UNLOCK_DECLINED',
      entityType: 'cohort_review_unlock_request',
      entityId: request.id,
      newValues: { mentorId: request.mentorId, note: request.decisionNote },
    }).catch(() => {});

    this._notifyMentor(request.mentorId, false, { note: request.decisionNote }).catch(() => {});
    return { request };
  }

  async _notifyMentor(mentorId, approved, { grant, note } = {}) {
    // Format the expiry in the MENTOR's own timezone (with its label) so the
    // baked-in notification text is correct for them, not the server.
    let expiresText = '';
    if (grant?.expiresAt) {
      const tz = (await models.UserSettings.findOne({ where: { userId: mentorId }, attributes: ['timezone'] }))?.timezone || 'UTC';
      try {
        expiresText = new Date(grant.expiresAt).toLocaleString('en-US', {
          timeZone: tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
        });
      } catch { expiresText = new Date(grant.expiresAt).toISOString(); }
    }
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.REVIEW_UNLOCK_HANDLED,
      recipients: [{ userId: mentorId }],
      payload: {
        title: approved ? 'Review-edit access granted' : 'Review-edit request declined',
        message: approved
          ? `An admin granted you temporary access to edit or delete your cohort-review records${expiresText ? ` until ${expiresText}` : ''}.${note ? ` Note: ${note}` : ''}`
          : `An admin declined your request to edit or delete a cohort-review record.${note ? ` Note: ${note}` : ''}`,
        actionUrl: '/mentor/review',
        actionLabel: 'Open review',
        relatedEntityType: approved ? 'cohort_review_unlock_grant' : 'cohort_review_unlock_declined',
        relatedEntityId: approved ? grant?.id : mentorId,
      },
    });
  }

  // ── admin: grants ────────────────────────────────────────────────────────────
  async listGrants({ active } = {}) {
    const grants = await models.CohortReviewUnlockGrant.findAll({
      include: [{ model: models.User, as: 'mentor', attributes: ['id', 'firstName', 'lastName'] }],
      order: [['created_at', 'DESC']],
    });
    const now = Date.now();
    const mapped = [];
    for (const g of grants) {
      const isActive = !g.revokedAt && new Date(g.expiresAt).getTime() > now;
      const clanName = g.mentor ? await this._leadClanName(g.mentor.id) : null;
      mapped.push({
        id: g.id,
        mentor: g.mentor
          ? { id: g.mentor.id, name: `${g.mentor.firstName || ''} ${g.mentor.lastName || ''}`.trim(), clanName }
          : null,
        reason: g.reason,
        expiresAt: g.expiresAt,
        revokedAt: g.revokedAt,
        createdAt: g.createdAt,
        active: isActive,
      });
    }
    if (active === true || String(active) === 'true') return mapped.filter((g) => g.active);
    return mapped;
  }

  async revokeGrant(grantId, adminId) {
    const grant = await models.CohortReviewUnlockGrant.findByPk(grantId);
    if (!grant) throw new NotFoundError('Grant not found');
    if (!grant.revokedAt) {
      grant.revokedAt = new Date();
      await grant.save();
    }
    createAuditLog({
      userId: adminId,
      action: 'REVIEW_UNLOCK_REVOKED',
      entityType: 'cohort_review_unlock_grant',
      entityId: grant.id,
      newValues: { mentorId: grant.mentorId },
    }).catch(() => {});
    return { revoked: true };
  }

  // ── views ────────────────────────────────────────────────────────────────────
  async getLockStateForMentor(mentorId) {
    const [locked, grant, pending] = await Promise.all([
      this.isDeleteLocked(),
      this.hasActiveGrant(mentorId),
      models.CohortReviewUnlockRequest.findOne({
        where: { mentorId, status: 'pending' },
        attributes: ['id', 'createdAt'],
        order: [['created_at', 'DESC']],
      }),
    ]);
    return {
      locked,
      hasActiveGrant: Boolean(grant),
      grantExpiresAt: grant ? grant.expiresAt : null,
      pendingRequest: pending ? { id: pending.id, createdAt: pending.createdAt } : null,
    };
  }

  async lockOverview() {
    const now = new Date();
    const [locked, pendingRequests, activeGrants] = await Promise.all([
      this.isDeleteLocked(),
      models.CohortReviewUnlockRequest.count({ where: { status: 'pending' } }),
      models.CohortReviewUnlockGrant.count({ where: { revokedAt: null, expiresAt: { [Op.gt]: now } } }),
    ]);
    return { locked, pendingRequests, activeGrants };
  }

  async recentLogs({ page = 1, limit = 10 } = {}) {
    const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 10));
    const parsedPage = Math.max(1, Number(page) || 1);
    const { rows, count } = await models.AuditLog.findAndCountAll({
      where: { action: { [Op.like]: 'REVIEW_%' } },
      include: [{ model: models.User, as: 'user', attributes: ['firstName', 'lastName'] }],
      order: [['created_at', 'DESC']],
      limit: parsedLimit,
      offset: (parsedPage - 1) * parsedLimit,
    });
    const labels = {
      REVIEW_LOCK_ENABLED: 'Enabled deletion lock',
      REVIEW_LOCK_DISABLED: 'Disabled deletion lock',
      REVIEW_UNLOCK_REQUESTED: 'Requested unlock',
      REVIEW_UNLOCK_GRANTED: 'Granted unlock',
      REVIEW_UNLOCK_DECLINED: 'Declined unlock',
      REVIEW_UNLOCK_REVOKED: 'Revoked grant',
      REVIEW_SESSION_DELETED: 'Deleted review session',
    };
    const logs = rows.map((r) => ({
      action: r.action,
      userName: r.user ? `${r.user.firstName || ''} ${r.user.lastName || ''}`.trim() : 'System',
      detail: labels[r.action] || r.action,
      createdAt: r.createdAt,
    }));
    return { logs, total: count, page: parsedPage, limit: parsedLimit };
  }
}

module.exports = new CohortReviewLockService();

const crypto = require('crypto');
const { Op } = require('sequelize');
const { models } = require('../db');
const {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
  AuthorizationError
} = require('../utils/errors/errorTypes');
const { createAuditLog } = require('../utils/auditContext');
const authzService = require('./authzService');
const clanService = require('./clanService');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');

const ACTIVE_MENTEE_STATUSES = ['active', 'paused'];

function buildJoinUrl(slug) {
  const base = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].replace(/\/$/, '');
  return `${base}/clan/join/${slug}`;
}

async function mintUniqueSlug() {
  for (let i = 0; i < 8; i += 1) {
    const slug = crypto.randomBytes(9).toString('base64url');
    const clash = await models.Clan.findOne({ where: { publicJoinSlug: slug }, attributes: ['id'] });
    if (!clash) return slug;
  }
  throw new ValidationError('Could not generate a unique joining link, try again');
}

class ClanPublicJoinService {
  serializeState(clan, { includeUrl = false } = {}) {
    const linkExists = Boolean(clan.publicJoinSlug);
    const usable = Boolean(
      clan.publicJoinAllowed
      && clan.publicJoinEnabled
      && clan.publicJoinSlug
      && clan.status === 'active'
    );
    return {
      publicJoinAllowed: Boolean(clan.publicJoinAllowed),
      publicJoinEnabled: Boolean(clan.publicJoinEnabled),
      publicJoinLinkExists: linkExists,
      publicJoinUsable: usable,
      publicJoinUrl: includeUrl && linkExists ? buildJoinUrl(clan.publicJoinSlug) : null
    };
  }

  async _loadClan(clanId, transaction) {
    const clan = await models.Clan.findByPk(clanId, {
      include: [
        { model: models.Program, as: 'program', attributes: ['id', 'name', 'status'] }
      ],
      transaction
    });
    if (!clan) throw new NotFoundError('Clan not found');
    return clan;
  }

  /**
   * Current Clan Lead Mentor only (pointer on Clan). Admins / co-mentors are not leads.
   */
  async assertCurrentLeadMentor(user, clan) {
    if (!user?.id || !clan?.leadMentorId || clan.leadMentorId !== user.id) {
      throw new ForbiddenError('Only the current Clan Lead Mentor can perform this action');
    }
  }

  async assertAdminCanManageClanAccess(user, clan, opts = {}) {
    const assignments = opts.assignments;
    // Clan lead mentors hold clan.manage_members but must never grant this feature.
    if (!(await authzService.hasAdminAccess(user, { assignments }))) {
      throw new ForbiddenError('Only an administrator can grant or remove public joining access');
    }
    await authzService.assertProgramInScope(user, clan.programId, { assignments });
  }

  async countMentees(clanId, transaction) {
    return models.ClanMembership.count({
      where: {
        clanId,
        role: 'mentee',
        status: { [Op.in]: ACTIVE_MENTEE_STATUSES }
      },
      transaction
    });
  }

  async isActiveMenteeOfClan(userId, clanId, transaction) {
    const row = await models.ClanMembership.findOne({
      where: {
        userId,
        clanId,
        role: 'mentee',
        status: { [Op.in]: ACTIVE_MENTEE_STATUSES }
      },
      attributes: ['id'],
      transaction
    });
    return Boolean(row);
  }

  async findOtherMenteePlacement(userId, clanId, transaction) {
    return models.ClanMembership.findOne({
      where: {
        userId,
        role: 'mentee',
        status: { [Op.in]: ACTIVE_MENTEE_STATUSES },
        clanId: { [Op.ne]: clanId }
      },
      include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name'] }],
      transaction
    });
  }

  /**
   * Resolve a public slug. Never throws for "not allowed" — callers map !open to 404.
   */
  async resolveBySlug(slug) {
    if (!slug || typeof slug !== 'string') {
      return { clan: null, open: false, reasons: ['invalid'] };
    }
    const clan = await models.Clan.findOne({
      where: { publicJoinSlug: slug },
      include: [
        { model: models.Program, as: 'program', attributes: ['id', 'name', 'status'] }
      ]
    });
    if (!clan) return { clan: null, open: false, reasons: ['not_found'] };

    const reasons = [];
    if (!clan.publicJoinAllowed) reasons.push('not_allowed');
    if (!clan.publicJoinEnabled) reasons.push('disabled');
    if (clan.status !== 'active') reasons.push('clan_inactive');
    if (!clan.publicJoinSlug) reasons.push('no_slug');

    const menteeCount = await this.countMentees(clan.id);
    const max = clan.maxMentees == null ? null : Number(clan.maxMentees);
    const full = max != null && menteeCount >= max;
    if (full) reasons.push('full');

    return {
      clan,
      open: reasons.length === 0,
      reasons,
      menteeCount,
      seatsRemaining: max == null ? null : Math.max(0, max - menteeCount)
    };
  }

  async requireOpenBySlug(slug) {
    const resolved = await this.resolveBySlug(slug);
    if (!resolved.open || !resolved.clan) {
      throw new NotFoundError('This clan joining link is invalid or no longer available.');
    }
    return resolved;
  }

  // ── Admin access ──────────────────────────────────────────────────────────

  async setPublicJoinAccess(clanId, allowed, actor) {
    const clan = await this._loadClan(clanId);
    await this.assertAdminCanManageClanAccess(actor, clan);

    const next = Boolean(allowed);
    clan.publicJoinAllowed = next;
    if (!next) {
      // Immediately disable activation; keep slug for audit/history.
      clan.publicJoinEnabled = false;
    }
    await clan.save();

    await createAuditLog({
      userId: actor.id,
      action: next ? 'clan.public_join.access_granted' : 'clan.public_join.access_removed',
      entityType: 'clan',
      entityId: clan.id,
      metadata: { publicJoinAllowed: next }
    });

    return this.serializeState(clan, { includeUrl: false });
  }

  async getPublicJoinState(clanId, actor) {
    const clan = await this._loadClan(clanId);
    const isLead = clan.leadMentorId === actor.id;
    let isAdmin = false;
    try {
      await this.assertAdminCanManageClanAccess(actor, clan);
      isAdmin = true;
    } catch (_) {
      isAdmin = false;
    }
    if (!isLead && !isAdmin) {
      throw new ForbiddenError('You do not have permission to view public joining settings for this clan');
    }

    // Lead may see the URL only when admin has granted access.
    const includeUrl = Boolean(clan.publicJoinAllowed) && (isLead || isAdmin);
    return {
      clanId: clan.id,
      clanName: clan.name,
      ...this.serializeState(clan, { includeUrl })
    };
  }

  // ── Lead link management ──────────────────────────────────────────────────

  async generateOrEnableLink(clanId, actor) {
    const clan = await this._loadClan(clanId);
    await this.assertCurrentLeadMentor(actor, clan);
    if (!clan.publicJoinAllowed) {
      throw new ForbiddenError('Public joining has not been enabled for this clan by an administrator');
    }
    if (clan.status !== 'active') {
      throw new ValidationError('Public joining is only available while the clan is active');
    }

    if (!clan.publicJoinSlug) {
      clan.publicJoinSlug = await mintUniqueSlug();
    }
    clan.publicJoinEnabled = true;
    await clan.save();

    await createAuditLog({
      userId: actor.id,
      action: 'clan.public_join.link_enabled',
      entityType: 'clan',
      entityId: clan.id,
      metadata: { slugPrefix: clan.publicJoinSlug.slice(0, 4) }
    });

    return this.serializeState(clan, { includeUrl: true });
  }

  async disableLink(clanId, actor) {
    const clan = await this._loadClan(clanId);
    await this.assertCurrentLeadMentor(actor, clan);
    if (!clan.publicJoinAllowed) {
      throw new ForbiddenError('Public joining has not been enabled for this clan by an administrator');
    }

    clan.publicJoinEnabled = false;
    await clan.save();

    await createAuditLog({
      userId: actor.id,
      action: 'clan.public_join.link_disabled',
      entityType: 'clan',
      entityId: clan.id
    });

    return this.serializeState(clan, { includeUrl: true });
  }

  async regenerateLink(clanId, actor) {
    const clan = await this._loadClan(clanId);
    await this.assertCurrentLeadMentor(actor, clan);
    if (!clan.publicJoinAllowed) {
      throw new ForbiddenError('Public joining has not been enabled for this clan by an administrator');
    }
    if (clan.status !== 'active') {
      throw new ValidationError('Public joining is only available while the clan is active');
    }

    const previous = clan.publicJoinSlug;
    clan.publicJoinSlug = await mintUniqueSlug();
    clan.publicJoinEnabled = true;
    await clan.save();

    await createAuditLog({
      userId: actor.id,
      action: 'clan.public_join.link_regenerated',
      entityType: 'clan',
      entityId: clan.id,
      metadata: {
        previousPrefix: previous ? previous.slice(0, 4) : null,
        slugPrefix: clan.publicJoinSlug.slice(0, 4)
      }
    });

    return this.serializeState(clan, { includeUrl: true });
  }

  // ── Public surface ────────────────────────────────────────────────────────

  async getViewerStatus(clanId, userId) {
    if (!userId) return 'anonymous';
    if (await this.isActiveMenteeOfClan(userId, clanId)) return 'already_member';
    const pending = await models.ClanJoinRequest.findOne({
      where: { clanId, userId, status: 'pending' },
      attributes: ['id']
    });
    if (pending) return 'pending';
    const other = await this.findOtherMenteePlacement(userId, clanId);
    if (other) return 'member_elsewhere';
    // Mentors of this clan should not join as mentee via public link.
    const mentorHere = await models.ClanMembership.findOne({
      where: {
        clanId,
        userId,
        status: 'active',
        role: { [Op.in]: ['lead_mentor', 'co_mentor', 'core_team'] }
      },
      attributes: ['id']
    });
    if (mentorHere) return 'mentor_of_clan';
    return 'eligible';
  }

  async getPublicClanInfo(slug, viewerUserId = null) {
    const resolved = await this.requireOpenBySlug(slug);
    const { clan, menteeCount, seatsRemaining } = resolved;
    const viewerStatus = await this.getViewerStatus(clan.id, viewerUserId);

    return {
      token: clan.publicJoinSlug,
      clan: {
        name: clan.name,
        description: clan.description || null,
        maxMentees: clan.maxMentees,
        menteeCount,
        seatsRemaining
      },
      program: clan.program
        ? { name: clan.program.name }
        : null,
      joining: {
        requiresApproval: true,
        message: 'Anyone with this link can request to join. The Clan Lead Mentor must approve the request before membership is granted.'
      },
      viewerStatus
    };
  }

  /**
   * Details for the registration page when using a public clan join slug.
   * Safe subset only; still 404s if the link is not currently usable.
   */
  async getRegistrationDetailsForSlug(slug) {
    const resolved = await this.requireOpenBySlug(slug);
    const { clan } = resolved;
    return {
      role: 'mentee',
      emailLocked: false,
      program: clan.program ? { id: clan.program.id, name: clan.program.name } : null,
      clan: { id: clan.id, name: clan.name },
      requiresApproval: true,
      joinPath: `/clan/join/${clan.publicJoinSlug}`
    };
  }

  async createJoinRequest(slug, user, { message } = {}) {
    if (!user?.id) throw new AuthorizationError('Authentication required');
    if (user.status && user.status !== 'active') {
      throw new ForbiddenError('Your account cannot submit join requests');
    }

    const resolved = await this.requireOpenBySlug(slug);
    const clan = resolved.clan;

    if (await this.isActiveMenteeOfClan(user.id, clan.id)) {
      throw new ConflictError('You are already a member of this clan.');
    }

    const other = await this.findOtherMenteePlacement(user.id, clan.id);
    if (other) {
      throw new ConflictError(
        `You are already a mentee of "${other.clan?.name || 'another clan'}". A person can be a mentee of only one clan at a time.`
      );
    }

    const mentorHere = await models.ClanMembership.findOne({
      where: {
        clanId: clan.id,
        userId: user.id,
        status: 'active',
        role: { [Op.in]: ['lead_mentor', 'co_mentor', 'core_team'] }
      },
      attributes: ['id']
    });
    if (mentorHere) {
      throw new ConflictError('You already have a mentor role in this clan and cannot join as a mentee via this link.');
    }

    const existingPending = await models.ClanJoinRequest.findOne({
      where: { clanId: clan.id, userId: user.id, status: 'pending' }
    });
    if (existingPending) {
      throw new ConflictError('Your request to join this clan is already pending.');
    }

    if (resolved.reasons?.includes('full') || (resolved.seatsRemaining != null && resolved.seatsRemaining <= 0)) {
      throw new ConflictError('This clan is currently full and is not accepting new join requests.');
    }

    let request;
    try {
      request = await models.ClanJoinRequest.create({
        clanId: clan.id,
        userId: user.id,
        status: 'pending',
        source: 'public_link',
        message: message ? String(message).trim().slice(0, 2000) : null
      });
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        throw new ConflictError('Your request to join this clan is already pending.');
      }
      throw error;
    }

    await createAuditLog({
      userId: user.id,
      action: 'clan.public_join.request_created',
      entityType: 'clan_join_request',
      entityId: request.id,
      metadata: { clanId: clan.id }
    });

    this._notifyLeadOfJoinRequest({ clan, requester: user, request }).catch((e) =>
      console.warn('clan join request notify failed:', e.message)
    );

    return this.serializeRequest(request);
  }

  serializeRequest(row, extras = {}) {
    const item = row.toJSON ? row.toJSON() : row;
    return {
      id: item.id,
      clanId: item.clanId,
      userId: item.userId,
      status: item.status,
      source: item.source,
      message: item.message || null,
      resolutionNote: item.resolutionNote || null,
      reviewedBy: item.reviewedBy || null,
      reviewedAt: item.reviewedAt || null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      ...extras
    };
  }

  async listJoinRequests(clanId, actor, { status } = {}) {
    const clan = await this._loadClan(clanId);
    await this.assertCurrentLeadMentor(actor, clan);

    const where = { clanId };
    if (status) where.status = status;

    const rows = await models.ClanJoinRequest.findAll({
      where,
      include: [{
        model: models.User,
        as: 'user',
        attributes: ['id', 'firstName', 'lastName', 'email']
      }],
      order: [['createdAt', 'ASC']]
    });

    return rows.map((row) => this.serializeRequest(row, {
      user: row.user
        ? {
            id: row.user.id,
            firstName: row.user.firstName,
            lastName: row.user.lastName,
            email: row.user.email
          }
        : null
    }));
  }

  async approveJoinRequest(clanId, requestId, actor) {
    const clan = await this._loadClan(clanId);
    await this.assertCurrentLeadMentor(actor, clan);

    const request = await models.ClanJoinRequest.findOne({ where: { id: requestId, clanId } });
    if (!request) throw new NotFoundError('Join request not found');
    if (request.status !== 'pending') {
      throw new ConflictError(`This join request is already ${request.status}`);
    }

    const user = await models.User.findByPk(request.userId);
    if (!user || user.status !== 'active') {
      throw new ValidationError('This user is no longer eligible to join');
    }

    if (await this.isActiveMenteeOfClan(user.id, clanId)) {
      request.status = 'approved';
      request.reviewedBy = actor.id;
      request.reviewedAt = new Date();
      request.resolutionNote = request.resolutionNote || 'Already a member';
      await request.save();
      return { request: this.serializeRequest(request), membership: null, alreadyMember: true };
    }

    const other = await this.findOtherMenteePlacement(user.id, clanId);
    if (other) {
      throw new ConflictError(
        `This person is already a mentee of "${other.clan?.name || 'another clan'}". Reassign them instead.`
      );
    }

    const menteeCount = await this.countMentees(clanId);
    if (clan.maxMentees != null && menteeCount >= clan.maxMentees) {
      throw new ConflictError('This clan is at capacity. Free a seat before approving.');
    }

    // Re-check lead still current at approval time.
    const freshClan = await models.Clan.findByPk(clanId);
    if (!freshClan || freshClan.leadMentorId !== actor.id) {
      throw new ForbiddenError('Only the current Clan Lead Mentor can approve join requests');
    }

    // Atomic claim: only one approver wins if two hit at once.
    const [claimed] = await models.ClanJoinRequest.update(
      {
        status: 'approved',
        reviewedBy: actor.id,
        reviewedAt: new Date()
      },
      { where: { id: requestId, clanId, status: 'pending' } }
    );
    if (!claimed) {
      throw new ConflictError('This join request was already processed');
    }

    let membership;
    try {
      membership = await clanService.addMember(
        clanId,
        { userId: user.id, role: 'mentee' },
        actor
      );
    } catch (error) {
      // Roll request back to pending so the lead can retry after fixing the issue,
      // unless membership already exists for this clan (treat as success).
      if (error instanceof ConflictError && /already a mentee of this clan/i.test(error.message)) {
        await request.reload();
        return { request: this.serializeRequest(request), membership: null, alreadyMember: true };
      }
      await models.ClanJoinRequest.update(
        {
          status: 'pending',
          reviewedBy: null,
          reviewedAt: null
        },
        { where: { id: requestId, clanId, status: 'approved' } }
      );
      throw error;
    }

    await createAuditLog({
      userId: actor.id,
      action: 'clan.public_join.request_approved',
      entityType: 'clan_join_request',
      entityId: request.id,
      metadata: { clanId, userId: user.id }
    });

    await request.reload();

    this._notifyRequesterDecision({
      userId: user.id,
      clan,
      approved: true
    }).catch((e) => console.warn('join approve notify failed:', e.message));

    return { request: this.serializeRequest(request), membership, alreadyMember: false };
  }

  async rejectJoinRequest(clanId, requestId, actor, { note } = {}) {
    const clan = await this._loadClan(clanId);
    await this.assertCurrentLeadMentor(actor, clan);

    const request = await models.ClanJoinRequest.findOne({ where: { id: requestId, clanId } });
    if (!request) throw new NotFoundError('Join request not found');
    if (request.status !== 'pending') {
      throw new ConflictError(`This join request is already ${request.status}`);
    }

    request.status = 'rejected';
    request.reviewedBy = actor.id;
    request.reviewedAt = new Date();
    request.resolutionNote = note ? String(note).trim().slice(0, 2000) : null;
    await request.save();

    await createAuditLog({
      userId: actor.id,
      action: 'clan.public_join.request_rejected',
      entityType: 'clan_join_request',
      entityId: request.id,
      metadata: { clanId, userId: request.userId }
    });

    this._notifyRequesterDecision({
      userId: request.userId,
      clan,
      approved: false
    }).catch((e) => console.warn('join reject notify failed:', e.message));

    return this.serializeRequest(request);
  }

  async _notifyLeadOfJoinRequest({ clan, requester, request }) {
    if (!clan.leadMentorId) return;
    const name = `${requester.firstName || ''} ${requester.lastName || ''}`.trim() || requester.email;
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.CLAN_JOIN_REQUEST_RECEIVED,
      recipients: [{ userId: clan.leadMentorId }],
      payload: {
        title: 'New clan join request',
        message: `${name} requested to join your clan "${clan.name}".`,
        actionUrl: '/mentor/clan-team',
        actionLabel: 'Review request',
        relatedEntityType: 'clan_join_request',
        relatedEntityId: request.id
      }
    });
  }

  async _notifyRequesterDecision({ userId, clan, approved }) {
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.CLAN_JOIN_REQUEST_DECIDED,
      recipients: [{ userId }],
      payload: {
        title: approved ? 'Clan join request approved' : 'Clan join request rejected',
        message: approved
          ? `Your request to join "${clan.name}" was approved.`
          : `Your request to join "${clan.name}" was not approved.`,
        actionUrl: approved ? '/mentee/dashboard' : '/mentee/dashboard',
        actionLabel: 'Open PathMent',
        relatedEntityType: 'clan',
        relatedEntityId: clan.id
      }
    });
  }
}

module.exports = new ClanPublicJoinService();
module.exports.ClanPublicJoinService = ClanPublicJoinService;
module.exports.buildJoinUrl = buildJoinUrl;

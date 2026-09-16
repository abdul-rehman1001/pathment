const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');
const authzService = require('./authzService');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { PERMISSIONS } = require('../config/permissions');
const { VISIBLE_MEMBERSHIP_STATUSES } = require('../config/membership');
const logger = require('../utils/logger');

/**
 * Mentor sign-off on AI-assigned certificate tiers.
 *
 * The AI grades from the record: points, completion, on-time rate, blockers,
 * attendance. It cannot know that somebody carried the clan through a bad
 * month, or that a strong-looking score came from work a mentor had already
 * flagged. So a human who actually knows the person confirms the grade — or
 * changes it — before anything is issued.
 *
 * The shape of the round:
 *
 *   open()      after an AI run, one pending row per graded mentee, routed to
 *               the mentors of that mentee's clan, with a deadline
 *   verify()    the mentor confirms or overrides; an override keeps the AI's
 *               original tier beside the new one so the change stays visible
 *   summary()   what the admin sees: which clans are done, which are overdue
 *
 * The deadline is a NUDGE, never a gate. Nothing issues on its own when it
 * passes and the admin is never blocked — they are told, and they decide. A
 * workflow that silently issued the wrong grade because nobody looked would be
 * worse than one that issues late.
 */
class CertificateVerificationService {
  /** Clan roles that can sign off on a clan's certificates. */
  static MENTOR_ROLES = ['lead_mentor', 'co_mentor'];

  /**
   * Open (or refresh) the review round for a template's AI results.
   *
   * Re-running the AI updates each person's row in place rather than stacking a
   * second opinion beside the first — but a row the mentor has ALREADY verified
   * keeps their decision. Re-grading must not quietly undo a human's sign-off.
   */
  async open(templateId, results, { deadline = null, notify = true } = {}) {
    if (!Array.isArray(results) || results.length === 0) return { created: 0, updated: 0, notified: 0 };

    const template = await models.CertificateTemplate.findByPk(templateId);
    if (!template) throw new NotFoundError('Certificate template not found');

    if (deadline) {
      template.verificationDeadline = deadline;
      await template.save();
    }

    const menteeIds = [...new Set(results.map((r) => r.mentee_id || r.id).filter(Boolean))];
    const clanByMentee = await this._clanOfMentees(menteeIds, template.programId);

    let created = 0;
    let updated = 0;
    for (const result of results) {
      const menteeId = result.mentee_id || result.id;
      if (!menteeId) continue;

      const aiTier = result.certificate_tier || null;
      const aiMatchScore = Number.isFinite(Number(result.match_score)) ? Number(result.match_score) : null;
      const existing = await models.CertificateVerification.findOne({ where: { templateId, menteeId } });

      if (!existing) {
        await models.CertificateVerification.create({
          templateId,
          menteeId,
          clanId: clanByMentee.get(menteeId) || null,
          aiTier,
          aiMatchScore,
          finalTier: aiTier,
          status: 'pending'
        });
        created += 1;
        continue;
      }

      // A verified row is a human decision. Record what the AI now thinks, but
      // do not reopen it or move their final tier.
      existing.aiTier = aiTier;
      existing.aiMatchScore = aiMatchScore;
      existing.clanId = clanByMentee.get(menteeId) || existing.clanId;
      if (existing.status !== 'verified') {
        existing.finalTier = aiTier;
        existing.overridden = false;
      }
      await existing.save();
      updated += 1;
    }

    const notified = notify ? await this._notifyMentors(template) : 0;
    return { created, updated, notified };
  }

  /**
   * The admin hands a template's grades to the clans that must sign them off.
   *
   * Explicit rather than automatic. Grading and asking people to review are two
   * different decisions: an admin often runs the AI more than once while tuning
   * the criteria, and mailing every mentor on each run would train them to
   * ignore the notification. So the round opens when the admin says so, and
   * they set the deadline when they know their own cycle.
   *
   * Sending again is a reminder, not a reset — already-signed-off rows keep
   * their decision (see `open`).
   */
  async sendToClans(templateId, { deadline = null, clanIds = null } = {}, user) {
    const template = await models.CertificateTemplate.findByPk(templateId);
    if (!template) throw new NotFoundError('Certificate template not found');

    const results = Array.isArray(template.aiEvaluation?.results) ? template.aiEvaluation.results : [];
    if (!results.length) {
      throw new ValidationError('Run the AI evaluation first — there are no grades to review yet.');
    }

    // An admin can send to a subset of clans; everyone else is confined to
    // the clans they may sign off in anyway.
    let scopedResults = results;
    if (Array.isArray(clanIds) && clanIds.length) {
      const menteeIds = results.map((r) => r.mentee_id || r.id).filter(Boolean);
      const clanOf = await this._clanOfMentees(menteeIds, template.programId);
      const wanted = new Set(clanIds);
      scopedResults = results.filter((r) => wanted.has(clanOf.get(r.mentee_id || r.id)));
    }

    const round = await this.open(templateId, scopedResults, { deadline, notify: true });
    logger.info('[certificateVerification] round sent to clans', {
      templateId, by: user?.id, ...round
    });
    return round;
  }

  /**
   * The mentees this user must sign off on for a template, with what the AI
   * proposed and what has been decided so far.
   */
  async listForReviewer(templateId, user, { clanId = null } = {}) {
    const template = await models.CertificateTemplate.findByPk(templateId);
    if (!template) throw new NotFoundError('Certificate template not found');

    const where = { templateId };
    const isAdmin = await authzService.hasAdminAccess(user);
    if (!isAdmin) {
      const clanIds = await this._reviewableClanIds(user, template.programId, clanId);
      if (!clanIds.length) return { template: this._templateSummary(template), rows: [], clans: [] };
      where.clanId = { [Op.in]: clanIds };
    } else if (clanId) {
      where.clanId = clanId;
    }

    const rows = await models.CertificateVerification.findAll({
      where,
      include: [
        { model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl'] },
        { model: models.User, as: 'verifier', attributes: ['id', 'firstName', 'lastName'], required: false },
        { model: models.Clan, as: 'clan', attributes: ['id', 'name'], required: false }
      ],
      order: [['createdAt', 'ASC']]
    });

    // Whether each clan in this queue has been released, so the mentor's screen
    // can say "signed off, waiting on the admin" rather than leaving them
    // wondering why there is no send button.
    const approved = await this.approvedClanIds(templateId);
    const clanIdsInQueue = [...new Set(rows.map((r) => r.clanId).filter(Boolean))];
    const clanState = clanIdsInQueue.map((id) => {
      const forClan = rows.filter((r) => r.clanId === id);
      return {
        clanId: id,
        clanName: forClan[0]?.clan?.name || null,
        pending: forClan.filter((r) => r.status !== 'verified').length,
        verified: forClan.filter((r) => r.status === 'verified').length,
        approved: approved.has(id),
        canSend: approved.has(id)
      };
    });

    return {
      template: this._templateSummary(template),
      rows: rows.map((r) => this._serialize(r)),
      clans: clanState
    };
  }

  /**
   * Record a decision for one mentee.
   *
   * `finalTier` omitted means "the AI had it right". Supplying a different tier
   * is an override: the AI's tier is preserved alongside it so the admin can
   * see what was changed, by whom and why.
   */
  async verify(templateId, menteeId, { finalTier = null, reason = null } = {}, user) {
    const row = await models.CertificateVerification.findOne({ where: { templateId, menteeId } });
    if (!row) throw new NotFoundError('There is nothing to verify for this mentee');
    await this._assertCanReview(user, row);

    const template = await models.CertificateTemplate.findByPk(templateId);
    const tier = finalTier || row.aiTier;
    if (tier) this._assertTierExists(template, tier);

    const overridden = Boolean(tier && row.aiTier && tier !== row.aiTier);
    if (overridden && !String(reason || '').trim()) {
      // An override is a mentor disagreeing with the evidence. The admin
      // reviewing it later needs to know why, and so does the mentor in three
      // months — so the reason is required rather than merely invited.
      throw new ValidationError('Tell us why you are changing this grade.');
    }

    row.finalTier = tier;
    row.overridden = overridden;
    row.overrideReason = overridden ? String(reason).trim() : null;
    row.status = 'verified';
    row.verifiedBy = user.id;
    row.verifiedAt = new Date();
    await row.save();

    await this._notifyAdminsIfClanComplete(templateId, row.clanId, user);
    return this._serialize(row);
  }

  /** Sign off several at once — "these all look right" is the common case. */
  async verifyMany(templateId, decisions, user) {
    if (!Array.isArray(decisions) || !decisions.length) {
      throw new ValidationError('Nothing to verify');
    }
    const out = [];
    for (const decision of decisions) {
      out.push(await this.verify(
        templateId, decision.menteeId,
        { finalTier: decision.finalTier, reason: decision.reason },
        user
      ));
    }
    return { verified: out.length, rows: out };
  }

  /**
   * What the admin sees before issuing: per-clan progress, overrides, and
   * whether the deadline has passed. Never blocks — it informs.
   */
  async summary(templateId) {
    const template = await models.CertificateTemplate.findByPk(templateId);
    if (!template) throw new NotFoundError('Certificate template not found');

    const [rows, approvedClans] = await Promise.all([
      models.CertificateVerification.findAll({
        where: { templateId },
        include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name'], required: false }]
      }),
      this.approvedClanIds(templateId)
    ]);

    const byClan = new Map();
    for (const row of rows) {
      const key = row.clanId || 'unassigned';
      if (!byClan.has(key)) {
        byClan.set(key, {
          clanId: row.clanId || null,
          clanName: row.clan?.name || 'No clan',
          total: 0, verified: 0, pending: 0, overridden: 0
        });
      }
      const bucket = byClan.get(key);
      bucket.total += 1;
      if (row.status === 'verified') bucket.verified += 1; else bucket.pending += 1;
      if (row.overridden) bucket.overridden += 1;
    }

    const clans = [...byClan.values()].map((c) => ({
      ...c,
      complete: c.pending === 0,
      // Released by the admin — this is what lets the clan's mentors send.
      approved: Boolean(c.clanId && approvedClans.has(c.clanId)),
      // Verified but not released: the admin's move.
      readyToApprove: c.pending === 0 && !(c.clanId && approvedClans.has(c.clanId))
    }));
    const deadline = template.verificationDeadline || null;

    return {
      deadline,
      overdue: Boolean(deadline && new Date(deadline) < new Date() && clans.some((c) => !c.complete)),
      total: rows.length,
      verified: rows.filter((r) => r.status === 'verified').length,
      pending: rows.filter((r) => r.status !== 'verified').length,
      overridden: rows.filter((r) => r.overridden).length,
      allVerified: rows.length > 0 && rows.every((r) => r.status === 'verified'),
      approvedClans: clans.filter((c) => c.approved).length,
      awaitingApproval: clans.filter((c) => c.readyToApprove).length,
      clans: clans.sort((a, b) => a.clanName.localeCompare(b.clanName))
    };
  }

  /**
   * The admin releases a clan: its certificates may now be sent.
   *
   * Separate from verification on purpose. A clan finishing its review says the
   * grades are right; it does not say the cohort is ready to receive anything —
   * the admin may be waiting on a ceremony date, a sponsor, or the other clans.
   * So mentors can review the moment they are asked, and can only SEND once
   * this has happened.
   *
   * An admin may release a clan whose mentors have not finished. They are never
   * blocked — but it is recorded as such, because "we shipped before anyone
   * checked" is a thing somebody will need to know later.
   */
  async approveClan(templateId, clanId, { note = null } = {}, user) {
    const template = await models.CertificateTemplate.findByPk(templateId);
    if (!template) throw new NotFoundError('Certificate template not found');
    if (!clanId) throw new ValidationError('A clan is required');

    if (!(await authzService.hasAdminAccess(user))) {
      throw new ForbiddenError('Only an admin can release a clan for issuing');
    }

    const pending = await models.CertificateVerification.count({
      where: { templateId, clanId, status: 'pending' }
    });

    const [approval] = await models.CertificateClanApproval.findOrCreate({
      where: { templateId, clanId },
      defaults: {
        templateId,
        clanId,
        approvedBy: user.id,
        approvedAt: new Date(),
        approvedBeforeVerified: pending > 0,
        note
      }
    });

    await this._notifyClanApproved(templateId, clanId);
    return {
      clanId,
      approvedAt: approval.approvedAt,
      approvedBeforeVerified: approval.approvedBeforeVerified,
      outstandingAtApproval: pending
    };
  }

  /** Take a clan's release back — nothing more can be sent until it returns. */
  async revokeClanApproval(templateId, clanId, user) {
    if (!(await authzService.hasAdminAccess(user))) {
      throw new ForbiddenError('Only an admin can withdraw a clan\'s approval');
    }
    const removed = await models.CertificateClanApproval.destroy({ where: { templateId, clanId } });
    return { revoked: removed > 0 };
  }

  /** The clans an admin has released for this template. */
  async approvedClanIds(templateId) {
    const rows = await models.CertificateClanApproval.findAll({
      where: { templateId }, attributes: ['clanId'], raw: true
    });
    return new Set(rows.map((r) => r.clanId));
  }

  /**
   * May this user send certificates to these people right now?
   *
   * Admins always may. Everyone else may only send into a clan the admin has
   * released — which is the gate that was missing: a mentor could issue the
   * moment the round opened, skipping the approval step entirely.
   *
   * Returns the mentee ids that must NOT be sent to, so the caller can report
   * precisely rather than refusing a whole batch.
   */
  async blockedRecipients(templateId, menteeIds, user) {
    if (!Array.isArray(menteeIds) || !menteeIds.length) return [];
    if (await authzService.hasAdminAccess(user)) return [];

    const template = await models.CertificateTemplate.findByPk(templateId, { attributes: ['programId'] });
    const clanOf = await this._clanOfMentees(menteeIds, template?.programId || null);
    const approved = await this.approvedClanIds(templateId);

    return menteeIds.filter((menteeId) => {
      const clanId = clanOf.get(menteeId);
      // A mentee with no clan cannot be released by clan, so only an admin can
      // send to them. Refusing here is the safe reading.
      return !clanId || !approved.has(clanId);
    });
  }

  /** Tell a clan's mentors their certificates are cleared to send. */
  async _notifyClanApproved(templateId, clanId) {
    const mentors = await models.ClanMembership.findAll({
      where: {
        clanId,
        role: { [Op.in]: CertificateVerificationService.MENTOR_ROLES },
        status: 'active'
      },
      attributes: ['userId'],
      raw: true
    });
    if (!mentors.length) return;

    const [template, clan] = await Promise.all([
      models.CertificateTemplate.findByPk(templateId, { attributes: ['name'] }),
      models.Clan.findByPk(clanId, { attributes: ['name'] })
    ]);

    try {
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.CERTIFICATE_CLAN_APPROVED,
        recipients: [...new Set(mentors.map((m) => m.userId))].map((userId) => ({ userId })),
        payload: {
          title: 'Certificates approved for your clan',
          message: `"${template?.name}" is approved for ${clan?.name || 'your clan'}. You can send the certificates to your mentees now.`,
          actionUrl: '/mentor/certificates',
          actionLabel: 'Send certificates',
          relatedEntityType: 'CertificateTemplate'
        }
      });
    } catch (err) {
      logger.warn(`[certificateVerification] approval notification failed: ${err.message}`);
    }
  }

  /**
   * The tier to actually issue for each mentee.
   *
   * The mentor's decision wins where one exists — that is the entire point of
   * the round. A mentee with no verification row falls through to whatever the
   * caller already had, so issuance still works for a template that never went
   * through a review.
   */
  async resolveTiers(templateId, menteeIds) {
    const out = new Map();
    if (!Array.isArray(menteeIds) || !menteeIds.length) return out;
    const rows = await models.CertificateVerification.findAll({
      where: { templateId, menteeId: { [Op.in]: menteeIds } },
      attributes: ['menteeId', 'finalTier', 'status']
    });
    for (const row of rows) {
      if (row.finalTier) out.set(row.menteeId, row.finalTier);
    }
    return out;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  _templateSummary(template) {
    return {
      id: template.id,
      name: template.name,
      criteria: Array.isArray(template.criteria) ? template.criteria : [],
      verificationDeadline: template.verificationDeadline || null
    };
  }

  _serialize(row) {
    const json = row.toJSON ? row.toJSON() : row;
    return {
      id: json.id,
      menteeId: json.menteeId,
      mentee: json.mentee || null,
      clanId: json.clanId,
      clanName: json.clan?.name || null,
      aiTier: json.aiTier,
      aiMatchScore: json.aiMatchScore != null ? Number(json.aiMatchScore) : null,
      finalTier: json.finalTier,
      overridden: Boolean(json.overridden),
      overrideReason: json.overrideReason || null,
      status: json.status,
      verifiedAt: json.verifiedAt || null,
      verifiedBy: json.verifier
        ? `${json.verifier.firstName || ''} ${json.verifier.lastName || ''}`.trim()
        : null
    };
  }

  _assertTierExists(template, tierId) {
    const criteria = Array.isArray(template?.criteria) ? template.criteria : [];
    if (!criteria.some((c) => c.id === tierId)) {
      throw new ValidationError(`"${tierId}" is not a certificate type on this template`);
    }
  }

  /** Clans in this programme where the user may sign off. */
  async _reviewableClanIds(user, programId, onlyClanId = null) {
    // `certificate.verify`, not `mentee.view`: a lead mentor can revoke signing
    // off from an individual co-mentor without taking away their ability to see
    // the mentee at all. It is on by default for co-mentors.
    let clanIds = await authzService.clansWhereCan(user, PERMISSIONS.CERTIFICATE_VERIFY);
    if (!clanIds.length) return [];
    if (programId) {
      const inProgram = await models.Clan.findAll({
        where: { id: { [Op.in]: clanIds }, programId }, attributes: ['id'], raw: true
      });
      clanIds = inProgram.map((c) => c.id);
    }
    if (onlyClanId) clanIds = clanIds.filter((id) => id === onlyClanId);
    return clanIds;
  }

  async _assertCanReview(user, row) {
    if (await authzService.hasAdminAccess(user)) return;
    const allowed = await this._reviewableClanIds(user, null);
    if (!row.clanId || !allowed.includes(row.clanId)) {
      throw new ForbiddenError('You can only verify certificates for mentees in your clan');
    }
  }

  /** Which clan each mentee sits in, within one programme. */
  async _clanOfMentees(menteeIds, programId) {
    const out = new Map();
    if (!menteeIds.length) return out;
    const rows = await models.ClanMembership.findAll({
      where: {
        userId: { [Op.in]: menteeIds },
        role: 'mentee',
        status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES }
      },
      attributes: ['userId', 'clanId'],
      include: programId
        ? [{ model: models.Clan, as: 'clan', where: { programId }, attributes: [] }]
        : [],
      raw: true
    });
    for (const row of rows) if (!out.has(row.userId)) out.set(row.userId, row.clanId);
    return out;
  }

  /** Tell each clan's mentors they have grades waiting, and by when. */
  async _notifyMentors(template) {
    const pending = await models.CertificateVerification.findAll({
      where: { templateId: template.id, status: 'pending' },
      attributes: ['clanId'],
      raw: true
    });
    const clanIds = [...new Set(pending.map((r) => r.clanId).filter(Boolean))];
    if (!clanIds.length) return 0;

    const mentors = await models.ClanMembership.findAll({
      where: {
        clanId: { [Op.in]: clanIds },
        role: { [Op.in]: CertificateVerificationService.MENTOR_ROLES },
        status: 'active'
      },
      attributes: ['userId', 'clanId'],
      raw: true
    });

    const countByClan = pending.reduce((acc, r) => {
      if (r.clanId) acc[r.clanId] = (acc[r.clanId] || 0) + 1;
      return acc;
    }, {});

    const due = template.verificationDeadline
      ? ` by ${new Date(template.verificationDeadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : '';

    const recipients = [...new Set(mentors.map((m) => m.userId))].map((userId) => ({ userId }));
    if (!recipients.length) return 0;

    const total = Object.values(countByClan).reduce((a, b) => a + b, 0);
    try {
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.CERTIFICATE_VERIFICATION_REQUESTED,
        recipients,
        payload: {
          title: 'Certificate grades need your review',
          message: `${total} of your mentees have been graded for "${template.name}". Check the grades${due} before they go out.`,
          actionUrl: `/mentor/certificates?verify=${template.id}`,
          actionLabel: 'Review grades',
          relatedEntityType: 'CertificateTemplate',
          emailSubject: `Pathment: certificate grades to review${due}`
        }
      });
    } catch (err) {
      logger.warn(`[certificateVerification] mentor notification failed: ${err.message}`);
    }
    return recipients.length;
  }

  /** When a clan finishes, tell the admins it is clear to issue. */
  async _notifyAdminsIfClanComplete(templateId, clanId, actor) {
    if (!clanId) return;
    const stillPending = await models.CertificateVerification.count({
      where: { templateId, clanId, status: 'pending' }
    });
    if (stillPending > 0) return;

    const [template, clan] = await Promise.all([
      models.CertificateTemplate.findByPk(templateId, { attributes: ['id', 'name'] }),
      models.Clan.findByPk(clanId, { attributes: ['name'] })
    ]);
    const admins = await models.User.findAll({ where: { role: 'admin', status: 'active' }, attributes: ['id'] });
    if (!admins.length) return;

    const overrides = await models.CertificateVerification.count({
      where: { templateId, clanId, overridden: true }
    });

    try {
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.CERTIFICATE_VERIFICATION_COMPLETED,
        recipients: admins.map((a) => ({ userId: a.id })),
        payload: {
          title: `${clan?.name || 'A clan'} has verified its certificates`,
          message: overrides > 0
            ? `All grades for "${template?.name}" are signed off — ${overrides} were changed from the AI's assignment.`
            : `All grades for "${template?.name}" are signed off with no changes.`,
          actionUrl: `/admin/certificates/${templateId}/edit`,
          actionLabel: 'Open template',
          relatedEntityType: 'CertificateTemplate'
        }
      });
    } catch (err) {
      logger.warn(`[certificateVerification] admin notification failed: ${err.message}`);
    }
  }
}

module.exports = new CertificateVerificationService();

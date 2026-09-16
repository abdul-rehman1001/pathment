const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const groqService = require('./groqService');
const logger = require('../utils/logger');
const emailService = require('./emailService');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { certificateAwardedEmail } = require('../utils/emailTemplate');
const {
  preCheckHardConstraints,
  aggregateMenteeData,
  buildBatchMenteePrompt,
  extractJsonFromText,
  enrichEvaluationResults
} = require('../utils/certificateUtils');
const { sortCriteriaByPriority } = require('../utils/criteriaUtils');
const {
  generateCertificateNumber,
  normalizeCertificateNumber,
  isCertificateNumber,
  MAX_ATTEMPTS: NUMBER_MAX_ATTEMPTS
} = require('../utils/certificateNumber');
const authzService = require('./authzService');
const certificateVerificationService = require('./certificateVerificationService');
const { VISIBLE_MEMBERSHIP_STATUSES, strongestClanRole } = require('../config/membership');
const { PERMISSIONS } = require('../config/permissions');

// A per-tier value is either a line of certificate wording or an image URL.
// Generous enough for a paragraph or a signed Cloudinary URL, bounded so a
// template's JSONB column cannot be used as free storage.
const TIER_VALUE_MAX_LENGTH = 2000;

function deduplicateById(arr) {
  const seen = new Set();
  return arr.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

class CertificateService {
  // ==================== QUALIFICATION & SCOPE METHODS ====================

  /**
   * The clans this user may act on for certificates, inside one program.
   *
   * Derived from the permission they actually hold at each clan
   * (`authzService.clansWhereCan`) rather than from a `clan_memberships` row
   * with role lead_mentor/co_mentor. That matters because cross-clan cover and
   * explicit IAM grants also make somebody responsible for a clan, and reading
   * the membership table directly misses both.
   *
   * `clanId` narrows further to the clan picked in the sidebar, so a mentor who
   * runs several clans evaluates the one they are looking at.
   */
  async getMentorScopedMenteeClans(user, programId, { clanId = null } = {}) {
    if (!user) return [];
    let clanIds = await authzService.clansWhereCan(user, PERMISSIONS.MENTEE_VIEW);
    if (!clanIds.length) return [];

    if (programId) {
      const inProgram = await models.Clan.findAll({
        where: { id: { [Op.in]: clanIds }, programId },
        attributes: ['id'],
        raw: true
      });
      clanIds = inProgram.map((c) => c.id);
    }
    if (clanId) clanIds = clanIds.filter((id) => id === clanId);
    return clanIds;
  }

  /**
   * Throw unless the user may act on this mentee's certificate.
   *
   * The old shape of this check was `if (user.role === 'mentee') deny; if
   * (user.role === 'mentor') scope-check` — which got BOTH halves wrong for a
   * co-mentor promoted from a mentee account. They were denied their own
   * mentees on the read paths, and on delete/revoke the `role === 'mentor'`
   * test simply did not match, so the scope check never ran at all and they
   * could revoke anybody's certificate.
   */
  async assertCanActOnMentee(user, menteeId, message) {
    if (!user) throw new ForbiddenError(message);
    if (user.id === menteeId) return;                       // your own certificate
    const scope = await this.resolveMenteeScope(user);
    if (scope === null) return;                             // admin access
    if (!scope.includes(menteeId)) throw new ForbiddenError(message);
  }

  /**
   * Which mentees this user may see, grade and issue to.
   *
   *   null  → unrestricted, and ONLY for real org/program admin access
   *   [ids] → exactly the mentees they mentor
   *
   * This used to key off `user.role`, the column that records what an account
   * was CREATED as. A co-mentor promoted from mentee still reads 'mentee'
   * there, so the old `userRole !== 'mentor'` test fell through to the
   * unrestricted branch and handed them the entire programme: the AI evaluation
   * they started said "0 / 623" because it was grading every enrolled mentee in
   * the org, not the dozen in their clan. Capability is derived now, and the
   * default is closed — an empty scope means "nobody", never "everybody".
   */
  async resolveMenteeScope(user, { programId = null, clanId = null } = {}) {
    if (!user) return [];
    if (await authzService.hasAdminAccess(user)) return null;

    const clanIds = await this.getMentorScopedMenteeClans(user, programId, { clanId });
    if (!clanIds.length) return [];

    const menteeMembers = await models.ClanMembership.findAll({
      where: { clanId: { [Op.in]: clanIds }, role: 'mentee', status: 'active' },
      attributes: ['userId'],
      raw: true
    });
    return [...new Set(menteeMembers.map((m) => m.userId))];
  }

  /**
   * The mentees a certificate template is about, for THIS user.
   *
   * `user` decides the scope, not a mentorId the client happened to send: an
   * admin gets the whole programme, anybody else gets only the clans they
   * actually mentor. The caller no longer has to know which of those it is.
   */
  async getScopedMenteesForTemplate(programId, user, { clanId = null } = {}) {
    const activeMentees = [];
    const pausedMentees = [];

    const pausedMenteeIdsSet = new Set();
    if (programId) {
      const pausedMemberships = await models.ClanMembership.findAll({
        where: { role: 'mentee', status: 'paused' },
        include: [{
          model: models.Clan,
          as: 'clan',
          where: { programId },
          attributes: ['id']
        }],
        attributes: ['userId'],
        raw: true
      });
      pausedMemberships.forEach(pm => pausedMenteeIdsSet.add(pm.userId));
    }

    // Unrestricted ONLY for real admin access. Everyone else is confined to the
    // clans they mentor — and to none at all if they mentor none, which is the
    // safe answer rather than the whole programme.
    const isAdmin = await authzService.hasAdminAccess(user);

    if (!isAdmin) {
      const clanIds = await this.getMentorScopedMenteeClans(user, programId, { clanId });
      if (clanIds.length > 0) {
        const menteeMembers = await models.ClanMembership.findAll({
          where: { clanId: { [Op.in]: clanIds }, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
          include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'status'] }]
        });
        const seenMentees = new Set();
        for (const mem of menteeMembers) {
          if (!mem.user || seenMentees.has(mem.user.id)) continue;
          seenMentees.add(mem.user.id);
          const u = mem.user;
          const row = { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email };
          (mem.status === 'paused' || u.status === 'suspended' || pausedMenteeIdsSet.has(u.id))
            ? pausedMentees.push(row)
            : activeMentees.push(row);
        }
      }
    } else {
      const enrollments = await models.Enrollment.findAll({
        where: { programId },
        include: [{ model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'email', 'status'] }]
      });
      for (const e of enrollments) {
        if (!e.mentee) continue;
        const row = { id: e.mentee.id, firstName: e.mentee.firstName, lastName: e.mentee.lastName, email: e.mentee.email };
        (e.status === 'paused' || e.mentee.status === 'suspended' || pausedMenteeIdsSet.has(e.mentee.id))
          ? pausedMentees.push(row)
          : activeMentees.push(row);
      }
    }

    return {
      activeMentees: deduplicateById(activeMentees),
      pausedMentees: deduplicateById(pausedMentees)
    };
  }

  async getQualification(id, queryMentorId, user, { clanId = null } = {}) {
    const template = await models.CertificateTemplate.findOne({ where: { id, status: 'active' } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const programId = template.programId;
    // `queryMentorId` lets an ADMIN look at one mentor's slice. It can never
    // widen anybody's scope: the resolver below asks what this user actually
    // mentors, so a non-admin is confined to their own clans whatever the
    // client sends.
    const { activeMentees, pausedMentees } = await this.getScopedMenteesForTemplate(
      programId, user, { clanId }
    );

    const existingInstances = await models.CertificateInstance.findAll({
      where: { templateId: id },
      attributes: ['menteeId', 'mentorId', 'tier']
    });
    const issuedMap = {};
    for (const inst of existingInstances) {
      const key = inst.menteeId || inst.mentorId;
      if (key) { issuedMap[key] ??= []; issuedMap[key].push(inst.tier); }
    }

    const criteria = sortCriteriaByPriority(Array.isArray(template.criteria) ? template.criteria : []);

    const latestQueueRun = await models.AIEvaluationQueue.findOne({
      where: { templateId: id, status: 'completed' },
      order: [['createdAt', 'DESC']],
      attributes: ['runId'],
      raw: true
    });

    let aiResults = [];
    if (latestQueueRun) {
      const jobs = await models.AIEvaluationQueue.findAll({
        where: { runId: latestQueueRun.runId, status: 'completed' },
        attributes: ['result'],
        raw: true
      });
      aiResults = jobs.map(j => j.result).filter(Boolean);
    }

    if (aiResults.length === 0 && Array.isArray(template.aiEvaluation?.results)) {
      aiResults = template.aiEvaluation.results;
    }

    const aiResultMap = Object.fromEntries(aiResults.map(r => [r.mentee_id || r.id, r]));
    const hasAiRun = aiResults.length > 0;

    const buildMenteeRow = (m) => {
      const aiEval = aiResultMap[m.id];
      if (hasAiRun && aiEval) {
        return {
          ...m,
          assignedTier: aiEval.certificate_tier || null,
          tierMatches: { [aiEval.certificate_tier || 'participation']: Number(aiEval.match_score) || 0 },
          criteriaMatch: Number(aiEval.match_score) || 0,
          issuedTiers: issuedMap[m.id] || []
        };
      }
      return {
        ...m,
        assignedTier: null,
        tierMatches: {},
        criteriaMatch: null,
        issuedTiers: issuedMap[m.id] || []
      };
    };

    const result = {
      participation: activeMentees.map(buildMenteeRow),
      paused: pausedMentees.map(m => ({ ...m, assignedTier: null, tierMatches: {}, criteriaMatch: null, issuedTiers: issuedMap[m.id] || [] })),
      mentors: []
    };

    for (const tier of criteria) {
      result[tier.id] = activeMentees.map(buildMenteeRow);
    }

    if (programId) {
      const mentorMemberships = await models.ClanMembership.findAll({
        where: { role: { [Op.in]: ['lead_mentor', 'co_mentor'] }, status: 'active' },
        include: [
          { model: models.Clan, as: 'clan', where: { programId }, attributes: [] },
          { model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'status'] }
        ]
      });
      const uniqueMentors = [];
      const seenMentorIds = new Set();
      for (const mem of mentorMemberships) {
        if (mem.user && !seenMentorIds.has(mem.user.id)) {
          seenMentorIds.add(mem.user.id);
          uniqueMentors.push({
            id: mem.user.id,
            firstName: mem.user.firstName,
            lastName: mem.user.lastName,
            email: mem.user.email,
            assignedTier: null,
            tierMatches: {},
            criteriaMatch: null,
            issuedTiers: issuedMap[mem.user.id] || []
          });
        }
      }
      result.mentors = uniqueMentors;
    }

    return result;
  }

  /**
   * Resolve a certificate number for the PUBLIC verification page.
   *
   * Unauthenticated by design — the whole point of printing a number on a
   * credential is that a stranger reading a CV can check it. So the response is
   * deliberately thin: enough to confirm the claim (who, what, which programme,
   * when) and nothing more. No email, no ids, no scores, no internal state —
   * anybody on the internet can call this with a guessed code.
   *
   * A malformed code is refused before it reaches the database, so the endpoint
   * cannot be used to probe with junk.
   */
  async verifyByNumber(rawNumber) {
    if (!isCertificateNumber(rawNumber)) return { valid: false };
    const certificateNumber = normalizeCertificateNumber(rawNumber);

    const instance = await models.CertificateInstance.findOne({
      where: { certificateNumber },
      include: [
        { model: models.User, as: 'mentee', attributes: ['firstName', 'lastName'] },
        {
          model: models.CertificateTemplate,
          as: 'template',
          attributes: ['name', 'criteria'],
          include: [{ model: models.Program, as: 'program', attributes: ['name'], required: false }]
        }
      ]
    });
    if (!instance) return { valid: false };

    const criteria = Array.isArray(instance.template?.criteria) ? instance.template.criteria : [];
    const tierName = criteria.find((c) => c.id === instance.tier)?.name || instance.tier;

    return {
      valid: true,
      certificateNumber,
      recipientName: instance.mentee
        ? `${instance.mentee.firstName || ''} ${instance.mentee.lastName || ''}`.trim()
        : null,
      tier: instance.tier,
      tierName,
      programName: instance.template?.program?.name || null,
      templateName: instance.template?.name || null,
      issuedAt: instance.createdAt
    };
  }

  async getTemplateHistory(id, user) {
    const template = await models.CertificateTemplate.findOne({ where: { id } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const whereClause = { templateId: id };

    const menteeIds = await this.resolveMenteeScope(user, { programId: template.programId || null });
    if (menteeIds !== null) {
      whereClause.menteeId = { [Op.in]: [...menteeIds, user.id] };
    }

    const instances = await models.CertificateInstance.findAll({
      where: whereClause,
      include: [
        { model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'email', 'role'] },
        { model: models.User, as: 'mentor', attributes: ['id', 'firstName', 'lastName', 'email', 'role'] },
        { model: models.User, as: 'issuer', attributes: ['id', 'firstName', 'lastName', 'email', 'role'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    // What role did these people hold IN THIS PROGRAMME? `users.role` answers a
    // different question — what an account was created as — so a co-mentor
    // promoted from a mentee account was labelled MENTEE next to certificates
    // he had issued. The label has to come from the clan, which is where the
    // authority to issue came from too.
    const peopleIds = [...new Set(
      instances.flatMap((inst) => [inst.mentee?.id, inst.issuer?.id, inst.mentor?.id]).filter(Boolean)
    )];
    const roleInProgram = await this.resolveProgramRoles(peopleIds, template.programId);

    const describe = (u) => (u ? {
      id:        u.id,
      firstName: u.firstName,
      lastName:  u.lastName,
      email:     u.email,
      role:      roleInProgram.get(u.id) || u.role
    } : null);

    return instances.map(inst => ({
      id:        inst.id,
      tier:      inst.tier,
      createdAt: inst.createdAt,
      status:    'issued',
      recipient: describe(inst.mentee),
      issuedBy:  describe(inst.issuer || inst.mentor)
    }));
  }

  /**
   * The role each of these people holds inside one programme, as a label the UI
   * can show: 'admin', 'lead_mentor', 'co_mentor', 'core_team' or 'mentee'.
   *
   * Resolved from clan membership rather than `users.role`, because the account
   * column records only what somebody signed up as and never changes when they
   * are promoted. Somebody in several clans of the programme gets their most
   * senior hat. Anyone with no membership at all is left out of the map so the
   * caller can fall back to whatever it already had.
   */
  async resolveProgramRoles(userIds, programId) {
    const out = new Map();
    if (!userIds.length) return out;

    // An org-level admin outranks any clan role — they issue as the org.
    const admins = await models.User.findAll({
      where: { id: { [Op.in]: userIds }, role: 'admin' },
      attributes: ['id'],
      raw: true
    });
    admins.forEach((a) => out.set(a.id, 'admin'));

    const where = { userId: { [Op.in]: userIds }, status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES } };
    const memberships = await models.ClanMembership.findAll({
      where,
      attributes: ['userId', 'role'],
      include: programId
        ? [{ model: models.Clan, as: 'clan', where: { programId }, attributes: [] }]
        : [],
      raw: true
    });

    const byUser = new Map();
    for (const m of memberships) {
      if (!byUser.has(m.userId)) byUser.set(m.userId, []);
      byUser.get(m.userId).push(m.role);
    }
    for (const [userId, roles] of byUser) {
      if (out.has(userId)) continue; // admin already decided
      const strongest = strongestClanRole(roles);
      if (strongest) out.set(userId, strongest);
    }
    return out;
  }


  async runAIEvaluation(id, queryMentorId, user, { clanId = null } = {}) {
    const template = await models.CertificateTemplate.findOne({ where: { id, status: 'active' } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const programId = template.programId;
    const criteria = sortCriteriaByPriority(Array.isArray(template.criteria) ? template.criteria : []);

    // Who this run is allowed to grade. A mentor grades their own clans and
    // nobody else's — this is the path that used to hand a co-mentor the entire
    // programme ("0 / 623") because it decided scope from `user.role`.
    const { activeMentees } = await this.getScopedMenteesForTemplate(programId, user, { clanId });
    const mentees = activeMentees;

    if (mentees.length === 0) {
      return { total: 0, runId: null, data: [] };
    }

    const menteeIds = mentees.map(m => m.id);

    // An admin run is programme-wide and carries no clan.
    if (await authzService.hasAdminAccess(user)) {
      const { runId, total } = await this.enqueueEvaluation(
        id, menteeIds, user.id, criteria, null
      );
      return { runId, total };
    }

    const clanIds = await this.getMentorScopedMenteeClans(user, programId, { clanId });
    if (clanIds.length === 0) {
      return { total: 0, runId: null, data: [] };
    }

    if (clanIds.length === 1) {
      const { runId, total } = await this.enqueueEvaluation(
        id, menteeIds, user.id, criteria, clanIds[0]
      );
      return { runId, total };
    }

    const menteeClanMap = new Map();
    const memberships = await models.ClanMembership.findAll({
      where: {
        userId:  { [Op.in]: menteeIds },
        clanId:  { [Op.in]: clanIds },
        role:    'mentee',
        status:  'active'
      },
      attributes: ['userId', 'clanId'],
      raw: true
    });
    for (const mem of memberships) {
      if (!menteeClanMap.has(mem.userId)) {
        menteeClanMap.set(mem.userId, mem.clanId);
      }
    }

    const byClan = new Map();
    for (const menteeId of menteeIds) {
      const clan = menteeClanMap.get(menteeId) ?? clanIds[0];
      if (!byClan.has(clan)) byClan.set(clan, []);
      byClan.get(clan).push(menteeId);
    }

    const sharedRunId = uuidv4();
    let total = 0;
    for (const [clanId, clanMenteeIds] of byClan) {
      const r = await this.enqueueEvaluation(
        id, clanMenteeIds, user.id, criteria, clanId, sharedRunId
      );
      total += r.total;
    }

    return { runId: sharedRunId, total };
  }

  async getAIEvaluationStatus(runId, templateId) {
    let targetRunId = runId;

    if (!targetRunId && templateId) {
      const latestJob = await models.AIEvaluationQueue.findOne({
        where: { templateId },
        order: [
          [sequelize.literal(`CASE WHEN status IN ('pending', 'processing') THEN 0 ELSE 1 END`), 'ASC'],
          ['createdAt', 'DESC']
        ],
        attributes: ['runId'],
        raw: true
      });
      if (latestJob) targetRunId = latestJob.runId;
    }

    if (!targetRunId) {
      return { isDone: true, runId: null, total: 0, completed: 0, failed: 0, pending: 0, data: [] };
    }

    const jobs = await models.AIEvaluationQueue.findAll({
      where: { runId: targetRunId },
      attributes: ['menteeId', 'status', 'result', 'error'],
      raw: true
    });

    if (jobs.length === 0) {
      return { isDone: true, runId: targetRunId, total: 0, completed: 0, failed: 0, pending: 0, data: [] };
    }

    const total = jobs.length;
    const completed = jobs.filter(j => j.status === 'completed').length;
    const failed = jobs.filter(j => j.status === 'failed').length;
    const pending = jobs.filter(j => j.status === 'pending' || j.status === 'processing').length;
    const isDone = pending === 0;

    const completedResults = jobs
      .filter(j => j.status === 'completed' && j.result)
      .map(j => j.result);

    const enrichedResults = await enrichEvaluationResults(completedResults);

    return {
      runId: targetRunId,
      isDone,
      total,
      completed,
      failed,
      pending,
      data: enrichedResults,
      ranAt: isDone ? new Date().toISOString() : null
    };
  }

  // ==================== AI EVALUATION RUNNER METHODS ====================

  isTierAllowed(assignedTier, maxAllowedTierId, criteria) {
    if (!assignedTier || !maxAllowedTierId) return false;
    if (assignedTier === maxAllowedTierId) return true;

    if (maxAllowedTierId === 'participation') return false;

    const tierOrder = (criteria || []).map(c => c.id);
    const assignedIdx = tierOrder.indexOf(assignedTier);
    const maxIdx      = tierOrder.indexOf(maxAllowedTierId);

    if (assignedIdx === -1) return false;
    if (maxIdx === -1) return false;

    return assignedIdx >= maxIdx;
  }

  buildHardConstraintFailures(preCheck, criteria) {
    const failures  = [];
    const hardChecks = preCheck.hardChecks || {};
    const maxTierId  = preCheck.maxEligibleTier;

    const tierIds     = (criteria || []).map(c => c.id);
    const maxTierIndex = tierIds.indexOf(maxTierId);

    const higherTiers = maxTierIndex > 0
      ? tierIds.slice(0, maxTierIndex)
      : maxTierIndex === 0
        ? []
        : tierIds;

    for (const tierId of higherTiers) {
      const tierConfig = criteria.find(c => c.id === tierId);
      const checks     = hardChecks[tierId] || {};
      const tierName   = tierConfig?.name || tierId;

      if (checks.completion_rate_ok === false && tierConfig?.minCompletionRate != null) {
        failures.push(`Failed ${tierName} Hard Constraint: Mentee completion rate is below required ${tierConfig.minCompletionRate}% threshold.`);
      }
      if (checks.score_ok === false && tierConfig?.minScorePercent != null) {
        failures.push(`Failed ${tierName} Hard Constraint: Mentee score is below required ${tierConfig.minScorePercent}% threshold.`);
      }
      if (checks.blockers_ok === false && tierConfig?.maxOpenBlockers != null && tierConfig.maxOpenBlockers >= 0) {
        failures.push(`Failed ${tierName} Hard Constraint: Mentee open blockers exceeds max limit of ${tierConfig.maxOpenBlockers}.`);
      }
      if (checks.on_time_rate_ok === false && tierConfig?.minOnTimeRate != null) {
        failures.push(`Failed ${tierName} Hard Constraint: Mentee on-time submission rate is below required ${tierConfig.minOnTimeRate}% threshold.`);
      }
      if (checks.rating_ok === false && tierConfig?.minAvgRating != null) {
        failures.push(`Failed ${tierName} Hard Constraint: Mentee average mentor rating is below required ${tierConfig.minAvgRating} threshold.`);
      }
      if (checks.attendance_ok === false && tierConfig?.minAttendanceRate != null) {
        failures.push(`Failed ${tierName} Hard Constraint: Mentee attendance rate is below required ${tierConfig.minAttendanceRate}% threshold.`);
      }
    }

    return failures;
  }

  async evaluateBatchMentees(template, batchItems, adminUserId) {
    if (!batchItems || batchItems.length === 0) return [];

    const ai = await groqService._resolve('certificates', adminUserId);
    if (!ai.enabled) {
      throw new ValidationError(
        'AI is not configured. Add a provider key in Settings → AI Connections and route it to "certificates".'
      );
    }

    const criteria     = sortCriteriaByPriority(Array.isArray(template.criteria) ? template.criteria : []);
    const systemPrompt = buildBatchMenteePrompt(criteria, batchItems.length);

    const compactPayloads = batchItems.map(item => {
      const livePreCheck = preCheckHardConstraints(item.menteePayload, criteria);
      return {
        mentee_id:                item.menteePayload.mentee_id,
        score:                    item.menteePayload.normalized_score,
        completion:               item.menteePayload.completion_rate,
        on_time:                  item.menteePayload.on_time_rate,
        avg_rating:               item.menteePayload.avg_rating,
        max_eligible_tier:        livePreCheck.maxEligibleTier,
        hard_constraint_failures: this.buildHardConstraintFailures(livePreCheck, criteria),
        score_breakdown:          item.menteePayload.score_breakdown,
        cohort_reviews:           item.menteePayload.cohort_reviews,
        clan_name:                item.menteePayload.clan_name,
        tasks: (item.menteePayload.tasks || []).map(t => ({
          title:      t.title,
          status:     t.status,
          type:       t.type,
          isCustom:   Boolean(t.isCustomTask),
          desc:       t.description ? t.description.slice(0, 300) : undefined,
          rating:     t.rating,
          difficulty: t.difficulty,
          points_pct: t.pointsPct
        })),
        blockers: {
          total:            item.menteePayload.blockers?.total            ?? 0,
          open:             item.menteePayload.blockers?.open             ?? 0,
          open_by_severity: item.menteePayload.blockers?.open_by_severity ?? {}
        }
      };
    });

    const userPrompt = JSON.stringify(compactPayloads);

    let response = null;
    const initialCandidates = [ai.model];

    if (ai.provider === 'groq' || /groq/i.test(ai.baseURL || '')) {
      initialCandidates.push('llama-3.3-70b-versatile', 'llama-3.1-8b-instant');
    } else if (ai.provider === 'openai' || /openai/i.test(ai.baseURL || '')) {
      initialCandidates.push('gpt-4o-mini', 'gpt-4o');
    }

    const modelQueue  = [...new Set(initialCandidates.filter(Boolean))];
    const triedModels = new Set();
    let lastError     = null;

    for (let idx = 0; idx < modelQueue.length; idx++) {
      const m = modelQueue[idx];
      if (triedModels.has(m)) continue;
      triedModels.add(m);

      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), 35000);

      try {
        response = await ai.client.chat.completions.create(
          {
            model: m,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user',   content: userPrompt }
            ],
            temperature: 0.1,
            max_tokens:  3500
          },
          { signal: controller.signal }
        );
        if (response) break;
      } catch (err) {
        lastError = err.name === 'AbortError' || controller.signal.aborted
          ? new Error(`AI Request Timeout for model ${m} during batch evaluation after 35s`)
          : err;

        logger.warn(`[certificateService] Model ${m} batch failed: ${lastError.message}`);

        if (/401|unauthorized|auth|api_key|invalid_key|429|rate_limit|quota|billing/i.test(lastError?.message || '')) {
          break;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (!response) {
      logger.warn('[certificateService] Batch AI call failed, generating fallbacks for batch');
      return batchItems.map(item => ({
        menteeId: item.menteeId,
        result:   this.buildFallbackResult(item.menteePayload, item.preCheck)
      }));
    }

    const raw = response.choices[0]?.message?.content || '';
    return this.parseBatchAIResponse(raw, criteria, batchItems, ai);
  }

  async attemptJSONSelfCorrection(rawText, errorMsg, ai) {
    try {
      logger.info('[certificateService] Triggering AI self-correction retry prompt for malformed JSON...');
      const repairResponse = await ai.client.chat.completions.create({
        model: ai.model || 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a specialized JSON repair assistant. Fix the JSON syntax error in the provided text and output valid JSON ONLY. Do NOT add markdown wrappers or explanations.'
          },
          {
            role: 'user',
            content: `The following response produced a JSON syntax error '${errorMsg}'. Please fix it and return valid JSON array only:\n\n${rawText.slice(0, 3500)}`
          }
        ],
        temperature: 0.0,
        max_tokens:  3500
      });

      const repaired = JSON.parse(extractJsonFromText(repairResponse.choices[0]?.message?.content || ''));
      logger.info('[certificateService] AI self-correction retry successfully repaired the JSON!');
      return repaired;
    } catch (err) {
      logger.warn(`[certificateService] JSON self-correction retry failed: ${err.message}`);
      return null;
    }
  }

  async parseBatchAIResponse(raw, criteria, batchItems, ai = null) {
    let parsedArray = [];

    try {
      const jsonStr = extractJsonFromText(raw);
      parsedArray   = JSON.parse(jsonStr);
      if (!Array.isArray(parsedArray)) parsedArray = [];
    } catch (err) {
      logger.warn(`[certificateService] Direct JSON parse failed (${err.message}). Trying AI self-correction retry...`);
      if (ai) {
        const repaired = await this.attemptJSONSelfCorrection(raw, err.message, ai);
        if (Array.isArray(repaired)) parsedArray = repaired;
      }
    }

    const resultMap = new Map();
    for (const item of parsedArray) {
      const id = item?.mentee_id || item?.id;
      if (id) resultMap.set(String(id), item);
    }

    return batchItems.map(batchItem => {
      const menteeId = batchItem.menteePayload.mentee_id;
      const aiItem   = resultMap.get(String(menteeId));

      const livePreCheck = preCheckHardConstraints(batchItem.menteePayload, criteria);

      if (!aiItem) {
        return { menteeId, result: this.buildFallbackResult(batchItem.menteePayload, livePreCheck) };
      }

      const menteePayload = batchItem.menteePayload;
      const sortedCriteria = sortCriteriaByPriority(criteria);
      const maxTierId     = livePreCheck.maxEligibleTier;

      const rawMatchScore = aiItem.match_score ?? aiItem.matchScore ?? menteePayload.normalized_score;
      const cappedScore   = Math.min(100, Math.max(0, Number(rawMatchScore) || 0));

      const matchedKw = Array.isArray(aiItem.matched_keywords) ? aiItem.matched_keywords
        : (Array.isArray(aiItem.matchedKeywords) ? aiItem.matchedKeywords : []);

      const missingKw = Array.isArray(aiItem.missing_keywords) ? aiItem.missing_keywords
        : (Array.isArray(aiItem.missingKeywords) ? aiItem.missingKeywords : []);

      const customRulesCheck = (
        Array.isArray(aiItem.custom_rules_check) ? aiItem.custom_rules_check
          : (Array.isArray(aiItem.customRulesCheck) ? aiItem.customRulesCheck : [])
      ).map(crc => ({
        rule:     String(crc.rule || crc.name || 'Custom Qualification Rule').trim(),
        passed:   Boolean(crc.passed ?? crc.status === 'passed'),
        evidence: String(crc.evidence || crc.reason || '').trim()
      }));

      const blockersAnalysisObj = aiItem.blockers_analysis || aiItem.blockersAnalysis || {};

      let qualifiedTier = 'participation';
      const normalizedMatched = matchedKw.map(k => String(k).toLowerCase());

      for (const tierConfig of sortedCriteria) {
        const tierId = tierConfig.id;

        if (!this.isTierAllowed(tierId, maxTierId, sortedCriteria)) {
          continue;
        }

        const requiredKw = Array.isArray(tierConfig.keywords) ? tierConfig.keywords : [];
        const unfulfilledKw = requiredKw.filter(kw => !normalizedMatched.includes(String(kw).toLowerCase()));
        if (unfulfilledKw.length > 0) {
          continue;
        }

        if (tierConfig.customRule?.trim()) {
          const failedRule = customRulesCheck.some(c => c.passed === false);
          if (failedRule) {
            continue;
          }
        }

        qualifiedTier = tierId;
        break;
      }

      const assignedTier = aiItem.certificate_tier || aiItem.certificateTier || aiItem.tier || maxTierId;

      const validTier = qualifiedTier !== 'participation' ? qualifiedTier : assignedTier;

      const hardConstraintsCheck = livePreCheck.hardChecks[validTier]
        ?? (validTier === 'participation'
          ? Object.values(livePreCheck.hardChecks)[0] ?? { score_ok: false, blockers_ok: false, completion_rate_ok: false, on_time_rate_ok: false, rating_ok: false, attendance_ok: false }
          : { score_ok: true, blockers_ok: true, completion_rate_ok: true, on_time_rate_ok: true, rating_ok: true, attendance_ok: true });

      let finalReasoning = aiItem.reasoning || aiItem.summary || '';
      if (validTier !== assignedTier) {
        const tierName = sortedCriteria.find(c => c.id === validTier)?.name || validTier;
        finalReasoning = `Mentee qualifies for the ${tierName} based on priority tier evaluation: hard constraints, required keywords, and custom rules were all satisfied.`;
      }

      const result = {
        mentee_id:            menteeId,
        is_eligible:          validTier !== 'participation',
        certificate_tier:     validTier,
        match_score:          cappedScore,
        matched_keywords:     matchedKw,
        missing_keywords:     missingKw,
        custom_rules_check:   customRulesCheck,
        overall_percentage:   Math.min(100, Math.max(0, Number(menteePayload.normalized_score) || 0)),
        completion_rate:      menteePayload.completion_rate,
        on_time_rate:         menteePayload.on_time_rate,
        avg_rating:           menteePayload.avg_rating,
        score_breakdown:      menteePayload.score_breakdown,
        cohort_reviews:       menteePayload.cohort_reviews,
        hard_constraints_check: hardConstraintsCheck,
        blockers_analysis: {
          total:    Number(blockersAnalysisObj.total)    || (menteePayload.blockers?.total    ?? 0),
          resolved: Number(blockersAnalysisObj.resolved) || (menteePayload.blockers?.resolved ?? 0),
          open:     Number(blockersAnalysisObj.open)     || (menteePayload.blockers?.open     ?? 0),
          impact:   blockersAnalysisObj.impact  || 'Low',
          summary:  blockersAnalysisObj.summary || ''
        },
        reasoning:            finalReasoning
      };

      return { menteeId, result };
    });
  }


  buildFallbackResult(menteePayload, preCheckResult) {
    const cappedScore = Math.min(100, Math.max(0, Number(menteePayload.normalized_score) || 0));
    const blockers    = menteePayload.blockers ?? {};

    return {
      mentee_id:       menteePayload.mentee_id,
      is_eligible:     preCheckResult.maxEligibleTier !== 'participation',
      certificate_tier: preCheckResult.maxEligibleTier,
      match_score:     cappedScore,
      matched_keywords: [],
      missing_keywords: [],
      overall_percentage:   cappedScore,
      completion_rate:      menteePayload.completion_rate,
      on_time_rate:         menteePayload.on_time_rate,
      avg_rating:           menteePayload.avg_rating,
      score_breakdown:      menteePayload.score_breakdown,
      cohort_reviews:       menteePayload.cohort_reviews,
      hard_constraints_check: preCheckResult.hardChecks[preCheckResult.maxEligibleTier] ?? {
        score_ok: false, blockers_ok: false, completion_rate_ok: false,
        on_time_rate_ok: false, rating_ok: false, attendance_ok: false
      },
      blockers_analysis: {
        total:    blockers.total    ?? 0,
        resolved: blockers.resolved ?? 0,
        open:     blockers.open     ?? 0,
        impact:   (blockers.open ?? 0) > 2 ? 'High' : (blockers.open ?? 0) > 0 ? 'Medium' : 'Low',
        summary:  'AI response could not be parsed. Tier assigned by server-side constraint checks.'
      },
      reasoning: `Server pre-check determined ${preCheckResult.maxEligibleTier} tier based on: score=${cappedScore}%, completion=${menteePayload.completion_rate}%, on-time=${menteePayload.on_time_rate}%.`
    };
  }

  async enqueueEvaluation(templateId, menteeIds, triggeredBy, criteria, clanId = null, runId = null) {
    const sortedCriteria = sortCriteriaByPriority(criteria);

    await models.AIEvaluationQueue.destroy({ where: { templateId } });

    const payloads = await aggregateMenteeData(menteeIds, clanId);
    const jobRunId = runId || uuidv4();

    const queueRows = payloads.map(payload => {
      const preCheck = preCheckHardConstraints(payload, sortedCriteria);
      return {
        runId:        jobRunId,
        templateId,
        menteeId:     payload.mentee_id,
        triggeredBy,
        status:       'pending',
        menteePayload: payload,
        preCheck,
        attempts:     0
      };
    });

    await models.AIEvaluationQueue.bulkCreate(queueRows);
    logger.info(`[certificateService] Enqueued ${queueRows.length} evaluation jobs (runId=${jobRunId}, clanId=${clanId ?? 'none'})`);

    return { runId: jobRunId, total: queueRows.length };
  }

  // ==================== TEMPLATE MANAGEMENT METHODS ====================

  /**
   * Shape-check a template's layers.
   *
   * Tier-aware fields (`tierValues`, `visibleForTiers`) are validated for SHAPE
   * only, never against the template's current tier ids. Criteria are edited
   * independently of the layout — renaming or deleting a tier would otherwise
   * make an existing template unsavable — and the renderer already falls back
   * cleanly for a tier key it does not recognise. Being strict here would turn
   * a survivable mismatch into a save that fails.
   */
  validateTemplateConfig(config) {
    if (!Array.isArray(config)) {
      throw new ValidationError('Template config must be an array of elements');
    }
    for (const el of config) {
      if (el.xPercent != null && (typeof el.xPercent !== 'number' || el.xPercent < 0 || el.xPercent > 100)) {
        throw new ValidationError('Element xPercent must be a number between 0 and 100');
      }
      if (el.yPercent != null && (typeof el.yPercent !== 'number' || el.yPercent < 0 || el.yPercent > 100)) {
        throw new ValidationError('Element yPercent must be a number between 0 and 100');
      }
      if (el.widthPercent != null && (typeof el.widthPercent !== 'number' || el.widthPercent < 0 || el.widthPercent > 100)) {
        throw new ValidationError('Element widthPercent must be a number between 0 and 100');
      }
      if (el.tierValues != null) {
        if (typeof el.tierValues !== 'object' || Array.isArray(el.tierValues)) {
          throw new ValidationError('Element tierValues must be an object keyed by tier id');
        }
        for (const [tierId, value] of Object.entries(el.tierValues)) {
          if (typeof value !== 'string') {
            throw new ValidationError(`Element tierValues.${tierId} must be a string`);
          }
          if (value.length > TIER_VALUE_MAX_LENGTH) {
            throw new ValidationError(`Element tierValues.${tierId} is too long (max ${TIER_VALUE_MAX_LENGTH} characters)`);
          }
        }
      }
      if (el.visibleForTiers != null) {
        if (!Array.isArray(el.visibleForTiers)) {
          throw new ValidationError('Element visibleForTiers must be an array of tier ids');
        }
        if (el.visibleForTiers.some((tierId) => typeof tierId !== 'string' || !tierId.trim())) {
          throw new ValidationError('Element visibleForTiers must contain non-empty tier ids');
        }
      }
    }
  }

  async createTemplate({ name, bgImageUrl, logoUrl, logoConfig, config, criteria, programId }, userId) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new ValidationError('Template name is required');
    }
    if (!programId) {
      throw new ValidationError('Program ID is required');
    }
    this.validateTemplateConfig(config);

    return models.CertificateTemplate.create({
      name: name.trim(),
      bgImageUrl: bgImageUrl || null,
      logoUrl: logoUrl || null,
      logoConfig: logoConfig || null,
      config,
      criteria: criteria || [],
      programId,
      createdBy: userId,
      status: 'active'
    });
  }

  async listTemplates(queryProgramId, user) {
    const whereClause = { status: 'active' };

    if (queryProgramId) {
      whereClause.programId = queryProgramId;
    }

    // Non-admins see the templates of programmes they mentor in, plus any
    // shared directly with them. Keyed on what they mentor rather than on
    // `user.role`, which says only what their account was created as — a
    // co-mentor promoted from a mentee account was falling past this branch
    // and listing every template in the org.
    if (!(await authzService.hasAdminAccess(user))) {
      const mentoredClanIds = await authzService.clansWhereCan(user, PERMISSIONS.MENTEE_VIEW);
      const mentoredClans = mentoredClanIds.length
        ? await models.Clan.findAll({
          where: { id: { [Op.in]: mentoredClanIds } },
          attributes: ['programId'],
          raw: true
        })
        : [];
      const programIds = [...new Set(mentoredClans.map((c) => c.programId).filter(Boolean))];

      const shares = await models.Notification.findAll({
        where: {
          userId: user.id,
          relatedEntityType: 'CertificateTemplate'
        },
        attributes: ['relatedEntityId']
      });
      const sharedIds = [...new Set(shares.map(s => s.relatedEntityId).filter(Boolean))];

      whereClause[Op.or] = [
        { programId: { [Op.in]: programIds } },
        { id: { [Op.in]: sharedIds } }
      ];
    }

    return models.CertificateTemplate.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: models.User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: models.Program,
          as: 'program',
          attributes: ['id', 'name']
        }
      ]
    });
  }

  async getTemplate(id) {
    const template = await models.CertificateTemplate.findOne({
      where: { id, status: 'active' },
      include: [
        {
          model: models.User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: models.Program,
          as: 'program',
          attributes: ['id', 'name']
        }
      ]
    });

    if (!template) {
      throw new NotFoundError('Certificate template not found');
    }

    return template;
  }

  async updateTemplate(id, { name, bgImageUrl, logoUrl, logoConfig, config, criteria, programId }) {
    const template = await models.CertificateTemplate.findOne({
      where: { id, status: 'active' }
    });

    if (!template) {
      throw new NotFoundError('Certificate template not found');
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        throw new ValidationError('Template name cannot be empty');
      }
      template.name = name.trim();
    }

    if (programId !== undefined) {
      if (!programId) {
        throw new ValidationError('Program ID cannot be empty');
      }
      template.programId = programId;
    }

    if (bgImageUrl !== undefined) template.bgImageUrl = bgImageUrl || null;
    if (logoUrl !== undefined) template.logoUrl = logoUrl || null;
    if (logoConfig !== undefined) template.logoConfig = logoConfig || null;
    if (config !== undefined) {
      this.validateTemplateConfig(config);
      template.config = config;
    }
    if (criteria !== undefined) {
      if (!Array.isArray(criteria)) {
        throw new ValidationError('Template criteria must be an array of tiers');
      }
      template.criteria = criteria;
    }

    await template.save();
    return template;
  }

  async deleteTemplate(id) {
    const template = await models.CertificateTemplate.findOne({
      where: { id, status: 'active' }
    });

    if (!template) {
      throw new NotFoundError('Certificate template not found');
    }

    template.status = 'archived';
    await template.save();
    return true;
  }

  async uploadAsset(fileBuffer) {
    if (!fileBuffer) {
      throw new ValidationError('No file uploaded');
    }
    const result = await uploadToCloudinary(fileBuffer, 'pathment/certificates', 'auto');
    return result.secure_url;
  }

  async sendToMentors(id) {
    const template = await models.CertificateTemplate.findOne({ where: { id, status: 'active' } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const programId = template.programId;

    const mentorMemberships = await models.ClanMembership.findAll({
      where: {
        role: { [Op.in]: ['lead_mentor', 'co_mentor'] },
        status: 'active'
      },
      include: [
        {
          model: models.Clan,
          as: 'clan',
          where: { programId },
          attributes: []
        }
      ],
      attributes: ['userId']
    });
    const mentorIds = [...new Set(mentorMemberships.map(m => m.userId).filter(Boolean))];

    if (mentorIds.length === 0) {
      return { sent: 0 };
    }

    const notifications = mentorIds.map(mentorId => ({
      userId: mentorId,
      type: 'system',
      audience: 'mentor',
      title: `Certificate template shared: ${template.name}`,
      message: `An admin has shared the certificate template "${template.name}" with you. Review criteria and your mentees' eligibility.`,
      actionUrl: `/mentor/certificates`,
      actionLabel: 'View Certificates',
      relatedEntityType: 'CertificateTemplate',
      relatedEntityId: template.id,
      status: 'unread'
    }));

    await models.Notification.bulkCreate(notifications);

    try {
      const { emitToUser } = require('../socket');
      for (const n of notifications) {
        emitToUser(n.userId, 'notification:new', { title: n.title, message: n.message, type: n.type });
      }
    } catch (_) { }

    return { sent: mentorIds.length };
  }

  // ==================== ISSUANCE & QUEUE METHODS ====================

  async issueCertificates({ templateId, menteeIds, mentorId, tier, recipients }, userId, user = null) {
    if (!templateId) {
      throw new ValidationError('Template ID is required');
    }

    const t = await sequelize.transaction();
    try {
      const template = await models.CertificateTemplate.findOne({
        where: { id: templateId, status: 'active' },
        include: [{ model: models.Program, as: 'program', required: false }],
        transaction: t
      });

      if (!template) {
        throw new NotFoundError('Certificate template not found');
      }

      // Issuing is a WRITE and the recipient list comes straight from the
      // request body, so it has to be checked against what this user actually
      // mentors. Nothing did that before: a mentor could name any mentee id in
      // the org and a certificate was created for them.
      const requested = Array.isArray(recipients) && recipients.length > 0
        ? recipients.map((r) => r.menteeId)
        : (Array.isArray(menteeIds) ? menteeIds : []);
      const scope = await this.resolveMenteeScope(user, { programId: template.programId });
      if (scope !== null) {
        const allowed = new Set(scope);
        const refused = [...new Set(requested.filter((id) => id && !allowed.has(id)))];
        if (refused.length) {
          throw new ForbiddenError(
            `You can only issue certificates to mentees in your clan (${refused.length} recipient(s) are not).`
          );
        }
      }

      // The mentor's sign-off wins over whatever tier the caller sent. The
      // review round exists precisely so a human's correction is what gets
      // issued — an admin clicking Issue from a stale screen must not quietly
      // revert it to the AI's grade.
      const verifiedTiers = await certificateVerificationService.resolveTiers(templateId, requested);

      // Nobody gets the same certificate twice.
      //
      // Both an admin and a mentor can issue for a clan, and either may be
      // looking at a roster loaded before the other pressed the button — so a
      // second send for the same people is expected traffic, not a mistake to
      // reject outright. The already-issued are skipped and reported; the rest
      // go out. Refusing the whole batch would mean one duplicate stopped
      // everybody else's certificate.
      const alreadyIssued = await models.CertificateInstance.findAll({
        where: { templateId, menteeId: { [Op.in]: requested.length ? requested : [null] } },
        attributes: ['menteeId'],
        raw: true,
        transaction: t
      });
      const alreadyIssuedIds = new Set(alreadyIssued.map((r) => r.menteeId));

      let instancesData = [];
      if (Array.isArray(recipients) && recipients.length > 0) {
        instancesData = recipients.filter(r => !alreadyIssuedIds.has(r.menteeId)).map(r => ({
          id: crypto.randomUUID(),
          templateId,
          menteeId:  r.menteeId,
          mentorId:  mentorId || null,
          issuedBy:  userId,
          imageUrl:  null,
          tier:      verifiedTiers.get(r.menteeId) || r.tier || 'participation',
          metadata:  {}
        }));
      } else {
        if (!Array.isArray(menteeIds) || menteeIds.length === 0) {
          throw new ValidationError('At least one mentee ID or recipients list is required');
        }
        instancesData = menteeIds.filter(menteeId => !alreadyIssuedIds.has(menteeId)).map(menteeId => ({
          id: crypto.randomUUID(),
          templateId,
          menteeId,
          mentorId: mentorId || null,
          issuedBy: userId,
          imageUrl: null,
          tier:     verifiedTiers.get(menteeId) || tier || 'participation',
          metadata: {}
        }));
      }

      // Every credential gets its public number here, at the moment it becomes
      // real. Generated per row and retried on the unique index: the odds of a
      // collision are negligible, but "negligible" is not "never" and a clash
      // must not fail somebody else's issuance.
      const skipped = requested.length - instancesData.length;
      if (instancesData.length === 0) {
        await t.rollback();
        return { instances: [], count: 0, skipped, alreadyIssued: true };
      }

      const instances = await this._createWithNumbers(instancesData, t);
      await t.commit();

      // Fire-and-forget: send notifications + emails immediately (no image — user downloads from dashboard)
      this._notifyRecipients(instances, template, mentorId).catch(err =>
        logger.warn(`[certificateService] Post-issuance notification failed: ${err.message}`)
      );

      return {
        instances: instances.map(i => ({ id: i.id, menteeId: i.menteeId })),
        count: instances.length,
        skipped
      };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  /**
   * Create the instances, giving each a unique certificate number.
   *
   * bulkCreate in one shot would make a single collision fail the whole batch,
   * so rows are inserted individually and only the clashing row is retried. The
   * unique index is the authority — checking for existence first would race.
   */
  async _createWithNumbers(instancesData, transaction) {
    const created = [];
    for (const data of instancesData) {
      let lastError = null;
      for (let attempt = 0; attempt < NUMBER_MAX_ATTEMPTS; attempt += 1) {
        try {
          created.push(await models.CertificateInstance.create(
            { ...data, certificateNumber: generateCertificateNumber() },
            { transaction }
          ));
          lastError = null;
          break;
        } catch (err) {
          const isNumberClash = err?.name === 'SequelizeUniqueConstraintError'
            && String(err?.parent?.constraint || '').includes('certificate_number');
          if (!isNumberClash) throw err;
          lastError = err;
        }
      }
      if (lastError) throw lastError;
    }
    return created;
  }

  async _notifyRecipients(instances, template, mentorId) {
    if (!instances.length) return;

    const menteeIds = instances.map(i => i.menteeId);
    const mentees = await models.User.findAll({
      where: { id: { [Op.in]: menteeIds } },
      attributes: ['id', 'firstName', 'lastName', 'email', 'role']
    });
    const menteeMap = new Map(mentees.map(m => [m.id, m]));

    let mentorUser = null;
    if (mentorId) {
      mentorUser = await models.User.findByPk(mentorId, {
        attributes: ['id', 'firstName', 'lastName']
      });
    }

    const clientUrl = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');

    for (const inst of instances) {
      const mentee = menteeMap.get(inst.menteeId);
      if (!mentee) continue;

      const tierConfig = Array.isArray(template.criteria)
        ? template.criteria.find(c => c.id === inst.tier)
        : null;
      const tierDisplayName = tierConfig?.name
        ?? (inst.tier.charAt(0).toUpperCase() + inst.tier.slice(1));

      const targetPath = mentee.role === 'mentor' ? '/mentor/certificates' : '/mentee/certificates';
      const certificateLink = `${clientUrl}${targetPath}`;

      const issuerName = mentorUser
        ? `${mentorUser.firstName} ${mentorUser.lastName}`.trim()
        : 'Pathment Admin';

      const { subject, html } = certificateAwardedEmail({
        firstName:       mentee.firstName,
        lastName:        mentee.lastName,
        templateName:    template.name,
        tier:            inst.tier,
        tierDisplayName,
        imageUrl:        null,
        certificateLink
      });

      const idempotencyKey = `certificate_awarded:${inst.menteeId}:certificate_instance:${inst.id}`;

      await emailService.enqueue({
        to:             mentee.email,
        subject,
        html,
        emailType:      NOTIFICATION_EVENTS.CERTIFICATE_AWARDED,
        recipientId:    inst.menteeId,
        idempotencyKey
      });

      await notificationOrchestrator.dispatch({
        eventKey:   NOTIFICATION_EVENTS.CERTIFICATE_AWARDED,
        recipients: [{ userId: inst.menteeId }],
        payload: {
          title:             'Certificate Awarded!',
          message:           `Congratulations! You have been awarded a "${tierDisplayName}" certificate for: "${template.name}". Visit your dashboard to view and download it.`,
          actionUrl:         targetPath,
          actionLabel:       'View Certificate',
          relatedEntityType: 'certificate_instance',
          relatedEntityId:   inst.id,
          emailSubject:      subject,
          emailHtml:         html
        }
      });
    }
  }

  async listMenteeCertificates(menteeId, user) {
    await this.assertCanActOnMentee(
      user, menteeId, 'You can only view certificates for mentees in your clan'
    );

    return models.CertificateInstance.findAll({
      where: { menteeId },
      include: [
        {
          model: models.CertificateTemplate,
          as: 'template',
          include: [
            {
              model: models.Program,
              as: 'program',
              attributes: ['id', 'name']
            }
          ]
        },
        {
          model: models.User,
          as: 'mentor',
          attributes: ['id', 'firstName', 'lastName']
        },
        {
          model: models.User,
          as: 'issuer',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      order: [['createdAt', 'DESC']]
    });
  }

  async getCertificateInstance(id, user) {
    const instance = await models.CertificateInstance.findOne({
      where: { id },
      include: [
        {
          model: models.CertificateTemplate,
          as: 'template',
          include: [
            {
              model: models.Program,
              as: 'program',
              attributes: ['id', 'name']
            }
          ]
        },
        {
          model: models.User,
          as: 'mentee',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: models.User,
          as: 'mentor',
          attributes: ['id', 'firstName', 'lastName']
        },
        {
          model: models.User,
          as: 'issuer',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    if (!instance) {
      throw new NotFoundError('Certificate not found');
    }

    await this.assertCanActOnMentee(user, instance.menteeId, 'Access denied to this certificate');

    return instance;
  }

  async deleteCertificateInstance(id, user) {
    const instance = await models.CertificateInstance.findOne({ where: { id } });
    if (!instance) throw new NotFoundError('Certificate instance not found');

    await this.assertCanActOnMentee(
      user, instance.menteeId, 'You can only revoke certificates for mentees in your clan'
    );

    await instance.destroy();
    return true;
  }

  async resendCertificateInstance(id) {
    const instance = await models.CertificateInstance.findOne({
      where: { id },
      include: [
        { model: models.CertificateTemplate, as: 'template', required: false,
          include: [{ model: models.Program, as: 'program', required: false }] },
        { model: models.User, as: 'mentee' }
      ]
    });
    if (!instance) throw new NotFoundError('Certificate instance not found');

    // Re-fire the notification so the recipient is reminded
    this._notifyRecipients([instance], instance.template, instance.mentorId).catch(err =>
      logger.warn(`[certificateService] Resend notification failed: ${err.message}`)
    );

    return true;
  }

  async revokeAllTemplateCertificates(id, user) {
    const template = await models.CertificateTemplate.findOne({ where: { id } });
    if (!template) throw new NotFoundError('Certificate template not found');

    // Resolved once: `null` is admin (revoke everything the template issued),
    // an empty list is somebody with no mentees in this programme — who must be
    // refused rather than falling through to an unfiltered destroy.
    const menteeIds = await this.resolveMenteeScope(user, { programId: template.programId });
    if (menteeIds !== null && menteeIds.length === 0) {
      throw new ForbiddenError('You do not have access to this certificate template');
    }

    const whereClause = { templateId: id };
    if (menteeIds !== null) {
      whereClause.menteeId = { [Op.in]: menteeIds };
    }

    const instances = await models.CertificateInstance.findAll({
      where: whereClause,
      attributes: ['id']
    });
    const instanceIds = instances.map(i => i.id);

    if (instanceIds.length > 0) {
      await models.CertificateInstance.destroy({ where: { id: { [Op.in]: instanceIds } } });
    }

    return { count: instances.length };
  }

  async resendAllTemplateCertificates(id, failedOnly, user) {
    const template = await models.CertificateTemplate.findOne({
      where: { id },
      include: [{ model: models.Program, as: 'program', required: false }]
    });
    if (!template) throw new NotFoundError('Certificate template not found');

    const whereClause = { templateId: id };

    const scopedMenteeIds = await this.resolveMenteeScope(user, { programId: template.programId || null });
    if (scopedMenteeIds !== null) {
      whereClause.menteeId = { [Op.in]: scopedMenteeIds };
    }

    const instances = await models.CertificateInstance.findAll({ where: whereClause });

    if (instances.length === 0) {
      return { updated: 0 };
    }

    // Re-send notifications to all (or just a subset — failedOnly no longer meaningful without a queue,
    // so we treat failedOnly=false as "all" and failedOnly=true as a no-op for now).
    if (!failedOnly) {
      this._notifyRecipients(instances, template, null).catch(err =>
        logger.warn(`[certificateService] Bulk resend notification failed: ${err.message}`)
      );
    }

    return { updated: instances.length };
  }
}

module.exports = new CertificateService();

const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const applicationService = require('./applicationService');

/**
 * clanAssignmentService — place accepted intake candidates into clans.
 *
 * Two steps, mirroring the AI-review and pause flows: previewAssignment()
 * PROPOSES a clan per candidate against the admin's conditions (pure, no
 * writes), the admin edits any row, then commitAssignment() accepts each
 * candidate with their chosen clan (issuing the clan-stamped invite that lands
 * them in that clan on registration).
 *
 * Conditions (all admin-controlled):
 *   capacity        per-clan maxMentees, or a uniform override for the run
 *                   ("fill every clan to 40").
 *   matchLevel      candidate's level must be one the clan serves (clans can
 *                   serve several; a clan with no levels serves any).
 *   matchGender     candidate's gender must match the clan lead's gender.
 *   excludeClanIds  clans kept out of the auto-fill entirely.
 *   balanceMode     'even' spreads across clans (most room first); 'fill' tops
 *                   one clan up before moving on.
 *   allowLevelOverflow  when a candidate's level clans are all full, may place
 *                   them in another level's clan (off by default — level is
 *                   respected hard unless you opt in). Gender is always relaxed
 *                   before level.
 */
class ClanAssignmentService {
  _norm(v) { return v == null ? '' : String(v).trim().toLowerCase(); }

  /** Candidate gender from their application responses (pre-registration). */
  _candidateGender(app) {
    const r = app.responses || {};
    return this._norm(r.gender);
  }

  _defaults(settings = {}) {
    return {
      capacity: settings.capacity != null && settings.capacity !== '' ? Math.max(1, parseInt(settings.capacity, 10) || 0) : null,
      matchLevel: settings.matchLevel !== false,
      matchGender: !!settings.matchGender,
      excludeClanIds: Array.isArray(settings.excludeClanIds) ? settings.excludeClanIds : [],
      balanceMode: settings.balanceMode === 'fill' ? 'fill' : 'even',
      allowLevelOverflow: !!settings.allowLevelOverflow,
    };
  }

  /**
   * Active clans in the program, with lead gender and current live mentee fill.
   * Returns Map<clanId, { id, name, levels, leadGender, cap, fill }>. `cap` is
   * the per-clan max here; the run applies any override on top.
   */
  async _clanPool(programId, capacityOverride) {
    const clans = await models.Clan.findAll({
      where: { programId, status: 'active' },
      attributes: ['id', 'name', 'levels', 'maxMentees', 'leadMentorId'],
      include: [{ model: models.User, as: 'leadMentor', attributes: ['id', 'gender'] }],
    });
    if (!clans.length) return new Map();

    const counts = await models.ClanMembership.findAll({
      where: { clanId: { [Op.in]: clans.map((c) => c.id) }, role: 'mentee', status: 'active' },
      attributes: ['clanId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
      group: ['clanId'], raw: true,
    });
    const fillById = new Map(counts.map((r) => [r.clanId, parseInt(r.n, 10) || 0]));

    const pool = new Map();
    for (const c of clans) {
      pool.set(c.id, {
        id: c.id,
        name: c.name,
        levels: Array.isArray(c.levels) ? c.levels : [],
        leadGender: this._norm(c.leadMentor && c.leadMentor.gender),
        cap: capacityOverride != null ? capacityOverride : (c.maxMentees || 25),
        fill: fillById.get(c.id) || 0,
      });
    }
    return pool;
  }

  /** Clans (from the pool) with room, filtered by the given constraints. */
  _candidates(pool, { level, gender, useLevel, useGender, excludeSet }) {
    const out = [];
    for (const c of pool.values()) {
      if (excludeSet.has(c.id)) continue;
      if (c.fill >= c.cap) continue;                                   // full
      if (useLevel && level && c.levels.length && !c.levels.includes(level)) continue;
      if (useGender && gender && c.leadGender && c.leadGender !== gender) continue;
      out.push(c);
    }
    return out;
  }

  /** Pick one clan by balance mode: most room first (even), or first with room (fill). */
  _pick(list, balanceMode) {
    if (!list.length) return null;
    if (balanceMode === 'fill') {
      return [...list].sort((a, b) => (b.cap - b.fill) - (a.cap - a.fill) || a.name.localeCompare(b.name))
        .reverse().find((c) => c.cap - c.fill > 0) || null; // fewest-remaining-but-nonzero → top up
    }
    // 'even': most remaining room first (lowest fill ratio), name as tiebreak.
    return [...list].sort((a, b) => (b.cap - b.fill) - (a.cap - a.fill) || a.name.localeCompare(b.name))[0] || null;
  }

  /**
   * Resolve ONE candidate to a clan through the relaxation tiers, returning
   * { clan, reason } or { clan: null, reason } when nothing fits.
   */
  _resolve(pool, app, s) {
    const level = app.level || null;
    const gender = this._candidateGender(app);
    const excludeSet = new Set(s.excludeClanIds);
    const base = { excludeSet };

    // Tier 1 — full strength: level + gender.
    let list = this._candidates(pool, { ...base, level, gender, useLevel: s.matchLevel, useGender: s.matchGender });
    let pick = this._pick(list, s.balanceMode);
    if (pick) return { clan: pick, reason: this._reason('match', pick, level, gender, s) };

    // Tier 2 — drop gender (level still respected).
    if (s.matchGender) {
      list = this._candidates(pool, { ...base, level, gender, useLevel: s.matchLevel, useGender: false });
      pick = this._pick(list, s.balanceMode);
      if (pick) return { clan: pick, reason: this._reason('gender_relaxed', pick, level, gender, s) };
    }

    // Tier 3 — drop level (only if allowed). Keep gender if requested.
    if (s.matchLevel && s.allowLevelOverflow) {
      list = this._candidates(pool, { ...base, level, gender, useLevel: false, useGender: s.matchGender });
      pick = this._pick(list, s.balanceMode);
      if (pick) return { clan: pick, reason: this._reason('level_overflow', pick, level, gender, s) };

      // Tier 4 — drop both.
      if (s.matchGender) {
        list = this._candidates(pool, { ...base, level, gender, useLevel: false, useGender: false });
        pick = this._pick(list, s.balanceMode);
        if (pick) return { clan: pick, reason: this._reason('any', pick, level, gender, s) };
      }
    }

    return { clan: null, reason: this._noFitReason(pool, s) };
  }

  _fillStr(c) { return `${c.fill + 1}/${c.cap}`; }
  _reason(kind, c, level, gender, s) {
    const lvl = level ? `L:${level}` : 'any level';
    const g = s.matchGender && gender ? ` · lead ${gender}` : '';
    switch (kind) {
      case 'match': return `${lvl}${g} ✓ · ${this._fillStr(c)}`;
      case 'gender_relaxed': return `${lvl} ✓ · no ${gender}-lead clan free → placed with a different lead · ${this._fillStr(c)}`;
      case 'level_overflow': return `${lvl} clans full → overflow into ${c.name} (level relaxed) · ${this._fillStr(c)}`;
      case 'any': return `All matching clans full → ${c.name} · ${this._fillStr(c)}`;
      default: return `${c.name} · ${this._fillStr(c)}`;
    }
  }
  _noFitReason(pool, s) {
    if (!pool.size) return 'No active clans in this program — create a clan first';
    const anyRoom = [...pool.values()].some((c) => !s.excludeClanIds.includes(c.id) && c.fill < c.cap);
    if (!anyRoom) return 'Every eligible clan is at capacity — raise capacity or free a clan';
    return s.allowLevelOverflow
      ? 'No clan matches after relaxing gender & level — assign manually'
      : 'No clan for this level with room (level overflow is off) — assign manually';
  }

  /**
   * Shared planner. Takes normalized candidates ({ applicationId, userId,
   * firstName, lastName, email, level, responses, alreadyPlaced }) and proposes
   * a clan for each against the pool. Pure — writes nothing. Stable order so a
   * re-run gives the same plan.
   */
  async _plan(cohort, candidates, s) {
    const levelLabel = new Map((Array.isArray(cohort.levels) ? cohort.levels : []).map((l) => [l.key, l.label]));
    const pool = await this._clanPool(cohort.programId, s.capacity);
    candidates.sort((a, b) => (a.level || '').localeCompare(b.level || '')
      || `${a.firstName}${a.lastName}`.localeCompare(`${b.firstName}${b.lastName}`)
      || String(a.applicationId).localeCompare(String(b.applicationId)));

    const rows = [];
    for (const c of candidates) {
      const name = `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email;
      const base = { applicationId: c.applicationId, userId: c.userId || null, name, email: c.email,
        level: c.level, levelLabel: levelLabel.get(c.level) || c.level, gender: this._candidateGender(c) };
      if (c.alreadyPlaced) {
        rows.push({ ...base, clanId: null, clanName: null, status: 'already_placed', reason: c.placedReason || 'Already placed' });
        continue;
      }
      const { clan, reason } = this._resolve(pool, c, s);
      if (clan) clan.fill += 1; // reserve the seat for the rest of this run
      rows.push({ ...base, clanId: clan ? clan.id : null, clanName: clan ? clan.name : null,
        status: clan ? 'assigned' : 'unassigned', reason });
    }

    const clansOut = [...pool.values()].map((c) => ({ id: c.id, name: c.name, levels: c.levels, leadGender: c.leadGender, cap: c.cap, projectedFill: c.fill }));
    const summary = {
      total: rows.length,
      assigned: rows.filter((r) => r.status === 'assigned').length,
      unassigned: rows.filter((r) => r.status === 'unassigned').length,
      alreadyAccepted: rows.filter((r) => r.status === 'already_placed').length,
    };
    return { rows, clans: clansOut, summary, settings: s };
  }

  /** Propose a clan for each SELECTED candidate (assign-at-accept flow). */
  async previewAssignment(cohortId, applicationIds, rawSettings = {}) {
    const cohort = await models.Cohort.findByPk(cohortId, { attributes: ['id', 'programId', 'levels'] });
    if (!cohort) throw new NotFoundError('Cohort not found');
    if (!Array.isArray(applicationIds) || !applicationIds.length) throw new ValidationError('Select at least one candidate');

    const s = this._defaults(rawSettings);
    const apps = await models.Application.findAll({
      where: { id: { [Op.in]: applicationIds }, cohortId },
      attributes: ['id', 'firstName', 'lastName', 'email', 'level', 'status', 'responses'],
    });
    const candidates = apps.map((a) => ({
      applicationId: a.id, userId: null, firstName: a.firstName, lastName: a.lastName, email: a.email,
      level: a.level, responses: a.responses,
      alreadyPlaced: a.status === 'accepted', placedReason: 'Already accepted',
    }));
    return this._plan(cohort, candidates, s);
  }

  /**
   * Accepted candidates who have REGISTERED but never landed in a clan (accepted
   * with no clan → registered as pending_match). Returns their applications.
   */
  async _unassignedApplications(cohortId) {
    const apps = await models.Application.findAll({
      where: { cohortId, status: 'accepted', userId: { [Op.ne]: null } },
      attributes: ['id', 'userId', 'firstName', 'lastName', 'email', 'level', 'responses'],
    });
    if (!apps.length) return [];
    const placed = await models.ClanMembership.findAll({
      where: { userId: { [Op.in]: apps.map((a) => a.userId) }, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
      attributes: ['userId'], raw: true,
    });
    const placedSet = new Set(placed.map((p) => p.userId));
    return apps.filter((a) => !placedSet.has(a.userId));
  }

  /** Propose a clan for each already-accepted-but-unplaced mentee. */
  async previewUnassigned(cohortId, rawSettings = {}) {
    const cohort = await models.Cohort.findByPk(cohortId, { attributes: ['id', 'programId', 'levels'] });
    if (!cohort) throw new NotFoundError('Cohort not found');
    const s = this._defaults(rawSettings);
    const apps = await this._unassignedApplications(cohortId);
    const candidates = apps.map((a) => ({
      applicationId: a.id, userId: a.userId, firstName: a.firstName, lastName: a.lastName, email: a.email,
      level: a.level, responses: a.responses, alreadyPlaced: false,
    }));
    return this._plan(cohort, candidates, s);
  }

  /**
   * Commit the SELECTED-candidate plan: accept each with their clan. Reuses
   * acceptApplication (invite + email + clan-stamp). Resilient per row.
   */
  async commitAssignment(cohortId, assignments, acceptedBy) {
    if (!Array.isArray(assignments) || !assignments.length) throw new ValidationError('Nothing to assign');
    const results = { accepted: 0, skipped: [] };
    for (const a of assignments) {
      const clanId = a.clanId || null;
      if (!clanId) { results.skipped.push({ applicationId: a.applicationId, reason: 'no clan chosen' }); continue; }
      try {
        await applicationService.acceptApplication(a.applicationId, { clanId }, acceptedBy);
        results.accepted += 1;
      } catch (e) {
        results.skipped.push({ applicationId: a.applicationId, reason: e.message });
      }
    }
    return results;
  }

  /**
   * Commit the UNPLACED-mentee plan: place each registered mentee straight into
   * their clan via clanService.addMember (creates the membership + enrollment).
   * No invite — they already have an account. Resilient per row.
   */
  async commitPlacement(cohortId, placements) {
    if (!Array.isArray(placements) || !placements.length) throw new ValidationError('Nothing to place');
    const clanService = require('./clanService');
    const results = { placed: 0, skipped: [] };
    for (const p of placements) {
      const clanId = p.clanId || null;
      const userId = p.userId || null;
      if (!clanId || !userId) { results.skipped.push({ userId, reason: 'missing clan or user' }); continue; }
      try {
        // actor omitted: the route already enforces INTAKE_MANAGE.
        await clanService.addMember(clanId, { userId, role: 'mentee' });
        results.placed += 1;
      } catch (e) {
        results.skipped.push({ userId, reason: e.message });
      }
    }
    return results;
  }
}

module.exports = new ClanAssignmentService();

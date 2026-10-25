const { Op } = require('sequelize');
const { models } = require('../db');
const { requireWorkspaceId } = require('../utils/workspaceExecution');
const { ValidationError, NotFoundError } = require('../utils/errors/errorTypes');

/**
 * The rubric: what this workspace judges people on, and every score given.
 *
 * Everything else the platform measures comes from an artifact - was it
 * submitted, was it on time, how was it rated. None of that can see how
 * somebody reasons out loud, argues a position, or takes being told they are
 * wrong, which is most of what a fellowship claims to develop and all of what
 * an employer interviews for.
 *
 * Two rules carry this, and both are about the scorer rather than the data:
 *
 *   FEW COMPETENCIES. Six is the cap. Asked to score a dozen qualities for
 *   fifteen people during a live call, a mentor clicks the same number down
 *   the column and the result is noise that looks like data. The cap is here
 *   rather than in the database so the refusal can explain itself.
 *
 *   FOUR POINTS, NO MIDDLE. A five point scale has a centre, and the centre
 *   is where a tired reviewer puts everybody. Four forces a side.
 */

/** Enough to be useful on day one, few enough to actually get filled in. */
const DEFAULTS = [
  { name: 'Reasoning', description: 'Works a problem through rather than reaching for the first answer. Can say why.' },
  { name: 'Communication', description: 'Makes themselves understood, and checks that they were. Listens before answering.' },
  { name: 'Ownership', description: 'Treats the problem as theirs. Says what they will do next without being asked.' },
  { name: 'Adaptability', description: 'Takes new information and changes position on it, rather than defending the old one.' },
  { name: 'Judgement', description: 'Weighs trade-offs out loud. Knows what they are giving up and says so.' },
];

const MAX_ACTIVE = 6;
const SOURCE_TYPES = ['review_entry', 'task_feedback', 'interview', 'assessment', 'manual'];
const keyOf = (name) => String(name || '').trim().toLowerCase();

class CompetencyService {
  /** The rubric as it should be shown: active, in order. */
  async list({ includeRetired = false } = {}) {
    const where = includeRetired ? {} : { active: true };
    return models.Competency.findAll({
      where,
      order: [['position', 'ASC'], ['name', 'ASC']],
    });
  }

  /**
   * Put a usable rubric in place the first time somebody needs one.
   *
   * A workspace that has to invent five competencies before it can score
   * anybody will score nobody. These are editable and retirable afterwards;
   * what matters is that the first live discussion has something to tick.
   */
  async ensureDefaults(actorId = null) {
    const existing = await models.Competency.count();
    if (existing > 0) return this.list();

    const organizationId = requireWorkspaceId();
    await models.Competency.bulkCreate(DEFAULTS.map((d, index) => ({
      organizationId,
      name: d.name,
      nameKey: keyOf(d.name),
      description: d.description,
      position: index,
      active: true,
      createdBy: actorId,
    })));
    return this.list();
  }

  async create({ name, description = null }, actorId = null) {
    const clean = String(name || '').trim();
    if (!clean) throw new ValidationError('A competency needs a name');
    if (clean.length > 80) throw new ValidationError('That name is too long');

    const nameKey = keyOf(clean);
    if (await models.Competency.findOne({ where: { nameKey }, attributes: ['id'] })) {
      throw new ValidationError(`"${clean}" is already on the rubric`);
    }

    const active = await models.Competency.count({ where: { active: true } });
    if (active >= MAX_ACTIVE) {
      throw new ValidationError(
        `A rubric of more than ${MAX_ACTIVE} is not filled in honestly during a live session. Retire one first.`,
      );
    }

    return models.Competency.create({
      organizationId: requireWorkspaceId(),
      name: clean,
      nameKey,
      description: description ? String(description).trim() : null,
      position: active,
      active: true,
      createdBy: actorId,
    });
  }

  async update(id, { name, description, active, position } = {}) {
    const competency = await models.Competency.findByPk(id);
    if (!competency) throw new NotFoundError('Competency not found');

    const patch = {};
    if (name !== undefined) {
      const clean = String(name || '').trim();
      if (!clean) throw new ValidationError('A competency needs a name');
      const nameKey = keyOf(clean);
      const clash = await models.Competency.findOne({
        where: { nameKey, id: { [Op.ne]: id } }, attributes: ['id'],
      });
      if (clash) throw new ValidationError(`"${clean}" is already on the rubric`);
      patch.name = clean;
      patch.nameKey = nameKey;
    }
    if (description !== undefined) patch.description = description ? String(description).trim() : null;
    if (position !== undefined) patch.position = Number(position) || 0;
    if (active !== undefined) {
      const next = Boolean(active);
      if (next && !competency.active) {
        const live = await models.Competency.count({ where: { active: true } });
        if (live >= MAX_ACTIVE) {
          throw new ValidationError(`Only ${MAX_ACTIVE} can be active at once. Retire one first.`);
        }
      }
      patch.active = next;
    }
    await competency.update(patch);
    return competency;
  }

  /**
   * A competency is retired, never deleted.
   *
   * Scores already given against it are statements somebody made about a real
   * person, often attached to a decision about money. Deleting the row would
   * either destroy them or leave them pointing at nothing.
   */
  async retire(id) {
    return this.update(id, { active: false });
  }

  /**
   * Record scores. One call, because they are given together.
   *
   * Re-scoring the same person for the same source is a CORRECTION, not a
   * second opinion: somebody changing a 2 to a 3 after hearing the rest of a
   * discussion must leave one score behind, not two that average to 2.5.
   */
  async score({ menteeId, sourceType, sourceId = null, scores = [], scoredBy = null } = {}) {
    if (!menteeId) throw new ValidationError('A mentee is required');
    if (!SOURCE_TYPES.includes(sourceType)) {
      throw new ValidationError(`sourceType must be one of: ${SOURCE_TYPES.join(', ')}`);
    }
    const items = (Array.isArray(scores) ? scores : []).filter((s) => s && s.competencyId);
    if (!items.length) throw new ValidationError('Nothing to score');

    const ids = [...new Set(items.map((s) => s.competencyId))];
    const known = await models.Competency.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id'] });
    if (known.length !== ids.length) throw new ValidationError('That competency is not on this rubric');

    const organizationId = requireWorkspaceId();
    const saved = [];
    for (const item of items) {
      const value = Number(item.score);
      if (!Number.isInteger(value) || value < 1 || value > 4) {
        throw new ValidationError('A score is a whole number from 1 to 4');
      }
      const note = item.note ? String(item.note).trim().slice(0, 1000) : null;

      // eslint-disable-next-line no-await-in-loop
      const [row, created] = await models.CompetencyScore.findOrCreate({
        where: { competencyId: item.competencyId, menteeId, sourceType, sourceId },
        defaults: {
          organizationId,
          competencyId: item.competencyId,
          menteeId,
          score: value,
          note,
          sourceType,
          sourceId,
          scoredBy,
          scoredAt: new Date(),
        },
      });
      if (!created) {
        // eslint-disable-next-line no-await-in-loop
        await row.update({ score: value, note, scoredBy, scoredAt: new Date() });
      }
      saved.push(row);
    }
    return saved;
  }

  /** Every score given from one place, keyed by mentee. */
  async forSource(sourceType, sourceId) {
    const rows = await models.CompetencyScore.findAll({
      where: { sourceType, sourceId },
      attributes: ['id', 'competencyId', 'menteeId', 'score', 'note', 'scoredAt'],
    });
    const byMentee = new Map();
    for (const row of rows) {
      if (!byMentee.has(row.menteeId)) byMentee.set(row.menteeId, []);
      byMentee.get(row.menteeId).push({
        competencyId: row.competencyId,
        score: row.score,
        note: row.note,
        scoredAt: row.scoredAt,
      });
    }
    return byMentee;
  }

  /**
   * Where a group of people currently stand, per competency.
   *
   * The latest score is the answer rather than the mean of every score ever
   * given: the question a reviewer is asking is "where are they now", and an
   * average drags a person who has visibly improved back toward the version of
   * them that existed in month one. The count and the first score come back
   * too, so a screen can show the movement without having to guess at it.
   */
  async standingFor(menteeIds = [], { from = null, to = null } = {}) {
    const ids = [...new Set(menteeIds)].filter(Boolean);
    const out = new Map(ids.map((id) => [id, []]));
    if (!ids.length) return out;

    const where = { menteeId: { [Op.in]: ids } };
    if (from || to) {
      where.scoredAt = {};
      if (from) where.scoredAt[Op.gte] = from;
      if (to) where.scoredAt[Op.lte] = to;
    }

    const rows = await models.CompetencyScore.findAll({
      where,
      attributes: ['competencyId', 'menteeId', 'score', 'scoredAt'],
      order: [['scoredAt', 'ASC']],
      raw: true,
    });

    const byPair = new Map();
    for (const row of rows) {
      const key = `${row.menteeId}:${row.competencyId}`;
      const seen = byPair.get(key);
      if (!seen) {
        byPair.set(key, { menteeId: row.menteeId, competencyId: row.competencyId, first: row.score, latest: row.score, times: 1 });
      } else {
        seen.latest = row.score;
        seen.times += 1;
      }
    }
    for (const value of byPair.values()) {
      out.get(value.menteeId).push({
        competencyId: value.competencyId,
        score: value.latest,
        first: value.first,
        times: value.times,
        trend: value.times < 2 ? 'new' : value.latest > value.first ? 'up' : value.latest < value.first ? 'down' : 'flat',
      });
    }
    return out;
  }
}

module.exports = new CompetencyService();
module.exports.MAX_ACTIVE = MAX_ACTIVE;
module.exports.SOURCE_TYPES = SOURCE_TYPES;

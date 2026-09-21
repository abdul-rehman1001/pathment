const crypto = require('crypto');
const { models } = require('../db');
const { normalizeTaskSchedule } = require('../utils/taskSchedule');
const { ValidationError } = require('../utils/errors/errorTypes');

async function find(task, transaction) {
  const rows = await models.MenteeSchedule.findAll({ where: { menteeId: task.menteeId, clanId: task.clanId }, transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
  for (const row of rows) {
    const slot = (row.schedule || []).find(s => s.id === task.scheduleSlotId || s.recurring?.sourceTaskId === task.id);
    if (slot) return { row, slot };
  }
  return { row: rows[0], slot: null };
}
async function read(task) {
  const { slot } = await find(task);
  return slot?.recurring ? { ...slot.recurring, task: undefined, mentorId: undefined, clanId: undefined } : null;
}
async function save(task, input, mentorId, transaction) {
  if (!['assigned', 'not_started', 'in_progress'].includes(task.status)) throw new ValidationError('Scheduling can only change before submission');
  await models.User.findByPk(task.menteeId, { transaction, lock: transaction.LOCK.UPDATE });
  let { row, slot } = await find(task, transaction);
  if (input?.mode === 'now') {
    if (slot) { row.schedule = row.schedule.filter(s => s.id !== slot.id); await row.save({ transaction }); }
    return;
  }
  const rt = await models.RoadmapTask.findByPk(task.roadmapTaskId, { include: [{ model: models.TaskResource, as: 'resources' }], transaction });
  const type = task.typeOverride || rt.type;
  const config = normalizeTaskSchedule(input, type);
  const { zonedWallClockToUtc } = require('../utils/timezone');
  if (zonedWallClockToUtc(config.startsOn, config.timeLocal, config.timezone) <= new Date()) throw new ValidationError('Choose a future start for upcoming assignments');
  const recipe = { ...slot?.recurring?.task, title: task.titleOverride ?? rt.title, description: task.descriptionOverride ?? rt.description, type, difficulty: rt.difficulty, deliverable: task.deliverableOverride ?? rt.deliverable, acceptanceCriteria: task.acceptanceCriteriaOverride ?? rt.acceptanceCriteria, resources: task.resourcesOverride ?? (rt.resources || []).map(r => ({ title: r.title, url: r.url, resourceType: r.resourceType })), openSourceOrgIds: task.openSourceOrgIds };
  if (['quiz', 'interview'].includes(type) && !recipe[type]?.kitId) {
    const model = type === 'quiz' ? models.QuizAssignment : models.InterviewAssignment;
    const assignment = await model.findOne({ where: { assignedTaskId: task.id }, transaction, raw: true });
    if (assignment) {
      const { id, assignedTaskId, createdAt, updatedAt, ...options } = assignment;
      recipe[type] = options;
    }
  }
  if (['quiz', 'interview'].includes(type) && !recipe[type]?.kitId) throw new ValidationError('Schedule this quiz or interview from its assignment form so its kit is included');
  if (!row) row = await models.MenteeSchedule.create({ menteeId: task.menteeId, clanId: task.clanId, assignedBy: mentorId, timezone: config.timezone, schedule: [] }, { transaction });
  const next = { id: slot?.id || `slot-recurring-${crypto.randomUUID()}`, label: recipe.title, time: config.timeLocal, days: 'everyday', kind: 'recurring', recurring: { ...config, title: recipe.title, task: recipe, mentorId, clanId: task.clanId, sourceTaskId: slot?.recurring?.sourceTaskId || task.id } };
  row.schedule = [...(row.schedule || []).filter(s => s.id !== next.id), next];
  await row.save({ transaction });
}
module.exports = { read, save };

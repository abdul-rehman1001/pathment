const crypto = require('crypto');
const { models, sequelize } = require('../db');
const { ValidationError } = require('../utils/errors/errorTypes');
const { normalizeTaskSchedule } = require('../utils/taskSchedule');

/** Save the task recipe, not a reduced placeholder. The existing worker creates occurrences. */
async function create(data, mentorId, clanId) {
  if (typeof data.title !== 'string' || !data.title.trim())
    throw new ValidationError('Task title is required');
  data = { ...data, title: data.title.trim() };
  const config = normalizeTaskSchedule(data.schedule, data.type);
  const task = Object.fromEntries(
    [
      'title',
      'description',
      'type',
      'difficulty',
      'deliverable',
      'acceptanceCriteria',
      'resources',
      'interview',
      'quiz',
      'openSourceOrgIds',
      'trackId',
    ]
      .filter((key) => data[key] !== undefined)
      .map((key) => [key, data[key]]),
  );
  const slot = {
    id: `slot-recurring-${crypto.randomUUID()}`,
    label: data.title,
    time: config.timeLocal,
    days: 'everyday',
    kind: 'recurring',
    recurring: { ...config, title: data.title, task, mentorId, clanId },
  };
  await sequelize.transaction(async (transaction) => {
    // Serialize additions even when a mentee has no schedule row yet.
    await models.User.findByPk(data.menteeId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const [schedule] = await models.MenteeSchedule.findOrCreate({
      where: { menteeId: data.menteeId, clanId },
      defaults: {
        assignedBy: mentorId,
        clanId,
        timezone: config.timezone,
        schedule: [],
      },
      transaction,
    });
    schedule.schedule = [
      ...(Array.isArray(schedule.schedule) ? schedule.schedule : []),
      slot,
    ];
    await schedule.save({ transaction });
  });
  // The periodic worker retries safely if activation fails. Keep saved schedules durable.
  const materializer = require('./recurringSlotMaterializer');
  materializer
    .activateSlotForMentor(mentorId, slot.id, [data.menteeId])
    .catch((err) =>
      console.error('[taskSchedule] Activation deferred:', err.message),
    );
  return slot;
}
module.exports = { create };

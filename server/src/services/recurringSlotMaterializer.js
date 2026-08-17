const { Op } = require('sequelize');
const { models } = require('../db');
const { nextOccurrences } = require('../utils/reviewRecurrence');
const taskService = require('./taskService');

const HORIZON_DAYS = 14;

class RecurringSlotMaterializer {
  /**
   * Periodic tick run by notificationScheduler.
   * Finds all active MenteeSchedule recurring slots and materializes upcoming tasks.
   */
  async tick() {
    try {
      const menteeSchedules = await models.MenteeSchedule.findAll();
      let createdCount = 0;

      for (const ms of menteeSchedules) {
        const schedule = Array.isArray(ms.schedule) ? ms.schedule : [];
        const mentorId = ms.assignedBy;
        if (!mentorId) continue;

        for (const slot of schedule) {
          if (slot.kind !== 'recurring' || !slot.recurring) continue;

          const rec = slot.recurring;
          if (!rec.title || !rec.startsOn || rec.dayOfWeek == null || !rec.timeLocal) continue;

          try {
            const count = await this._processSlotForMentee(ms.menteeId, mentorId, slot.id, rec);
            createdCount += count;
          } catch (err) {
            console.error(`[recurringSlotMaterializer] Error processing slot ${slot.id} for mentee ${ms.menteeId}:`, err.message);
          }
        }
      }

      if (createdCount > 0) {
        console.log(`[recurringSlotMaterializer] Materialized ${createdCount} recurring schedule task(s)`);
      }
      return { createdCount };
    } catch (error) {
      console.error('[recurringSlotMaterializer] tick failed:', error.message);
      return { createdCount: 0, error: error.message };
    }
  }

  /**
   * Materialize occurrences for a specific slot across all mentees assigned by mentorId.
   * Driven by mentor's "Activate now" button.
   */
  async activateSlotForMentor(mentorId, slotId, menteeIds = null) {
    const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'slot';
    const where = Array.isArray(menteeIds) && menteeIds.length
      ? { menteeId: menteeIds, assignedBy: mentorId }
      : { assignedBy: mentorId };
    const menteeSchedules = await models.MenteeSchedule.findAll({ where });

    let appliedMentees = 0;
    let createdTasks = 0;
    let updatedTasks = 0;

    for (const ms of menteeSchedules) {
      const schedule = Array.isArray(ms.schedule) ? ms.schedule : [];
      let slot = schedule.find((s, i) => (s.id || slug(s.label) || `block-${i}`) === slotId);
      if (!slot && /^(slot|block)-\d+$/.test(slotId)) {
        const num = Number(slotId.replace(/^(slot|block)-/, ''));
        if (num >= 0 && num < schedule.length) slot = schedule[num];
      }
      if (!slot || slot.kind !== 'recurring' || !slot.recurring) continue;

      const rec = slot.recurring;
      if (!rec.title || !rec.startsOn || rec.dayOfWeek == null || !rec.timeLocal) continue;

      appliedMentees++;
      const res = await this._processSlotForMentee(ms.menteeId, mentorId, slot.id || slotId, rec);
      createdTasks += (res?.createdForSlot || 0);
      updatedTasks += (res?.updatedForSlot || 0);
    }

    return { appliedMentees, createdTasks, updatedTasks };
  }

  /**
   * Process a single recurring slot for a mentee and create missing occurrence tasks.
   */
  async _processSlotForMentee(menteeId, mentorId, slotId, recConfig) {
    const now = new Date();
    const horizon = new Date(now.getTime() + HORIZON_DAYS * 86400000);
    const targetDays = Array.isArray(recConfig.daysOfWeek) && recConfig.daysOfWeek.length > 0
      ? recConfig.daysOfWeek.map(Number)
      : [Number(recConfig.dayOfWeek ?? 1)];

    let rawOccurrences = [];
    for (const day of targetDays) {
      const scheduleDef = {
        dayOfWeek: day,
        timeLocal: recConfig.timeLocal,
        timezone: recConfig.timezone || 'UTC',
        intervalWeeks: Number(recConfig.intervalWeeks) || 1,
        startsOn: recConfig.startsOn,
        endsOn: recConfig.endsOn || null,
      };
      const occs = nextOccurrences(scheduleDef, now, 4).filter((o) => o.start <= horizon);
      rawOccurrences.push(...occs);
    }

    const occMap = new Map();
    for (const o of rawOccurrences) {
      if (!occMap.has(o.dateStr)) occMap.set(o.dateStr, o);
    }
    const occurrences = [...occMap.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
    let createdForSlot = 0;
    let updatedForSlot = 0;

    for (const occ of occurrences) {
      const occurrenceDate = occ.dateStr;
      const offsetDays = Number(recConfig.dueOffsetDays) || 7;
      const occDateObj = new Date(occurrenceDate + 'T00:00:00Z');
      const dueDateObj = new Date(occDateObj.getTime() + offsetDays * 86400000);
      const dueDate = dueDateObj.toISOString().split('T')[0];

      const title = String(recConfig.title || '').trim() || 'Scheduled Task';
      const rawType = String(recConfig.type || 'discussion').toLowerCase();
      const type = ['discussion', 'project', 'reading', 'exercise'].includes(rawType) ? rawType : 'discussion';

      const existing = await models.AssignedTask.findOne({
        where: {
          menteeId,
          scheduleSlotId: slotId,
          occurrenceDate,
        },
      });

      if (existing) {
        try {
          if (existing.roadmapTaskId) {
            await models.RoadmapTask.update(
              { title, type, description: `Recurring task (${title}) for ${occurrenceDate}` },
              { where: { id: existing.roadmapTaskId } }
            );
          }
          await existing.update({ dueDate });
          updatedForSlot++;
        } catch (_) {}
        continue;
      }

      try {
        await taskService.createCustomTask(
          {
            menteeId,
            title,
            type,
            description: `Recurring task (${title}) for ${occurrenceDate}`,
            dueDate,
            scheduleSlotId: slotId,
            occurrenceDate,
          },
          mentorId
        );
        createdForSlot++;
      } catch (err) {
        if (!/unique/i.test(err.message)) {
          console.error(`[recurringSlotMaterializer] Failed to create task for mentee ${menteeId}, slot ${slotId}, occ ${occurrenceDate}:`, err.message);
        }
      }
    }

    return { createdForSlot, updatedForSlot };
  }
}

module.exports = new RecurringSlotMaterializer();

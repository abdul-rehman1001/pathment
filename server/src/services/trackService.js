const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const taskService = require('./taskService');

const ACTIVE_ENROLLMENT_STATUSES = ['active', 'matched', 'approved', 'pending_completion', 'level_completed'];

/**
 * trackService - personal lanes for a mentee. Tasks belong to a track via
 * AssignedTask.trackId; the mentor curates lanes from the mentee profile and
 * the mentee's This-Week view groups by track.
 */
class TrackService {
  async _activeEnrollment(menteeId) {
    const enrollments = await models.Enrollment.findAll({ where: { menteeId } });
    return enrollments.find((e) => ACTIVE_ENROLLMENT_STATUSES.includes(e.status))
      || [...enrollments].sort((a, b) => new Date(b.enrolledAt || 0) - new Date(a.enrolledAt || 0))[0]
      || null;
  }

  /** All non-archived tracks for a mentee, each with its open/recent tasks. */
  async listForMentee(menteeId, { includeArchived = false } = {}) {
    const where = { menteeId };
    if (!includeArchived) where.archived = false;
    const tracks = await models.Track.findAll({
      where,
      order: [['archived', 'ASC'], ['order_index', 'ASC'], ['created_at', 'ASC']]
    });

    // Pull this mentee's track-tagged tasks in one go, then group in memory.
    const tasks = await models.AssignedTask.findAll({
      where: { menteeId, trackId: { [Op.ne]: null }, status: { [Op.ne]: 'cancelled' } },
      include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['id', 'title', 'type'] }],
      order: [['created_at', 'ASC']]
    });

    const byTrack = new Map();
    for (const t of tasks) {
      const list = byTrack.get(t.trackId) || [];
      list.push({
        id: t.id,
        title: t.roadmapTask?.title || 'Task',
        type: t.typeOverride || t.roadmapTask?.type || 'custom',
        status: t.status,
        dueDate: t.dueDate
      });
      byTrack.set(t.trackId, list);
    }

    return tracks.map((tr) => ({
      id: tr.id,
      name: tr.name,
      color: tr.color,
      source: tr.source,
      archived: tr.archived,
      orderIndex: tr.orderIndex,
      tasks: byTrack.get(tr.id) || []
    }));
  }

  async create(menteeId, mentorId, { name, color, source }) {
    if (!name || !name.trim()) throw new ValidationError('name is required');
    const max = await models.Track.max('order_index', { where: { menteeId } });
    return models.Track.create({
      menteeId,
      name: name.trim(),
      color: color || null,
      source: ['blank', 'template', 'program'].includes(source) ? source : 'blank',
      orderIndex: Number.isFinite(max) ? max + 1 : 0,
      createdBy: mentorId
    });
  }

  async rename(trackId, name) {
    if (!name || !name.trim()) throw new ValidationError('name is required');
    const track = await models.Track.findByPk(trackId);
    if (!track) throw new NotFoundError('Track not found');
    track.name = name.trim();
    await track.save();
    return track;
  }

  async setArchived(trackId, archived) {
    const track = await models.Track.findByPk(trackId);
    if (!track) throw new NotFoundError('Track not found');
    track.archived = !!archived;
    await track.save();
    return track;
  }

  async reorder(menteeId, orderedIds) {
    if (!Array.isArray(orderedIds)) throw new ValidationError('orderedIds required');
    await Promise.all(orderedIds.map((id, i) =>
      models.Track.update({ orderIndex: i }, { where: { id, menteeId } })
    ));
    return this.listForMentee(menteeId);
  }

  /** Delete a track; its tasks are untagged (track_id → null), not removed. */
  async remove(trackId) {
    const track = await models.Track.findByPk(trackId);
    if (!track) throw new NotFoundError('Track not found');
    await models.AssignedTask.update({ trackId: null }, { where: { trackId } });
    await track.destroy();
    return { deleted: true };
  }

  /** Quick-add a custom task straight into a track. */
  async addTask(trackId, mentorId, { title, type, dueDate }) {
    const track = await models.Track.findByPk(trackId);
    if (!track) throw new NotFoundError('Track not found');
    if (!title || !title.trim()) throw new ValidationError('title is required');
    const enrollment = await this._activeEnrollment(track.menteeId);
    if (!enrollment) throw new ValidationError('Mentee has no enrollment to attach this task to');
    return taskService.createCustomTask({
      menteeId: track.menteeId,
      enrollmentId: enrollment.id,
      trackId,
      title: title.trim(),
      description: title.trim(),
      type: type || 'assignment',
      dueDate: dueDate || null
    }, mentorId);
  }

  /** Move an existing assigned task into a track (or out, trackId=null). */
  async setTaskTrack(assignedTaskId, trackId) {
    const task = await models.AssignedTask.findByPk(assignedTaskId);
    if (!task) throw new NotFoundError('Task not found');
    if (trackId) {
      const track = await models.Track.findByPk(trackId);
      if (!track) throw new NotFoundError('Track not found');
      if (track.menteeId !== task.menteeId) throw new ValidationError('Track belongs to a different mentee');
    }
    task.trackId = trackId || null;
    await task.save();
    return { id: task.id, trackId: task.trackId };
  }
}

module.exports = new TrackService();

'use strict';

/**
 * Who is allowed to move a task, and where to.
 *
 * Owning a task was the whole permission check on `updateTaskStatus`, so a
 * mentee could PATCH their own task straight to 'completed' and mark their own
 * work approved: no submission, no review, no mentor involved. It counted
 * towards their progress and towards the roadmap completion that decides
 * whether an enrollment is ready for sign-off.
 *
 * Starting is the one transition that is genuinely theirs. These pin both
 * halves: that it still works, and that nothing else does.
 */

const taskService = require('../../src/services/taskService');
const { models } = require('../../src/db');
const {
  cleanDb,
  createMentee,
  createMentor,
  createProgram,
  createRoadmap,
  createEnrollment,
  createAssignedTask,
} = require('../helpers/seed');

/**
 * Built here rather than through the shared seed helper, which still creates
 * roadmap weeks. Weeks were dropped when roadmaps went linear and a task now
 * hangs off the roadmap directly, so that helper throws before it reaches the
 * thing these tests are about.
 */
async function roadmapStep(roadmapId) {
  return models.RoadmapTask.create({
    roadmapId,
    title: 'Build a REST API',
    description: 'A step to act on',
    type: 'project',
    difficulty: 'medium',
    taskOrder: 1,
    deliverable: 'A repository link',
    acceptanceCriteria: [],
    estimatedHours: 5,
  });
}

describe('who can move a task', () => {
  let mentee;
  let mentor;
  let task;

  beforeEach(async () => {
    await cleanDb();

    mentee = await createMentee();
    mentor = await createMentor();

    const program = await createProgram({ createdBy: mentor.id });
    const roadmap = await createRoadmap({ programId: program.id, createdBy: mentor.id });
    const roadmapTask = await roadmapStep(roadmap.id);
    const enrollment = await createEnrollment({ menteeId: mentee.id, programId: program.id });

    task = await createAssignedTask({
      menteeId: mentee.id,
      mentorId: mentor.id,
      enrollmentId: enrollment.id,
      roadmapTaskId: roadmapTask.id,
      status: 'assigned',
    });
  });

  it('lets the mentee start their own task', async () => {
    const updated = await taskService.updateTaskStatus(task.id, mentee.id, 'mentee', 'in_progress');
    expect(updated.status).toBe('in_progress');
  });

  // Nothing was setting this, so a mentor could not tell a task somebody had
  // opened from one they had not looked at.
  it('records when they picked it up', async () => {
    await taskService.updateTaskStatus(task.id, mentee.id, 'mentee', 'in_progress');

    const row = await models.AssignedTask.findByPk(task.id);
    expect(row.startedAt).toBeTruthy();
  });

  it('keeps the original start time when they start it twice', async () => {
    await taskService.updateTaskStatus(task.id, mentee.id, 'mentee', 'in_progress');
    const first = (await models.AssignedTask.findByPk(task.id)).startedAt;

    await taskService.updateTaskStatus(task.id, mentee.id, 'mentee', 'in_progress');
    const second = (await models.AssignedTask.findByPk(task.id)).startedAt;

    expect(new Date(second).getTime()).toBe(new Date(first).getTime());
  });

  /** The hole, stated directly. */
  it('does not let the mentee approve their own work', async () => {
    await expect(
      taskService.updateTaskStatus(task.id, mentee.id, 'mentee', 'completed'),
    ).rejects.toThrow(/only your mentor/i);

    const row = await models.AssignedTask.findByPk(task.id);
    expect(row.status).toBe('assigned');
  });

  it('does not let the mentee claim their work is with the mentor', async () => {
    await expect(
      taskService.updateTaskStatus(task.id, mentee.id, 'mentee', 'submitted'),
    ).rejects.toThrow(/only your mentor/i);
  });

  it('does not let the mentee withdraw a task set for them', async () => {
    await expect(
      taskService.updateTaskStatus(task.id, mentee.id, 'mentee', 'cancelled'),
    ).rejects.toThrow(/only your mentor/i);
  });

  it('does not let the mentee ask themselves for changes', async () => {
    await expect(
      taskService.updateTaskStatus(task.id, mentee.id, 'mentee', 'revision_needed'),
    ).rejects.toThrow(/only your mentor/i);
  });

  it('still lets the assigning mentor set any of them', async () => {
    const approved = await taskService.updateTaskStatus(task.id, mentor.id, 'mentor', 'completed');
    expect(approved.status).toBe('completed');

    const withdrawn = await taskService.updateTaskStatus(task.id, mentor.id, 'mentor', 'cancelled');
    expect(withdrawn.status).toBe('cancelled');
  });

  it('still turns away somebody with nothing to do with the task', async () => {
    const stranger = await createMentor({ email: 'stranger@test.com' });

    await expect(
      taskService.updateTaskStatus(task.id, stranger.id, 'mentor', 'in_progress'),
    ).rejects.toThrow(/not authorized/i);
  });

  it('rejects a status that is not one of them at all', async () => {
    await expect(
      taskService.updateTaskStatus(task.id, mentor.id, 'mentor', 'finished'),
    ).rejects.toThrow(/invalid status/i);
  });
});

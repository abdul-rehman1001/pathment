'use strict';

/**
 * The three review queues, pinned to the keys they actually answer with.
 *
 * `/mentor/approvals` answers with `{ queue }`. The other two answer with
 * `{ items }`. The phone read `queue` for all three, and `?? []` turned the two
 * misses into empty lists without an error anywhere. So a mentor could send
 * work back and watch the Sent back tab stay at nought, and grade twenty
 * submissions and find none of them under Graded.
 *
 * That is exactly the failure a shape test exists to catch: nothing throws,
 * nothing logs, two tabs are simply always empty.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const {
  cleanDb,
  createAdmin,
  createMentor,
  createMentee,
  createProgram,
  createEnrollment,
  createAssignedTask,
  authHeader,
} = require('../helpers/seed');

let admin;
let mentor;
let mentee;
let program;
let clan;
let roadmapTask;
let enrollment;

async function assignTask(status) {
  return createAssignedTask({
    menteeId: mentee.id,
    mentorId: mentor.id,
    enrollmentId: enrollment.id,
    roadmapTaskId: roadmapTask.id,
    status,
  });
}

beforeEach(async () => {
  await cleanDb();
  admin = await createAdmin({ email: 'approvals-admin@test.com' });
  mentor = await createMentor({ email: 'approvals-mentor@test.com' });
  mentee = await createMentee({ email: 'approvals-mentee@test.com' });
  program = await createProgram({ createdBy: admin.id, name: 'Backend' });

  clan = await models.Clan.create({
    name: 'Node Guild',
    programId: program.id,
    createdBy: admin.id,
  });
  for (const [userId, role] of [[mentor.id, 'lead_mentor'], [mentee.id, 'mentee']]) {
    await models.ClanMembership.create({ clanId: clan.id, userId, role, status: 'active' });
  }

  enrollment = await createEnrollment({
    menteeId: mentee.id,
    programId: program.id,
    status: 'active',
  });

  const roadmap = await models.Roadmap.create({
    programId: program.id,
    createdBy: admin.id,
    name: 'Core',
    description: 'Core roadmap',
  });
  roadmapTask = await models.RoadmapTask.create({
    roadmapId: roadmap.id,
    title: 'Build the login screen',
    description: 'Wire the form to the auth endpoint.',
    type: 'project',
    deliverable: 'A screen that signs somebody in.',
    taskOrder: 1,
    difficulty: 'medium',
  });
});

describe('the three queues', () => {
  test('work awaiting review comes back under queue', async () => {
    const task = await assignTask('submitted');
    await models.TaskSubmission.create({
      assignedTaskId: task.id,
      version: 1,
      submissionText: 'Done',
      status: 'pending',
      submittedAt: new Date(),
    });

    const response = await request(app)
      .get('/api/mentor/approvals')
      .set('Authorization', authHeader(mentor));

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data.queue)).toBe(true);
    expect(response.body.data.queue).toHaveLength(1);
  });

  // The bug. This answers with items, and the phone was reading queue.
  test('sent back comes back under items, not queue', async () => {
    const task = await assignTask('revision_needed');
    // Feedback always belongs to the submission it is about, so sending work
    // back needs the version that was sent.
    const submission = await models.TaskSubmission.create({
      assignedTaskId: task.id,
      version: 1,
      submissionText: 'First go',
      status: 'revision_needed',
      submittedAt: new Date(),
    });
    await models.TaskFeedback.create({
      assignedTaskId: task.id,
      submissionId: submission.id,
      mentorId: mentor.id,
      feedbackText: 'Close',
      revisionNotes: '1. Handle the offline case',
      rating: 3,
      isApproved: false,
      decision: 'changes',
      feedbackType: 'general',
    });

    const response = await request(app)
      .get('/api/mentor/approvals/changes-requested')
      .set('Authorization', authHeader(mentor));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveProperty('items');
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].revisionNotes).toMatch(/offline/);
  });

  test('graded comes back under items too', async () => {
    const task = await assignTask('completed');
    const submission = await models.TaskSubmission.create({
      assignedTaskId: task.id,
      version: 1,
      submissionText: 'Done',
      status: 'approved',
      submittedAt: new Date(),
      reviewedAt: new Date(),
    });
    await models.TaskFeedback.create({
      assignedTaskId: task.id,
      submissionId: submission.id,
      mentorId: mentor.id,
      feedbackText: 'Solid',
      rating: 4,
      isApproved: true,
      decision: 'approved',
      feedbackType: 'general',
    });

    const response = await request(app)
      .get('/api/mentor/approvals/reviewed')
      .set('Authorization', authHeader(mentor));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveProperty('items');
    expect(response.body.data.items).toHaveLength(1);
  });
});

describe('an extension request', () => {
  /**
   * A pending extension does not move the task to 'submitted', because the
   * mentee has not done the work. It still belongs in the queue, flagged, so
   * the phone can put it on its own tab.
   */
  test('reaches the queue flagged, even though the task is not submitted', async () => {
    const task = await assignTask('in_progress');
    await models.TaskSubmission.create({
      assignedTaskId: task.id,
      version: 1,
      submissionText: '',
      status: 'pending',
      extensionRequested: true,
      extensionStatus: 'pending',
      extensionReason: 'Night shift moved',
      extensionDays: 3,
      submittedAt: new Date(),
    });

    const response = await request(app)
      .get('/api/mentor/approvals')
      .set('Authorization', authHeader(mentor));

    const rows = response.body.data.queue;
    expect(rows).toHaveLength(1);
    expect(rows[0].isExtensionRequest).toBe(true);
    expect(rows[0].extensionDays).toBe(3);
    expect(rows[0].extensionReason).toMatch(/Night shift/);
  });

  // The phone splits one queue into two tabs on this flag alone.
  test('is told apart from work awaiting review', async () => {
    const waiting = await assignTask('submitted');
    await models.TaskSubmission.create({
      assignedTaskId: waiting.id,
      version: 1,
      submissionText: 'Done',
      status: 'pending',
      submittedAt: new Date(),
    });

    const asking = await assignTask('in_progress');
    await models.TaskSubmission.create({
      assignedTaskId: asking.id,
      version: 1,
      submissionText: '',
      status: 'pending',
      extensionRequested: true,
      extensionStatus: 'pending',
      extensionDays: 3,
      submittedAt: new Date(),
    });

    const response = await request(app)
      .get('/api/mentor/approvals')
      .set('Authorization', authHeader(mentor));

    const rows = response.body.data.queue;
    expect(rows).toHaveLength(2);
    expect(rows.filter((one) => one.isExtensionRequest)).toHaveLength(1);
    expect(rows.filter((one) => !one.isExtensionRequest)).toHaveLength(1);
  });
});

/**
 * A mentor marking work they can actually open.
 *
 * The queue has carried the links and the attached files all along, and the
 * review sheet showed the note and nothing else, so a mentor rated work with no
 * way to reach it. These pin the fields that sheet now reads.
 */
describe('what the mentee actually sent', () => {
  test('the links come with the submission', async () => {
    const task = await assignTask('submitted');
    await models.TaskSubmission.create({
      assignedTaskId: task.id,
      version: 1,
      submissionText: 'Repo and notes',
      submissionUrls: ['https://github.com/noor/api', 'https://noor-api.vercel.app'],
      status: 'pending',
      submittedAt: new Date(),
    });

    const response = await request(app)
      .get('/api/mentor/approvals')
      .set('Authorization', authHeader(mentor));

    expect(response.body.data.queue[0].submissionUrls).toEqual([
      'https://github.com/noor/api',
      'https://noor-api.vercel.app',
    ]);
  });

  test('the attachments come with it, with what is needed to open one', async () => {
    const task = await assignTask('submitted');
    const submission = await models.TaskSubmission.create({
      assignedTaskId: task.id,
      version: 1,
      submissionText: 'Screenshots attached',
      status: 'pending',
      submittedAt: new Date(),
    });
    await models.TaskSubmissionFile.create({
      submissionId: submission.id,
      fileName: 'retry-path.png',
      fileUrl: 'https://res.cloudinary.com/demo/image/upload/retry-path.png',
      fileType: 'image/png',
      fileSizeBytes: 374_000,
    });

    const response = await request(app)
      .get('/api/mentor/approvals')
      .set('Authorization', authHeader(mentor));

    const files = response.body.data.queue[0].files;
    expect(files).toHaveLength(1);
    expect(files[0].fileName).toBe('retry-path.png');
    expect(files[0].fileUrl).toMatch(/^https:/);
    // A BIGINT, which the driver hands back as a string so precision is never
    // quietly lost. The phone formats it through Number for exactly this
    // reason, and asserting the string here is what says so out loud.
    expect(Number(files[0].fileSizeBytes)).toBe(374_000);
  });

  test('is an empty list rather than missing when nothing was attached', async () => {
    const task = await assignTask('submitted');
    await models.TaskSubmission.create({
      assignedTaskId: task.id,
      version: 1,
      submissionText: 'Just a note',
      status: 'pending',
      submittedAt: new Date(),
    });

    const response = await request(app)
      .get('/api/mentor/approvals')
      .set('Authorization', authHeader(mentor));

    expect(response.body.data.queue[0].files).toEqual([]);
    expect(response.body.data.queue[0].submissionUrls).toEqual([]);
  });
});

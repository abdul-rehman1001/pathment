const request = require('supertest');
const app = require('../../src/index');
const { authHeader } = require('../helpers/seed');
const { models } = require('../../src/db');
const taskService = require('../../src/services/taskService');
const materializer = require('../../src/services/recurringSlotMaterializer');
const scheduleService = require('../../src/services/scheduleTemplateService');
const {
  normalizeTaskSchedule,
  TASK_TYPES,
} = require('../../src/utils/taskSchedule');
const {
  cleanDb,
  createAdmin,
  createMentor,
  createMentee,
  createProgram,
  createClan,
  createEnrollment,
} = require('../helpers/seed');

const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const timing = {
  mode: 'once',
  startsOn: date,
  timeLocal: '09:00',
  timezone: 'Asia/Karachi',
  dueOffsetDays: 3,
};

describe('minimal task scheduling', () => {
  test.each(TASK_TYPES)(
    '%s keeps its normal task type when scheduled',
    (type) => {
      expect(normalizeTaskSchedule(timing, type)).toMatchObject({
        type,
        mode: 'once',
        endsOn: date,
        timezone: 'Asia/Karachi',
      });
    },
  );
  test.each([
    { timeLocal: '25:60' },
    { startsOn: '2027-02-30' },
    { timezone: 'Invalid/Zone' },
    { dueOffsetDays: 0 },
    { intervalWeeks: 0 },
    { mode: 'weekly', daysOfWeek: [] },
    { mode: 'weekly', daysOfWeek: [7] },
    { mode: 'weekly', daysOfWeek: [1], endsOn: '2020-01-01' },
  ])('rejects invalid timing %j', (patch) =>
    expect(() =>
      normalizeTaskSchedule({ ...timing, ...patch }, 'project'),
    ).toThrow(),
  );
});

describe('scheduled task lifecycle', () => {
  let mentor, mentee, clan;
  beforeAll(async () => {
    await cleanDb();
    const admin = await createAdmin();
    mentor = await createMentor();
    mentee = await createMentee();
    const program = await createProgram({ createdBy: admin.id });
    clan = await createClan({
      programId: program.id,
      createdBy: admin.id,
      leadMentor: mentor,
      mentees: [mentee],
    });
    await createEnrollment({
      menteeId: mentee.id,
      programId: program.id,
      status: 'active',
    });
  });

  test('a scheduled project retains its brief, resources and difficulty and materializes once under concurrent activation', async () => {
    const slot = await taskService.createCustomTask(
      {
        menteeId: mentee.id,
        title: 'Scheduled API project',
        type: 'project',
        description: '<p>Build an API.</p>',
        difficulty: 'hard',
        deliverable: 'A working API',
        acceptanceCriteria: ['Tests pass'],
        resources: [{ title: 'Guide', url: 'https://example.com/guide' }],
        schedule: timing,
      },
      mentor.id,
    );
    expect(slot.recurring.task).toMatchObject({
      type: 'project',
      difficulty: 'hard',
      description: '<p>Build an API.</p>',
    });
    await Promise.all(
      [1, 2].map(() =>
        materializer.activateSlotForMentor(mentor.id, slot.id, [mentee.id]),
      ),
    );
    const tasks = await models.AssignedTask.findAll({
      where: { menteeId: mentee.id, scheduleSlotId: slot.id },
      include: [{ model: models.RoadmapTask, as: 'roadmapTask' }],
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].roadmapTask).toMatchObject({
      type: 'project',
      difficulty: 'hard',
      description: '<p>Build an API.</p>',
      deliverable: 'A working API',
    });
    expect(
      await models.TaskResource.count({
        where: { roadmapTaskId: tasks[0].roadmapTaskId },
      }),
    ).toBe(1);
    await scheduleService.updateSlot(
      mentee.id,
      slot.id,
      { kind: 'recurring', recurring: { ...slot.recurring, dueOffsetDays: 5 } },
      mentor.id,
      clan.id,
    );
    const saved = await models.MenteeSchedule.findOne({
      where: { menteeId: mentee.id, clanId: clan.id },
    });
    expect(
      saved.schedule.find((s) => s.id === slot.id).recurring.task.description,
    ).toBe('<p>Build an API.</p>');
    await materializer.activateSlotForMentor(mentor.id, slot.id, [mentee.id]);
    await tasks[0].reload();
    expect(tasks[0].dueDate.toISOString().slice(0, 10)).not.toBe(
      new Date(Date.parse(date) + 5 * 86400000).toISOString().slice(0, 10),
    );
  });

  test('the HTTP endpoint schedules a quiz and retains its kit options', async () => {
    const kit = await models.QuizKit.create({
      title: 'Scheduled knowledge check',
      status: 'published',
      createdBy: mentor.id,
    });
    await models.QuizQuestion.create({
      kitId: kit.id,
      position: 0,
      kind: 'short',
      prompt: 'Name a framework',
      points: 1,
      acceptedAnswers: ['React'],
    });
    const response = await request(app)
      .post('/api/tasks/custom')
      .set('Authorization', authHeader(mentor))
      .send({
        menteeId: mentee.id,
        title: 'Weekly quiz',
        type: 'quiz',
        schedule: timing,
        quiz: { kitId: kit.id, evaluationMode: 'review', allowRetake: false },
      });
    expect(response.status).toBe(201);
    const slot = response.body.data.task;
    await materializer.activateSlotForMentor(mentor.id, slot.id, [mentee.id]);
    const task = await models.AssignedTask.findOne({
      where: { scheduleSlotId: slot.id },
    });
    expect(task).not.toBeNull();
    const assignment = await models.QuizAssignment.findOne({
      where: { assignedTaskId: task.id },
    });
    expect(assignment).toMatchObject({
      kitId: kit.id,
      evaluationMode: 'review',
      allowRetake: false,
    });
  });

  test('rejects scheduled quizzes without a kit before saving any schedule', async () => {
    await expect(
      taskService.createCustomTask(
        { menteeId: mentee.id, title: 'Quiz', type: 'quiz', schedule: timing },
        mentor.id,
      ),
    ).rejects.toThrow(/quiz kit/);
  });

  test('weekly config creates the chosen weekdays and preserves the task recipe', async () => {
    const slot = await taskService.createCustomTask(
      {
        menteeId: mentee.id,
        title: 'Reading practice',
        type: 'reading',
        description: 'Read and summarize',
        schedule: { ...timing, mode: 'weekly', daysOfWeek: [1, 3] },
      },
      mentor.id,
    );
    await materializer.activateSlotForMentor(mentor.id, slot.id, [mentee.id]);
    const tasks = await models.AssignedTask.findAll({
      where: { menteeId: mentee.id, scheduleSlotId: slot.id },
    });
    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks)
      expect([1, 3]).toContain(
        new Date(`${task.occurrenceDate}T12:00:00Z`).getUTCDay(),
      );
  });
});

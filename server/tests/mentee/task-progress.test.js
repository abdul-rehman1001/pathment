'use strict';

/**
 * Day-by-day progress on an assigned task.
 *
 * The feature exists to answer "is this going badly, and can we tell before the
 * deadline", so the things worth locking in are: the gaps survive (they ARE the
 * signal), one entry per day, logging feeds the streak, and nobody can write on
 * or read a task that is not theirs to touch.
 */

const { models } = require('../../src/db');
const svc = require('../../src/services/taskProgressService');
const clanService = require('../../src/services/clanService');
const { cleanDb, createMentor, createMentee, createProgram } = require('../helpers/seed');

const todayKey = () => new Date().toISOString().split('T')[0];
const shift = (key, n) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
};

describe('task progress log', () => {
  let mentor, otherMentor, mentee, otherMentee, program, clan, task;

  beforeEach(async () => {
    await cleanDb();
    mentor = await createMentor({ email: 'mentor@test.com' });
    otherMentor = await createMentor({ email: 'other-mentor@test.com' });
    mentee = await createMentee({ email: 'mentee@test.com' });
    otherMentee = await createMentee({ email: 'other-mentee@test.com' });
    program = await createProgram({ createdBy: mentor.id });
    clan = await models.Clan.create({ programId: program.id, name: 'Clan A', leadMentorId: mentor.id, createdBy: mentor.id });
    await clanService.addMember(clan.id, { userId: mentor.id, role: 'lead_mentor' });
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });

    task = await models.AssignedTask.create({
      menteeId: mentee.id, mentorId: mentor.id, status: 'assigned',
      assignedAt: new Date(), dueDate: new Date(Date.now() + 3 * 86400000),
    }, { validate: false });
  });

  // ── writing ───────────────────────────────────────────────────────────────
  it('records a note for today', async () => {
    const entry = await svc.log(mentee.id, task.id, { note: 'Read the JWT docs, no code yet.' });
    expect(entry.note).toBe('Read the JWT docs, no code yet.');
    expect(entry.dateKey).toBe(todayKey());
  });

  it('replaces rather than duplicates when logging twice in one day', async () => {
    await svc.log(mentee.id, task.id, { note: 'First attempt' });
    await svc.log(mentee.id, task.id, { note: 'Actually got it working' });

    const rows = await models.TaskProgressEntry.findAll({ where: { assignedTaskId: task.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe('Actually got it working');
  });

  it('refuses an empty note', async () => {
    await expect(svc.log(mentee.id, task.id, { note: '   ' })).rejects.toThrow(/what you did/i);
  });

  it('moves an untouched task to in_progress', async () => {
    await svc.log(mentee.id, task.id, { note: 'Started reading' });
    await task.reload();
    expect(task.status).toBe('in_progress');
  });

  it('refuses progress on a closed task', async () => {
    await task.update({ status: 'completed' });
    await expect(svc.log(mentee.id, task.id, { note: 'late note' })).rejects.toThrow(/closed/i);
  });

  // ── the streak connection, the reason this lives on the task ───────────────
  it('logs the day in the daily log so the streak counts it', async () => {
    await svc.log(mentee.id, task.id, { note: 'Worked on auth' });

    const day = await models.DailyLogEntry.findOne({ where: { menteeId: mentee.id, dateKey: todayKey() } });
    expect(day).toBeTruthy();

    const profile = await models.MenteeProfile.findOne({ where: { userId: mentee.id } });
    expect(Number(profile.currentStreakDays)).toBeGreaterThanOrEqual(1);
  });

  it('does not touch tasksDone, which means something different', async () => {
    await svc.log(mentee.id, task.id, { note: 'Worked on it, not finished' });
    const day = await models.DailyLogEntry.findOne({ where: { menteeId: mentee.id, dateKey: todayKey() } });
    // "worked on it" is not "ticked complete". Conflating them would put two
    // meanings in one column.
    expect(day.tasksDone).toEqual([]);
  });

  // ── reading: the gaps are the point ───────────────────────────────────────
  it('keeps empty days in the timeline instead of collapsing them', async () => {
    const today = todayKey();
    await models.TaskProgressEntry.create({
      assignedTaskId: task.id, menteeId: mentee.id, dateKey: shift(today, -3), note: 'day one',
    });
    await models.TaskProgressEntry.create({
      assignedTaskId: task.id, menteeId: mentee.id, dateKey: today, note: 'day four',
    });

    const { days, summary } = await svc.listForTask(task.id, { menteeId: mentee.id });
    const past = days.filter((d) => !d.isFuture);
    const filled = past.filter((d) => d.entry);
    const empty = past.filter((d) => !d.entry);

    expect(filled).toHaveLength(2);
    expect(empty.length).toBeGreaterThan(0);        // the gap survived
    expect(summary.loggedDays).toBe(2);
    expect(summary.lastNote).toBe('day four');
  });

  it('summarises as the sentence a mentor reads', async () => {
    await svc.log(mentee.id, task.id, { note: 'Something' });
    const { summary } = await svc.listForTask(task.id, { menteeId: mentee.id });
    expect(summary.label).toMatch(/logged \d+ of \d+ day/);
  });

  it('says "not started" when there is nothing yet', async () => {
    const { summary } = await svc.listForTask(task.id, { menteeId: mentee.id });
    expect(summary.loggedDays).toBe(0);
    expect(summary.lastNote).toBeNull();
  });

  // ── who may touch it ──────────────────────────────────────────────────────
  it('does not let a mentee write on somebody else’s task', async () => {
    await expect(svc.log(otherMentee.id, task.id, { note: 'not mine' }))
      .rejects.toThrow(/not yours/i);
  });

  it('lets the mentee’s own mentor read the timeline', async () => {
    await svc.log(mentee.id, task.id, { note: 'progress' });
    const data = await svc.listForMentor(mentor, task.id);
    expect(data.summary.loggedDays).toBe(1);
  });

  it('does not let a mentor outside the clan read it', async () => {
    await svc.log(mentee.id, task.id, { note: 'progress' });
    await expect(svc.listForMentor(otherMentor, task.id)).rejects.toThrow(/do not mentor/i);
  });

  // ── the edit window ───────────────────────────────────────────────────────
  it('lets a mentee remove a recent day', async () => {
    await svc.log(mentee.id, task.id, { note: 'oops' });
    await expect(svc.remove(mentee.id, task.id, todayKey())).resolves.toMatchObject({ removed: true });
    await expect(models.TaskProgressEntry.count({ where: { assignedTaskId: task.id } })).resolves.toBe(0);
  });

  it('freezes a day older than the edit window', async () => {
    const old = shift(todayKey(), -5);
    await models.TaskProgressEntry.create({
      assignedTaskId: task.id, menteeId: mentee.id, dateKey: old, note: 'ancient history',
    });
    await expect(svc.remove(mentee.id, task.id, old)).rejects.toThrow(/locked/i);
  });
});

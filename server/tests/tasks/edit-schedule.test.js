jest.mock('../../src/db', () => ({ models: {
  MenteeSchedule: { findAll: jest.fn(), create: jest.fn() }, User: { findByPk: jest.fn() },
  RoadmapTask: { findByPk: jest.fn() }, TaskResource: {}, QuizAssignment: { findOne: jest.fn() },
} }));
const { models } = require('../../src/db');
const service = require('../../src/services/taskEditScheduleService');
const task = { id: 'task', menteeId: 'mentee', clanId: 'clan', roadmapTaskId: 'rt', status: 'in_progress' };
const tx = { LOCK: { UPDATE: 'UPDATE' } };
const input = { mode: 'weekly', startsOn: '2099-01-01', timeLocal: '09:00', timezone: 'UTC', daysOfWeek: [1], dueOffsetDays: 7 };
beforeEach(() => { jest.clearAllMocks(); models.RoadmapTask.findByPk.mockResolvedValue({ title: 'Work', type: 'practical', resources: [] }); });
test('updates matching recipe without replacing unrelated slots or touching existing work', async () => {
 const row = { schedule: [{ id: 'other' }, { id: 'slot', recurring: { sourceTaskId: 'task' } }], save: jest.fn() };
 models.MenteeSchedule.findAll.mockResolvedValue([row]);
 await service.save(task, input, 'mentor', tx);
 expect(row.schedule).toHaveLength(2);
 expect(row.schedule[1].id).toBe('slot');
 expect(row.schedule[1].recurring.task.type).toBe('practical');
 expect(row.save).toHaveBeenCalledWith({ transaction: tx });
});
test('turning off recurrence removes only the matching slot', async () => {
 const row = { schedule: [{ id: 'other' }, { id: 'slot', recurring: { sourceTaskId: 'task' } }], save: jest.fn() };
 models.MenteeSchedule.findAll.mockResolvedValue([row]);
 await service.save(task, { mode: 'now' }, 'mentor', tx);
 expect(row.schedule).toEqual([{ id: 'other' }]);
});
test('rejects completed tasks and past starts', async () => {
 await expect(service.save({ ...task, status: 'completed' }, input, 'mentor', tx)).rejects.toThrow('before submission');
 models.MenteeSchedule.findAll.mockResolvedValue([]);
 await expect(service.save(task, { ...input, startsOn: '2000-01-01' }, 'mentor', tx)).rejects.toThrow('future start');
 expect(models.MenteeSchedule.create).not.toHaveBeenCalled();
});

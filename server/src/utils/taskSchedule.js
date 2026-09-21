const { ValidationError } = require('./errors/errorTypes');
const { zonedWallClockToUtc } = require('./timezone');

const TASK_TYPES = [
  'assignment', 'practical', 'assessment', 'custom',
  'project',
  'quiz',
  'reading',
  'video',
  'discussion',
  'interview',
  'open_source',
  'exercise',
];
function normalizeTaskSchedule(input, type) {
  if (!TASK_TYPES.includes(type))
    throw new ValidationError('Choose a supported task type');
  if (!input || !['once', 'weekly'].includes(input.mode))
    throw new ValidationError('Choose schedule once or repeat weekly');
  const validDate = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (
    !validDate(input.startsOn) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.timeLocal || '')
  )
    throw new ValidationError('Choose a valid start date and time');
  const timezone = input.timezone || 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  } catch {
    throw new ValidationError('Choose a valid timezone');
  }
  const dueOffsetDays = Number(input.dueOffsetDays ?? 7);
  const intervalWeeks = Number(input.intervalWeeks ?? 1);
  if (
    !Number.isInteger(dueOffsetDays) ||
    dueOffsetDays < 1 ||
    dueOffsetDays > 365
  )
    throw new ValidationError('Due after must be between 1 and 365 days');
  if (
    !Number.isInteger(intervalWeeks) ||
    intervalWeeks < 1 ||
    intervalWeeks > 52
  )
    throw new ValidationError('Repeat interval must be between 1 and 52 weeks');
  const startsOn = input.startsOn;
  const daysOfWeek =
    input.mode === 'once'
      ? [new Date(`${startsOn}T12:00:00Z`).getUTCDay()]
      : [...new Set(Array.isArray(input.daysOfWeek) ? input.daysOfWeek : [])];
  if (
    !daysOfWeek.length ||
    daysOfWeek.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  )
    throw new ValidationError('Choose at least one day to repeat');
  const endsOn = input.mode === 'once' ? startsOn : input.endsOn || null;
  if (endsOn && (!validDate(endsOn) || endsOn < startsOn))
    throw new ValidationError('End date must be on or after the start date');
  if (
    input.mode === 'once' &&
    zonedWallClockToUtc(startsOn, input.timeLocal, timezone) <= new Date()
  )
    throw new ValidationError('Choose a future time or use Assign now');
  return {
    mode: input.mode,
    recurrence: input.mode,
    type,
    startsOn,
    endsOn,
    timeLocal: input.timeLocal,
    timezone,
    daysOfWeek,
    dayOfWeek: daysOfWeek[0],
    intervalWeeks,
    dueOffsetDays,
  };
}
module.exports = { TASK_TYPES, normalizeTaskSchedule };

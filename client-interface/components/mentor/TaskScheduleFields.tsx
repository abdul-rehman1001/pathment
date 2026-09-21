'use client';

export interface TaskScheduleDraft {
  mode: 'now' | 'once' | 'weekly';
  startsOn: string;
  timeLocal: string;
  timezone: string;
  daysOfWeek: number[];
  dueOffsetDays: number;
  intervalWeeks: number;
  endsOn: string;
}
export function initialTaskSchedule(): TaskScheduleDraft {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return {
    mode: 'now',
    startsOn: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    timeLocal: '09:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    daysOfWeek: [date.getDay()],
    dueOffsetDays: 7,
    intervalWeeks: 1,
    endsOn: '',
  };
}

export function TaskScheduleFields({
  value,
  onChange,
  allowNow = true,
}: {
  value: TaskScheduleDraft;
  onChange: (value: TaskScheduleDraft) => void;
  allowNow?: boolean;
}) {
  const patch = (change: Partial<TaskScheduleDraft>) =>
    onChange({ ...value, ...change });
  const field =
    'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-brand-500';
  return (
    <section
      aria-label="Task timing"
      className="rounded-2xl border border-border bg-muted/40 p-4 space-y-4"
    >
      <div>
        <h3 className="text-sm font-semibold">When should this happen?</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Assign now, plan ahead, or build a weekly habit.
        </p>
      </div>
      <div className="flex flex-wrap gap-1 rounded-xl bg-card p-1 border border-border">
        {(
          [
            ['now', 'Assign now'],
            ['once', 'Schedule once'],
            ['weekly', 'Repeat weekly'],
          ] as const
        )
          .filter(([mode]) => allowNow || mode !== 'now')
          .map(([mode, label]) => (
            <button
              type="button"
              key={mode}
              aria-pressed={value.mode === mode}
              onClick={() => patch({ mode })}
              className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium ${value.mode === mode ? 'bg-brand-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {label}
            </button>
          ))}
      </div>
      {value.mode !== 'now' && (
        <>
          <label className="block text-xs font-medium">
            {value.mode === 'once' ? 'Scheduled for' : 'Start repeating from'}
            <input
              aria-label="Schedule date and time"
              type="datetime-local"
              value={`${value.startsOn}T${value.timeLocal}`}
              onChange={(e) => {
                const [startsOn, timeLocal] = e.target.value.split('T');
                patch({ startsOn: startsOn || '', timeLocal: timeLocal || '' });
              }}
              className={`${field} mt-1.5`}
            />
          </label>
          {value.mode === 'weekly' && (
            <fieldset>
              <legend className="text-xs font-medium mb-2">Repeat on</legend>
              <div className="flex gap-1.5 flex-wrap">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
                  (day, index) => (
                    <button
                      type="button"
                      key={day}
                      aria-pressed={value.daysOfWeek.includes(index)}
                      onClick={() =>
                        patch({
                          daysOfWeek: value.daysOfWeek.includes(index)
                            ? value.daysOfWeek.filter((d) => d !== index)
                            : [...value.daysOfWeek, index],
                        })
                      }
                      className={`h-9 min-w-10 rounded-lg text-xs font-medium ${value.daysOfWeek.includes(index) ? 'bg-brand-600 text-white' : 'bg-card border border-border text-muted-foreground'}`}
                    >
                      {day}
                    </button>
                  ),
                )}
              </div>
            </fieldset>
          )}
          <p className="text-xs text-muted-foreground">
            {value.timezone} · Due {value.dueOffsetDays} days after each
            scheduled date. Upcoming tasks appear ahead of time.
          </p>
          <details>
            <summary className="cursor-pointer text-xs font-medium text-brand-700">
              Adjust deadline{value.mode === 'weekly' ? ' or end date' : ''}
            </summary>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <label className="text-xs font-medium">
                Due after (days)
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={value.dueOffsetDays}
                  onChange={(e) =>
                    patch({ dueOffsetDays: Number(e.target.value) })
                  }
                  className={`${field} mt-1.5`}
                />
              </label>
              {value.mode === 'weekly' && (
                <label className="text-xs font-medium">
                  End date (optional)
                  <input
                    type="date"
                    min={value.startsOn}
                    value={value.endsOn}
                    onChange={(e) => patch({ endsOn: e.target.value })}
                    className={`${field} mt-1.5`}
                  />
                </label>
              )}
            </div>
          </details>
        </>
      )}
    </section>
  );
}

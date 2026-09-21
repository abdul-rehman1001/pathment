'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface AttendanceEntry {
  sessionId: string;
  date: string | null;
  status: string;
  title: string | null;
}
const tone: Record<string, string> = {
  present: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  absent: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  excused: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
};

export function AttendanceHistoryCalendar({
  entries,
}: {
  entries: AttendanceEntry[];
}) {
  const [month, setMonth] = useState(() => {
    const latest = entries
      .map((entry) => entry.date)
      .filter(Boolean)
      .sort()
      .at(-1);
    const date = latest ? new Date(`${latest}T12:00:00`) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(null);
  const year = month.getFullYear();
  const index = month.getMonth();
  const prefix = `${year}-${String(index + 1).padStart(2, '0')}`;
  const days = new Date(year, index + 1, 0).getDate();
  const offset = (month.getDay() + 6) % 7;
  const byDate = new Map<string, AttendanceEntry[]>();
  for (const entry of entries) {
    if (entry.date)
      byDate.set(entry.date, [...(byDate.get(entry.date) || []), entry]);
  }
  const visible = entries.filter((entry) =>
    selected ? entry.date === selected : entry.date?.startsWith(prefix),
  );
  const move = (amount: number) => {
    setMonth(new Date(year, index + amount, 1));
    setSelected(null);
  };
  return (
    <section aria-label="Attendance calendar" className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        {['present', 'absent', 'excused'].map((status) => (
          <div key={status} className={`rounded-xl p-3 ${tone[status]}`}>
            <p className="text-xl font-semibold tabular-nums">
              {entries.filter((entry) => entry.status === status).length}
            </p>
            <p className="text-xs capitalize">{status}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <button
            aria-label="Previous attendance month"
            onClick={() => move(-1)}
            className="rounded-lg p-2 hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h3 className="font-semibold text-sm" aria-live="polite">
            {month.toLocaleDateString(undefined, {
              month: 'long',
              year: 'numeric',
            })}
          </h3>
          <button
            aria-label="Next attendance month"
            onClick={() => move(1)}
            className="rounded-lg p-2 hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
            <span key={i} className="pb-2 text-xs text-muted-foreground">
              {day}
            </span>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <span key={`empty-${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const date = `${prefix}-${String(i + 1).padStart(2, '0')}`;
            const records = byDate.get(date) || [];
            return (
              <button
                key={date}
                disabled={!records.length}
                aria-pressed={date === selected}
                aria-label={`${date}: ${records.length ? records.map((record) => record.status).join(', ') : 'No attendance recorded'}`}
                onClick={() => setSelected(date === selected ? null : date)}
                className={`flex min-h-11 flex-col items-center justify-center rounded-xl text-xs disabled:text-muted-foreground ${date === selected ? 'ring-2 ring-brand-500' : ''} ${records.length ? tone[records[0].status] || 'bg-muted' : ''}`}
              >
                <span>{i + 1}</span>
                {records.length > 0 && (
                  <span className="mt-1 text-[9px] capitalize">
                    {records.length > 1
                      ? `${records.length} sessions`
                      : records[0].status}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{selected || 'This month'}</h4>
        {selected && (
          <button
            onClick={() => setSelected(null)}
            className="text-xs text-brand-700"
          >
            Show month
          </button>
        )}
      </div>
      {!visible.length && (
        <p className="text-sm text-muted-foreground">
          No attendance recorded for this month. Empty days are not absences.
        </p>
      )}
      <div className="space-y-2">
        {visible.map((entry) => (
          <div
            key={entry.sessionId}
            className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
          >
            <div>
              <p className="text-sm font-medium">
                {entry.title || 'Clan review'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{entry.date}</p>
            </div>
            <span
              className={`rounded-full px-2 py-1 text-xs capitalize ${tone[entry.status] || 'bg-muted'}`}
            >
              {entry.status}
            </span>
          </div>
        ))}
      </div>
      {entries.some((entry) => !entry.date) && (
        <p className="text-xs text-muted-foreground">
          {entries.filter((entry) => !entry.date).length} undated records
          included in the totals.
        </p>
      )}
    </section>
  );
}

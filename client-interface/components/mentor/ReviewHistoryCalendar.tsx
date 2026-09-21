'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  dates: string[];
  label?: string;
  unit?: string;
  initialDate?: string;
  selected: string | null;
  onSelect: (date: string | null) => void;
}

/** Local date keys avoid shifting a saved review into the preceding day. */
export function ReviewHistoryCalendar({
  dates,
  selected,
  onSelect,
  label = 'Review history calendar',
  unit = 'review',
  initialDate,
}: Props) {
  const [month, setMonth] = useState(() => {
    const latest = initialDate || [...dates].sort().at(-1);
    const date = latest ? new Date(`${latest}T12:00:00`) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const year = month.getFullYear();
  const index = month.getMonth();
  const offset = (month.getDay() + 6) % 7;
  const days = new Date(year, index + 1, 0).getDate();
  const counts = new Map<string, number>();
  dates.forEach((date) => counts.set(date, (counts.get(date) ?? 0) + 1));
  return (
    <section
      aria-label={label}
      className="mb-5 rounded-2xl border border-border bg-card p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <button
          aria-label="Previous month"
          onClick={() => {
            setMonth(new Date(year, index - 1, 1));
            onSelect(null);
          }}
          className="rounded-lg p-2 hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 aria-live="polite" className="text-sm font-semibold">
          {month.toLocaleDateString(undefined, {
            month: 'long',
            year: 'numeric',
          })}
        </h3>
        <button
          aria-label="Next month"
          onClick={() => {
            setMonth(new Date(year, index + 1, 1));
            onSelect(null);
          }}
          className="rounded-lg p-2 hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Select a highlighted day to filter</span>
        <button
          className="font-medium text-brand-700 dark:text-brand-300"
          onClick={() => {
            const now = new Date();
            setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
            onSelect(null);
          }}
        >
          This month
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => (
          <span key={day} className="py-1 text-xs text-muted-foreground">
            {day}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const key = `${year}-${String(index + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
          const count = counts.get(key) ?? 0;
          return (
            <button
              key={key}
              disabled={!count}
              aria-label={`${key}, ${count} ${unit}${count === 1 ? '' : 's'}`}
              aria-pressed={selected === key}
              onClick={() => onSelect(selected === key ? null : key)}
              className={`min-h-10 rounded-lg text-xs disabled:opacity-50 ${selected === key ? 'bg-brand-600 text-white' : count ? 'bg-brand-50 text-brand-700 hover:bg-brand-100' : 'text-muted-foreground'}`}
            >
              {i + 1}
              {count > 0 && (
                <span className="block text-[9px] leading-3">
                  {count} {unit}
                  {count === 1 ? '' : 's'}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <button
        onClick={() => onSelect(null)}
        className="mt-4 text-xs font-medium text-brand-700"
      >
        {selected ? `Clear date filter · ${selected}` : 'Showing all sessions'}
      </button>
    </section>
  );
}
